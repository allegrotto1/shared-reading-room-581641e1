import {readMedia} from './media.js?rev=babylon9a';
const B=globalThis.BABYLON;

export async function createEngine(canvas) {
  const options={preserveDrawingBuffer:true,stencil:true,powerPreference:'high-performance',antialias:true};
  const fallback=new URLSearchParams(location.search).get('graphics')==='webgl';
  if(!fallback && navigator.gpu && await B.WebGPUEngine.IsSupportedAsync) {
    let engine;
    try {
      engine=new B.WebGPUEngine(canvas,options);
      await engine.initAsync();
      return engine;
    }catch(error){engine?.dispose(); console.warn('WebGPU unavailable, opening WebGL.',error.message);}
  }
  return new B.Engine(canvas,true,options);
}
export async function loadOffice(engine, progress) {
  B.SceneLoader.ShowLoadingScreen=false;
  B.Tools.AssetBaseUrl=new URL('../vendor/babylon',import.meta.url).href;
  const scene=new B.Scene(engine);scene.clearColor=new B.Color4(.75,.78,.79,1);
  scene.imageProcessingConfiguration.toneMappingEnabled=false;
  engine.enableOfflineSupport=false;
  const response=await readMedia('./POD-office.babylon.gz');
  if(!response.ok)throw Error('Office model unavailable');
  const text=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text();
  const data=JSON.parse(text);
  if(data.producer?.name!=='Blender'||!data.meshes.length)throw Error('Invalid native office');
  const names=new Set();
  for(const material of data.materials)for(const v of Object.values(material))if(v?.name?.startsWith('materials/'))names.add(v.name);
  const textures=new Map();const list=[...names];let cursor=0,done=0;
  await Promise.all(Array.from({length:5},async()=>{
    while(cursor<list.length){
      const name=list[cursor++],res=await readMedia('./'+name);
      if(!res.ok)throw Error('Surface not available');
      textures.set(name,URL.createObjectURL(new Blob([await res.arrayBuffer()],{type:name.endsWith('.webp')?'image/webp':'image/png'})));
      progress(24+62*++done/list.length,'正在載入地氈、枱凳同櫃面');
    }
  }));
  for(const mat of data.materials)for(const v of Object.values(mat)){
    if(textures.has(v?.name)){v.name=textures.get(v.name);v.url=v.name;}
  }
  await B.SceneLoader.AppendAsync('', 'data:'+JSON.stringify(data), scene,undefined,'.babylon');
  // These imported, measured fixtures belong to the Blender file. Indirect illumination is baked.
  const nativeCounts={lights:scene.lights.length,rectangularLights:scene.lights.filter(light=>light instanceof B.RectAreaLight).length,cameras:scene.cameras.length,meshes:scene.meshes.length,source:data.producer.exporter_version};
  let maxPositionError=0,maxAimError=0;
  for(const lamp of scene.lights.filter(light=>light instanceof B.RectAreaLight)){
    const source=data.lights.find(item=>item.id===lamp.id);
    const mount=scene.getTransformNodeById(source.parentId);
    if(!mount)throw Error('Missing rectangular light mount');
    if(lamp.parent!==mount)lamp.parent=mount;
    const matrix=mount.computeWorldMatrix(true),[x,y,z]=source.metadata.xyz,[ax,ay,az]=source.metadata.aim;
    const actualPosition=B.Vector3.TransformCoordinates(lamp.position,matrix);
    const actualAim=B.Vector3.TransformNormal(new B.Vector3(0,0,-1),matrix).normalize();
    maxPositionError=Math.max(maxPositionError,B.Vector3.Distance(actualPosition,new B.Vector3(x,z,y)));
    maxAimError=Math.max(maxAimError,B.Vector3.Distance(actualAim,new B.Vector3(ax,az,ay)));
    if(Math.abs(lamp.width-source.width)>.0001 || Math.abs(lamp.height-source.height)>.0001)throw Error('Rectangular light dimensions changed');
  }
  if(maxPositionError>.001 || maxAimError>.001)throw Error('Rectangular light rig misaligned');
  nativeCounts.fixtureMaxErrorMm=+(maxPositionError*1000).toFixed(3);
  for(const l of scene.lights){
    const meeting=l.name.includes('Meeting LED');
    l.renderPriority=meeting?7:l.name.includes('sign washer')?4:1;
    if(meeting){
      l.includedOnlyMeshes=scene.meshes.filter(mesh=>mesh.name.startsWith('seating-v8')||mesh.name.startsWith('ceiling-v7'));
    }else if(l.name.includes('working emitter')){
      l.includedOnlyMeshes=scene.meshes.filter(mesh=>!mesh.name.startsWith('seating-v8'));
    }
  }
  const fill=new B.HemisphericLight('Interior bounce for unbaked hardware',new B.Vector3(.12,1,.08),scene);
  fill.intensity=.76;fill.groundColor=new B.Color3(.56,.54,.55);fill.renderPriority=10;
  const envRes=await readMedia('./pilot/meeting-reflection.hdr');
  if(envRes.ok){
    const envURL=URL.createObjectURL(new Blob([await envRes.arrayBuffer()]));
    const environment=new B.HDRCubeTexture(envURL,scene,128,false,true,false,false);
    scene.environmentTexture=environment;scene.environmentIntensity=.45;
    scene.onDisposeObservable.addOnce(()=>URL.revokeObjectURL(envURL));
  }
  for(const m of scene.materials){if(m.maxSimultaneousLights!==undefined) m.maxSimultaneousLights=!m.unlit&&m.name.startsWith('POD8 seating')?8:4;
    if(m.unlit){m.environmentIntensity=0;}
    for(const tex of m.getActiveTextures())tex.anisotropicFilteringLevel=Math.min(engine.getCaps().maxAnisotropy||1,8);
  }
  const camera=new B.FreeCamera('Visitor',new B.Vector3(0,1.62,0),scene);
  camera.minZ=.035;camera.maxZ=100;scene.activeCamera=camera;camera.inputs.clear();
  scene.onDisposeObservable.addOnce(()=>{for(const url of textures.values())URL.revokeObjectURL(url);});
  for(const mesh of scene.meshes){mesh.isPickable=true;mesh.freezeWorldMatrix();}
  await scene.whenReadyAsync();
  return {scene,camera,nativeCounts};
}
export function aimCamera(camera,x,y,height,yaw,pitch,fov) {
  const cp=Math.cos(pitch);camera.position.set(x,height,y);
  camera.setTarget(new B.Vector3(x-Math.sin(yaw)*cp,height+Math.sin(pitch),y+Math.cos(yaw)*cp));camera.fov=fov*Math.PI/180;
}

