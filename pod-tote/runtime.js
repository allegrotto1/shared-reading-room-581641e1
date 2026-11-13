(async()=>{
 'use strict';
 const params=new URLSearchParams(location.hash.slice(1)),secret=params.get('key'),status=document.getElementById('status'),mount=document.getElementById('mount');
 if(!secret||!/^[A-Za-z0-9_-]{43}$/.test(secret))return;
 const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 const key=await crypto.subtle.importKey('raw',bytes(secret),'AES-GCM',false,['decrypt']);
 async function decrypt(url){const response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw Error('HTTP '+response.status);const data=new Uint8Array(await response.arrayBuffer());const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:data.slice(0,12)},key,data.slice(12));return new Response(new Blob([clear]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();}
 let manifest;try{status.textContent='正在開啟布袋設計…';manifest=JSON.parse(new TextDecoder().decode(await decrypt('manifest.enc')));}catch(e){status.textContent='未能解鎖，請由原有分享連結重新開啟。';return;}
 const latest=manifest.latest,rawCache=new Map(),blobCache=new Map(),moduleCache=new Map();let rendering=0;
 function resolve(base,rel){const u=new URL(rel,'https://project.invalid/'+base);if(u.origin!=='https://project.invalid')return null;const file=decodeURIComponent(u.pathname.slice(1));if(!manifest.files[file])throw Error('Missing packaged file: '+file);return file;}
 function raw(file){if(!rawCache.has(file))rawCache.set(file,decrypt('assets/'+manifest.files[file].id+'.enc').catch(e=>{rawCache.delete(file);throw e;}));return rawCache.get(file);}
 async function text(file){return new TextDecoder().decode(await raw(file));}
 async function asset(file){const info=manifest.files[file];if(!info)throw Error('Missing asset');if(!blobCache.has(info.id))blobCache.set(info.id,raw(file).then(data=>URL.createObjectURL(new Blob([data],{type:info.type}))));return blobCache.get(info.id);}
 async function module(file){if(moduleCache.has(file))return moduleCache.get(file);const task=(async()=>{let source=await text(file);const imports=[...source.matchAll(/from\s*(['"])([^'"]+)\1/g)];for(const m of imports){const target=m[2]==='three'?'vendor/three.module.js':resolve(file,m[2]);if(target)source=source.replace(m[0],'from '+JSON.stringify(await module(target)));}
 if(file.endsWith('/app.js')||file==='app.js'){const page=file.slice(0,-6)+'index.html';if(!source.includes('im.src=src;'))throw Error('Unexpected image loading contract');source=source.replace('im.src=src;','parent.__podAsset('+JSON.stringify(page)+',src).then(u=>{im.src=u;},reject);');}
 return URL.createObjectURL(new Blob([source],{type:'text/javascript'}));})();moduleCache.set(file,task);return task;}
 window.__podAsset=(base,rel)=>asset(resolve(base,rel));
 function routeURL(file){const u=new URL(location.href);u.hash=new URLSearchParams({key:secret,page:file}).toString();return u.href;}
 const home=new URL('../',location.href);home.hash=new URLSearchParams({key:secret,view:'projects'}).toString();document.getElementById('home').href=home.href;
 async function render(file){const token=++rendering;status.hidden=false;status.textContent='正在載入設計與圖片…';mount.replaceChildren();try{
 const doc=new DOMParser().parseFromString(await text(file),'text/html');doc.querySelectorAll('script[type="importmap"]').forEach(e=>e.remove());
 await Promise.all([...doc.querySelectorAll('link[rel="stylesheet"]')].map(async e=>{const style=doc.createElement('style');style.textContent=await text(resolve(file,e.getAttribute('href')));e.replaceWith(style);}));
 await Promise.all([...doc.querySelectorAll('img[src]')].map(async e=>{e.setAttribute('src',await asset(resolve(file,e.getAttribute('src'))));}));
 await Promise.all([...doc.querySelectorAll('[data-art],[data-layout]')].flatMap(e=>['data-art','data-layout'].filter(a=>e.hasAttribute(a)).map(async a=>e.setAttribute(a,await asset(resolve(file,e.getAttribute(a)))))));
 await Promise.all([...doc.querySelectorAll('script[src]')].map(async e=>{e.src=await module(resolve(file,e.getAttribute('src')));}));
 await Promise.all([...doc.querySelectorAll('a[href]')].map(async e=>{const href=e.getAttribute('href');if(!href||href.startsWith('#')||/^(https?:|mailto:|data:|blob:)/i.test(href))return;const target=resolve(file,href);if(!target)return;if(target.endsWith('.html')){e.href=routeURL(target);e.dataset.podPage=target;e.target='_top';}else{e.href=await asset(target);if(e.hasAttribute('download'))e.download=target.split('/').pop();}}));
 const bridge=doc.createElement('script');bridge.textContent="document.addEventListener('click',e=>{const a=e.target.closest('a[data-pod-page]');if(a&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey&&e.button===0){e.preventDefault();parent.__podNavigate(a.dataset.podPage);}});";doc.body.append(bridge);
 if(token!==rendering)return;const frame=document.createElement('iframe');frame.id='design-frame';frame.title=doc.title||'布袋設計預覽';frame.srcdoc='<!doctype html>'+doc.documentElement.outerHTML;mount.replaceChildren(frame);document.title=(doc.title||'布袋設計')+' · Research Studio';status.hidden=true;window.__podCurrent=file;
 }catch(e){if(token===rendering){status.hidden=false;status.textContent='載入未完成，請重新整理。';console.error('Design load failed',e);}}}
 window.__podNavigate=file=>{if(!manifest.files[file]||!file.endsWith('.html'))return;history.pushState({},'',routeURL(file));render(file);};
 document.getElementById('latest').onclick=()=>window.__podNavigate(latest);document.getElementById('compare').onclick=()=>window.__podNavigate('compare.html');window.addEventListener('popstate',()=>render(new URLSearchParams(location.hash.slice(1)).get('page')||latest));
 window.__podManifest=manifest;await render(params.get('page')&&manifest.files[params.get('page')]?params.get('page'):latest);
})();
