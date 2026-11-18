import {enter,readFile,transportHealth} from './storage12.js';
import {Navigation} from './nav-floor.js';
import {CaptureField} from './field.js';
import {lookAt,stepManual,stepGuide,destinations,previewPath} from './guide.js';
import {SourceTextures} from './textures12.js';
import {projectionMaterial} from './projection12.js';
const $=sel=>document.querySelector(sel),canvas=$('#scene'),qs=new URLSearchParams(location.search),keys=new Set();
let vfov=Math.PI/3;
const view={xy:[],yaw:0,pitch:0},route={points:[]},mobile=matchMedia('(pointer:coarse)').matches;
let B,engine,scene,cam,geo,material,layout,nav,field,sources,drag,ready=false,manual=false,dirty=true,last=0,lastDraw=null,stats=[],mapImage;
const unzip=bytes=>new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
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
  const [x,y]=view.xy,cp=Math.cos(view.pitch),h=layout.eyeHeight;
  cam.position.set(x,h,-y);cam.setTarget(new B.Vector3(x+Math.sin(view.yaw)*cp,h+Math.sin(view.pitch),-y-Math.cos(view.yaw)*cp));
  cam.fov=vfov;material.setVector3('visitorEye',new B.Vector3(x,h,-y));
}
function draw(settled=false){
  dirty=false;aim();if(sources.bind(view.xy,settled))dirty=true;
  engine.beginFrame();try{scene.render();}finally{engine.endFrame();}
  $('#place').textContent=nav.zone(view.xy).label;$('#stop').hidden=!route.points.length;mapUpdate();
}
let waitStart=0,waitMs=0,waitEvents=0,blocked=false,wholeTimingRun=false;
function step(dt){
  if(!manual&&(keys.size||route.points.length)){
    const f=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'));
    const s=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
    let dx,dy;
    if(f||s){dx=f*Math.sin(view.yaw)+s*Math.cos(view.yaw);dy=f*Math.cos(view.yaw)-s*Math.sin(view.yaw);}
    else if(route.points.length){dx=route.points[0][0]-view.xy[0];dy=route.points[0][1]-view.xy[1];}
    if(dx||dy){
      const mag=Math.hypot(dx,dy);dx/=mag;dy/=mag;
      const ahead=[view.xy[0]+.85*dx,view.xy[1]+.85*dy];
      sources.predict(nav.safe(ahead)?ahead:view.xy);
      const now=performance.now();
      if(now-sources.lastPreview>250){
        sources.lastPreview=now;
        const path=route.points.length?route.points:[[view.xy[0]+4.6*dx,view.xy[1]+4.6*dy]];
        const upcoming=previewPath(view.xy,path,[.30,.80,1.45,2.15,3.05,4.35]);
        sources.preview(upcoming.filter(p=>nav.safe(p)&&field.reachable(p)));
      }
      const test=[view.xy[0]+dt*1.5*dx,view.xy[1]+dt*1.5*dy];
      if(nav.safe(test)&&sources.coverage(test)<.52){
        if(!waitStart){waitStart=performance.now();waitEvents++;}
        if(performance.now()-waitStart>350){$('#hint').textContent='正在載入前面嘅原畫';blocked=true;}
        return;
      }
    }
  }else sources?.predict(null);
  if(waitStart){waitMs+=performance.now()-waitStart;waitStart=0;if(blocked){$('#hint').textContent='拖曳環視 · 點地面行走';blocked=false;}}

  if(stepManual(view,keys,nav,dt)){route.points=[];dirty=true;}
  else if(route.points.length){stepGuide(view,route,nav,dt,layout.eyeHeight);dirty=true;}
}
function frame(now){
  const elapsed=now-last;last=now;
  if(ready&&!manual){
    const moving=Boolean(keys.size||drag||route.points.length);
    step(Math.min(.060,elapsed/1000));
    if(!moving)lastDraw=null;
    if(dirty){if(moving&&lastDraw!==null){stats.push(now-lastDraw);if(!wholeTimingRun&&stats.length>3000)stats.shift();}draw();if(moving)lastDraw=now;}
  }
  requestAnimationFrame(frame);
}
function state(timings=true){
  const a=engine._adapter?.info;
  return {eye:[...view.xy,layout.eyeHeight],yaw:view.yaw,pitch:view.pitch,vfov,width:engine.getRenderWidth(),height:engine.getRenderHeight(),backend:engine.name,adapter:a?[a.vendor,a.architecture,a.description].filter(Boolean).join(' / '):engine.getGlInfo?.().renderer,active:sources.active.slice(),resident:sources.cache.size,tiles:[...sources.tiles.keys()],zone:nav.zone(view.xy).id,walking:route.points.length>0,waitEvents,sourceWaitMs:Math.round(waitMs+(waitStart?performance.now()-waitStart:0)),media:timings?{recovered:[...transportHealth.recovered],failed:[...transportHealth.failed]}:undefined,frameTimes:timings?stats.slice():[]};
}
function guide(to,destination=null){
  if(!ready)return;
  const end=nav.safe(to)&&field.reachable(to)?to:nav.nearest(to,.42);
  if(!end||!field.reachable(end))return;
  const points=nav.path(view.xy,end);if(!points||!points.length)return;
  Object.assign(route,{points,destination,end,autoLook:!!destination});
  keys.clear();dirty=true;
}
function stop(){route.points=[];keys.clear();dirty=true;}
const map=$('#floorMap'),body=$('#planBody');
const scale=23,mapPos=(x,y)=>[64+(x+4.75)*scale,12+(9.65-y)*scale];
function setupMap(){
  mapImage=document.createElement('canvas');mapImage.width=map.width;mapImage.height=map.height;
  const g=mapImage.getContext('2d');
  for(const zone of layout.walk.zones){const [l,b,r,t]=zone.rect,[x,y]=mapPos(l,t);g.fillStyle='#3c4552';g.fillRect(x,y,(r-l)*scale,(t-b)*scale);}
  for(const o of layout.walk.obstacles){const [l,b]=o.min,[r,t]=o.max,[x,y]=mapPos(l,t);const wall=o.group?.includes('Architecture');g.fillStyle=wall?'#c4c7c5':'#657079';g.fillRect(x,y,Math.max(1,(r-l)*scale),Math.max(1,(t-b)*scale));}
  for(const row of destinations){const btn=document.createElement('button');btn.type='button';btn.textContent=row[1];btn.dataset.go=row[0];btn.onclick=()=>{
    guide(layout.targets[row[0]],row[0]);if(mobile)setMap(false);
  };$('#places').append(btn);}
}
function mapUpdate(){
  if(!mapImage||body.hidden)return;
  const g=map.getContext('2d');g.clearRect(0,0,map.width,map.height);g.drawImage(mapImage,0,0);
  const [x,y]=mapPos(...view.xy);if(route.points.length){g.beginPath();g.moveTo(x,y);route.points.forEach(q=>g.lineTo(...mapPos(...q)));g.strokeStyle='#e8c68b';g.lineWidth=2;g.stroke();}
  g.beginPath();g.moveTo(x,y);g.arc(x,y,18,view.yaw-Math.PI/2-.54,view.yaw-Math.PI/2+.54);g.closePath();g.fillStyle='#dfac616f';g.fill();g.beginPath();g.arc(x,y,4.5,0,Math.PI*2);g.fillStyle='#f3cc8a';g.fill();
}
function setMap(open){body.hidden=!open;$('#mapToggle').setAttribute('aria-expanded',String(open));mapUpdate();}
$('#mapToggle').onclick=()=>setMap(body.hidden);$('#stop').onclick=stop;
map.onpointerdown=e=>{if(!ready)return;const r=map.getBoundingClientRect();const x=(e.clientX-r.left)*map.width/r.width,y=(e.clientY-r.top)*map.height/r.height;guide([(x-64)/scale-4.75,9.65-(y-12)/scale]);};
canvas.addEventListener('pointerdown',e=>{if(!ready||e.button!==0)return;canvas.focus({preventScroll:true});const wasWalking=route.points.length>0;stop();drag={id:e.pointerId,x:e.clientX,y:e.clientY,ox:e.clientX,oy:e.clientY,moved:false,wasWalking};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{
 if(!drag||e.pointerId!==drag.id)return;
 if(Math.hypot(e.clientX-drag.ox,e.clientY-drag.oy)>5)drag.moved=true;
 if(drag.moved){view.yaw-=(e.clientX-drag.x)*.0038;view.pitch=Math.max(-1.53,Math.min(1.53,view.pitch+(e.clientY-drag.y)*.003));dirty=true;}
 drag.x=e.clientX;drag.y=e.clientY;
});
canvas.addEventListener('pointerup',e=>{
 if(!drag||e.pointerId!==drag.id)return;
 if(!drag.moved&&!drag.wasWalking){const r=canvas.getBoundingClientRect(),hit=scene.pick(e.clientX-r.left,e.clientY-r.top,m=>m===geo);
 if(hit?.pickedPoint&&hit.pickedPoint.y<.18)guide([hit.pickedPoint.x,-hit.pickedPoint.z]);}
 drag=null;
});
canvas.addEventListener('pointercancel',()=>drag=null);
const allowed=new Set(['w','a','s','d','q','e','shift','arrowup','arrowdown','arrowleft','arrowright']);
addEventListener('keydown',e=>{if(!ready||e.altKey||e.ctrlKey||e.metaKey)return;const k=e.key.toLowerCase();if(k==='escape'){stop();setMap(false);return;}if(allowed.has(k)){e.preventDefault();keys.add(k);route.points=[];}});
addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));addEventListener('blur',()=>{keys.clear();drag=null;});
for(const b of document.querySelectorAll('[data-key]')){
 b.onpointerdown=e=>{if(!ready)return;e.preventDefault();route.points=[];b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);};
 b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>keys.delete(b.dataset.key);
}
$('#retry').onclick=()=>location.reload();
async function boot(){
  if(!await enter())return;
  const [config,dist]=await Promise.all([readFile('layout.json'),readFile('distance-grid.bin.gz').then(unzip),engineBundle()]);
  layout=JSON.parse(new TextDecoder().decode(config));nav=new Navigation(layout.walk);field=new CaptureField(layout,new Uint16Array(dist));
  const initial=destinations.find(row=>row[0]===qs.get('start')&&row[0]!=='board');view.xy=(initial?layout.targets[initial[0]]:layout.spawn).slice();
  [view.yaw,view.pitch]=lookAt(view.xy,layout.eyeHeight,initial?initial[2]:layout.target);
  if(qs.get('graphics')!=='webgl'&&navigator.gpu&&await B.WebGPUEngine.IsSupportedAsync){
    try{engine=new B.WebGPUEngine(canvas,{antialias:true,powerPreference:'high-performance'});await engine.initAsync();}catch(e){engine?.dispose();engine=null;}
  }
  if(!engine)engine=new B.Engine(canvas,true,{preserveDrawingBuffer:true,stencil:true,powerPreference:'high-performance'});
  engine.setHardwareScalingLevel(1/Math.min(devicePixelRatio,mobile?2:1.75));
  const gpuDevice=engine.isWebGPU?engine._device:null;gpuDevice?.pushErrorScope('validation');
  scene=new B.Scene(engine);scene.useRightHandedSystem=true;scene.clearColor=new B.Color4(.66,.68,.70,1);scene.skipPointerMovePicking=true;
  scene.imageProcessingConfiguration.toneMappingEnabled=false;
  cam=new B.FreeCamera('Visitor',B.Vector3.Zero(),scene);cam.minZ=.025;cam.maxZ=1050;scene.activeCamera=cam;
  material=projectionMaterial(B,scene,engine.isWebGPU===true);
  sources=new SourceTextures(B,scene,material,field,mobile,()=>dirty=true);loading('正在載入附近嘅 Cycles 原畫',28);
  const [mesh,ink,world]=await Promise.all([readFile('geometry.bin.gz').then(unzip),sources.colour('board.png'),sources.colour('world.png'),sources.settle(view.xy,false)]);
  geometry(mesh);material.setTexture('inkBoard',ink);material.setTexture('exteriorWorld',world);
  setupMap();loading('正在對齊視角',88);aim();sources.bind(view.xy,true);
  await material.forceCompilationAsync(geo);draw(true);
  if(gpuDevice){
    await gpuDevice.queue.onSubmittedWorkDone();
    if(await gpuDevice.popErrorScope()){const retry=new URL(location.href);retry.searchParams.set('graphics','webgl');location.replace(retry);return;}
  }
  ready=true;$('#loading').hidden=true;document.body.dataset.ready='true';
  addEventListener('resize',()=>{engine.resize();dirty=true;});
  if(qs.has('review')){
    window.officeQA={state,resetTimes:()=>{stats=[];lastDraw=null;wholeTimingRun=true;},freeze:(hide=true)=>{manual=true;stop();$('#viewer').classList.toggle('measuring',hide);},
      optics:(height,verticalFov)=>{if(height<1||height>2.1||verticalFov<.5||verticalFov>1.6)throw Error('Camera range');layout.eyeHeight=height;vfov=verticalFov;dirty=true;},
      start:(x,y,az,el)=>{if(!nav.safe([x,y])||!field.reachable([x,y]))throw Error('Outside office');view.xy=[x,y];view.yaw=az;view.pitch=el;dirty=true;},
      advanceSteps:n=>{for(let i=0;i<n;i++)step(1/60);return state();},advance:dt=>{step(dt);return state();},
      settle:async(floors=true)=>{await sources.settle(view.xy,floors);draw(true);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return state();},
      resume:()=>{manual=false;stop();$('#viewer').classList.remove('measuring');last=performance.now();}};
  }
  if(qs.has('device')){const el=document.createElement('output');el.className='glass';el.style.cssText='right:12px;top:57px;padding:8px;max-width:70vw;pointer-events:none';$('#viewer').append(el);
   function update(){const sort=stats.slice().sort((a,b)=>a-b);el.textContent=engine.name+' · '+engine.getRenderWidth()+' × '+engine.getRenderHeight()+(sort.length>4?' · '+[.5,.95].map(q=>sort[Math.floor(q*(sort.length-1))].toFixed(1)).join(' / ')+' ms (P50/P95)':' · 行兩步量度畫格時間');}
   update();setInterval(update,500);}
  last=performance.now();requestAnimationFrame(frame);
}
boot().catch(e=>{console.error(e);loading('辦公室未能載入，請重試。',0);$('#retry').hidden=false;document.body.dataset.error=String(e);});
