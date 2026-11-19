import { Navigation } from '../whiteboard/nav-floor.js';
import { stepGuide, stepManual } from '../whiteboard/guide.js';
import { makeSurfaceFactory } from './surface-material.js';
const element=id=>document.getElementById(id);
const canvas=element('scene'),status=element('status'),params=new URLSearchParams(location.search);
const full=document.documentElement.dataset.walk==='office';
const meetingAssets=new URL('./assets/',import.meta.url);
const officeAssets=new URL('../office-native/assets/',import.meta.url);
const review=params.has('review'),view={xy:[1.12,1.76],yaw:.20,pitch:-.125},route={points:[],autoLook:false};
const keys=new Set(),materials=new Map(),cameraEye={};let B,engine,scene,cam,nav,ready=false,dirty=true,drag,measurement=null;
let lastState='',last=0,firstReady=0;
let office,bottle,testStep,wingReady=false,wingError=false,wingLoad,waitingAtDoor=false;
function clearMotion(){keys.clear();route.points=[];for(const el of document.querySelectorAll('[data-key]'))el.removeAttribute('data-active');}
async function get(url){const res=await fetch(url);if(!res.ok)throw Error('Could not open '+url);return res;}
async function unpack(url){return new Response((await get(url)).body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();}
async function bundle(){
  const bytes=await unpack('../vendor/babylon/babylon-9.37.0.js.gz');
  const url=URL.createObjectURL(new Blob([bytes],{type:'text/javascript'}));
  try{await new Promise((ok,fail)=>{const s=document.createElement('script');s.src=url;s.onload=ok;s.onerror=fail;document.head.append(s);});}
  finally{URL.revokeObjectURL(url);}B=window.BABYLON;
}
function expandGeometry(spec,source) {
  if(spec.packing!=='delta-planes-v1')return new DataView(source);
  const input=new Uint8Array(source),out=new DataView(new ArrayBuffer(source.byteLength));
  for(const part of spec.mesh){
    let offset=part.offset;
    // Each attribute is stored as deltas, with the high bytes in their own lane.
    function unpackLane(count,bytes,stride,dest){
      let previous=0;
      for(let i=0;i<count;i++){
        let delta=input[offset+i];
        if(bytes>1)delta+=input[offset+count+i]*256;
        if(bytes===4)delta+=input[offset+count*2+i]*65536+input[offset+count*3+i]*16777216;
        previous=(previous+delta)>>>0;
        if(bytes===1)out.setUint8(dest,previous);
        else if(bytes===2)out.setUint16(dest,previous,true);
        else out.setUint32(dest,previous,true);
        dest+=stride;
      }
      offset+=count*bytes;
    }
    let lane=0;
    for(const bytes of [2,2,2,1,1,1,2,2]){
      unpackLane(part.v,bytes,13,part.offset+lane);lane+=bytes;
    }
    unpackLane(part.i,part.word,part.word,part.offset+13*part.v);
  }
  return out;
}
async function packet(name,base=meetingAssets){
  const [spec,blob]=await Promise.all([get(new URL(name+'.json',base)).then(r=>r.json()),unpack(new URL(name+'.bin.gz',base))]);
  return [spec,expandGeometry(spec,blob)];
}
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
    if(full&&part.name.includes('whiteboard · deep blue marker')){
      for(let i=0;i<n;i++){uvs[2*i]=(2.62-positions[3*i])/.62;uvs[2*i+1]=(positions[3*i+1]-.695)/.61;}
      mesh.setVerticesData('uv',uvs);
    }
  }
}
function loadTexture(key,base=meetingAssets){
  return new Promise((resolve,reject)=>{
    const tex=new B.Texture(new URL(key+'.webp',base).href,scene,false,false,B.Texture.TRILINEAR_SAMPLINGMODE,()=>resolve(tex),(msg)=>reject(Error(key+': '+msg)));
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
function snapshot(){return {eye:[...view.xy,1.62],yaw:view.yaw,pitch:view.pitch,vfov:cam?.fov,width:engine?.getRenderWidth(),height:engine?.getRenderHeight(),backend:engine?.isWebGPU?'WebGPU':'WebGL2',firstReadyMs:Math.round(firstReady),moving:keys.size>0||route.points.length>0,wingReady,waterBumps:bottle?.motion.count,...office?.state()};}
function hinted(){element('hint').dataset.done='true';}
function tap(x,y){
  if(!ready)return;
  if(route.points.length){route.points=[];return;}
  const hit=scene.pick(x,y,m=>m.isPickable);
  if(!hit?.hit)return;
  if(office?.pick(hit.pickedMesh))return;
  if(hit.pickedMesh.metadata?.role==='bottle'){bottle?.motion.tap(hit.pickedPoint,view.xy,performance.now());return;}
  if(hit.pickedMesh.metadata?.role!=='floor')return;
  const p=[hit.pickedPoint.x,-hit.pickedPoint.z],dest=nav.safe(p)?p:nav.nearest(p,.30);
  if(dest){route.autoLook=false;route.points=nav.path(view.xy,dest)||[];}
}
function controls(){
  const accepted=new Set(['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright','shift']);
  window.addEventListener('keydown',ev=>{
    if(!ready||office?.blocks()||ev.altKey||ev.metaKey||ev.ctrlKey)return;
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
  const side=element('half-step');
  if(side)side.onclick=()=>{
    if(!measurement)return;
    clearMotion();const base=[...view.xy],end=[base[0]+.5*Math.cos(view.yaw),base[1]-.5*Math.sin(view.yaw)];
    if(!nav.clear(base,end)){result.textContent='There is less than half a metre of space on your right.';return;}
    route.autoLook=false;route.points=[end];testStep={base,end};result.textContent='Stepping 0.50 m to the right…';
  };
  btn.addEventListener('click',()=>{if(!ready)return;
    result.hidden=false;
    if(!measurement){measurement={frames:[]};btn.textContent='Finish test';btn.setAttribute('aria-pressed','true');result.textContent='Walk and turn, then finish the test.';if(side)side.hidden=false;return;}
    if(side)side.hidden=true;testStep=null;
    const a=measurement.frames.sort((x,y)=>x-y);measurement=null;btn.textContent='Measure walk';btn.setAttribute('aria-pressed','false');
    result.textContent=a.length>4?snapshot().width+' × '+snapshot().height+' · P95 '+a[Math.ceil(a.length*.95)-1].toFixed(1)+' ms · Max '+a[a.length-1].toFixed(0)+' ms ('+a.length+' frames)':'Walk for a few seconds, then finish.';
  });
}
async function main(){
  controls();
  const payload=full?Promise.all([packet('office',officeAssets),packet('threshold',officeAssets),get(new URL('plan.json',officeAssets)).then(r=>r.json())]):Promise.all([packet('room'),packet('street'),get(new URL('navigation.json',meetingAssets)).then(r=>r.json())]);
  const extensions=full?Promise.all([import('../office-native/office.js'),import('../office-native/bottle.js'),unpack(new URL('bottle.json.gz',officeAssets)).then(b=>JSON.parse(new TextDecoder().decode(b)))]):null;
  await bundle();if(params.get('graphics')!=='webgl'&&navigator.gpu&&await B.WebGPUEngine.IsSupportedAsync){
    try{engine=new B.WebGPUEngine(canvas,{antialias:true,powerPreference:'high-performance'});await engine.initAsync();}catch{engine?.dispose();engine=null;}
  }
  if(!engine)engine=new B.Engine(canvas,true,{preserveDrawingBuffer:review,stencil:true,powerPreference:'high-performance'},false);
  resize();window.addEventListener('resize',resize);scene=new B.Scene(engine);scene.useRightHandedSystem=true;scene.skipPointerMovePicking=true;scene.clearColor=new B.Color4(.72,.77,.82,1);
  cam=new B.FreeCamera('Visitor',new B.Vector3(0,1.62,0),scene);cam.minZ=.025;cam.maxZ=1050;cam.fov=Math.PI/3;cam.inputs.clear();scene.activeCamera=cam;
  cameraEye.value=new B.Vector3(...[view.xy[0],view.xy[1],1.62]);status.textContent='Preparing the light and surfaces…';
  const localNames=full?['lobby','fittings','officefloor','plant','officeprobe','softprobe','ink','institute','aster','tern']:[];
  const names=full?['shell','probe','weave',...localNames]:['floor','furniture','shell','paper','city','branch','extension','probe','weave'];
  const [[first,second,layout],images]=await Promise.all([payload,Promise.all(names.map(k=>loadTexture(k,localNames.includes(k)?officeAssets:meetingAssets)))]);
  const textures=Object.fromEntries(names.map((name,i)=>[name,images[i]]));textures.weave.wrapU=textures.weave.wrapV=B.Texture.WRAP_ADDRESSMODE;nav=new Navigation(full?layout.walk:layout);
  const factory=makeSurfaceFactory(B,scene,!!engine.isWebGPU,textures,cameraEye.value);
  if(full){
    for(const mat of Object.keys(first[0].materials))if(mat.includes('whiteboard · deep blue marker'))first[0].materials[mat].tex='ink';
    const nearTextures=[...new Set(Object.values(second[0].materials).map(m=>m.tex))].filter(k=>!textures[k]);
    await Promise.all(nearTextures.map(async k=>{textures[k]=await loadTexture(k);}));
    const [controlsModule,bottleModule,water]=await extensions;
    office=controlsModule.officeControls(B,scene,cam,nav,layout,view,route,clearMotion,textures,params,()=>{dirty=true;});
    bottle=bottleModule.installBottle(B,scene,water,textures.officeprobe);
  }
  install(...first,factory);install(...second,factory);
  async function loadMeeting(){
    const missing=['floor','furniture','paper','city','branch','extension'].filter(k=>!textures[k]);
    const [wing,street]=await Promise.all([packet('meeting',officeAssets),packet('street',officeAssets),...missing.map(async k=>{textures[k]=await loadTexture(k);})]);
    install(...wing,factory);install(...street,factory);await scene.whenReadyAsync();wingReady=true;dirty=true;
    document.body.dataset.complete='true';
  }
  function requestMeeting(){
    if(wingReady)return Promise.resolve();
    if(!wingLoad)wingLoad=loadMeeting().then(()=>{
      wingError=false;const el=element('hint');if(waitingAtDoor){el.textContent='Drag to look · Tap the floor to walk';setTimeout(hinted,2500);}
      el.onclick=null;el.style.pointerEvents='';el.removeAttribute('role');el.removeAttribute('tabindex');el.onkeydown=null;waitingAtDoor=false;
    }).catch(err=>{
      wingError=true;const el=element('hint');el.dataset.done='false';el.style.pointerEvents='auto';el.setAttribute('role','button');el.tabIndex=0;
      el.textContent='Meeting room unavailable · Tap to retry';el.onclick=()=>{el.textContent='Opening the meeting room…';requestMeeting().catch(()=>{});};
      el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();el.onclick();}};console.warn(err);throw err;
    }).finally(()=>{wingLoad=null;});
    return wingLoad;
  }
  if(full){try{await requestMeeting();}catch{if(view.xy[1]>1.25){view.xy=[1.06,.94];view.yaw=0;view.pitch=0;}}}

  moveCamera();await scene.whenReadyAsync();
  if(review)window.nativeQA={ready:true,state:snapshot,walkable:p=>nav.safe(p),place(p){view.xy=p.slice(0,2);view.yaw=p[2];view.pitch=p[3];dirty=true;},async pose(p,id=false){
    clearMotion();view.xy=p.slice(0,2);view.yaw=p[2];view.pitch=p[3];
    for(const mat of materials.values())mat.setFloat('classify',id?1:0);
    scene.clearColor=id?new B.Color4(0,0,0,1):new B.Color4(.72,.77,.82,1);dirty=true;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  }};
  engine.onContextRestoredObservable?.add(()=>{dirty=true;});
  window.addEventListener('pageshow',()=>{dirty=true;});
  engine.runRenderLoop(()=>{
    const now=performance.now(),raw=last>0?now-last:0;last=now;if(document.hidden)return;
    const dt=Math.min(.065,raw/1000),beforeXY=view.xy;
    const keyMotion=stepManual(view,keys,nav,dt);
    const guideWait=full&&!wingReady&&view.xy[1]>=1.15&&route.points[0]?.[1]>1.16;
    const walking=guideWait?false:stepGuide(view,route,nav,dt);
    const manualWait=full&&!wingReady&&view.xy[1]>1.16;
    if(manualWait)view.xy=nav.move(beforeXY,view.xy[0]-beforeXY[0],Math.max(0,1.16-beforeXY[1]));
    if(guideWait||manualWait){
      waitingAtDoor=true;const h=element('hint');h.dataset.done='false';if(!wingError)h.textContent='Opening the meeting room…';
    }
    if(bottle){
      const front=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown')),side=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
      const prev=[cam.position.x,-cam.position.z],s=Math.sin(view.yaw),c=Math.cos(view.yaw);
      if(front||side)bottle.motion.observe(prev,view.xy,[front*s+side*c,front*c-side*s],dt*(keys.has('shift')?1.50:.92),now);else bottle.motion.release();
      if(bottle.update(now))dirty=true;
    }
    if(testStep&&!route.points.length){
      const dist=Math.hypot(view.xy[0]-testStep.base[0],view.xy[1]-testStep.base[1]);
      element('result').textContent='Side-step '+dist.toFixed(2)+' m · Finish for frame times.';testStep=null;
    }
    const s=view.xy[0]+','+view.xy[1]+','+view.yaw+','+view.pitch;
    const moving=keyMotion||walking||drag?.look||s!==lastState;
    if(measurement&&raw>0&&moving)measurement.frames.push(raw);
    const redraw=moving||dirty||!ready;
    if(moving||dirty){moveCamera();dirty=false;lastState=s;}
    if(redraw||!full)scene.render();
    office?.update(now,Boolean(moving&&lastState&&ready));
    if(!ready){firstReady=performance.now();ready=true;document.querySelector('.loading').hidden=true;document.body.dataset.ready='true';}
  });
  if(full&&!wingReady&&!wingError)requestMeeting().catch(()=>{});
  if(!wingError&&!matchMedia('(pointer:coarse)').matches)element('hint').textContent='WASD to walk · Drag to look · Click the floor to walk';
  setTimeout(()=>{if(!wingError&&!waitingAtDoor)hinted();},8200);
}
main().catch(err=>{console.error(err);document.body.dataset.error=String(err.message||err);status.textContent='The room could not open. '+String(err.message||err);});
