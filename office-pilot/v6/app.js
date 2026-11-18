import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {HDRLoader} from 'three/addons/loaders/HDRLoader.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Navigation} from './nav.js';
import {getPilotInputs, isDoor, adjustDoor, attachFinish} from './pilot/shading.js';
import {enterPilot, loadMedia, readMedia} from './pilot/media.js';
import {PanoramaViewer} from './pilot/panorama.js';
const $=s=>document.querySelector(s),canvas=$('#scene'),map=$('#map');
let layout,nav,pos=[0,0],yaw=0,pitch=0,path=[],ready=false,renderer,scene,camera,model,keys=new Set(),movingTouch='',loadedAt=0,frames=[],totalFrames=0,last=performance.now(),mapTime=0;
const started=0,review=new URLSearchParams(location.search).has('review'),diagnostics=$('#diagnostics');
let pilot, inputs, slide=null;
let panorama, pendingStation=null, lastRequest=0, failedStation=null, resumePosition=null, resumeMap=null;
if(review)diagnostics.hidden=false;
const toast=msg=>{const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('show'),2800);};
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function progress(p,msg){$('#loadBar').style.width=p+'%';$('#loadPercent').textContent=Math.round(p)+'%';if(msg)$('#loadMessage').textContent=msg;}
function fatal(e){console.error(e);$('#loading').classList.remove('done');$('#loadMessage').textContent='場景暫時未能載入，請重試。';$('#retry').hidden=false;$('#loadPercent').textContent='請檢查網絡連線';}
$('#retry').onclick=()=>location.reload();
function optimize(root,probes,pass='base'){
 root.updateMatrixWorld(true);const groups=new Map();
 root.traverse(o=>{
  if(!o.isMesh)return;const source=o.material;if(!source||Array.isArray(source))return;
  const world=o.getWorldPosition(new THREE.Vector3());
  const region=source.name.includes('_meeting')||(world.x>=0&&world.z<=-1.25)?'meeting':'office';
  const g=o.geometry.clone().applyMatrix4(o.matrixWorld);
  const door=pass==='base'&&isDoor(o.name);
  if(door)adjustDoor(g,o.name);
  const kind=pass==='shell'?(/carpet/i.test(o.name)?'floor':'shell'):pass==='fixtures'?'fixture':pass==='hardware'?'hardware':door?'door':source.name.includes('architecture_office')?'floor':'room';
  for(const k of Object.keys(g.attributes))if(!['position','normal','uv','uv1','tangent','color'].includes(k))g.deleteAttribute(k);
  const key=source.uuid+region+kind+Object.keys(g.attributes).sort().join(',')+!!g.index;
  if(!groups.has(key)){
   const mat=source.clone();mat.envMap=probes[region];mat.envMapIntensity=.65;
   if(mat.name.startsWith('WEB v6 baked')){mat.envMapIntensity=.28;mat.normalScale?.set(.16,.16);}
   if(mat.name==='POD official identity'&&region==='office'){mat.emissiveIntensity=.44;mat.emissive.setRGB(.91,.75,.54);}
   attachFinish(mat,inputs,pilot,kind);
   for(const k of ['map','emissiveMap','normalMap','roughnessMap','metalnessMap'])if(mat[k])mat[k].anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
   groups.set(key,{mat,geo:[],name:source.name});
  }
  groups.get(key).geo.push(g);
 });
 const group=new THREE.Group();
 for(const {mat,geo,name} of groups.values()){
  const merged=geo.length===1?geo[0]:mergeGeometries(geo,false);if(!merged)throw Error('Unable to assemble '+name);
  const m=new THREE.Mesh(merged,mat);m.name=name;if(/reverse-cut/i.test(name))m.renderOrder=4;group.add(m);
  if(geo.length>1)for(const g of geo)g.dispose();
 }
 root.traverse(o=>{if(o.isMesh)o.geometry.dispose();});return group;
}
async function loadProbes(pmrem){
 const result={};
 for(const region of ['office','meeting']){
  const hdr=await loadMedia(new HDRLoader(), `./assets/v6/${region}-reflection.hdr`);
  result[region]=pmrem.fromEquirectangular(hdr).texture;hdr.dispose();
 }
 return result;
}
async function boot(){try{
 if (!await enterPilot()) return;
 renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
 if(review){
   $('#reviewNumbers').hidden=false;
   const gl=renderer.getContext(),info=gl.getExtension('WEBGL_debug_renderer_info');
   $('#deviceReadout').textContent=JSON.stringify({three:THREE.REVISION,browser:navigator.userAgent,gpu:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)});
 }
 renderer.setPixelRatio(Math.min(devicePixelRatio,matchMedia('(pointer:coarse)').matches?1.3:1.6));
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=Math.SQRT2;
 scene=new THREE.Scene();scene.background=new THREE.Color('#c1d0d3');camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.04,60);camera.rotation.order='YXZ';
 const [response,poses]=await Promise.all([readMedia('./assets/layout.json'),readMedia('./pilot/poses.json')]);
 if(!response.ok||!poses.ok)throw Error('Layout or pilot camera unavailable');
 layout=await response.json();pilot=await poses.json();nav=new Navigation(layout);
 if(!nav.clear(pilot.origin,pilot.side))throw Error('Sample camera path obstructed');
 pos=[...pilot.origin];yaw=entranceHeading();pitch=pilot.pitch;camera.fov=pilot.fov;
 progress(8,'正在載入影印機、門框同室內光影');
 const draco=new DRACOLoader();draco.setDecoderPath('./vendor/examples/jsm/libs/draco/gltf/');draco.setWorkerLimit(2);
 const loader=new GLTFLoader().setDRACOLoader(draco);
 const pmrem=new THREE.PMREMGenerator(renderer);pmrem.compileEquirectangularShader();
 const [gltf,probes,pilotInputs]=await Promise.all([loadMedia(loader,'./pilot/office-context.glb',e=>progress(8+Math.min(69,e.total?e.loaded/e.total*69:30),'正在載入高清樣板')),loadProbes(pmrem),getPilotInputs(renderer,loader,new HDRLoader(),pmrem,pilot)]);
 inputs=pilotInputs;pmrem.dispose();draco.dispose();
 model=optimize(gltf.scene,probes);model.add(optimize(inputs.shell,probes,'shell'),optimize(inputs.fixtures,probes,'fixtures'),optimize(inputs.hardware,probes,'hardware'));
 scene.add(model);resize();makeMap();setMap(false);
 panorama=new PanoramaViewer(renderer,pilot.yaw,()=>{dirtyFrame=true;},showTileStatus);
 camera.position.set(pos[0],layout.eyeHeight,-pos[1]);camera.rotation.set(pitch,yaw,0);
 progress(92,'正在準備行走畫面');await renderer.compileAsync(scene,camera);renderer.render(scene,camera);
 ready=true;document.body.dataset.loaded='true';loadedAt=performance.now();last=loadedAt;progress(100,'可以開始參觀');$('#loading').classList.add('done');$('#loading').setAttribute('aria-hidden','true');canvas.focus({preventScroll:true});
 $('#originalMode').disabled=false;document.body.dataset.mode='walk';
 if(review && !document.documentElement.hasAttribute('data-research-studio'))$('#saveReview').hidden=false;
 requestAnimationFrame(animate);
 }catch(e){fatal(e);}}
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();ready=false;keys.clear();path=[];fatal(Error('WebGL context lost'));});
function resize(){if(!renderer)return;dirtyFrame=true;renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}addEventListener('resize',resize);
let mapTransform, mapMarker, activeArea = '';
const mapPanel = $('#mapPanel');
const svgNS = 'http://www.w3.org/2000/svg';
function svgElement(tag, attributes, parent) {
  const node = document.createElementNS(svgNS, tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  parent.append(node);
  return node;
}
function makeMap() {
  const [left, bottom, right, top] = layout.bounds;
  const s = Math.min(280 / (right-left), 250 / (top-bottom));
  const ox = 150 - (left+right)*s/2, oy = 137 + (top+bottom)*s/2;
  mapTransform = {s, ox, oy};
  function rect(r, styling) {
    return svgElement('rect', {x:ox+r[0]*s, y:oy-r[3]*s, width:(r[2]-r[0])*s, height:(r[3]-r[1])*s, ...styling}, map);
  }
  const defs = svgElement('defs',{},map);
  const beam = svgElement('linearGradient',{id:'bearing',x1:'0%',y1:'100%',x2:'0%',y2:'0%'},defs);
  svgElement('stop',{offset:'0%','stop-color':'#ffc064','stop-opacity':.78},beam);
  svgElement('stop',{offset:'100%','stop-color':'#ffc064','stop-opacity':0},beam);
  for (const floor of layout.walkable) rect(floor, {fill:'#22334f'});
  for (const o of layout.obstacles) {
    const wall = /wall|sill|boundary|threshold/i.test(o.name) && !/chair|report cabinet|publication/i.test(o.name);
    rect([...o.min,...o.max],{fill:wall?'#e0e6ee':'#293b57',stroke:wall?'#f4efe4':'#a8b6cb','stroke-width':wall ? 0.7 : 0.65});
  }
  const names = {'辦公座位區':'辦公區','入口及接待區':'接待','茶水位':'茶水','連接通道':'通道','會議室':'會議室'};
  for (const zone of layout.zones) {
    const [x,y]=zone.anchor;
    const label=svgElement('text',{x:ox+x*s,y:oy-y*s-3,'text-anchor':'middle',fill:'#f5eee2',stroke:'#1b2941','stroke-width':2.5,'paint-order':'stroke','font-size':8.4},map);
    label.textContent=names[zone.label] || zone.label;
    const button=document.createElement('button');
    button.type='button';button.textContent=zone.label;button.dataset.zone=zone.id;button.onclick=()=>goTo(zone.anchor,zone.label);
    $('#destinations').append(button);
  }
  mapMarker=svgElement('g',{},map);
  svgElement('path',{d:'M0 0 L-16 -31 Q0 -42 16 -31 Z',fill:'url(#bearing)'},mapMarker);
  svgElement('circle',{r:5.2,fill:'#ffba59',stroke:'#fff9e8','stroke-width':2},mapMarker);
  updateMap();
}
function updateMap() {
  if (!mapMarker) return;
  const {s,ox,oy}=mapTransform;
  mapMarker.setAttribute('transform','translate('+(ox+pos[0]*s)+' '+(oy-pos[1]*s)+') rotate('+(-yaw*180/Math.PI)+')');
  const zone=nav.zone(pos);
  if(activeArea===zone.id) return;
  activeArea=zone.id;
  $('#area').textContent=zone.label;
  document.querySelectorAll('[data-zone]').forEach(b=>b.classList.toggle('active',b.dataset.zone===zone.id));
}
let previousCamera=null,dirtyFrame=true,drawnFrames=0;
function drawIfMoved() {
  if(!dirtyFrame&&previousCamera&&previousCamera[0]===pos[0]&&previousCamera[1]===pos[1]&&
    previousCamera[2]===yaw&&previousCamera[3]===pitch)return;
  if(panorama?.active) panorama.render(camera); else renderer.render(scene,camera);
  drawnFrames++;
  previousCamera=[pos[0],pos[1],yaw,pitch];
  dirtyFrame=false;
}
function goTo(p,label){if(atStation()){toast('先按「自由行」就可以行去其他位置');return false;}slide=null;const target=nav.safe(p)?p:nav.nearest(p,.65);if(!target){toast('請選擇通道或空曠地面');return false;}const planned=nav.path(pos,target);if(!planned){toast('這裏未能從目前位置到達，請選另一處地面');return false;}path=planned;if(label)toast('正前往'+label);return true;}
map.addEventListener('click', e => {
  if (!ready) return;
  const point=new DOMPoint(e.clientX,e.clientY).matrixTransform(map.getScreenCTM().inverse());
  const {s,ox,oy}=mapTransform;
  goTo([(point.x-ox)/s,(oy-point.y)/s]);
});
function setMap(expanded, closed=false) {
  mapPanel.classList.toggle('closed',closed);
  mapPanel.classList.toggle('expanded',expanded && !closed);
  $('#expandMap').setAttribute('aria-expanded', String(expanded && !closed));
  $('#expandMap').setAttribute('aria-label', expanded && !closed ? '縮小平面圖' : '放大平面圖');
  $('#mapToggle').setAttribute('aria-expanded',String(!closed));
}
$('#expandMap').onclick=()=>setMap(!mapPanel.classList.contains('expanded'));
$('#mapToggle').onclick=()=>setMap(false,!mapPanel.classList.contains('closed'));
addEventListener('keydown', e=>{
  if (e.key.toLowerCase()==='m' && !e.repeat && !dialog.open && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();setMap(!mapPanel.classList.contains('expanded'));
  }
});
canvas.addEventListener('wheel', e=>{
  if(!ready || dialog.open || e.ctrlKey || e.metaKey) return;
  if(atStation()){e.preventDefault();if(panorama.active)zoomOriginal(Math.sign(e.deltaY)*4);return;}
  e.preventDefault();slide=null;path=[];
  const pixels = e.deltaY * (e.deltaMode===1 ? 16 : e.deltaMode===2 ? innerHeight : 1);
  const metres=Math.max(-.45,Math.min(.45,-pixels*.003));
  const n=Math.max(1,Math.ceil(Math.abs(metres)/.07));
  for(let i=0;i<n;i++) pos=nav.move(pos,-Math.sin(yaw)*metres/n,Math.cos(yaw)*metres/n);
  updateMap();
},{passive:false});
$('#home').onclick=()=>{if(!ready)return;leaveOriginal();stopWalking();pos=[...layout.spawn];yaw=layout.spawnYaw;pitch=0;keys.clear();setFov(pilot.fov);updateMap();toast('已返回入口');canvas.focus({preventScroll:true});};
const dialog=$('#helpDialog');$('#help').onclick=()=>{keys.clear();path=[];dialog.showModal();};$('#start').onclick=$('#closeHelp').onclick=()=>{dialog.close();canvas.focus({preventScroll:true});};$('#fullscreen').onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen().catch(()=>toast('請使用瀏覽器的全螢幕功能'));
addEventListener('keydown',e=>{if(dialog.open||e.ctrlKey||e.metaKey||e.altKey)return;const k=e.key.toLowerCase();if(['w','a','s','d','q','e','arrowup','arrowdown','arrowleft','arrowright','shift','escape'].includes(k)){e.preventDefault();if(atStation()&&!['q','e','arrowup','arrowdown','arrowleft','arrowright'].includes(k)){if(k==='escape')leaveOriginal();return;}slide=null;keys.add(k);path=[];}});addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));addEventListener('blur',()=>{keys.clear();movingTouch='';});document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();movingTouch='';}});
let drag=null;
canvas.addEventListener('pointerdown',e=>{if(!ready||e.button!==0)return;slide=null;path=[];drag={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,moved:false};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)>6)drag.moved=true;if(drag.moved){const sensitivity=camera.fov/pilot.fov;yaw-=dx*.004*sensitivity;pitch=Math.max(-1.568,Math.min(1.568,pitch-dy*.003*sensitivity));}drag.x=e.clientX;drag.y=e.clientY;});
const ray=new THREE.Raycaster(),ground=new THREE.Plane(new THREE.Vector3(0,1,0),0),hit=new THREE.Vector3();
canvas.addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;if(!drag.moved&&!atStation()){ray.setFromCamera(new THREE.Vector2(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1),camera);const hits=ray.intersectObject(model,true);if(hits.length&&hits[0].point.y<.10&&ray.ray.intersectPlane(ground,hit))goTo([hit.x,-hit.z]);else toast('點選空曠地面即可行走');}drag=null;});canvas.addEventListener('pointercancel',()=>drag=null);
for(const b of document.querySelectorAll('[data-dir]')){b.addEventListener('pointerdown',e=>{if(atStation())return;e.preventDefault();slide=null;path=[];movingTouch=b.dataset.dir;b.setPointerCapture(e.pointerId);});b.addEventListener('pointerup',()=>movingTouch='');b.addEventListener('pointercancel',()=>movingTouch='');}
let previousDiagnostic=0;
function stopWalking() {
  keys.clear();
  movingTouch='';
  if(drag&&canvas.hasPointerCapture(drag.id))canvas.releasePointerCapture(drag.id);
  drag=null;
  slide=null;
  path=[];
}

const panoStatus=$('#panoQuality');
const stationButtons=[...document.querySelectorAll('[data-station]')];
const atStation=()=>Boolean(panorama?.active || pendingStation);
const stationDistance=name=>Math.hypot(pos[0]-pilot[name][0],pos[1]-pilot[name][1]);

function setFov(value) {
  camera.fov=value;
  camera.updateProjectionMatrix();
  dirtyFrame=true;
}
function zoomOriginal(change) {
  if(panorama?.active) setFov(Math.max(35,Math.min(85,camera.fov+change)));
}
function setModeControls() {
  const active=panorama?.active;
  document.body.dataset.mode=active?'original':'walk';
  document.body.dataset.station=active||'';
  $('#walkMode').setAttribute('aria-pressed',String(!active));
  $('#originalMode').setAttribute('aria-pressed',String(Boolean(active)));
  $('#originalMode').setAttribute('aria-busy',String(Boolean(pendingStation)));
  $('#stationBar').hidden=!(active||pendingStation||failedStation);
  $('#originalHint').hidden=!active;
  $('#mapHint').textContent=active?'定點環視':'點擊移動';
  $('#touchPad').inert=Boolean(active||pendingStation);
  for(const button of stationButtons) button.setAttribute('aria-pressed',String(active===button.dataset.station));
}
function writeQuality(text) {
  if(panoStatus.textContent!==text) panoStatus.textContent=text;
}
function showTileStatus(loaded,total,failed) {
  if(pendingStation||failedStation) return;
  $('#retryPano').hidden=!failed;
  if(failed) writeQuality('部分細節未能載入');
  else if(total && loaded===total) writeQuality('8K 原畫已就緒');
  else writeQuality('載入 8K 細節 '+loaded+'／'+total);
}
async function openOriginal(name) {
  if(!ready||pendingStation===name)return;
  if(panorama.active===name&&!pendingStation&&!failedStation)return;
  const request=++lastRequest;
  if(!panorama.active && !pendingStation) {
    const distance=Math.min(stationDistance('origin'),stationDistance('side'));
    resumePosition=distance>.04?[...pos]:null;
  }
  stopWalking();
  pendingStation=name;failedStation=null;
  setModeControls();$('#retryPano').hidden=true;writeQuality('載入 Blender 全景…');
  try {
    await panorama.prepare(name);
    if(request!==lastRequest) return;
    pendingStation=null;
    pos=[...pilot[name]];
    if(!panorama.active) {
      resumeMap={expanded:mapPanel.classList.contains('expanded'),closed:mapPanel.classList.contains('closed')};
      setMap(false,true);
    }
    panorama.activate(name);
    renderer.setPixelRatio(Math.min(devicePixelRatio,3));
    resize();setModeControls();updateMap();
    if(resumePosition)toast('已到全景取景位，按「自由行」可返回剛才位置');
    canvas.focus({preventScroll:true});
  } catch {
    if(request!==lastRequest) return;
    pendingStation=null;failedStation=name;setModeControls();
    writeQuality('全景未能載入');$('#retryPano').hidden=false;
  }
}
function leaveOriginal() {
  if(!ready)return;
  ++lastRequest;
  stopWalking();
  pendingStation=null;failedStation=null;
  panorama.leave();
  if(resumeMap){setMap(resumeMap.expanded,resumeMap.closed);resumeMap=null;}
  if(resumePosition)pos=resumePosition;
  resumePosition=null;
  renderer.setPixelRatio(Math.min(devicePixelRatio,matchMedia('(pointer:coarse)').matches?1.3:1.6));
  resize();setModeControls();updateMap();
  canvas.focus({preventScroll:true});
}
$('#walkMode').onclick=leaveOriginal;
$('#originalMode').onclick=()=>{if(ready)openOriginal(panorama.active||(stationDistance('origin')<=stationDistance('side')?'origin':'side'));};
for(const b of stationButtons)b.onclick=()=>openOriginal(b.dataset.station);
$('#retryPano').onclick=()=>{if(failedStation)openOriginal(failedStation);else panorama.retry();};
$('#panoZoomOut').onclick=()=>zoomOriginal(8);
$('#panoZoomIn').onclick=()=>zoomOriginal(-8);

function entranceHeading() {
  // Keep the glass entrance in a portrait viewport without widening or stretching the image.
  return pilot.yaw-.20*Math.max(0,Math.min(1,(.85-camera.aspect)/.4));
}
function usePose(name,canonical=false) {
  stopWalking();
  setFov(pilot.fov);
  const validation=name==='validation';
  pos=[...(validation?pilot.validation.position:pilot[name])];
  yaw=validation?pilot.validation.yaw:canonical?pilot.yaw:entranceHeading();
  pitch=validation?pilot.validation.pitch:pilot.pitch;
  camera.position.set(pos[0],pilot.eyeHeight,-pos[1]);
  camera.rotation.set(pitch,yaw,0);
  updateMap();
  $('#halfStep').textContent=name==='side'?'橫移返回':'橫移半米';
}
$('#origin').onclick=()=>{if(ready){if(atStation())openOriginal('origin');else usePose('origin');canvas.focus({preventScroll:true});}};
$('#halfStep').onclick=()=>{
  if(!ready||slide)return;
  const atSide=Math.hypot(pos[0]-pilot.side[0],pos[1]-pilot.side[1])<.025;
  if(atStation()){openOriginal(atSide?'origin':'side');return;}
  const start=atSide?'side':'origin', end=atSide?'origin':'side';
  usePose(start);
  slide={from:[...pos],end,elapsed:0,started:performance.now(),lastFrame:null,intervals:[]};
  canvas.focus({preventScroll:true});
};
function advanceSlide(dt) {
  if(!slide)return;
  yaw=entranceHeading();
  pitch=pilot.pitch;
  const time=performance.now();
  if(slide.lastFrame!==null)slide.intervals.push(time-slide.lastFrame);
  slide.lastFrame=time;
  const end=pilot[slide.end];
  slide.elapsed=Math.min(.9,(time-slide.started)/1000);
  const t=slide.elapsed/.9, s=t*t*(3-2*t);
  const x=slide.from[0]+(end[0]-slide.from[0])*s, y=slide.from[1]+(end[1]-slide.from[1])*s;
  pos=nav.move(pos,x-pos[0],y-pos[1]);
  if(t>=1) {
    const name=slide.end;
    if(review){
      const sorted=slide.intervals.slice().sort((a,b)=>a-b);
      const ms=sorted.reduce((a,b)=>a+b,0);
      $('#motionReadout').textContent=JSON.stringify({destination:name,frames:sorted.length,elapsedMs:Math.round(time-slide.started),visible:document.visibilityState,focused:document.hasFocus(),fps:ms>0?+(1000*sorted.length/ms).toFixed(1):null,p95ms:+(sorted[Math.floor(sorted.length*.95)]||0).toFixed(2),metres:+Math.hypot(pos[0]-slide.from[0],pos[1]-slide.from[1]).toFixed(4),safe:nav.safe(pos),heading:yaw});
    }
    slide=null;
    $('#halfStep').textContent=name==='side'?'橫移返回':'橫移半米';
    updateMap();
  }
}

async function saveReview() {
  const button=$('#saveReview');
  if(!ready||button.disabled||atStation())return;
  button.disabled=true;
  const saved={pos:[...pos],yaw,pitch,dpr:renderer.getPixelRatio()};
  stopWalking();
  try {
    for(const which of ['origin','side','validation']) {
      usePose(which,true);
      const [width,height]=pilot.capture;
      renderer.setPixelRatio(1);
      renderer.setSize(width,height,false);
      camera.aspect=width/height;
      camera.updateProjectionMatrix();
      renderer.render(scene,camera);
      const png=await new Promise(resolve=>renderer.domElement.toBlob(resolve,'image/png'));
      if(!png)throw new Error('WebGL capture unavailable');
      const r=await fetch('/__pilot_capture/'+which,{method:'POST',headers:{'Content-Type':'image/png'},body:png});
      if(!r.ok)throw new Error('Capture storage failed');
    }
    $('#captureStatus').textContent='三個機位已儲存';
  } catch(e) {
    $('#captureStatus').textContent='儲存失敗，請重試';
    console.error(e);
  } finally {
    renderer.setPixelRatio(saved.dpr);
    pos=saved.pos;yaw=saved.yaw;pitch=saved.pitch; document.querySelector("#halfStep").textContent=Math.hypot(pos[0]-pilot.side[0],pos[1]-pilot.side[1])<.025?"橫移返回":"橫移半米";
    resize();
    button.disabled=false;
  }
}
$('#saveReview').onclick=saveReview;
function advanceMovement(dt) {
  if(dialog.open)return;
  advanceSlide(dt);
  const fixed=atStation();
  const left=keys.has('q') || (fixed && keys.has('arrowleft'));
  const right=keys.has('e') || (fixed && keys.has('arrowright'));
  yaw+=((+left)-(+right))*dt*1.6;
  if(fixed) {
    const vertical=(+keys.has('arrowup'))-(+keys.has('arrowdown'));
    pitch=Math.max(-1.568,Math.min(1.568,pitch+vertical*dt*1.4));
    return;
  }
  const forward=+(keys.has('w')||keys.has('arrowup')||movingTouch==='forward')-+(keys.has('s')||keys.has('arrowdown')||movingTouch==='back');
  const side=+(keys.has('d')||keys.has('arrowright')||movingTouch==='right')-+(keys.has('a')||keys.has('arrowleft')||movingTouch==='left');
  if(forward||side) {
    const length=Math.hypot(forward,side), speed=keys.has('shift')?2.7:1.4;
    const dx=(-Math.sin(yaw)*forward+Math.cos(yaw)*side)/length*dt*speed;
    const dy=(Math.cos(yaw)*forward+Math.sin(yaw)*side)/length*dt*speed;
    pos=nav.move(pos,dx,dy);
  } else if(path.length) {
    const target=path[0], dx=target[0]-pos[0], dy=target[1]-pos[1], distance=Math.hypot(dx,dy);
    if(distance<.035) {pos=[...target];path.shift();return;}
    const step=Math.min(distance,dt*1.35);
    pos=nav.move(pos,dx/distance*step,dy/distance*step);
    const difference=Math.atan2(-dx,dy)-yaw;
    yaw+=Math.atan2(Math.sin(difference),Math.cos(difference))*Math.min(1,dt*4);
  }
}
function animate(now) {
  const rawDt=Math.max(0,(now-last)/1000);
  last=now;
  if(rawDt>0)frames.push(rawDt);
  if(frames.length>180)frames.shift();
  totalFrames++;
  advanceMovement(Math.min(.075,rawDt));
  camera.position.set(pos[0],layout.eyeHeight,-pos[1]);
  camera.rotation.set(pitch,yaw,0);
  drawIfMoved();
  if(now-mapTime>80){updateMap();mapTime=now;}
  if(now-previousDiagnostic>500) {
    previousDiagnostic=now;
    const fps=frames.length/frames.reduce((a,b)=>a+b,0);
    const perf={version:'copier-v6-panorama',mode:panorama.active?'original':'walk',station:panorama.active,
      visibleTiles:panorama.visibleCount,readyTiles:panorama.loadedCount,fov:camera.fov,ready:true,
      visible:document.visibilityState,focused:document.hasFocus(),position:pos.map(x=>+x.toFixed(3)),
      yaw:+yaw.toFixed(3),pitch:+pitch.toFixed(3),area:nav.zone(pos).label,walking:path.length>0||!!slide,
      pilot:'copier-hd-1',safe:nav.safe(pos),rafHz:Number.isFinite(fps)?+fps.toFixed(1):null,drawnFrames,
      readyMs:Math.round(loadedAt-started),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
      downloadBytes:performance.getEntriesByType('resource').reduce((a,b)=>a+(b.transferSize||0),0),
      viewport:[innerWidth,innerHeight],dpr:renderer.getPixelRatio(),frames:totalFrames};
    diagnostics.textContent=JSON.stringify(perf);
    diagnostics.dataset.state=diagnostics.textContent;
  }
  requestAnimationFrame(animate);
}
boot();
