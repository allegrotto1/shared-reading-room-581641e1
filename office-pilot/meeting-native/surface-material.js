// The fixed UV texture contains Cycles diffuse light. Reflected room lights are evaluated in world space.
export function makeSurfaceFactory(B,scene,gpu,textures,eye){
  const code='meetingNativeSurface';const store=gpu?B.ShaderStore.ShadersStoreWGSL:B.ShaderStore.ShadersStore;
  const glv=`precision highp float;attribute vec3 position;attribute vec3 normal;attribute vec2 uv;uniform mat4 worldViewProjection;varying vec3 P;varying vec3 N;varying vec2 T;
  void main(){P=vec3(position.x,-position.z,position.y);N=vec3(normal.x,-normal.z,normal.y);T=vec2(uv.x,1.-uv.y);gl_Position=worldViewProjection*vec4(position,1.);}`;
  const wgv=`#include<sceneUboDeclaration>
  attribute position:vec3f;attribute normal:vec3f;attribute uv:vec2f;varying P:vec3f;varying N:vec3f;varying T:vec2f;
  @vertex fn main(input:VertexInputs)->FragmentInputs{let p=vertexInputs.position;let n=vertexInputs.normal;vertexOutputs.P=vec3f(p.x,-p.z,p.y);vertexOutputs.N=vec3f(n.x,-n.z,n.y);vertexOutputs.T=vec2f(vertexInputs.uv.x,1.-vertexInputs.uv.y);vertexOutputs.position=scene.viewProjection*vec4f(p,1.);}`;
  const glf=`precision highp float;varying vec3 P;varying vec3 N;varying vec2 T;uniform vec3 eye;uniform vec4 props;uniform vec2 mirrorClip;uniform float classify;uniform float finish;uniform sampler2D officeMap;uniform sampler2D softMap;uniform sampler2D baked;uniform sampler2D probe;uniform sampler2D weave;
  void main(){if(mirrorClip.x*(P.x-mirrorClip.y)>.0005)discard;vec4 pixel=texture2D(baked,T);vec3 v=normalize(eye-P),n=normalize(N);if(dot(n,v)<0.)n=-n;
    vec3 r=reflect(-v,n);vec3 env=texture2D(probe,vec2(.5+atan(r.x,r.y)*.159155,.5-asin(clamp(r.z,-1.,1.))*.31831)).rgb;
    if(props.z>0.){float t=(9.487-eye.y)/(P.y-eye.y);vec3 hit=eye+t*(P-eye);if(t<=0.||t>=1.||hit.x<.096||hit.x>4.204||hit.z<1.070||hit.z>2.53||pixel.a<.43)discard;}
    if(classify>.5){gl_FragColor=vec4(vec3(props.w),1.);return;}
    float fibre=texture2D(weave,P.xy).r-.5;vec3 col=pixel.rgb;if(props.z<0.)col*=1.+fibre*.70;if(props.x>.60){float lum=clamp(dot(col,vec3(.28,.56,.16)),.06,.40);col=mix(col,lum*vec3(1.16,.82,1.36),.55)*1.10+vec3(.031,.018,.043);}
    if(props.z>0.)col=mix(col,vec3(.83,.85,.87),.075);
    if(props.x>0.&&finish<.5){float d=(2.646-P.z)/max(.02,r.z);vec2 q=P.xy+r.xy*d;float w=clamp(props.y*props.y*max(.1,d)*.64,.026,.80);
      float dx=min(abs(q.x-1.13),abs(q.x-3.17))-.865;float row=clamp(floor((q.y-3.37)/1.18+.5),0.,4.);
      float dy=abs(q.y-(3.37+1.18*row))-.056;vec2 edge=max(vec2(0.),vec2(dx,dy));float gloss=exp(-dot(edge,edge)/(w*w))*smoothstep(.08,.44,r.z);
      float fres=.045+.21*pow(1.-max(0.,dot(n,v)),5.);
      col+=props.x*(env*(.24+fres)*.36+vec3(.96,.96,1.)*gloss*(.9-props.y*.66));}
    if(finish>.5){
      vec2 envUV=vec2(.5+atan(r.x,r.y)*.159155,.5-asin(clamp(r.z,-1.,1.))*.31831);
      vec3 detail=texture2D(officeMap,envUV).rgb;vec3 diffuse=texture2D(softMap,envUV).rgb;
      float facing=max(0.,dot(n,v));float rim=pow(1.-facing,3.);
      if(finish<1.5){float vertical=clamp(P.z/2.18,0.,1.);col=mix(vec3(.22,.31,.36),vec3(.43,.50,.53),vertical*.68)+(.24+rim*.25)*diffuse+detail*.072;}
      else if(finish<2.5){col=vec3(.095,.102,.11)+mix(diffuse,detail,.32)*vec3(.82,.84,.86)+.08*pixel.rgb;}
      else{
        float d=(2.685-P.z)/max(.03,r.z);vec2 q=P.xy+r.xy*d;
        vec2 e1=max(abs(q-vec2(1.69,-3.14))-vec2(.62,.22),vec2(0.));vec2 e2=max(abs(q-vec2(1.81,-1.34))-vec2(.62,.22),vec2(0.));
        vec2 e3=max(abs(vec2(min(abs(q.x+1.43),abs(q.x+3.60)),q.y+3.0))-vec2(.22,.62),vec2(0.));
        vec2 e4=max(abs(vec2(min(abs(q.x+.53),abs(q.x+3.34)),q.y-.79))-vec2(.22,.62),vec2(0.));
        float dist2=min(min(dot(e1,e1),dot(e2,e2)),min(dot(e3,e3),dot(e4,e4)));
        float w=clamp(.08+props.y*props.y*d*.45,.1,.78);float strip=exp(-dist2/(w*w))*smoothstep(.16,.45,r.z);
        if(finish<3.5)col=pixel.rgb*1.06+vec3(.018,.035,.010)+(.09+.23*rim)*detail+strip*.21;
        else col=pixel.rgb+(detail*(.11+.23*rim)+strip*.21)*props.x;
      }
    }
    gl_FragColor=vec4(col,1.);}`;
  const wgf=`varying P:vec3f;varying N:vec3f;varying T:vec2f;uniform eye:vec3f;uniform props:vec4f;uniform mirrorClip:vec2f;uniform classify:f32;uniform finish:f32;var officeMapSampler:sampler;var officeMap:texture_2d<f32>;var softMapSampler:sampler;var softMap:texture_2d<f32>;
    var weaveSampler:sampler;var weave:texture_2d<f32>;var bakedSampler:sampler;var baked:texture_2d<f32>;var probeSampler:sampler;var probe:texture_2d<f32>;
    @fragment fn main(input:FragmentInputs)->FragmentOutputs{let P=fragmentInputs.P;let prop=uniforms.props;let eye=uniforms.eye;let clip=uniforms.mirrorClip;if(clip.x*(P.x-clip.y)>.0005){discard;}
      let pixel=textureSample(baked,bakedSampler,fragmentInputs.T);let v=normalize(eye-P);var n=normalize(fragmentInputs.N);if(dot(n,v)<0.){n=-n;}
      let r=reflect(-v,n);let env=textureSampleLevel(probe,probeSampler,vec2f(.5+atan2(r.x,r.y)*.159155,.5-asin(clamp(r.z,-1.,1.))*.31831),2.).rgb;
      if(prop.z>0.){let t=(9.487-eye.y)/(P.y-eye.y);let hit=eye+t*(P-eye);if(t<=0.||t>=1.||hit.x<.096||hit.x>4.204||hit.z<1.070||hit.z>2.53||pixel.a<.43){discard;}}
      let fibre=textureSample(weave,weaveSampler,P.xy).r-.5;var col=pixel.rgb;if(prop.z<0.){col*=1.+fibre*.70;}if(prop.x>.60){let lum=clamp(dot(col,vec3f(.28,.56,.16)),.06,.40);col=mix(col,lum*vec3f(1.16,.82,1.36),.55)*1.10+vec3f(.031,.018,.043);}if(prop.z>0.){col=mix(col,vec3f(.83,.85,.87),.075);}
      if(prop.x>0.&&uniforms.finish<.5){let d=(2.646-P.z)/max(.02,r.z);let q=P.xy+r.xy*d;let w=clamp(prop.y*prop.y*max(.1,d)*.64,.026,.80);
        let dx=min(abs(q.x-1.13),abs(q.x-3.17))-.865;let row=clamp(floor((q.y-3.37)/1.18+.5),0.,4.);
        let dy=abs(q.y-(3.37+1.18*row))-.056;let edge=max(vec2f(0.),vec2f(dx,dy));
        let gloss=exp(-dot(edge,edge)/(w*w))*smoothstep(.08,.44,r.z);let fres=.045+.21*pow(1.-max(0.,dot(n,v)),5.);
        col+=prop.x*(env*(.24+fres)*.36+vec3f(.96,.96,1.)*gloss*(.9-prop.y*.66));}
      if(uniforms.finish>.5){
        let envUV=vec2f(.5+atan2(r.x,r.y)*.159155,.5-asin(clamp(r.z,-1.,1.))*.31831);
        let detail=textureSampleLevel(officeMap,officeMapSampler,envUV,0.).rgb;let diffuse=textureSampleLevel(softMap,softMapSampler,envUV,0.).rgb;
        let facing=max(0.,dot(n,v));let rim=pow(1.-facing,3.);
        if(uniforms.finish<1.5){let vertical=clamp(P.z/2.18,0.,1.);col=mix(vec3f(.22,.31,.36),vec3f(.43,.50,.53),vertical*.68)+(.24+rim*.25)*diffuse+detail*.072;}
        else if(uniforms.finish<2.5){col=vec3f(.095,.102,.11)+mix(diffuse,detail,.32)*vec3f(.82,.84,.86)+.08*pixel.rgb;}
        else{
          let d=(2.685-P.z)/max(.03,r.z);let q=P.xy+r.xy*d;
          let e1=max(abs(q-vec2f(1.69,-3.14))-vec2f(.62,.22),vec2f(0.));let e2=max(abs(q-vec2f(1.81,-1.34))-vec2f(.62,.22),vec2f(0.));
          let e3=max(abs(vec2f(min(abs(q.x+1.43),abs(q.x+3.60)),q.y+3.0))-vec2f(.22,.62),vec2f(0.));
          let e4=max(abs(vec2f(min(abs(q.x+.53),abs(q.x+3.34)),q.y-.79))-vec2f(.22,.62),vec2f(0.));
          let dist2=min(min(dot(e1,e1),dot(e2,e2)),min(dot(e3,e3),dot(e4,e4)));
          let w=clamp(.08+prop.y*prop.y*d*.45,.1,.78);let strip=exp(-dist2/(w*w))*smoothstep(.16,.45,r.z);
          if(uniforms.finish<3.5){col=pixel.rgb*1.06+vec3f(.018,.035,.010)+(.09+.23*rim)*detail+strip*.21;}
          else{col=pixel.rgb+(detail*(.11+.23*rim)+strip*.21)*prop.x;}
        }
      }
      if(uniforms.classify>.5){col=vec3f(prop.w);}fragmentOutputs.color=vec4f(col,1.);}`;
  store[code+'VertexShader']=gpu?wgv:glv;store[code+'FragmentShader']=gpu?wgf:glf;
  return function(part,desc){
    let strength=0;
    if(part.name.includes('Pressed plum'))strength=.63;
    else if(part.name.includes('powder-coated tube'))strength=.32;
    else if(part.name.includes('hinge rivets'))strength=.58;
    else if(part.name.includes('table laminate'))strength=.10;
    else if(part.name.includes('aluminium feet'))strength=.22;
    else if(part.name.includes('satin laminate'))strength=.06;
    let finish=0;
    const officeSurface=textures.officeprobe&&['lobby','fittings','plant'].includes(desc.tex);
    if(officeSurface){
      const name=part.name.toLowerCase();
      if(name.includes('frosted entrance glass'))finish=1;
      else if(name.includes('stainless')||desc.metal>=.75)finish=2;
      else if(name.includes('zz leaflet'))finish=3;
      else if(['monitor glass','black matte abs','light beech','satin laminate','scalloped panels','dispenser enamel'].some(key=>name.includes(key))){
        finish=4;strength=name.includes('monitor')?.62:name.includes('abs')?.16:.23;
      }
    }
    const mat=new B.ShaderMaterial(part.name,scene,code,{attributes:['position','normal','uv'],uniforms:gpu?['eye','props','classify','finish','mirrorClip']:['worldViewProjection','eye','props','classify','finish','mirrorClip'],uniformBuffers:gpu?['Scene']:[],samplers:['baked','probe','weave','officeMap','softMap'],shaderLanguage:gpu?B.ShaderLanguage.WGSL:B.ShaderLanguage.GLSL});
    mat.setVector2('mirrorClip',B.Vector2.Zero());mat.setFloat('finish',finish);mat.setTexture('officeMap',textures.officeprobe||textures.probe);mat.setTexture('softMap',textures.softprobe||textures.probe);mat.backFaceCulling=false;mat.setTexture('baked',textures[desc.tex]);mat.setTexture('probe',textures.probe);mat.setTexture('weave',textures.weave);
    mat.setVector4('props',new B.Vector4(strength,desc.rough??.72,['branch','city','extension','sky'].includes(part.role)?1:(part.role==='floor'?-1:0),part.role==='chair'?1:0));
    mat.setVector3('eye',eye);mat.setFloat('classify',0);return mat;
  };
}
