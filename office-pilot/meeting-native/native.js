import { Navigation } from '../whiteboard/nav-floor.js';
import { stepGuide, stepManual } from '../whiteboard/guide.js';
import { makeSurfaceFactory } from './surface-material.js';
const element=id=>document.getElementById(id);
const canvas=element('scene'),status=element('status'),params=new URLSearchParams(location.search);
const review=params.has('review'),view={xy:[1.12,1.76],yaw:.20,pitch:-.125},route={points:[],autoLook:false};
const keys=new Set(),materials=new Map(),cameraEye={};let B,engine,scene,cam,nav,ready=false,dirty=true,drag,measurement=null;
let lastState='',last=0,firstReady=0;
function clearMotion(){keys.clear();route.points=[];for(const el of document.querySelectorAll('[data-key]'))el.removeAttribute('data-active');}
async function get(url){const res=await fetch(url);if(!res.ok)throw Error('Could not open '+url);return res;}
async function unpack(url){return new Response((await get(url)).body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();}
async function bundle(){
  const bytes=await unpack('../vendor/babylon/babylon-9.37.0.js.gz');
  const url=URL.createObjectURL(new Blob([bytes],{type:'text/javascript'}));
  try{await new Promise((ok,fail)=>{const s=document.createElement('script');s.src=url;s.onload=ok;s.onerror=fail;document.head.append(s);});}
  finally{URL.revokeObjectURL(url);}B=window.BABYLON;
}
async function packet(name){const [spec,blob]=await Promise.all([get('assets/'+name+'.json').then(r=>r.json()),unpack('assets/'+name+'.bin.gz')]);return [spec,new DataView(blob)];}
function install(spec,bytes,factory){
  for(const part of spec.mesh){
    const n=part.v,positions=new Float32Array(n*3),normals=new Float32Array(n*3),uvs=new Float32Array(n*2);let off=part.offset;
    for(let i=0;i<n;i++,off+=13){
      const p=i*3,k=i*2;positions[p]=part.min[0]+part.extent[0]*bytes.getUint16(off,true)/65535;
      positions[p+1]=part.min[2]+part.extent[2]*bytes.getUint16(off+4,true)/65535;
      positions[p+2]=-part.min[1]-part.extent[1]*bytes.getUint16(off+2,true)/65535;
      normals[p]=bytes.getInt8(off+6)/127;normals[p+1]=bytes.getInt8(off+8)/127;normals[p+2]=-bytes.getInt8(off+7)/127;
      uvs[k]=bytes.getUint16(off+9,true)/65535;uvs[k+1]=bytes.getUint16(off+11,true)/65535;
    }
    const index=part.word===2?new Uint16Array(part.i):new Uint32Array(part.i);
    for(let j=0;j<part.i;j++,off+=part.word)index[j]=part.word===2?bytes.getUint16(off,true):bytes.getUint32(off,true);
    const mesh=new B.Mesh(part.name,scene);mesh.setVerticesData('position',positions);mesh.setVerticesData('normal',normals);mesh.setVerticesData('uv',uvs);mesh.setIndices(index);
    const tag=part.mat+' / '+part.role;if(!materials.has(tag))materials.set(tag,factory(part,spec.materials[part.mat]));
    mesh.material=materials.get(tag);mesh.isPickable=true;mesh.metadata={role:part.role};mesh.freezeWorldMatrix();
  }
}
function loadTexture(key){
  return new Promise((resolve,reject)=>{
    const tex=new B.Texture('assets/'+key+'.webp',scene,false,false,B.Texture.TRILINEAR_SAMPLINGMODE,()=>resolve(tex),(msg)=>reject(Error(key+': '+msg)));
    tex.wrapU=tex.wrapV=B.Texture.CLAMP_ADDRESSMODE;tex.anisotropicFilteringLevel=Math.min(8,engine.getCaps().maxAnisotropy||1);
  });
}
function moveCamera(){
  const [x,y]=view.xy,h=1.62;cam.position.set(x,h,-y);const c=Math.cos(view.pitch),position=cam.position;
  cam.setTarget(new B.Vector3(x+Math.sin(view.yaw)*c,h+Math.sin(view.pitch),-y-Math.cos(view.yaw)*c));
  cameraEye.value.set(x,y,h);
  for(const mat of materials.values())mat.setVector3('eye',cameraEye.value);
  cam.getViewMatrix(true);
}
function resize(){
  if(!engine)return;
  const d=review&&params.get('scale')!=='device'?1:Math.min(devicePixelRatio||1,2,1700/Math.max(canvas.clientWidth,canvas.clientHeight));
  engine.setHardwareScalingLevel(1/d);engine.resize();dirty=true;
}
function snapshot(){return {eye:[...view.xy,1.62],yaw:view.yaw,pitch:view.pitch,vfov:cam?.fov,width:engine?.getRenderWidth(),height:engine?.getRenderHeight(),backend:engine?.isWebGPU?'WebGPU':'WebGL2',firstReadyMs:Math.round(firstReady),moving:keys.size>0||route.points.length>0};}
function hinted(){element('hint').dataset.done='true';}
function tap(x,y){
  if(!ready)return;
  if(route.points.length){route.points=[];return;}
  const hit=scene.pick(x,y,m=>m.isPickable);
  if(!hit?.hit||hit.pickedMesh.metadata?.role!=='floor')return;
  const p=[hit.pickedPoint.x,-hit.pickedPoint.z],dest=nav.safe(p)?p:nav.nearest(p,.30);
  if(dest)route.points=nav.path(view.xy,dest)||[];
}
function controls(){
  const accepted=new Set(['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright','shift']);
  window.addEventListener('keydown',ev=>{
    if(!ready||ev.altKey||ev.metaKey||ev.ctrlKey)return;
    const k=ev.key.toLowerCase();if(k==='escape'||k===' '){if(ev.target===canvas||ev.target===document.body){clearMotion();ev.preventDefault();}return;}
    if(accepted.has(k)){ev.preventDefault();route.points=[];keys.add(k);hinted();}
  });window.addEventListener('keyup',ev=>keys.delete(ev.key.toLowerCase()));
  function reset(){drag=null;clearMotion();last=0;}window.addEventListener('blur',reset);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
  for(const button of document.querySelectorAll('[data-key]')){
    const k=button.dataset.key;
    button.addEventListener('pointerdown',ev=>{ev.preventDefault();if(!ready)return;button.setPointerCapture(ev.pointerId);button.dataset.active='true';route.points=[];keys.add(k);hinted();});
    const release=()=>{keys.delete(k);button.removeAttribute('data-active');};button.addEventListener('lostpointercapture',release);button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);
  }
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('pointerdown',ev=>{if(!ready||drag||ev.button!==0)return;canvas.focus({preventScroll:true});canvas.setPointerCapture(ev.pointerId);drag={id:ev.pointerId,x:ev.clientX,y:ev.clientY,sx:ev.clientX,sy:ev.clientY,look:false};});
  canvas.addEventListener('pointermove',ev=>{if(drag?.id!==ev.pointerId)return;
    if(!drag.look&&Math.hypot(ev.clientX-drag.sx,ev.clientY-drag.sy)>4){drag.look=true;route.points=[];}
    if(drag.look){const k=1.65/Math.min(900,canvas.clientHeight);view.yaw-=(ev.clientX-drag.x)*k;view.pitch=Math.max(-1.25,Math.min(1.18,view.pitch+(ev.clientY-drag.y)*k));dirty=true;hinted();}
    drag.x=ev.clientX;drag.y=ev.clientY;
  });
  canvas.addEventListener('pointerup',ev=>{if(drag?.id!==ev.pointerId)return;const moved=drag.look;drag=null;if(!moved){tap(ev.clientX,ev.clientY);hinted();}});
  canvas.addEventListener('lostpointercapture',ev=>{if(drag?.id===ev.pointerId)drag=null;});
  const btn=element('measure'),result=element('result');
  btn.addEventListener('click',()=>{if(!ready)return;
    result.hidden=false;
    if(!measurement){measurement={frames:[]};btn.textContent='Finish test';btn.setAttribute('aria-pressed','true');result.textContent='Walk and turn, then finish the test.';return;}
    const a=measurement.frames.sort((x,y)=>x-y);measurement=null;btn.textContent='Measure walk';btn.setAttribute('aria-pressed','false');
    result.textContent=a.length>4?snapshot().width+' × '+snapshot().height+' · P95 '+a[Math.ceil(a.length*.95)-1].toFixed(1)+' ms · Max '+a[a.length-1].toFixed(0)+' ms ('+a.length+' frames)':'Walk for a few seconds, then finish.';
  });
}
async function main(){
  controls();
  const payload=Promise.all([packet('room'),packet('street'),get('assets/navigation.json').then(r=>r.json())]);
  await bundle();if(params.get('graphics')!=='webgl'&&navigator.gpu&&await B.WebGPUEngine.IsSupportedAsync){
    try{engine=new B.WebGPUEngine(canvas,{antialias:true,powerPreference:'high-performance'});await engine.initAsync();}catch{engine?.dispose();engine=null;}
  }
  if(!engine)engine=new B.Engine(canvas,true,{preserveDrawingBuffer:review,stencil:true,powerPreference:'high-performance'},false);
  resize();window.addEventListener('resize',resize);scene=new B.Scene(engine);scene.useRightHandedSystem=true;scene.skipPointerMovePicking=true;scene.clearColor=new B.Color4(.72,.77,.82,1);
  cam=new B.FreeCamera('Visitor',new B.Vector3(0,1.62,0),scene);cam.minZ=.025;cam.maxZ=1050;cam.fov=Math.PI/3;cam.inputs.clear();scene.activeCamera=cam;
  cameraEye.value=new B.Vector3(...[view.xy[0],view.xy[1],1.62]);status.textContent='Preparing the light and surfaces…';
  const names=['floor','furniture','shell','paper','city','branch','extension','probe','weave'];
  const [[room,street,layout],images]=await Promise.all([payload,Promise.all(names.map(loadTexture))]);
  const textures=Object.fromEntries(names.map((name,i)=>[name,images[i]]));textures.weave.wrapU=textures.weave.wrapV=B.Texture.WRAP_ADDRESSMODE;nav=new Navigation(layout);
  const factory=makeSurfaceFactory(B,scene,!!engine.isWebGPU,textures,cameraEye.value);install(...room,factory);install(...street,factory);
  moveCamera();await scene.whenReadyAsync();
  if(review)window.nativeQA={ready:true,state:snapshot,walkable:p=>nav.safe(p),place(p){view.xy=p.slice(0,2);view.yaw=p[2];view.pitch=p[3];dirty=true;},async pose(p,id=false){
    clearMotion();view.xy=p.slice(0,2);view.yaw=p[2];view.pitch=p[3];
    for(const mat of materials.values())mat.setFloat('classify',id?1:0);
    scene.clearColor=id?new B.Color4(0,0,0,1):new B.Color4(.72,.77,.82,1);dirty=true;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  }};
  window.addEventListener('pageshow',()=>{dirty=true;});
  engine.runRenderLoop(()=>{
    const now=performance.now(),raw=last>0?now-last:0;last=now;if(document.hidden)return;
    const dt=Math.min(.065,raw/1000);const keyMotion=stepManual(view,keys,nav,dt),walking=stepGuide(view,route,nav,dt);
    const s=view.xy[0]+','+view.xy[1]+','+view.yaw+','+view.pitch;
    const moving=keyMotion||walking||drag?.look||s!==lastState;
    if(measurement&&raw>0&&moving)measurement.frames.push(raw);
    if(moving||dirty){moveCamera();dirty=false;lastState=s;}
    scene.render();
    if(!ready){firstReady=performance.now();ready=true;document.querySelector('.loading').hidden=true;document.body.dataset.ready='true';}
  });
  if(!matchMedia('(pointer:coarse)').matches)element('hint').textContent='WASD to walk · Drag to look · Click the floor to walk';
  setTimeout(hinted,8200);
}
main().catch(err=>{console.error(err);document.body.dataset.error=String(err.message||err);status.textContent='The room could not open. '+String(err.message||err);});
