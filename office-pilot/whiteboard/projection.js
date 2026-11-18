// The colour sources already carry the master's AgX display transform.
export function projectionMaterial(B,scene,gpu){
  const slots=[0,1,2,3];
  const shader=gpu?'boardProjectionWG':'boardProjectionGL';
  const store=gpu?B.ShaderStore.ShadersStoreWGSL:B.ShaderStore.ShadersStore;
  const names=slots.flatMap(i=>['colour'+i,'depth'+i]).concat('inkBoard','exteriorWorld');
  const uniforms=['weights','visitorEye',...slots.map(i=>'eye'+i)];
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
    vec4 from${i}(vec3 p){
      vec3 ray=p-eye${i};float d=max(.0001,length(ray));ray/=d;
      vec2 uv=vec2(.5+atan(ray.x,ray.y)*.1591549431,.5-asin(clamp(ray.z,-1.,1.))*.3183098862);
      vec2 dx=dFdx(uv),dy=dFdy(uv);dx.x-=floor(dx.x+.5);dy.x-=floor(dy.x+.5);
      vec3 colour=textureGrad(colour${i},uv,dx,dy).rgb;
      vec2 packedZ=texture2D(depth${i},uv).rg;
      float z=exp(dot(packedZ,vec2(65280.,255.))*(6.93244789/65535.))-1.;
      vec2 tap=vec2(1./2048.,1./1024.);
      float edgeZ=65535.;
      for(int j=0;j<4;j++){
        vec2 offset=vec2(j==0?tap.x:(j==1?-tap.x:0.),j==2?tap.y:(j==3?-tap.y:0.));
        edgeZ=min(edgeZ,dot(texture2D(depth${i},uv+offset).rg,vec2(65280.,255.)));
      }
      float nearest=exp(edgeZ*(6.93244789/65535.))-1.,tol=.012+.007*d;
      float e=abs(z-d)/tol, visible=mix(.0002,1.,smoothstep(-2.5*tol,-.6*tol,nearest-d));
      return vec4(colour,visible/(1.+e*e*e*e));
    }`;
  const wgSample=i=>`
    fn from${i}(p:vec3f)->vec4f{
      let ray0=p-uniforms.eye${i};let d=max(.0001,length(ray0));let ray=ray0/d;
      let uv=vec2f(.5+atan2(ray.x,ray.y)*.1591549431,.5-asin(clamp(ray.z,-1.,1.))*.3183098862);
      var dx=dpdx(uv);var dy=dpdy(uv);dx.x-=floor(dx.x+.5);dy.x-=floor(dy.x+.5);
      let colour=textureSampleGrad(colour${i},colour${i}Sampler,uv,dx,dy).rgb;
      let packedZ=textureSampleLevel(depth${i},depth${i}Sampler,uv,0.).rg;
      let z=exp(dot(packedZ,vec2f(65280.,255.))*(6.93244789/65535.))-1.;
      let offsets=array<vec2f,4>(vec2f(1./2048.,0.),vec2f(-1./2048.,0.),vec2f(0.,1./1024.),vec2f(0.,-1./1024.));
      var edgeZ=65535.;
      for(var j=0;j<4;j++){
        let tap=textureSampleLevel(depth${i},depth${i}Sampler,uv+offsets[j],0.).rg;
        edgeZ=min(edgeZ,dot(tap,vec2f(65280.,255.)));
      }
      let nearest=exp(edgeZ*(6.93244789/65535.))-1.;let tol=.012+.007*d;
      let e=abs(z-d)/tol;let visibility=mix(.0002,1.,smoothstep(-2.5*tol,-.6*tol,nearest-d));
      return vec4f(colour,visibility/(1.+e*e*e*e));
    }`;
  const glFragment=`
    precision highp float;
    varying vec3 P;varying float board;
    uniform vec4 weights;uniform vec3 visitorEye;
    ${slots.map(i=>'uniform vec3 eye'+i+';').join('\n')}
    ${names.map(n=>'uniform sampler2D '+n+';').join('\n')}
    ${slots.map(glSample).join('\n')}
    vec3 linearise(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
    vec3 displayRGB(vec3 c){return mix(12.92*c,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));}
    void main(){
      vec4 a=from0(P),b=from1(P),c=from2(P),d=from3(P);
      vec4 w=weights*max(vec4(1e-14),vec4(a.a,b.a,c.a,d.a));
      w/=max(1e-16,dot(w,vec4(1.)));
      vec3 col=displayRGB(linearise(a.rgb)*w.x+linearise(b.rgb)*w.y+linearise(c.rgb)*w.z+linearise(d.rgb)*w.w);
      vec2 uv=vec2((2.62-P.x)/.62,(1.305-P.z)/.61);
      vec3 ink=texture2D(inkBoard,uv).rgb;
      float edge=min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));
      float face=board*smoothstep(.014,.034,edge)*(1.-smoothstep(.001,.003,abs(P.y+1.993)));
      vec3 ray=normalize(P-vec3(visitorEye.x,-visitorEye.z,visitorEye.y));
      vec2 skyUV=vec2(.5+atan(ray.x,ray.y)*.1591549431,.5-asin(clamp(ray.z,-1.,1.))*.3183098862);
      vec3 world=texture2D(exteriorWorld,skyUV).rgb;
      gl_FragColor=vec4(board<-.5?world:mix(col,ink,face),1.);
    }`;
  const wgFragment=`
    varying P: vec3f;
    varying board: f32;
    uniform weights: vec4f;uniform visitorEye: vec3f;
    ${slots.map(i=>'uniform eye'+i+': vec3f;').join('\n')}
    ${names.map(n=>'var '+n+'Sampler: sampler;\nvar '+n+': texture_2d<f32>;').join('\n')}
    ${slots.map(wgSample).join('\n')}
    fn linearise(c:vec3f)->vec3f{return select(c/12.92,pow((c+.055)/1.055,vec3f(2.4)),c>=vec3f(.04045));}
    fn displayRGB(c:vec3f)->vec3f{return select(12.92*c,1.055*pow(max(c,vec3f(0)),vec3f(1./2.4))-.055,c>=vec3f(.0031308));}
    @fragment fn main(input:FragmentInputs)->FragmentOutputs{
      let p=fragmentInputs.P;
      let a=from0(p);let b=from1(p);let c=from2(p);let d=from3(p);
      var w=uniforms.weights*max(vec4f(1e-14),vec4f(a.a,b.a,c.a,d.a));
      w/=max(1e-16,dot(w,vec4f(1.)));
      let col=displayRGB(linearise(a.rgb)*w.x+linearise(b.rgb)*w.y+linearise(c.rgb)*w.z+linearise(d.rgb)*w.w);
      let uv=vec2f((2.62-p.x)/.62,(1.305-p.z)/.61);
      let ink=textureSample(inkBoard,inkBoardSampler,uv).rgb;
      let edge=min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));
      let face=fragmentInputs.board*smoothstep(.014,.034,edge)*(1.-smoothstep(.001,.003,abs(p.y+1.993)));
      let eye=uniforms.visitorEye;let ray=normalize(p-vec3f(eye.x,-eye.z,eye.y));
      let skyUV=vec2f(.5+atan2(ray.x,ray.y)*.1591549431,.5-asin(clamp(ray.z,-1.,1.))*.3183098862);
      let world=textureSampleLevel(exteriorWorld,exteriorWorldSampler,skyUV,0.).rgb;
      fragmentOutputs.color=vec4f(select(mix(col,ink,face),world,fragmentInputs.board<-.5),1.);
    }`;
  store[shader+'VertexShader']=gpu?wgVertex:glVertex;
  store[shader+'FragmentShader']=gpu?wgFragment:glFragment;
  const mat=new B.ShaderMaterial('Cycles view projections',scene,{vertex:shader,fragment:shader},{
    attributes:['position','boardFace'],uniforms:gpu?uniforms:['worldViewProjection',...uniforms],
    uniformBuffers:gpu?['Scene']:[],samplers:names,shaderLanguage:gpu?B.ShaderLanguage.WGSL:B.ShaderLanguage.GLSL});
  mat.backFaceCulling=false;return mat;
}
