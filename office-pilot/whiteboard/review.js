import {enter,readFile} from './transport.js';
const $=id=>document.getElementById(id);
async function json(id){return JSON.parse(new TextDecoder().decode(await readFile(id)));}
function addRow(id,title,value){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=title;dd.textContent=value;$(id).append(dt,dd);}
function url(data,type){return URL.createObjectURL(new Blob([data],{type}));}
function save(blob,name){
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.textContent='儲存 '+name;
  const feedback=$('download-status');feedback.replaceChildren(a);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),900000);
}
function downloads(){
 $('cams').onclick=async()=>{try{save(new Blob([await readFile('cameras.json')],{type:'application/json'}),'whiteboard-cameras.json');}catch(e){$('download-status').textContent='下載中斷，可以再試一次。';}};
 $('blend').onclick=async()=>{
  const button=$('blend');button.disabled=true;
  try{
   const manifest=await json('source.json'),parts=[];
   for(const [i,id] of manifest.chunks.entries()){
    $('download-status').textContent='下載 Blender 檔 · '+Math.round(i/manifest.chunks.length*100)+'%';
    parts.push(await readFile(id));
   }
   const file=new Blob(parts,{type:'application/octet-stream'});if(file.size!==manifest.size)throw Error('File size');
   save(file,manifest.name);$('download-status').append(' · SHA-256 '+manifest.sha256);
  }catch(e){$('download-status').textContent='下載中斷，可以再試一次。';}finally{button.disabled=false;}
 };
}
async function show(){
 if(!await enter(true))return;
 const data=await json('review.json'),m=data.metrics;
 $('film-caption').textContent=m.frameCount+' 個獨立機位畫格 · 每邊 960 × 640 · '+m.seconds+' 秒。兩邊嘅停步時間相同，短片按 24 格／秒播放。';
 addRow('metrics','青框角位偏差','中位 '+m.cornerMedian+' px，第 95 百分位 '+m.cornerP95+' px，最大 '+m.cornerMax+' px（'+m.cornerCount+' 個可見角位）。');
 addRow('metrics','字跡重影','對正板面後，偏離原筆畫超過 1.5 個標準板面像素嘅深色墨跡，中位 '+m.extraInkMedian+'%，第 95 百分位 '+m.extraInkP95+'%。');
 addRow('metrics','行走時筆畫閃動','補償透視後，網頁對原畫嘅逐格亮度變化差，筆畫範圍平均 '+m.temporalMean+' / 255（'+m.temporalPairs+' 對相鄰格）。');
 $('method').textContent='框線以青色外沿獨立擬合，超出畫面嘅角位剔除。墨跡以 260 × 100 像素嘅相同板面區域核對，只計完整可見嘅 '+m.inkFrames+' 格。相機離最近輸入機位至少 '+Math.round(m.minDistance*100)+' 厘米。';
 $('observations').textContent=data.observations;
 for(const [which,desc] of Object.entries(data.devices))addRow('devices',which,desc);
 $('stream').textContent='本機 RTX 4050 Laptop 6 GB 以 960 × 640、40 samples 重渲，連 Blender 寫檔嘅每格中位 '+m.renderMedian+' 秒。逐格串流要另設常駐 Blender GPU 及 WebRTC 編碼器。若渲染可縮至 33 毫秒，另預算 30–100 毫秒香港至機房來回、編解碼及顯示，輸入到畫面約 63–133 毫秒。按今次原畫設定，單格已要數秒。網絡與編碼數字係規劃估算。';
 downloads();$('status').textContent='';$('report').hidden=false;
 const clip=readFile('walk-comparison.mp4').then(bytes=>{$('film').src=url(bytes,'video/mp4');});
 const crops=[['ink-100.png','行近白板 · 原筆畫粗幼與感嘆號'],['desk-100.png','橫移半米 · 屏風後嘅枱、椅及櫃'],['door-100.png','玻璃門 · 門腳及屏風邊緣']];
 await Promise.all([clip,...crops.map(async([id,caption],i)=>{
   const figure=document.createElement('figure'),cap=document.createElement('figcaption'),ln=document.createElement('a'),label=document.createElement('a'),im=document.createElement('img');
   figure.style.order=i;cap.append(label);figure.append(ln,cap);$('crops').append(figure);
   const u=url(await readFile(id),'image/png');ln.href=label.href=u;ln.target=label.target='_blank';ln.rel=label.rel='noopener';label.textContent=caption+' ↗';im.alt=caption;im.src=u;ln.append(im);
 })]);document.body.dataset.ready='true';
}
show().catch(e=>{$('status').textContent='未能完整載入實測紀錄，請重新整理。';document.body.dataset.error=String(e);});
