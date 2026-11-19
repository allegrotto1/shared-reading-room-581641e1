import {WaterMotion} from '../whiteboard/water-motion.js';
export function installBottle(B,scene,source,probe){
  const toBabylon=positions=>Float32Array.from(positions.flatMap(([x,y,z])=>[x,z,-y]));
  const reflection=probe.clone();reflection.level=.34;reflection.coordinatesMode=B.Texture.FIXED_EQUIRECTANGULAR_MODE;
  const model=(name,[points,faces],order)=>{
    const mesh=new B.Mesh(name,scene);const p=toBabylon(points),indices=Uint16Array.from(faces.flat()),normals=new Float32Array(p.length);
    B.VertexData.ComputeNormals(p,indices,normals,{useRightHandedSystem:true});
    mesh.setVerticesData('position',p,order===1);mesh.setVerticesData('normal',normals,order===1);mesh.setIndices(indices);
    mesh.metadata={role:'bottle'};mesh.alphaIndex=order;mesh.freezeWorldMatrix();
    const mat=new B.StandardMaterial(name,scene);mat.backFaceCulling=true;
    mat.diffuseColor=B.Color3.FromHexString(order===1?'#354e55':'#84939a');
    mat.emissiveColor=B.Color3.FromHexString(order===1?'#080f14':'#111a20');
    mat.specularColor=new B.Color3(.22,.25,.27);mat.specularPower=order===1?110:86;
    mat.reflectionTexture=reflection;mat.reflectionFresnelParameters=new B.FresnelParameters();
    mat.reflectionFresnelParameters.bias=.03;mat.reflectionFresnelParameters.power=3.6;
    mat.opacityFresnelParameters=new B.FresnelParameters();mat.opacityFresnelParameters.leftColor=new B.Color3(.76,.76,.76);
    mat.opacityFresnelParameters.rightColor=new B.Color3(order===1?.49:.14,order===1?.49:.14,order===1?.49:.14);
    mat.opacityFresnelParameters.power=2.5;mat.alpha=order===1?.85:.38;mat.transparencyMode=B.Material.MATERIAL_ALPHABLEND;
    mesh.material=mat;return {mesh,p,indices,normals};
  };
  const shell=model('Pantry jug · ribbed polycarbonate',source.jug,2),liquid=model('Water and moving meniscus',source.water,1);
  const fill=new B.HemisphericLight('Pantry ambient',new B.Vector3(0,1,0),scene);fill.intensity=.61;fill.groundColor=B.Color3.FromHexString('#575159');
  const lamp=new B.PointLight('Pantry counter panel',new B.Vector3(3.15,2.57,1.19),scene);lamp.intensity=.47;lamp.radius=.36;
  fill.includedOnlyMeshes=lamp.includedOnlyMeshes=[liquid.mesh,shell.mesh];
  const [lower,upper]=source.displacements.map(toBabylon),positions=new Float32Array(liquid.p);
  const motion=new WaterMotion();let previous=0;
  return {motion,update(now){
    const age=motion.age(now);const wave=age<0?0:Math.min(1,age/.065)*Math.exp(-2.4*age)*Math.sin(17.4*age);
    if(wave===previous)return false;previous=wave;const d=wave<0?lower:upper,w=Math.abs(wave);
    for(let i=0;i<positions.length;i++)positions[i]=liquid.p[i]+w*d[i];
    liquid.mesh.updateVerticesData('position',positions);
    B.VertexData.ComputeNormals(positions,liquid.indices,liquid.normals,{useRightHandedSystem:true});liquid.mesh.updateVerticesData('normal',liquid.normals);return true;
  }};
}
