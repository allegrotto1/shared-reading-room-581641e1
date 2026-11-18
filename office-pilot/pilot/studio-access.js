// The existing Research Studio gate owns login. Only its per-purpose, non-extractable key is used here.
const root = new URL('../', import.meta.url);
const studio = new URL('../../', import.meta.url);
const slot = 'studio-session:' + studio.pathname;
const catalog = {"assets/layout.json":["76eec9d1a961fabd26acc1297433605831a5","application/json",19493],"assets/v6/office-reflection.hdr":["acdfadd03502e384e6f4f91027cb4b994249","application/octet-stream",1421961],"assets/v6/meeting-reflection.hdr":["078d82960b5fe54f6c7d5ddcef8e3c1bbb1a","application/octet-stream",1379623],"pilot/poses.json":["7eaf30f9eb5a69e0ffe36d9e3e0c3a25d926","application/json",556],"pilot/office-context.glb":["fe928c3a7c12eaf1a46499878921bc5ca181","model/gltf-binary",5081560],"pilot/shell-hd.glb":["dc2e5411e7a1cc9e80fff1de0b63d33607ec","model/gltf-binary",3100316],"pilot/fixtures-hd.glb":["3a98031c9a4cd37420ecaa8e6d38b5bcb42f","model/gltf-binary",3381136],"pilot/hardware.glb":["86a3b06fd7e57bd2c9e05a9d96fe84ddd7ea","model/gltf-binary",1258420],"pilot/entrance-reflection.hdr":["3232fdf1924a9aa42e7085dcc0b47e5eaebc","application/octet-stream",1460243],"pilot/light-fields/origin-depth.png":["a149a18014908b4a7d6a0d1198aeb1edc216","image/png",271232],"pilot/light-fields/origin-diffuse.png":["8ec235ffb3708fc13884adf973ad1a3a782b","image/png",562311],"pilot/light-fields/side-depth.png":["6911518ce066bc1d3b15b5adbf1f72107300","image/png",277281],"pilot/light-fields/side-diffuse.png":["4b65b50bf1055a30b4a0ccc5e0c1223a3d9d","image/png",553241],"pilot/surfaces/blender-view-lut.bin":["5dff557bc3d2ac86994bd3e7a726b1b43c9c","application/octet-stream",1048576],"pilot/surfaces/carpet-detail.png":["2a413ebaff2626be58c18b4bebc9e75489d7","image/png",1361828],"pilot/surfaces/carpet-normal.png":["4e2f6a031abb257f36d1a8549373f91cec2a","image/png",444473],"pilot/panoramas/origin/preview.webp":["04a79bd19b260b9a5bc9a92f9a1f13c04af8","image/webp",139634],"pilot/panoramas/origin/r0-c0.png":["f91f51f0b0d34573c295c962386744e92177","image/png",3475528],"pilot/panoramas/origin/r0-c1.png":["8d9b51225a45dabaeaacf4396038f695b542","image/png",3515748],"pilot/panoramas/origin/r0-c2.png":["359cbe6be22bfd46c4688a46800fe2adf724","image/png",3413285],"pilot/panoramas/origin/r0-c3.png":["93369ff6feaedd4acc083f79f8e8b98a2e17","image/png",3411740],"pilot/panoramas/origin/r0-c4.png":["891f223f7a92e0afa531c205ccaedf008279","image/png",3441792],"pilot/panoramas/origin/r0-c5.png":["391b54bec74854875e202629494b558e6932","image/png",3501949],"pilot/panoramas/origin/r0-c6.png":["c5059c20146363c55460ca4fe7a0a68d7966","image/png",3446688],"pilot/panoramas/origin/r0-c7.png":["b7dbfc484c2f35cc7c6e29260e96f086fe3b","image/png",3536582],"pilot/panoramas/origin/r1-c0.png":["61e6677b6db315221020646628e21a6b33ff","image/png",3466151],"pilot/panoramas/origin/r1-c1.png":["52b7fb3e4a8e822b84e1ebdd42543981e4ba","image/png",3449142],"pilot/panoramas/origin/r1-c2.png":["0e8b62b2d624d965b2b54a267473ea80a6ab","image/png",3860451],"pilot/panoramas/origin/r1-c3.png":["7fcc702d4ef046bf72bfa682c259a688b14e","image/png",3952030],"pilot/panoramas/origin/r1-c4.png":["da4b960cdfe351ed9d8ee497fc538f71689e","image/png",3692421],"pilot/panoramas/origin/r1-c5.png":["d9049788a2023efcf681fc3778b3b097ece5","image/png",3873036],"pilot/panoramas/origin/r1-c6.png":["4b7374fa774d8c2987d7910e33ff7950fa75","image/png",4048951],"pilot/panoramas/origin/r1-c7.png":["5fb763a17f40ec9a1907f47e9b3cc8ed0869","image/png",3478445],"pilot/panoramas/origin/r2-c0.png":["a4ef721eb4f059ad1f0d06f499aba95a2e37","image/png",3443928],"pilot/panoramas/origin/r2-c1.png":["299d7e8598d41130330c7a67dd94a2fbb793","image/png",3422442],"pilot/panoramas/origin/r2-c2.png":["22dd744948a0d3b6439812c8617e90106a2f","image/png",3830161],"pilot/panoramas/origin/r2-c3.png":["c3e92db89125552a666baee4d320c301845f","image/png",4193393],"pilot/panoramas/origin/r2-c4.png":["81affde82295d99a826ebe9d0400ebc6f2c1","image/png",4477197],"pilot/panoramas/origin/r2-c5.png":["f6234ce43eb59e61ab1f92550e91ea683769","image/png",4579514],"pilot/panoramas/origin/r2-c6.png":["6392f6fd2a8cd3a0a57459c1a3c2347f81f0","image/png",4450858],"pilot/panoramas/origin/r2-c7.png":["37604856b5418b2af3a329fff951ec622a19","image/png",3401265],"pilot/panoramas/origin/r3-c0.png":["2916d56fc879e7b9e177b67e399f2b2568e4","image/png",3656340],"pilot/panoramas/origin/r3-c1.png":["f0bdabff1bf7257d6b25cca924662878703c","image/png",3775238],"pilot/panoramas/origin/r3-c2.png":["94515ecf652e64ffdeedbf4b0b03662dfe24","image/png",4630665],"pilot/panoramas/origin/r3-c3.png":["335d69f4d9fb57bebe709c3ab15e3a69683d","image/png",4970851],"pilot/panoramas/origin/r3-c4.png":["28bb9fceb758a23ba7eaa94a8398164ecfe5","image/png",4285369],"pilot/panoramas/origin/r3-c5.png":["7e9b09a25dcaa6ec664134611895bd9bc1ae","image/png",4992275],"pilot/panoramas/origin/r3-c6.png":["a5a527a4bbf019182ccb186e000d713f42ae","image/png",5247845],"pilot/panoramas/origin/r3-c7.png":["505680c5e4814b539d1221f885c4b7079d34","image/png",4016208],"pilot/panoramas/side/preview.webp":["5ca57f4fb0cd3d345a801d3c8eaa1d51149f","image/webp",167310],"pilot/panoramas/side/r0-c0.png":["04397b64ba9a60e406e7461cfc9c1e1e7026","image/png",3542793],"pilot/panoramas/side/r0-c1.png":["7a427f26900322adc203779e54cc60e1ffcb","image/png",3564478],"pilot/panoramas/side/r0-c2.png":["3c5cf663957adb71ca8607cbf93b110bd9c4","image/png",3431958],"pilot/panoramas/side/r0-c3.png":["aa3dbcfc70b1018886cd56d1b1ef4c5de7e9","image/png",3533774],"pilot/panoramas/side/r0-c4.png":["62892f9176264c4e5402998d43b5960eb03a","image/png",3485017],"pilot/panoramas/side/r0-c5.png":["9d995ff03d2dcd6a41dc98e405b57769ccf5","image/png",3407029],"pilot/panoramas/side/r0-c6.png":["a50d21cbc9f1fb3c15352fe26aabc062303b","image/png",3495456],"pilot/panoramas/side/r0-c7.png":["fa12db0ec3c44ab5ada2bec2729ee72ed551","image/png",3639863],"pilot/panoramas/side/r1-c0.png":["a627e34b2058ac738fce06670278f1791639","image/png",3414717],"pilot/panoramas/side/r1-c1.png":["44ecdfaa0e5dd4bb9feabd8cab4b3b5b8b9f","image/png",3476874],"pilot/panoramas/side/r1-c2.png":["7af6cccfd146efed8f4e9d019a1d3eb822af","image/png",3916389],"pilot/panoramas/side/r1-c3.png":["5d65858fa009c950f291c380fdaf6d5097f0","image/png",3857029],"pilot/panoramas/side/r1-c4.png":["ee6a0cea3a07349790001f19e1c021902646","image/png",3714430],"pilot/panoramas/side/r1-c5.png":["ba04130d51a99ed7d63434a9dde16ec97d7e","image/png",3914113],"pilot/panoramas/side/r1-c6.png":["fc6f4a29d883ba0601c592ea25f052fe151a","image/png",3979376],"pilot/panoramas/side/r1-c7.png":["ce05cc060e5a2ef29f9668fbc2a967fee792","image/png",3490098],"pilot/panoramas/side/r2-c0.png":["8ab2ed9b8a0578d19a75dc18f5f6376918fd","image/png",3362604],"pilot/panoramas/side/r2-c1.png":["46a97270a8b8925b00c439a79911bef45a5e","image/png",3385790],"pilot/panoramas/side/r2-c2.png":["1451567ddc8c7a6aae7d2f409f8a36dd540b","image/png",3912429],"pilot/panoramas/side/r2-c3.png":["5632b26fc1fdcf311285de9f4bd03d809fad","image/png",4262534],"pilot/panoramas/side/r2-c4.png":["1287c127225ade9edd49677a97b0f25233f3","image/png",4134027],"pilot/panoramas/side/r2-c5.png":["bd479a9aff75a3c7feaf92622a44850c2efc","image/png",4642440],"pilot/panoramas/side/r2-c6.png":["7da6ff933c45906e559dcf6657dfb48ca0ca","image/png",4376075],"pilot/panoramas/side/r2-c7.png":["cefd62ca2f018dc51f1d7efeb9b5aa754f2a","image/png",3258012],"pilot/panoramas/side/r3-c0.png":["f80f65d7ba29e6ad4da2245500c12934055d","image/png",4003071],"pilot/panoramas/side/r3-c1.png":["cccb67de0fb76cbe64673e8ec314b973624d","image/png",4266262],"pilot/panoramas/side/r3-c2.png":["294ffc7f9ac48a1e9c518efcd79c00b8c8c2","image/png",5099533],"pilot/panoramas/side/r3-c3.png":["3e49421675289fe0e57f0274b27fe848e36d","image/png",4204511],"pilot/panoramas/side/r3-c4.png":["04a515cb8588ac58db905c62bf2275ae1add","image/png",4929467],"pilot/panoramas/side/r3-c5.png":["f2e1ff21e4a50820d5f84a3ec95d25d6ffb3","image/png",5248862],"pilot/panoramas/side/r3-c6.png":["6f63429db4fd67843b53a7b4b7a413faa096","image/png",5308316],"pilot/panoramas/side/r3-c7.png":["f407ae2d4d4952ab4b3d34129f29ccf4ac3d","image/png",4643823]};
const encoder = new TextEncoder();
let keyPromise;

function backToGate() {
  studio.search = '?preview=v6-360';
  studio.hash = 'view=office-pilot';
  location.replace(studio.href);
}
window.addEventListener('pageshow',event=>{
  if(event.persisted && !sessionStorage.getItem(slot)) {document.body.hidden=true;backToGate();}
});
export async function enter() {
  let secret;
  try { secret = sessionStorage.getItem(slot); } catch {}
  if (!secret || !/^[\w-]{43}$/.test(secret)) {
    backToGate();
    return false;
  }
  if (!keyPromise) {
    const raw=Uint8Array.from(atob(secret.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
    keyPromise=crypto.subtle.importKey('raw',raw,'HKDF',false,['deriveKey']).then(material=>
      crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:encoder.encode('Research Studio media / 1'),
        info:encoder.encode('POD copier panorama review 1')},material,{name:'AES-GCM',length:256},false,['decrypt']));
  }
  return true;
}
export async function read(path, onProgress) {
  const url=new URL(path,root);
  if(url.origin!==root.origin || !url.pathname.startsWith(root.pathname)) throw Error('Unknown asset origin');
  const id=url.pathname.slice(root.pathname.length);
  const row=catalog[id];
  if(!row || !keyPromise)throw Error('Review asset unavailable');
  const response=await fetch(new URL('media/'+row[0]+'.bin',root),{referrerPolicy:'no-referrer'});
  if(!response.ok) throw Error('Could not load review asset');
  let packet;
  if(onProgress && response.body) {
    const reader=response.body.getReader(), parts=[];
    let count=0;
    for (;;) {
      const {value,done}=await reader.read();
      if(done)break;
      parts.push(value);count+=value.byteLength;onProgress({loaded:count,total:row[2]+28});
    }
    packet=new Uint8Array(await new Blob(parts).arrayBuffer());
  } else packet=new Uint8Array(await response.arrayBuffer());
  if(packet.length!==row[2]+28)throw Error('Incomplete review asset');
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:packet.subarray(0,12),
    additionalData:encoder.encode('office-pilot/'+id)},await keyPromise,packet.subarray(12));
  return new Response(plain,{headers:{'Content-Type':row[1],'Content-Length':String(row[2])}});
}
