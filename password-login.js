(()=>{'use strict';
// Link-based access only. No password form, derivation, or stored password.
const status=document.getElementById('status');
document.querySelector('#login')?.remove();
if(status&&!status.isConnected)document.querySelector('main')?.append(status);
const intro=document.querySelector('.intro');if(intro)intro.textContent='使用研究分享連結直接閱讀。';
const slot='studio-session:'+location.pathname.replace(/(?:ecss2026\/)?[^/]*$/, '');
const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
let busy=false;
const message=s=>{if(status)status.textContent=s;};
async function openShare(){
 if(busy)return;
 let secret=new URLSearchParams(location.hash.slice(1)).get('key');
 if(!secret){try{secret=sessionStorage.getItem(slot);}catch{}}
 if(!secret){message('請使用完整的研究分享連結開啟此頁。');return;}
 busy=true;message('正在開啟研究…');
 try{
  if(!/^[A-Za-z0-9_-]{43}$/.test(secret))throw Error('invalid link');
  const route=new URLSearchParams(location.hash.slice(1));
  if(route.get('view')==='tickets'){
   const material=await crypto.subtle.importKey('raw',bytes(secret),'HKDF',false,['deriveBits']);
   const enc=new TextEncoder();
   const bits=await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:enc.encode("HK Research Studio / project access / 2026"),info:enc.encode("shared-reading-room-581641e1/tickets/v1")},material,256);
   const scoped=btoa(String.fromCharCode(...new Uint8Array(bits))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
   const params=new URLSearchParams({key:scoped,view:'tickets',ticketSection:route.get('ticketSection')||'report'});
   if(route.get('ticketChapter'))params.set('ticketChapter',route.get('ticketChapter'));
   try{sessionStorage.removeItem(slot);}catch{}
   location.replace(new URL('tickets/',location.href.split('#')[0]).href+'#'+params);return;
  }
  const key=await crypto.subtle.importKey('raw',bytes(secret),'AES-GCM',false,['decrypt']);
  const zipped=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(payload.iv)},key,bytes(payload.data));
  const html=await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  try{sessionStorage.setItem(slot,secret);sessionStorage.removeItem(slot+':locked');}catch{}
  const h=new URLSearchParams(location.hash.slice(1));h.set('key',secret);if(!h.has('view'))h.set('view','projects');
  history.replaceState(null,'',location.pathname+location.search+'#'+h.toString());
  document.open();document.write(html);document.close();
 }catch{busy=false;message('此分享連結未能開啟，請重新使用完整的研究分享連結。');}
}
window.addEventListener('hashchange',openShare);openShare();
})();

