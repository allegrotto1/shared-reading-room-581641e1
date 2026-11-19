// The colour sources already carry the master's AgX display transform.
export function projectionMaterial(B,scene,gpu){
  const slots=[0,1,2,3];
  const shader=gpu?'boardProjectionWG':'boardProjectionGL';
  const store=gpu?B.ShaderStore.ShadersStoreWGSL:B.ShaderStore.ShadersStore;
  const names=slots.flatMap(i=>['colour'+i,'depth'+i]) .concat('inkBoard','exteriorWorld','streetPhoto','leafPhoto',slots.map(i=>'carpet'+i));
  const uniforms=['weights','visitorEye','floorLevel','streetReady','rightStreetReady','waterRipple',...slots.map(i=>'eye'+i),...slots.map(i=>'rect'+i)];
  const glVertex=`
    precision highp float;
    attribute vec3 position; attribute float boardFace;
    uniform mat4 worldViewProjection;
    varying vec3 P; varying float board;
    void main(){P=vec3(position.x,-position.z,position.y);board=boardFace;gl_Position=worldViewProjection*vec4(position,1.);}
  `;
  const wgVertex=`
    #include<sceneUboDeclaration>
    attribute position: vec3f;
    attribute boardFace: f32;
    varying P: vec3f;
    varying board: f32;
    @vertex fn main(input:VertexInputs)->FragmentInputs{
      let p=vertexInputs.position;
      vertexOutputs.P=vec3f(p.x,-p.z,p.y); vertexOutputs.board=vertexInputs.boardFace;
      vertexOutputs.position=scene.viewProjection*vec4f(p,1.0);
    }
  `;
  const glSample=i=>`
    vec4 from${i}(vec3 p,float ripple){
      vec3 ray=p-eye${i};float d=max(.0001,length(ray));ray/=d;
      vec2 uv=vec2(.5+atan(ray.x,ray.y)*.1591549431,.5-asin(clamp(ray.z,-1.,1.))*.3183098862);
      vec2 dx=dFdx(uv),dy=dFdy(uv);dx.x-=floor(dx.x+.5);dy.x-=floor(dy.x+.5);
      float waterShift=-atan(ripple*length(ray.xy),d)*.3183098862;
      vec3 colour=textureGrad(colour${i},uv+vec2(0.,waterShift),dx,dy).rgb;
      vec2 dims=vec2(4096.,2048.);
      vec2 center=(floor(uv*dims)+.5)/dims;
      float z=texture2D(depth${i},center).r, error=abs(z-d), nearest=z;
      vec2 best=center;
      for(int j=0;j<4;j++){
        vec2 offset=vec2(j==0?1.:(j==1?-1.:0.),j==2?1.:(j==3?-1.:0.))/dims;
        float v=texture2D(depth${i},center+offset).r;nearest=min(nearest,v);
        if(abs(v-d)<error){best=center+offset;error=abs(v-d);}
      }
      float tol=.009+.005*d;
      if(abs(z-d)>2.4*tol && error<tol)colour=textureGrad(colour${i},best+vec2(0.,waterShift),vec2(0.),vec2(0.)).rgb;
      float e=min(abs(z-d),error+tol*.6)/tol;
      float visible=mix(.003,1.,smoothstep(-3.*tol,-.7*tol,nearest-d));
      if(p.y>9.63 && ray.y>.01){float glass=(9.487-eye${i}.y)/ray.y;vec3 hit=eye${i}+ray*glass;
        if(hit.x>.096 && hit.x<4.204 && hit.z>1.070 && hit.z<2.53 && abs(z-glass)<.016+.006*glass){e=0.;visible=1.;}}
      return vec4(colour,visible/(1.+e*e*e*e));
    }`;
  const wgSample=i=>`
    fn from${i}(p:vec3f,ripple:f32)->vec4f{
      let ray0=p-uniforms.eye${i};let d=max(.0001,length(ray0));let ray=ray0/d;
      let uv=vec2f(.5+atan2(ray.x,ray.y)*.1591549431,.5-asin(clamp(ray.z,-1.,1.))*.3183098862);
      var dx=dpdx(uv);var dy=dpdy(uv);dx.x-=floor(dx.x+.5);dy.x-=floor(dy.x+.5);
      let waterShift=-atan2(ripple*length(ray.xy),d)*.3183098862;
      var colour=textureSampleGrad(colour${i},colour${i}Sampler,uv+vec2f(0.,waterShift),dx,dy).rgb;
      let dims=vec2f(4096.,2048.);let center=(floor(uv*dims)+.5)/dims;
      let z=textureSampleLevel(depth${i},depth${i}Sampler,center,0.).r;
      var err=abs(z-d);var nearest=z;var best=center;
      let off=array<vec2f,4>(vec2f(1.,0.),vec2f(-1.,0.),vec2f(0.,1.),vec2f(0.,-1.));
      for(var j=0;j<4;j++){
        let pos=center+off[j]/dims;let v=textureSampleLevel(depth${i},depth${i}Sampler,pos,0.).r;nearest=min(nearest,v);
        if(abs(v-d)<err){best=pos;err=abs(v-d);}
      }
      let tol=.009+.005*d;
      if(abs(z-d)>2.4*tol && err<tol){colour=textureSampleLevel(colour${i},colour${i}Sampler,best+vec2f(0.,waterShift),0.).rgb;}
      var e=min(abs(z-d),err+tol*.6)/tol;var visibility=mix(.003,1.,smoothstep(-3.*tol,-.7*tol,nearest-d));
      if(p.y>9.63 && ray.y>.01){let glass=(9.487-uniforms.eye${i}.y)/ray.y;let hit=uniforms.eye${i}+ray*glass;
        if(hit.x>.096 && hit.x<4.204 && hit.z>1.070 && hit.z<2.53 && abs(z-glass)<.016+.006*glass){e=0.;visibility=1.;}}
      return vec4f(colour,visibility/(1.+e*e*e*e));
    }`;
  const glFragment=`
    precision highp float;
    varying vec3 P;varying float board;
    uniform vec4 weights;uniform vec3 visitorEye;uniform vec4 floorLevel; uniform float streetReady; uniform float rightStreetReady;uniform float waterRipple;
    ${slots.map(i=>'uniform vec4 rect'+i+';').join('\n')}
    ${slots.map(i=>'uniform vec3 eye'+i+';').join('\n')}
    ${names.map(n=>'uniform sampler2D '+n+';').join('\n')}
    ${slots.map(glSample).join('\n')}
    vec3 linearise(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
    vec3 displayRGB(vec3 c){return mix(12.92*c,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
    float waterWave(vec3 p,float t){
      if(t<0.||p.x<3.883||p.x>4.178||abs(p.y+.86)>.148||abs(p.z-1.485)>.074)return 0.;
      float band=1.-smoothstep(.018,.074,abs(p.z-1.485));
      return .012*band*smoothstep(0.,.09,t)*exp(-2.8*t)*(sin(19.*t+17.*(p.y+.86))+.40*sin(29.*t-16.*(p.x-4.03)));
    }
    void main(){
      float ripple=waterWave(P,waterRipple);
      vec4 a=from0(P,ripple),b=from1(P,ripple),c=from2(P,ripple),d=from3(P,ripple);
      vec4 w=weights*max(vec4(1e-14),vec4(a.a,b.a,c.a,d.a));
      float confidence=clamp(2.*dot(w,vec4(1.)),0.,1.);w/=max(1e-16,dot(w,vec4(1.)));
      vec3 col=displayRGB(linearise(a.rgb)*w.x+linearise(b.rgb)*w.y+linearise(c.rgb)*w.z+linearise(d.rgb)*w.w);
${slots.map(i=>`
      {vec2 tile=(P.xy-rect${i}.xy)/rect${i}.zw;tile.y=1.-tile.y;
       vec2 tx=dFdx(tile),ty=dFdy(tile);float edgeT=min(min(tile.x,1.-tile.x),min(tile.y,1.-tile.y));
       if(board>1.5&&board<2.5&&floorLevel[${i}]>.001&&edgeT>0.){
        float fine=textureGrad(carpet${i},tile,tx,ty).r;
        float broad=textureGrad(carpet${i},tile,tx*2.,ty*2.).r;
        float factor=clamp((fine+.035)/(broad+.035),.74,1.30);
        col*=mix(1.,factor,.50*floorLevel[${i}]*smoothstep(0.,.006,edgeT));}}
      `).join('\n')}
      vec3 rayRef=P-vec3(2.16,9.4,1.64);
      vec3 local=vec3(dot(rayRef,vec3(.999484,-.021577,-.023791)),dot(rayRef,vec3(-.022342,.065105,-.997628)),dot(rayRef,vec3(.023075,.997645,.06459)));
      vec2 ref=vec2(1024.,768.)+768.2379*local.xy/max(.05,local.z);
      vec2 faceUV=(ref+vec2(1200.,1500.))/vec2(4300.,3100.),leafUV=ref/vec2(2048.,1536.);
      vec2 ax=dFdx(faceUV),ay=dFdy(faceUV),lx=dFdx(leafUV),ly=dFdy(leafUV);
      bool trimmed=false;if(board>2.5 && streetReady>.5){
        vec4 pixel=board<3.5?textureGrad(leafPhoto,leafUV,lx,ly):textureGrad(streetPhoto,faceUV,ax,ay);
        trimmed=board<3.5 && (min(leafUV.x,leafUV.y)<0. || max(leafUV.x,leafUV.y)>1. || pixel.a<.43);
        vec3 residual=abs(col-pixel.rgb);float drift=max(residual.r,max(residual.g,residual.b));
        col=mix(pixel.rgb,col,smoothstep(.003,.14,confidence)*.84*(1.-smoothstep(.06,.19,drift)));
      }
      vec2 uv=vec2((2.62-P.x)/.62,(1.305-P.z)/.61);
      vec3 ink=texture2D(inkBoard,uv).rgb;
      float edge=min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));
      float face=(board>.5 && board<1.5?1.:0.)*smoothstep(.014,.034,edge)*(1.-smoothstep(.001,.003,abs(P.y+1.993)));
      vec3 ray=normalize(P-vec3(visitorEye.x,-visitorEye.z,visitorEye.y));
      vec2 skyUV=vec2(.5+atan(ray.x,ray.y)*.1591549431,.5-asin(clamp(ray.z,-1.,1.))*.3183098862);
      vec4 world=texture2D(exteriorWorld,skyUV);
      // Cross the two matched facade photographs gently at their common edge. Keep the near tree in depth.
      if(rightStreetReady>.5 && board>3.5)col=mix(col,world.rgb,.72*world.a*smoothstep(.886,.983,atan(ray.x,ray.y)));
      if(trimmed)discard;gl_FragColor=vec4(board<-.5?world.rgb:mix(col,ink,face),1.);
    }`;
  const wgFragment=`
    varying P: vec3f;
    varying board: f32;
    uniform weights: vec4f;uniform visitorEye: vec3f;uniform floorLevel: vec4f; uniform streetReady: f32; uniform rightStreetReady: f32; uniform waterRipple: f32;
    ${slots.map(i=>'uniform rect'+i+': vec4f;').join('\n')}
    ${slots.map(i=>'uniform eye'+i+': vec3f;').join('\n')}
    ${names.map(n=>'var '+n+'Sampler: sampler;\nvar '+n+': texture_2d<f32>;').join('\n')}
    ${slots.map(wgSample).join('\n')}
    fn linearise(c:vec3f)->vec3f{return select(c/12.92,pow((c+.055)/1.055,vec3f(2.4)),c>=vec3f(.04045));}
    fn displayRGB(c:vec3f)->vec3f{return select(12.92*c,1.055*pow(max(c,vec3f(0)),vec3f(1./2.4))-.055,c>=vec3f(.0031308));}
    fn waterWave(p:vec3f,t:f32)->f32{
      if(t<0.||p.x<3.883||p.x>4.178||abs(p.y+.86)>.148||abs(p.z-1.485)>.074){return 0.;}
      let band=1.-smoothstep(.018,.074,abs(p.z-1.485));
      return .012*band*smoothstep(0.,.09,t)*exp(-2.8*t)*(sin(19.*t+17.*(p.y+.86))+.40*sin(29.*t-16.*(p.x-4.03)));
    }
    @fragment fn main(input:FragmentInputs)->FragmentOutputs{
      let p=fragmentInputs.P;let ripple=waterWave(p,uniforms.waterRipple);
      let a=from0(p,ripple);let b=from1(p,ripple);let c=from2(p,ripple);let d=from3(p,ripple);
      var w=uniforms.weights*max(vec4f(1e-14),vec4f(a.a,b.a,c.a,d.a));
      let confidence=clamp(2.*dot(w,vec4f(1.)),0.,1.);w/=max(1e-16,dot(w,vec4f(1.)));
      var col=displayRGB(linearise(a.rgb)*w.x+linearise(b.rgb)*w.y+linearise(c.rgb)*w.z+linearise(d.rgb)*w.w);
${slots.map(i=>`
      {var tile=(p.xy-uniforms.rect${i}.xy)/uniforms.rect${i}.zw;tile.y=1.-tile.y;
       let tx=dpdx(tile);let ty=dpdy(tile);let edgeT=min(min(tile.x,1.-tile.x),min(tile.y,1.-tile.y));
       if(fragmentInputs.board>1.5 && fragmentInputs.board<2.5 && uniforms.floorLevel[${i}]>.001 && edgeT>0.){
        let fine=textureSampleGrad(carpet${i},carpet${i}Sampler,tile,tx,ty).r;
        let broad=textureSampleGrad(carpet${i},carpet${i}Sampler,tile,tx*2.,ty*2.).r;
        let factor=clamp((fine+.035)/(broad+.035),.74,1.30);
        col*=mix(1.,factor,.50*uniforms.floorLevel[${i}]*smoothstep(0.,.006,edgeT));}}
      `).join('\n')}
      let rayRef=p-vec3f(2.16,9.4,1.64);
      let local=vec3f(dot(rayRef,vec3f(.999484,-.021577,-.023791)),dot(rayRef,vec3f(-.022342,.065105,-.997628)),dot(rayRef,vec3f(.023075,.997645,.06459)));
      let photoPixel=vec2f(1024.,768.)+768.2379*local.xy/max(.05,local.z);
      let faceUV=(photoPixel+vec2f(1200.,1500.))/vec2f(4300.,3100.);let leafUV=photoPixel/vec2f(2048.,1536.);
      let ax=dpdx(faceUV);let ay=dpdy(faceUV);let lx=dpdx(leafUV);let ly=dpdy(leafUV);
      var trimmed=false;if(fragmentInputs.board>2.5 && uniforms.streetReady>.5){var pixel:vec4f;
        if(fragmentInputs.board<3.5){pixel=textureSampleGrad(leafPhoto,leafPhotoSampler,leafUV,lx,ly);
          trimmed=min(leafUV.x,leafUV.y)<0. || max(leafUV.x,leafUV.y)>1. || pixel.a<.43;}
        else{pixel=textureSampleGrad(streetPhoto,streetPhotoSampler,faceUV,ax,ay);}
        let residual=abs(col-pixel.rgb);let drift=max(residual.r,max(residual.g,residual.b));
        col=mix(pixel.rgb,col,smoothstep(.003,.14,confidence)*.84*(1.-smoothstep(.06,.19,drift)));
      }
      let uv=vec2f((2.62-p.x)/.62,(1.305-p.z)/.61);
      let ink=textureSample(inkBoard,inkBoardSampler,uv).rgb;
      let edge=min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));
      let face=select(0.,1.,fragmentInputs.board>.5 && fragmentInputs.board<1.5)*smoothstep(.014,.034,edge)*(1.-smoothstep(.001,.003,abs(p.y+1.993)));
      let eye=uniforms.visitorEye;let ray=normalize(p-vec3f(eye.x,-eye.z,eye.y));
      let skyUV=vec2f(.5+atan2(ray.x,ray.y)*.1591549431,.5-asin(clamp(ray.z,-1.,1.))*.3183098862);
      let world=textureSampleLevel(exteriorWorld,exteriorWorldSampler,skyUV,0.);
      if(uniforms.rightStreetReady>.5 && fragmentInputs.board>3.5){col=mix(col,world.rgb,.72*world.a*smoothstep(.886,.983,atan2(ray.x,ray.y)));}
      if(trimmed){discard;}fragmentOutputs.color=vec4f(select(mix(col,ink,face),world.rgb,fragmentInputs.board<-.5),1.);
    }`;
  store[shader+'VertexShader']=gpu?wgVertex:glVertex;
  store[shader+'FragmentShader']=gpu?wgFragment:glFragment;
  const mat=new B.ShaderMaterial('Cycles view projections',scene,{vertex:shader,fragment:shader},{
    attributes:['position','boardFace'],uniforms:gpu?uniforms:['worldViewProjection',...uniforms],
    uniformBuffers:gpu?['Scene']:[],samplers:names,shaderLanguage:gpu?B.ShaderLanguage.WGSL:B.ShaderLanguage.GLSL});
  mat.backFaceCulling=false;
  mat.setFloat('rightStreetReady',0);mat.setFloat('waterRipple',-1);return mat;
}
