// The fixed UV texture contains Cycles diffuse light. Reflected room lights are evaluated in world space.
export function makeSurfaceFactory(B,scene,gpu,textures,eye){
  const code='meetingNativeSurface';const store=gpu?B.ShaderStore.ShadersStoreWGSL:B.ShaderStore.ShadersStore;
  const glv=`precision highp float;attribute vec3 position;attribute vec3 normal;attribute vec2 uv;uniform mat4 worldViewProjection;varying vec3 P;varying vec3 N;varying vec2 T;
  void main(){P=vec3(position.x,-position.z,position.y);N=vec3(normal.x,-normal.z,normal.y);T=vec2(uv.x,1.-uv.y);gl_Position=worldViewProjection*vec4(position,1.);}`;
  const wgv=`#include<sceneUboDeclaration>
  attribute position:vec3f;attribute normal:vec3f;attribute uv:vec2f;varying P:vec3f;varying N:vec3f;varying T:vec2f;
  @vertex fn main(input:VertexInputs)->FragmentInputs{let p=vertexInputs.position;let n=vertexInputs.normal;vertexOutputs.P=vec3f(p.x,-p.z,p.y);vertexOutputs.N=vec3f(n.x,-n.z,n.y);vertexOutputs.T=vec2f(vertexInputs.uv.x,1.-vertexInputs.uv.y);vertexOutputs.position=scene.viewProjection*vec4f(p,1.);}`;
  const glf=`precision highp float;varying vec3 P;varying vec3 N;varying vec2 T;uniform vec3 eye;uniform vec4 props;uniform float classify;uniform sampler2D baked;uniform sampler2D probe;uniform sampler2D weave;
  void main(){vec4 pixel=texture2D(baked,T);vec3 v=normalize(eye-P),n=normalize(N);if(dot(n,v)<0.)n=-n;
    vec3 r=reflect(-v,n);vec3 env=texture2D(probe,vec2(.5+atan(r.x,r.y)*.159155,.5-asin(clamp(r.z,-1.,1.))*.31831)).rgb;
    if(props.z>0.){float t=(9.487-eye.y)/(P.y-eye.y);vec3 hit=eye+t*(P-eye);if(t<=0.||t>=1.||hit.x<.096||hit.x>4.204||hit.z<1.070||hit.z>2.53||pixel.a<.43)discard;}
    if(classify>.5){gl_FragColor=vec4(vec3(props.w),1.);return;}
    float fibre=texture2D(weave,P.xy).r-.5;vec3 col=pixel.rgb;if(props.z<0.)col*=1.+fibre*.70;if(props.x>.60){float lum=clamp(dot(col,vec3(.28,.56,.16)),.06,.40);col=mix(col,lum*vec3(1.16,.82,1.36),.55)*1.10+vec3(.031,.018,.043);}
    if(props.z>0.)col=mix(col,vec3(.83,.85,.87),.075);
    if(props.x>0.){float d=(2.646-P.z)/max(.02,r.z);vec2 q=P.xy+r.xy*d;float w=clamp(props.y*props.y*max(.1,d)*.64,.026,.80);
      float dx=min(abs(q.x-1.13),abs(q.x-3.17))-.865;float row=clamp(floor((q.y-3.37)/1.18+.5),0.,4.);
      float dy=abs(q.y-(3.37+1.18*row))-.056;vec2 edge=max(vec2(0.),vec2(dx,dy));float gloss=exp(-dot(edge,edge)/(w*w))*smoothstep(.08,.44,r.z);
      float fres=.045+.21*pow(1.-max(0.,dot(n,v)),5.);
      col+=props.x*(env*(.24+fres)*.36+vec3(.96,.96,1.)*gloss*(.9-props.y*.66));}
    gl_FragColor=vec4(col,1.);}`;
  const wgf=`varying P:vec3f;varying N:vec3f;varying T:vec2f;uniform eye:vec3f;uniform props:vec4f;uniform classify:f32;
    var weaveSampler:sampler;var weave:texture_2d<f32>;var bakedSampler:sampler;var baked:texture_2d<f32>;var probeSampler:sampler;var probe:texture_2d<f32>;
    @fragment fn main(input:FragmentInputs)->FragmentOutputs{let P=fragmentInputs.P;let prop=uniforms.props;let eye=uniforms.eye;
      let pixel=textureSample(baked,bakedSampler,fragmentInputs.T);let v=normalize(eye-P);var n=normalize(fragmentInputs.N);if(dot(n,v)<0.){n=-n;}
      let r=reflect(-v,n);let env=textureSampleLevel(probe,probeSampler,vec2f(.5+atan2(r.x,r.y)*.159155,.5-asin(clamp(r.z,-1.,1.))*.31831),2.).rgb;
      if(prop.z>0.){let t=(9.487-eye.y)/(P.y-eye.y);let hit=eye+t*(P-eye);if(t<=0.||t>=1.||hit.x<.096||hit.x>4.204||hit.z<1.070||hit.z>2.53||pixel.a<.43){discard;}}
      let fibre=textureSample(weave,weaveSampler,P.xy).r-.5;var col=pixel.rgb;if(prop.z<0.){col*=1.+fibre*.70;}if(prop.x>.60){let lum=clamp(dot(col,vec3f(.28,.56,.16)),.06,.40);col=mix(col,lum*vec3f(1.16,.82,1.36),.55)*1.10+vec3f(.031,.018,.043);}if(prop.z>0.){col=mix(col,vec3f(.83,.85,.87),.075);}
      if(prop.x>0.){let d=(2.646-P.z)/max(.02,r.z);let q=P.xy+r.xy*d;let w=clamp(prop.y*prop.y*max(.1,d)*.64,.026,.80);
        let dx=min(abs(q.x-1.13),abs(q.x-3.17))-.865;let row=clamp(floor((q.y-3.37)/1.18+.5),0.,4.);
        let dy=abs(q.y-(3.37+1.18*row))-.056;let edge=max(vec2f(0.),vec2f(dx,dy));
        let gloss=exp(-dot(edge,edge)/(w*w))*smoothstep(.08,.44,r.z);let fres=.045+.21*pow(1.-max(0.,dot(n,v)),5.);
        col+=prop.x*(env*(.24+fres)*.36+vec3f(.96,.96,1.)*gloss*(.9-prop.y*.66));}
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
    const mat=new B.ShaderMaterial(part.name,scene,code,{attributes:['position','normal','uv'],uniforms:gpu?['eye','props','classify']:['worldViewProjection','eye','props','classify'],uniformBuffers:gpu?['Scene']:[],samplers:['baked','probe','weave'],shaderLanguage:gpu?B.ShaderLanguage.WGSL:B.ShaderLanguage.GLSL});
    mat.backFaceCulling=false;mat.setTexture('baked',textures[desc.tex]);mat.setTexture('probe',textures.probe);mat.setTexture('weave',textures.weave);
    mat.setVector4('props',new B.Vector4(strength,desc.rough??.72,['branch','city','extension','sky'].includes(part.role)?1:(part.role==='floor'?-1:0),part.role==='chair'?1:0));
    mat.setVector3('eye',eye);mat.setFloat('classify',0);return mat;
  };
}
