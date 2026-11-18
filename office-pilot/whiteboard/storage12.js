const sealed=document.documentElement.hasAttribute('data-protected');
const base=new URL('../../',location.href);
const encoder=new TextEncoder();
let key,table;
export const transportHealth={recovered:new Set(),failed:new Set()};
export async function enter(proof=false){
  if(!sealed)return true;
  const secret=sessionStorage.getItem('studio-session:'+base.pathname);
  if(!secret || !/^[\w-]{43}$/.test(secret)){
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
  const row=sealed?table[id]:null;
  if(sealed&&!row)throw Error('樣板檔案未登記');
  const uri=sealed?new URL(row[0],location.href):new URL('./data/'+id,location.href);
  const endpoints=[{url:uri}];
  if(sealed){
    // Every URL identifies the same immutable ciphertext. Authentication always happens in the browser.
    const [owner,repo,revision,...path]=uri.pathname.slice(1).split('/');
    endpoints.push({url:new URL('https://cdn.jsdelivr.net/gh/'+owner+'/'+repo+'@'+revision+'/'+path.join('/'))});
    const api=new URL('https://api.github.com/repos/'+owner+'/'+repo+'/contents/'+path.join('/'));
    api.searchParams.set('ref',revision);endpoints.push({url:api,accept:'application/vnd.github.raw+json'});
  }
  const retry=new URL(uri);retry.searchParams.set('retry','1');endpoints.push({url:retry});
  for(const [i,entry] of endpoints.entries()){
    try{
      const res=await fetch(entry.url,{referrerPolicy:'no-referrer',credentials:'omit',
        headers:entry.accept?{Accept:entry.accept}:{},signal:globalThis.AbortSignal?.timeout?.(row&&row[1]>5000000?120000:30000)});
      if(!res.ok)throw Error('HTTP '+res.status+' · '+id);
      const bytes=new Uint8Array(await res.arrayBuffer());
      if(row && bytes.length!==row[1]+28)throw Error('下載未完整');
      const plain=sealed?new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.subarray(0,12),additionalData:encoder.encode('whiteboard/'+id)},key,bytes.subarray(12))):bytes;
      if(i)transportHealth.recovered.add(id);transportHealth.failed.delete(id);return plain;
    }catch(e){
      if(i===endpoints.length-1){transportHealth.failed.add(id);throw e;}
    }
  }
}
