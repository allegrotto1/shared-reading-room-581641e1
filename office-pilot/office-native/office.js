import {destinations,lookAt,meetingSignView} from '../whiteboard/guide.js';
import {stations} from '../whiteboard/esg-pilot.js';
const byId=id=>document.getElementById(id);
export function officeControls(B,scene,cam,nav,config,view,route,stop,textures,query,invalidate){
  const canvas=byId('scene'),plan=byId('office-plan'),map=byId('map'),toggle=byId('plan-toggle'),marker=byId('object-info');
  const signs=byId('sign-dialog'),info=byId('info-dialog'),card=byId('station-dialog');
  const seen=new Set(),surfaces=[],identity=B.Matrix.Identity();
  const signDefs=[['Reception',[1.67,-3.871,2.05],[-1,0],1.694,.412],['Meeting room',[.129,3.8,2.05],[0,1],1.798,.438],['Entrance glass',[-.65,-4.132,1.45],[-1,0],.56,.137]];
  const print=new B.StandardMaterial('Printed sign',scene);print.disableLighting=true;print.backFaceCulling=false;print.diffuseColor=B.Color3.Black();print.specularColor=B.Color3.Black();
  for(const [station,pt,right,w,h] of signDefs){
    const mesh=new B.Mesh(station+' sign',scene),data=new B.VertexData();
    data.positions=[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]].flatMap(([u,v])=>[pt[0]+right[0]*w*u,pt[2]+v*h,-pt[1]-right[1]*w*u]);
    data.indices=[0,1,2,0,2,3];data.uvs=[0,1,1,1,1,0,0,0];data.applyToMesh(mesh);
    mesh.material=print;mesh.metadata={role:'sign'};mesh.freezeWorldMatrix();surfaces.push(mesh);
  }
  let brand='institute',active=null,timer=0,lastTime=-Infinity,started=false,stamp='';
  function choose(key){if(!['aster','tern','institute'].includes(key))return;brand=key;print.emissiveTexture=textures[key];invalidate();for(const b of signs.querySelectorAll('[data-brand]'))b.setAttribute('aria-pressed',String(b.dataset.brand===brand));}
  choose(query.get('brand')==='tern'?'tern':query.get('brand')==='aster'?'aster':'institute');
  function menu(open){plan.hidden=!open;toggle.setAttribute('aria-expanded',String(open));if(open){stop();drawMap();byId('object-info').hidden=true;}lastTime=-Infinity;}
  toggle.onclick=()=>menu(plan.hidden);
  const modals=()=>signs.open||info.open||card.open;
  function openDialog(which){menu(false);stop();marker.hidden=true;which.showModal();}
  for(const d of [signs,info,card])d.addEventListener('close',()=>{canvas.focus({preventScroll:true});lastTime=-Infinity;});
  for(const b of signs.querySelectorAll('[data-brand]'))b.onclick=()=>{choose(b.dataset.brand);signs.close();};
  byId('sign-options').onclick=()=>openDialog(signs);byId('info-options').onclick=()=>openDialog(info);
  const points=Object.fromEntries(destinations.map(([id,label,point])=>[id,{id,label,point}]));
  points.corridor={id:'corridor',label:'Connecting corridor',point:[1.0,1.25,1.5]};
  const targetFor=id=>id==='meeting-sign'?(canvas.clientWidth<canvas.clientHeight*.85?meetingSignView.portraitEye:meetingSignView.eye):config.targets[id];
  function go(id){
    const point=targetFor(id);if(!point)return false;
    const end=nav.safe(point)?point:nav.nearest(point,.45);const path=end&&nav.path(view.xy,end);
    if(!path)return false;menu(false);stop();started=true;
    Object.assign(route,{points:path,autoLook:true,destination:id,end,lookTarget:id==='reception'?signDefs[0][1]:points[id]?.point});return true;
  }
  const start=query.get('start'),target=points[start]&&targetFor(start);
  if(target&&nav.safe(target)){view.xy=[...target];[view.yaw,view.pitch]=lookAt(target,1.62,start==='reception'?signDefs[0][1]:points[start].point);started=start!=='reception';}
  else{const entry=[-.55,-3.62];view.xy=nav.safe(entry)?entry:nav.nearest(entry,.85);view.yaw=.38;view.pitch=-.06;}
  const floor=byId('destinations');
  for(const id of ['reception','board','office','plant','copier','pantry','meeting','meeting-sign','window']){
    const b=document.createElement('button');b.type='button';b.dataset.go=id;b.textContent=points[id].label;b.onclick=()=>go(id);floor.append(b);
  }
  for(const s of stations){
    const b=document.createElement('button');b.type='button';b.dataset.stop=s.id;b.textContent=s.title;b.onclick=()=>{info.close();go(s.id);};byId('station-list').append(b);
  }
  function showCard(s){seen.add(s.id);byId('station-category').textContent='Example practice · '+s.category;byId('station-title').textContent=s.title;byId('station-copy').textContent=s.copy;openDialog(card);}
  marker.onclick=()=>{if(active?.id==='sign')openDialog(signs);else if(active)showCard(active);};
  function markerOff(){clearTimeout(timer);timer=0;active=null;marker.hidden=true;}
  const world=([x,y,z])=>new B.Vector3(x,z,-y),pos=(x,y)=>[(x+4.85)*16+42,(9.78-y)*16+3];
  const base=document.createElement('canvas');base.width=map.width;base.height=map.height;
  const bg=base.getContext('2d');
  function rect(r,col){const a=pos(r[0],r[3]),b=pos(r[2],r[1]);bg.fillStyle=col;bg.fillRect(a[0],a[1],Math.max(1,b[0]-a[0]),Math.max(1,b[1]-a[1]));}
  for(const z of config.walk.zones)rect(z.rect,'#514b58');
  for(const o of config.walk.obstacles)rect([...o.min,...o.max],o.group?.includes('Architecture')?'#b8adb9':'#837789');
  function drawMap(){
    const g=map.getContext('2d');g.clearRect(0,0,map.width,map.height);g.drawImage(base,0,0);const [x,y]=pos(...view.xy);
    g.fillStyle='#e8ce99';g.beginPath();g.arc(x,y,3.4,0,7);g.fill();
    g.strokeStyle='#e8ce99';g.beginPath();g.moveTo(x,y);g.lineTo(x+11*Math.sin(view.yaw),y-11*Math.cos(view.yaw));g.stroke();
  }
  map.onclick=e=>{
    const r=map.getBoundingClientRect(),scale=Math.min(r.width/map.width,r.height/map.height);
    const px=(e.clientX-r.left-(r.width-map.width*scale)/2)/scale,py=(e.clientY-r.top-(r.height-map.height*scale)/2)/scale;
    const dst=[(px-42)/16-4.85,9.78-(py-3)/16],end=nav.safe(dst)?dst:nav.nearest(dst,.22),path=end&&nav.path(view.xy,end);
    if(path){menu(false);stop();Object.assign(route,{points:path,autoLook:false});}
  };
  function visible(at,range){
    const point=world(at),d=point.subtract(cam.position),dist=d.length();
    if(Math.hypot(d.x,d.z)>range||B.Vector3.Dot(d,cam.getForwardRay().direction)<=0)return null;
    const screen=B.Vector3.Project(point,identity,scene.getTransformMatrix(),cam.viewport.toGlobal(canvas.clientWidth,canvas.clientHeight));
    if(screen.z<0||screen.z>1||screen.x<25||screen.x>canvas.clientWidth-25||screen.y<64||screen.y>canvas.clientHeight-115)return null;
    const ray=new B.Ray(cam.position,d.normalize(),Math.max(0,dist-.09));
    const hit=scene.pickWithRay(ray,m=>m.isPickable&&m.metadata?.role!=='sign'&&m.metadata?.role!=='bottle',true);
    return hit?.hit?null:screen;
  }
  function update(now,moving){
    if(moving)started=true;
    if(now-lastTime<105)return;
    const thisStamp=[...view.xy,view.yaw,view.pitch,canvas.clientWidth,canvas.clientHeight,started,plan.hidden,modals()].join('|');
    if(thisStamp===stamp&&now-lastTime<1000)return;lastTime=now;stamp=thisStamp;
    byId('current-place').textContent=nav.zone(view.xy).label;
    if(!plan.hidden)drawMap();
    if(!started||modals()||!plan.hidden){markerOff();return;}
    let item,screen;
    for(const s of stations){screen=visible(s.at,s.range);if(screen){item=s;break;}}
    if(!item){for(const [,p] of signDefs){screen=visible(p,2.55);if(screen){item={id:'sign',title:'Change sign'};break;}}}
    if(!item){markerOff();return;}
    if(active?.id!==item.id){markerOff();active=item;marker.textContent=item.title;marker.dataset.station=item.id;}
    marker.hidden=false;const half=marker.offsetWidth/2+8;marker.style.left=Math.max(half,Math.min(canvas.clientWidth-half,screen.x))+'px';marker.style.top=(item.id==='sign'?Math.min(canvas.clientHeight-113,screen.y+Math.min(84,canvas.clientHeight*.095)):screen.y)+'px';
    if(item.id!=='sign'&&byId('auto-open').checked&&!seen.has(item.id)&&!timer){timer=setTimeout(()=>{timer=0;if(active?.id===item.id&&!modals()&&byId('auto-open').checked)showCard(item);},550);}
  }
  return {go,update,blocks:modals,closeMap:()=>menu(false),pick(mesh){if(surfaces.includes(mesh)){openDialog(signs);return true;}return false;},state:()=>({brand,seen:[...seen],zone:nav.zone(view.xy).id})};
}
