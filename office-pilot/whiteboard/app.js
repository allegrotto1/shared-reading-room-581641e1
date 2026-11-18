import {enter,readFile} from './transport.js';
import {WalkArea,barycentric} from './walk.js';
import {projectionMaterial} from './projection.js';

const $=s=>document.querySelector(s), canvas=$('#scene'), qs=new URLSearchParams(location.search);
const keys=new Set(),records=new Map();
let B,engine,scene,cam,material,geo,layout,area,xy,yaw,pitch,cache=new Map(),pending=new Map(),active=[],walkPath=[];
let dirty=true,manual=false,ready=false,last=performance.now(),lastDraw=null,stats=[],generation=0;
const vfov=60*Math.PI/180;
const isMobile=matchMedia('(pointer:coarse)').matches;
async function engineBundle(){
  const response=await fetch('../vendor/babylon/babylon-9.37.0.js.gz');
  if(!response.ok)throw Error('Babylon.js 未能載入');
  const bin=await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).blob();
  const url=URL.createObjectURL(new Blob([bin],{type:'text/javascript'}));
  try{await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=resolve;s.onerror=reject;document.head.append(s);});}
  finally{URL.revokeObjectURL(url);}
  B=window.BABYLON;
}
function loading(msg,p){$('#status').textContent=msg;$('progress').value=p;}
function texture(bytes,depth=false){
  const mime=bytes[0]===137?'image/png':'image/webp';
  const url=URL.createObjectURL(new Blob([bytes],{type:mime}));
  return new Promise((resolve,reject)=>{
    const t=new B.Texture(url,scene,depth,false,depth?B.Texture.NEAREST_SAMPLINGMODE:B.Texture.TRILINEAR_SAMPLINGMODE,()=>{
      URL.revokeObjectURL(url);t.wrapU=B.Texture.WRAP_ADDRESSMODE;t.wrapV=B.Texture.CLAMP_ADDRESSMODE;
      t.gammaSpace=false;t.anisotropicFilteringLevel=depth?1:4;resolve(t);
    },(msg,err)=>{URL.revokeObjectURL(url);reject(err||Error(msg));});
  });
}
async function blobFile(id){
  if(!records.has(id))records.set(id,readFile(id).catch(e=>{records.delete(id);throw e;}));return records.get(id);
}
function getView(i){
  if(cache.has(i))return Promise.resolve(cache.get(i));
  if(!pending.has(i)){
    const n='view-'+String(i).padStart(2,'0');
    const promise=Promise.all([blobFile(n+'.webp'),blobFile(n+'-z.png')]).then(async(data)=>{
      const [colour,depth]=await Promise.all([texture(data[0]),texture(data[1],true)]);
      const view={colour,depth,used:performance.now()};cache.set(i,view);dirty=true;return view;
    }).finally(()=>pending.delete(i));
    pending.set(i,promise);
  }
  return pending.get(i);
}
let want=[],fixedGuard=7;
function requestViews(ids){
  if(ids.join(',')===want.join(','))return;
  want=ids.slice();
  const token=++generation;
  Promise.all(ids.map(getView)).then(()=>{if(token===generation)dirty=true;}).catch(e=>{console.warn('原畫載入重試',String(e));if(token===generation)setTimeout(()=>{want=[];dirty=true;},900);});
}
function bindSources(){
  const triangle=area.triangle(xy);
  requestViews(triangle.ids);
  if(triangle.ids.every(i=>cache.has(i)))active=triangle.ids.slice();
  if(!active.length)return;
  const guard=cache.has(fixedGuard)?fixedGuard:active[0];
  const weights=barycentric(xy,active,layout.anchors).map(w=>Math.max(0,w));
  const sum=weights.reduce((a,b)=>a+b,0);
  material.setVector4('weights',new B.Vector4(...weights.map(w=>w/sum),.0007));
  const current=[...active,guard];
  current.forEach((id,slot)=>{
    const source=cache.get(id);source.used=performance.now();
    material.setVector3('eye'+slot,B.Vector3.FromArray(layout.anchors[id]));
    material.setTexture('colour'+slot,source.colour);material.setTexture('depth'+slot,source.depth);
  });
  const retain=new Set([...current,...want]);
  const extra=[...cache.entries()].filter(([id])=>!retain.has(id)).sort((a,b)=>a[1].used-b[1].used);
  while(cache.size>6 && extra.length){const [id,t]=extra.shift();t.colour.dispose();t.depth.dispose();cache.delete(id);}
}
function geometry(buffer){
  const h=new DataView(buffer);
  if(h.getUint32(0,true)!==0x31524257)throw Error('幾何資料版本不符');
  const n=h.getUint32(4,true),m=h.getUint32(8,true);
  const pos=new Float32Array(buffer,16,n*3),layer=new Float32Array(buffer,16+n*12,n),index=new Uint32Array(buffer,16+n*16,m);
  if(16+n*16+m*4!==buffer.byteLength)throw Error('幾何資料不完整');
  geo=new B.Mesh('POD office · Cycles geometry',scene);
  geo.setVerticesData('position',pos,false,3);geo.setVerticesData('boardFace',layer,false,1);geo.setIndices(index);
  geo.material=material;geo.freezeWorldMatrix();
  const sky=B.MeshBuilder.CreateSphere('Exterior rays',{diameter:1400,segments:12},scene);
  sky.setVerticesData('boardFace',new Float32Array(sky.getTotalVertices()).fill(-1),false,1);sky.material=material;sky.isPickable=false;sky.freezeWorldMatrix();
}
function aim(){
  const cp=Math.cos(pitch);
  cam.position.set(xy[0],layout.eyeHeight,-xy[1]);
  cam.setTarget(new B.Vector3(xy[0]+Math.sin(yaw)*cp,layout.eyeHeight+Math.sin(pitch),-xy[1]-Math.cos(yaw)*cp));
  cam.fov=vfov;
  material.setVector3('visitorEye',new B.Vector3(xy[0],layout.eyeHeight,-xy[1]));
}
function sync(){
  aim();bindSources();engine.beginFrame();
  try{scene.render();}finally{engine.endFrame();}
  dirty=false;drawMap();
}
function forward(dt){
  const side=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
  const front=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'));
  const spin=Number(keys.has('e'))-Number(keys.has('q'));
  if(spin){yaw+=spin*dt*1.3;dirty=true;}
  if(side||front){
    const k=.92*dt/Math.hypot(side,front);
    xy=area.move(xy,k*(Math.sin(yaw)*front+Math.cos(yaw)*side),k*(Math.cos(yaw)*front-Math.sin(yaw)*side));walkPath=[];dirty=true;
  }else if(walkPath.length){
    const dest=walkPath[0],dx=dest[0]-xy[0],dy=dest[1]-xy[1],d=Math.hypot(dx,dy);
    if(d<.012){xy=dest;walkPath.shift();}
    else{const k=Math.min(1,dt*.92/d);xy=area.move(xy,dx*k,dy*k);}
    dirty=true;
  }
}
function frame(now){
  const delta=now-last;last=now;
  if(ready&&!manual){
    forward(Math.min(.06,delta/1000));
    const moving=Boolean(keys.size||drag||walkPath.length);
    if(!moving)lastDraw=null;
    if(dirty){
      if(moving&&lastDraw!==null)stats.push(now-lastDraw);
      if(stats.length>850)stats.shift();
      sync();if(moving)lastDraw=now;
    }
  }
  requestAnimationFrame(frame);
}
function state(){const adapter=engine._adapter?.info;return {eye:[xy[0],xy[1],layout.eyeHeight],yaw,pitch,vfov,width:engine.getRenderWidth(),height:engine.getRenderHeight(),backend:engine.name,adapter:adapter?[adapter.vendor,adapter.architecture,adapter.description].filter(Boolean).join(' / '):engine.getGlInfo?.().renderer,active:active.slice(),draws:scene.getActiveMeshes().length,frameTimes:stats.slice()};}
let drag;
canvas.addEventListener('pointerdown',e=>{if(!ready||e.button!==0)return;canvas.focus({preventScroll:true});walkPath=[];drag={id:e.pointerId,x:e.clientX,y:e.clientY,ox:e.clientX,oy:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  if(Math.hypot(e.clientX-drag.ox,e.clientY-drag.oy)>5)drag.moved=true;
  if(drag.moved){yaw-=(e.clientX-drag.x)*.0038;pitch=Math.max(-1.53,Math.min(1.53,pitch+(e.clientY-drag.y)*.003));dirty=true;}
  drag.x=e.clientX;drag.y=e.clientY;
});
canvas.addEventListener('pointerup',e=>{
  if(!drag||drag.id!==e.pointerId)return;
  if(!drag.moved){
    const box=canvas.getBoundingClientRect();const hit=scene.pick(e.clientX-box.left,e.clientY-box.top,m=>m===geo);
    if(hit?.pickedPoint&&hit.pickedPoint.y<.18)walkPath=area.path(xy,[hit.pickedPoint.x,-hit.pickedPoint.z]);
  }
  drag=null;
});
canvas.addEventListener('pointercancel',()=>drag=null);
const allowed=new Set(['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright']);
addEventListener('keydown',e=>{const k=e.key.toLowerCase();if(!allowed.has(k)||!ready||e.altKey||e.ctrlKey||e.metaKey)return;e.preventDefault();keys.add(k);});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
addEventListener('blur',()=>{keys.clear();drag=null;});
for(const b of document.querySelectorAll('[data-key]')){
  b.onpointerdown=e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);};
  b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>keys.delete(b.dataset.key);
}
const map=$('#floorMap'),plan=$('#mapToggle');
const mapPixel=(x,y)=>[25+(x-.52)*112,19+(.63-y)*83];
function drawMap(){
  if(map.hidden||!layout)return;
  const g=map.getContext('2d');g.clearRect(0,0,map.width,map.height);
  const path=[[.52,-1.60],[3.03,-1.60],[3.03,-.99],[1.20,-.99],[1.20,.63],[.52,.63]];
  g.beginPath();path.forEach(([x,y],i)=>g[i?'lineTo':'moveTo'](...mapPixel(x,y)));g.closePath();g.fillStyle='#454c58';g.fill();g.lineWidth=2;g.strokeStyle='#bfc5cc';g.stroke();
  const [x,y]=mapPixel(...xy);g.beginPath();g.moveTo(x,y);g.arc(x,y,24,-Math.PI/2+yaw-.43,-Math.PI/2+yaw+.43);g.closePath();g.fillStyle='#d7af6777';g.fill();g.beginPath();g.arc(x,y,5,0,Math.PI*2);g.fillStyle='#f0c68a';g.fill();
  g.fillStyle='#b5dfdf';g.font='16px system-ui';g.fillText('白板',211,228);
}
plan.onclick=()=>{map.hidden=!map.hidden;plan.setAttribute('aria-expanded',String(!map.hidden));drawMap();};
map.onpointerdown=e=>{const rect=map.getBoundingClientRect();walkPath=area.path(xy,[.52+((e.clientX-rect.left)*map.width/rect.width-25)/112,.63-((e.clientY-rect.top)*map.height/rect.height-19)/83]);};
$('#retry').onclick=()=>location.reload();
async function boot(){
  if(!await enter())return;
  const [config]=await Promise.all([readFile('layout.json'),engineBundle()]);
  layout=JSON.parse(new TextDecoder().decode(config));area=new WalkArea(layout);xy=layout.spawn.slice();
  const dx=layout.target[0]-xy[0],dy=layout.target[1]-xy[1];
  yaw=Math.atan2(dx,dy);pitch=Math.atan2(layout.target[2]-layout.eyeHeight,Math.hypot(dx,dy));
  if(qs.get('graphics')!=='webgl'&&navigator.gpu&&await B.WebGPUEngine.IsSupportedAsync){
    try{engine=new B.WebGPUEngine(canvas,{antialias:true,powerPreference:'high-performance'});await engine.initAsync();}catch(e){engine?.dispose();engine=null;}
  }
  if(!engine)engine=new B.Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true,powerPreference:'high-performance'});
  engine.setHardwareScalingLevel(1/Math.min(devicePixelRatio,isMobile?2:1.75));
  scene=new B.Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new B.Color4(.66,.68,.70,1);
  scene.imageProcessingConfiguration.toneMappingEnabled=false;
  cam=new B.FreeCamera('Visitor',B.Vector3.Zero(),scene);cam.minZ=.025;cam.maxZ=1050;scene.activeCamera=cam;
  material=projectionMaterial(B,scene,engine.isWebGPU===true);
  loading('正在載入通道幾何同 Cycles 原畫',26);
  const tri=area.triangle(xy);
  const [meshBytes,boardTex,worldTex]=await Promise.all([
    readFile('geometry.bin.gz').then(bytes=>new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()),
    readFile('board.png').then(bytes=>texture(bytes)),readFile('world.png').then(bytes=>texture(bytes)),Promise.all(tri.ids.map(getView))]);
  geometry(meshBytes);material.setTexture('inkBoard',boardTex);material.setTexture('exteriorWorld',worldTex);active=tri.ids.slice();want=active.slice();
  loading('正在對齊白板前嘅視角',88);aim();bindSources();
  await material.forceCompilationAsync(geo);sync();ready=true;
  $('#loading').hidden=true;document.body.dataset.ready='true';
  getView(fixedGuard).then(()=>{dirty=true;}).catch(()=>{});
  addEventListener('resize',()=>{engine.resize();dirty=true;});
  if(qs.has('review')){
    window.boardQA={state,resetTimes:()=>{stats=[];},freeze:(hide)=>{manual=true;keys.clear();walkPath=[];$('#viewer').classList.toggle('measuring',hide);},
      start:(x,y,az,el)=>{if(!area.triangle([x,y]))throw Error('Outside pilot');xy=[x,y];yaw=az;pitch=el;},
      advance:async(dt)=>{
        forward(dt);const ids=area.triangle(xy).ids;
        await Promise.all([...new Set([...ids,fixedGuard])].map(getView));sync();return state();
      },
      resume:()=>{manual=false;keys.clear();$('#viewer').classList.remove('measuring');dirty=true;}
    };
  }
  if(qs.has('device')){
    const meter=document.createElement('output');meter.className='glass';meter.style.cssText='top:58px;right:12px;padding:8px;max-width:75vw;pointer-events:none';$('#viewer').append(meter);
    function showMeter(){const values=stats.slice().sort((a,b)=>a-b),q=n=>values[Math.floor((values.length-1)*n)]?.toFixed(1);
      meter.textContent=engine.name+' · '+engine.getRenderWidth()+' × '+engine.getRenderHeight()+(values.length>5?' · '+q(.5)+' / '+q(.95)+' ms (P50/P95)':' · 行兩步量度畫格時間');}
    showMeter();setInterval(showMeter,450);
  }
  last=performance.now();requestAnimationFrame(frame);
}
boot().catch(e=>{console.error(e);loading('樣板未能載入，請重試。',0);$('#retry').hidden=false;document.body.dataset.error=String(e);});
