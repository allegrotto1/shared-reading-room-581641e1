// Cycles rendered the same physical vessel at rest and at the two extremes of
// its native water shape keys. Only the depth-tested bottle shell samples them.
export function makeDispenser(B, scene, capture, atlas) {
  const mesh = new B.Mesh('Pantry dispenser bottle', scene);
  const data = new B.VertexData();
  data.positions = capture.positions.flatMap(([x,y,h]) => [x,h,-y]);
  data.indices = capture.triangles.flat();
  data.applyToMesh(mesh);
  mesh.freezeWorldMatrix();
  const gpu = scene.getEngine().isWebGPU;
  const id = 'hotelDispenser';
  const store = gpu ? B.ShaderStore.ShadersStoreWGSL : B.ShaderStore.ShadersStore;
  const glVertex = `precision highp float;attribute vec3 position;
    uniform mat4 worldViewProjection;varying vec3 point;
    void main(){point=vec3(position.x,-position.z,position.y);gl_Position=worldViewProjection*vec4(position,1.);}`;
  const wgVertex = `#include<sceneUboDeclaration>
    attribute position:vec3f;varying point:vec3f;
    @vertex fn main(input:VertexInputs)->FragmentInputs{
      let p=vertexInputs.position;vertexOutputs.point=vec3f(p.x,-p.z,p.y);
      vertexOutputs.position=scene.viewProjection*vec4f(p,1.);
    }`;
  const slots=[0,1,2];
  const vectors=slots.flatMap(i=>['eye','right','up','forward'].map(s=>s+i));
  const count=capture.poses.length.toFixed(1);
  const glFragment=`precision highp float;varying vec3 point;uniform sampler2D photos;uniform vec3 weights;uniform float wave;
    ${vectors.map(n=>'uniform vec4 '+n+';').join('\n')}
    ${slots.map(i=>`vec3 read${i}(){
      vec3 v=point-eye${i}.xyz;float scale=eye${i}.w/max(.02,dot(v,forward${i}.xyz));
      vec2 tile=clamp(vec2(.5)+scale*vec2(dot(v,right${i}.xyz),-dot(v,up${i}.xyz)),.002,.998);
      vec2 uv=(tile+vec2(0.,forward${i}.w))/vec2(3.,${count});
      vec3 still=texture2D(photos,uv).rgb;
      if(abs(wave)<.001)return still;
      float column=wave<0.?1.:2.;
      return mix(still,texture2D(photos,uv+vec2(column/3.,0.)).rgb,abs(wave));
    }`).join('\n')}
    void main(){gl_FragColor=vec4(read0()*weights.x+read1()*weights.y+read2()*weights.z,1.);}`;
  const wgFragment=`varying point:vec3f;var photosSampler:sampler;var photos:texture_2d<f32>;
    uniform weights:vec3f;uniform wave:f32;
    ${vectors.map(n=>'uniform '+n+':vec4f;').join('\n')}
    ${slots.map(i=>`fn read${i}(p:vec3f)->vec3f{
      let v=p-uniforms.eye${i}.xyz;let scale=uniforms.eye${i}.w/max(.02,dot(v,uniforms.forward${i}.xyz));
      let tile=clamp(vec2f(.5)+scale*vec2f(dot(v,uniforms.right${i}.xyz),-dot(v,uniforms.up${i}.xyz)),vec2f(.002),vec2f(.998));
      let uv=(tile+vec2f(0.,uniforms.forward${i}.w))/vec2f(3.,${count});
      let still=textureSampleLevel(photos,photosSampler,uv,0.).rgb;
      if(abs(uniforms.wave)<.001){return still;}
      let column=select(2.,1.,uniforms.wave<0.);
      return mix(still,textureSampleLevel(photos,photosSampler,uv+vec2f(column/3.,0.),0.).rgb,abs(uniforms.wave));
    }`).join('\n')}
    @fragment fn main(input:FragmentInputs)->FragmentOutputs{
      let p=fragmentInputs.point;let w=uniforms.weights;
      fragmentOutputs.color=vec4f(read0(p)*w.x+read1(p)*w.y+read2(p)*w.z,1.);
    }`;
  store[id+'VertexShader']=gpu?wgVertex:glVertex;
  store[id+'FragmentShader']=gpu?wgFragment:glFragment;
  const mat = new B.ShaderMaterial('Pantry water in its bottle',scene,{vertex:id,fragment:id},{
    attributes:['position'], uniforms:[...(gpu?[]:['worldViewProjection']),...vectors,'weights','wave'],
    uniformBuffers:gpu?['Scene']:[],samplers:['photos'],shaderLanguage:gpu?B.ShaderLanguage.WGSL:B.ShaderLanguage.GLSL
  });
  mat.backFaceCulling=false;
  mat.setTexture('photos',atlas);
  mesh.material=mat;
  const direction=([x,y,h])=>new B.Vector3(x-4.03,y+.86,h-1.39).normalize();
  const poses=capture.poses.map((p,index)=>({...p,index,direction:direction(p.eye),
    uniforms:[new B.Vector4(...p.eye,p.focal),new B.Vector4(...p.right,0),new B.Vector4(...p.up,0),new B.Vector4(...p.forward,index)]}));
  let lastX,lastY,lastH, ids=[];
  function update(xy,h,t) {
    if(lastX!==xy[0]||lastY!==xy[1]||lastH!==h){
      const d=direction([...xy,h]);
      const near=poses.map(p=>({p,gap:Math.max(.00002,1-B.Vector3.Dot(d,p.direction))})).sort((a,b)=>a.gap-b.gap);
      const w=near.slice(0,3).map(a=>(1/a.gap-1/near[3].gap)**2);
      const total=w.reduce((a,b)=>a+b,0);
      mat.setVector3('weights',new B.Vector3(...(total>0?w.map(v=>v/total):[1,0,0])));
      for(const i of slots){const p=near[i].p;if(ids[i]===p.index)continue;
        ['eye','right','up','forward'].forEach((name,j)=>mat.setVector4(name+i,p.uniforms[j]));
        ids[i]=p.index;
      }
      [lastX,lastY]=xy;lastH=h;
    }
    mat.setFloat('wave',t<0?0:Math.min(1,t/.065)*Math.exp(-2.4*t)*Math.sin(17.4*t));
  }
  return {mesh,update,prepare:()=>mat.forceCompilationAsync(mesh)};
}
