const doc=document.documentElement;
const sealed=doc.hasAttribute('data-protected');
const guest=!sealed&&doc.hasAttribute('data-public-hotel');
const guestBase=new URL('./hotel-demo/v2/',import.meta.url);
const guestRevision='9328728563d66266187d249c01c35372dcf5b7db';
const guestRepo='allegrotto1/shared-reading-room-581641e1';
const guestFolder='office-pilot/whiteboard/hotel-demo/v2/';
const guestAsset=/^(?:(?:layout\.json|(?:geometry|distance-grid)\.bin\.gz)|(?:board|world)\.png|floor-[0-3]\.bin\.gz|(?:exterior|branches|world-right|dispenser)\.webp|(?:lite|view)-\d{2}(?:\.webp|-depth\.bin\.gz))$/;
const base=new URL('../../',location.href);
const encoder=new TextEncoder();
let key,table;
export const transportHealth={recovered:new Set(),failed:new Set()};
export async function enter(proof=false,redirect=true){
  if(!sealed)return true;
  const secret=sessionStorage.getItem('studio-session:'+base.pathname);
  if(!secret || !/^[\w-]{43}$/.test(secret)){
    if(!redirect)return false;
    const query=new URLSearchParams(location.search),start=query.get('start');
    const destinations={plant:'office-plant',window:'office-window',meeting:'office-meeting',copier:'office-copier',pantry:'office-pantry',office:'office-desks',reception:'office-entrance'};
    base.hash='view='+(proof?'office-full-proof':query.has('device')?'office-board-device':destinations[start]||'office-whiteboard');
    location.replace(base.href);return false;
  }
  const bytes=Uint8Array.from(atob(secret.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const material=await crypto.subtle.importKey('raw',bytes,'HKDF',false,['deriveKey']);
  key=await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode('Research Studio media / 1'),info:encoder.encode('POD whiteboard walk / 1')},material,{name:'AES-GCM',length:256},false,['decrypt']);
  table=(await import('./catalog12.js')).files;return true;
}
export async function readFile(id){
  if(guest&&!guestAsset.test(id))throw Error('This file is not part of the hotel demo');
  const row=sealed?table[id]:null;
  if(sealed&&!row)throw Error('This office file is missing from the catalog');
  const uri=sealed?new URL(row[0],location.href):guest?new URL(id,guestBase):new URL('./data/'+id,location.href);
  const endpoints=[{url:uri}];
  if(guest){
    const raw=new URL('https://raw.githubusercontent.com/'+guestRepo+'/'+guestRevision+'/'+guestFolder+id);
    const edge=new URL('https://cdn.jsdelivr.net/gh/'+guestRepo+'@'+guestRevision+'/'+guestFolder+id);
    const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
    if(!local)endpoints.splice(0,endpoints.length,{url:edge},{url:raw});
  }
  if(sealed){
    // Every URL identifies the same immutable ciphertext. Authentication always happens in the browser.
    const [owner,repo,revision,...path]=uri.pathname.slice(1).split('/');
    endpoints.push({url:new URL('https://cdn.jsdelivr.net/gh/'+owner+'/'+repo+'@'+revision+'/'+path.join('/'))});
    const api=new URL('https://api.github.com/repos/'+owner+'/'+repo+'/contents/'+path.join('/'));
    api.searchParams.set('ref',revision);endpoints.push({url:api,accept:'application/vnd.github.raw+json'});
  }
  const retry=new URL(endpoints[0].url);retry.searchParams.set('retry','1');endpoints.push({url:retry});
  for(const [i,entry] of endpoints.entries()){
    try{
      const res=await fetch(entry.url,{referrerPolicy:'no-referrer',credentials:'omit',
        headers:entry.accept?{Accept:entry.accept}:{},signal:globalThis.AbortSignal?.timeout?.(row&&row[1]>5000000?120000:30000)});
      if(!res.ok)throw Error('HTTP '+res.status+' · '+id);
      const bytes=new Uint8Array(await res.arrayBuffer());
      if(row && bytes.length!==row[1]+28)throw Error('Incomplete download');
      const plain=sealed?new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12),additionalData:encoder.encode('whiteboard/'+id)},key,bytes.subarray(12))):bytes;
      if(i)transportHealth.recovered.add(id);transportHealth.failed.delete(id);return plain;
    }catch(e){
      if(i===endpoints.length-1){transportHealth.failed.add(id);throw e;}
    }
  }
}
