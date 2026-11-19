import {enter,readFile} from './storage12.js';
const $=id=>document.getElementById(id),json=async id=>JSON.parse(new TextDecoder().decode(await readFile(id)));
function add(id,a,b){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=a;dd.textContent=b;$(id).append(dt,dd);}
function save(blob,name){
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.textContent='儲存 '+name;
 $('download-status').replaceChildren(a);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),900000);
}
async function source(){
 const b=$('blend');b.disabled=true;
 try{
  const m=await json('source.json'),parts=[],loaded=new Map(),needs=new Map();let bytes=0;
  for(const [id] of m.parts)needs.set(id,(needs.get(id)||0)+1);
  for(const [id,from,n] of m.parts){
   if(!loaded.has(id))loaded.set(id,new Blob([await readFile(id)]));const part=loaded.get(id);
   if(from+n>part.size)throw Error('Incomplete source');
   parts.push(part.slice(from,from+n));bytes+=n;needs.set(id,needs.get(id)-1);if(!needs.get(id))loaded.delete(id);
   $('download-status').textContent='下載 Blender 檔 · '+Math.round(bytes/m.size*100)+'%';
  }
  const file=new Blob(parts,{type:'application/octet-stream'});if(file.size!==m.size)throw Error('Incomplete download');
  save(file,m.name);$('download-status').append(' · SHA-256 '+m.sha256);
 }catch(e){$('download-status').textContent='下載中斷，可以再試一次。';}finally{b.disabled=false;}
}
async function show(){
 if(!await enter(true))return;
 const r=await json('review.json'),a=r.office,b=r.board;
 $('caption').textContent=a.metres+' 米 · '+a.seconds+' 秒 · '+a.frames+' 個獨立重渲機位。每邊 960 × 640，按實際行走時間同步播放。一般每秒抽四格，較接近輸入機位嘅畫格留空，以最近嘅獨立格顯示。';
 add('general','五區整體','RGB 平均絕對誤差 '+a.mae+' / 255，亮度結構相似度（SSIM）'+a.ssim+'。');
 for(const zone of Object.values(a.zones))add('general',zone.label,zone.frames+' 個視角 · RGB 誤差 '+zone.mae+' / 255 · SSIM '+zone.ssim);
 $('limitations').textContent=r.notes;
 add('ink','青框對位',b.corners+' 個可見角位，中位偏差 '+b.cornerMedian+' px，第 95 百分位 '+b.cornerP95+' px，最大 '+b.cornerMax+' px。');
 add('ink','離開原筆畫嘅墨跡','完整可見嘅 '+b.inkFrames+' 格，對正板面後，偏離原筆畫超過 1.5 px 嘅墨跡比例，中位 '+b.extraInkMedian+'%，第 95 百分位 '+b.extraInkP95+'%。');
 add('ink','移動時筆畫閃動',b.temporalPairs+' 對相鄰畫格，扣除透視同原畫亮度變化後，筆畫變化差平均 '+b.flicker+' / 255。');
 if(r.exitSign)add('ink','出口牌橫移',r.exitSign.frames+' 個獨立機位橫移 '+r.exitSign.travelMetres+' 米，牌面連周邊嘅 RGB 平均絕對誤差 '+r.exitSign.cropRGBMean+' / 255，最高 '+r.exitSign.cropRGBWorst+' / 255。將牌面對正為 560 × 190 像素後，偏離原字超過 2.5 像素嘅筆畫比例，第 95 百分位 '+r.exitSign.extraStrokeP95+'%。');
 for(const [label,val] of Object.entries(r.devices))add('devices',label,val);
 $('stream').textContent='本機 RTX 4050 Laptop 6 GB 喺呢條路線以 960 × 640、40 次取樣重渲，連寫檔每格中位 '+a.renderMedian+' 秒，第 95 百分位 '+a.renderP95+' 秒。即時逐格串流需要常駐 GPU、硬件視像編碼及 WebRTC。以 30 fps 計，渲染、編碼同排程要配合每格 33.3 毫秒。假設網絡來回 20–60 毫秒、編解碼及顯示合計 15–35 毫秒，單格渲染 33 毫秒時，操作到畫面約 68–128 毫秒。以上延遲係規劃估算。';
 $('blend').onclick=source;$('cams').onclick=async()=>{try{save(new Blob([await readFile('cameras.json')],{type:'application/json'}),'POD-office-cameras-and-walk.json');}catch(e){$('download-status').textContent='下載中斷，可以再試一次。';}};
 $('status').textContent='';$('report').hidden=false;
 const mediaURL=async(id,type)=>URL.createObjectURL(new Blob([await readFile(id)],{type}));
 if($('rev14-proof')){
   const extras=[['revision-window.webp','右窗 · 斜望角度'],['revision-pantry.webp','茶水間 · 補光同水位'],['revision-hotel.webp','獨立酒店試玩 · 原招牌位置']];
   void mediaURL('revision-water.mp4','video/mp4').then(url=>{ $('rev14-water').src=url; }).catch(()=>{ $('rev14-water').hidden=true; });
   for(const [id,label] of extras){
     void mediaURL(id,'image/webp').then(url=>{
       const fig=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');
       image.alt=label;image.loading='lazy';image.src=url;caption.textContent=label;
       fig.append(image,caption);$('rev14-proof').append(fig);
     }).catch(()=>{});
   }
 }
 const crops=[['ink-100.png','青框白板 · 白板筆起收筆'],['desk-100.png','橫移半米 · 椅扶手及屏風'],['door-100.png','連接通道 · 玻璃門腳及地氈'],['plant-100.png','入口 · 黃金樹葉片及花盆'],['office-100.png','辦公區 · 影印機'],['window-100.png','會議室 · 窗外街景'],['exit-sign-100.png','門口 · EXIT 出口牌']];
 await Promise.all([mediaURL('walk-comparison.mp4','video/mp4').then(v=>$('film').src=v),mediaURL('board-walk.mp4','video/mp4').then(v=>$('board').src=v),...crops.map(async([id,label])=>{
  const fig=document.createElement('figure'),link=document.createElement('a'),im=document.createElement('img'),caption=document.createElement('figcaption');
  link.target='_blank';link.rel='noopener';im.alt=label;link.append(im);caption.textContent=label;fig.append(link,caption);$('crops').append(fig);im.src=link.href=await mediaURL(id,'image/png');
 })]);document.body.dataset.ready='true';
}
show().catch(e=>{$('status').textContent='未能載入完整對照，請重新整理。';document.body.dataset.error=String(e);});
