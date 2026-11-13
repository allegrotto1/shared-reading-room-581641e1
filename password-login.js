(()=>{'use strict';
const form=document.getElementById('login'),input=document.getElementById('password'),status=document.getElementById('status'),submit=document.getElementById('submit'),show=document.getElementById('show');
const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
let busy=false;
function message(text,error=false){status.textContent=text;status.dataset.error=String(error);input.setAttribute('aria-invalid',String(error));}
function working(on){busy=on;submit.disabled=on;input.disabled=on;show.disabled=on;form.setAttribute('aria-busy',String(on));submit.textContent=on?'正在開啟…':'開啟研究室 →';}
show.onclick=()=>{const visible=input.type==='password';input.type=visible?'text':'password';show.textContent=visible?'隱藏':'顯示';show.setAttribute('aria-label',visible?'隱藏密碼':'顯示密碼');show.setAttribute('aria-pressed',String(visible));input.focus();};
async function open(secret){if(!/^[A-Za-z0-9_-]{43}$/.test(secret))throw Error('Invalid key');const imported=await crypto.subtle.importKey('raw',bytes(secret),'AES-GCM',false,['decrypt']);const compressed=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(payload.iv)},imported,bytes(payload.data));let html=await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
// Existing project routes read the key from the fragment; fragments stay in the browser.
const params=new URLSearchParams(location.hash.slice(1));params.set('key',secret);if(!params.has('view'))params.set('view','projects');history.replaceState(null,'',location.pathname+location.search+'#'+params.toString());input.value='';
const lock='<button type="button" id="studioLock" data-language-preserve onclick="location.replace(location.pathname+\'?locked=1#view=projects\')">鎖定 / Lock</button>';
html=html.replace('<div class="studio-actions">','<div class="studio-actions">'+lock);document.open();document.write(html);document.close();}
form.onsubmit=async e=>{e.preventDefault();if(busy||!input.value)return;working(true);message('正在開啟研究室…');try{const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(input.value),'PBKDF2',false,['deriveKey']);const wrappingKey=await crypto.subtle.deriveKey({name:'PBKDF2',salt:bytes(passwordEnvelope.salt),iterations:passwordEnvelope.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);const raw=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(passwordEnvelope.iv)},wrappingKey,bytes(passwordEnvelope.data));await open(encode(raw));}catch{working(false);message('未能解鎖，請檢查密碼後再試。',true);input.focus();input.select();}};
const secret=new URLSearchParams(location.hash.slice(1)).get('key');if(secret){working(true);message('正在開啟研究室…');open(secret).catch(()=>{working(false);message('分享連結未能解鎖，請輸入密碼。',true);input.focus();});}
})();
