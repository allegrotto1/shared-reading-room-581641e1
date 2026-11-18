const sealed=document.documentElement.hasAttribute('data-protected');
const base=new URL('../../',location.href);
const encoder=new TextEncoder();
let key,table;
export async function enter(proof=false){
  if(!sealed)return true;
  const secret=sessionStorage.getItem('studio-session:'+base.pathname);
  if(!secret || !/^[\w-]{43}$/.test(secret)){
    base.hash='view='+(proof?'office-board-proof':new URLSearchParams(location.search).has('device')?'office-board-device':'office-whiteboard');
    location.replace(base.href);return false;
  }
  const bytes=Uint8Array.from(atob(secret.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
  const material=await crypto.subtle.importKey('raw',bytes,'HKDF',false,['deriveKey']);
  key=await crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode('Research Studio media / 1'),info:encoder.encode('POD whiteboard walk / 1')},material,{name:'AES-GCM',length:256},false,['decrypt']);
  table=(await import('./catalog.js')).files;return true;
}
export async function readFile(id){
  const row=sealed?table[id]:null;
  if(sealed&&!row)throw Error('樣板檔案未登記');
  const uri=sealed?new URL(row[0],location.href):new URL('./data/'+id,location.href);
  let bytes;
  for(let i=0;i<4;i++){
    try{
      const url=new URL(uri);
      if(i)url.searchParams.set('retry',String(i));
      const res=await fetch(url,{referrerPolicy:'no-referrer'});
      if(!res.ok)throw Error('HTTP '+res.status+' · '+id);
      bytes=new Uint8Array(await res.arrayBuffer());
      if(row && bytes.length!==row[1]+28)throw Error('下載未完整');
      break;
    }catch(e){if(i===3)throw e;await new Promise(ok=>setTimeout(ok,350*2**i));}
  }
  if(!sealed)return bytes;
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12),additionalData:encoder.encode('whiteboard/'+id)},key,bytes.subarray(12)));
}
