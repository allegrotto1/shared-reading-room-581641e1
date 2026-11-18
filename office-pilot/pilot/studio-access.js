// The existing Research Studio gate owns login. Only its per-purpose, non-extractable key is used here.
const root = new URL('../', import.meta.url);
const studio = new URL('../../', import.meta.url);
const slot = 'studio-session:' + studio.pathname;
const catalog = {"assets/layout.json":["76eec9d1a961fabd26acc1297433605831a5","application/json",19493],"assets/v6/office-reflection.hdr":["4316f21120bbc32442f64e6bc5ef987e09a3","application/octet-stream",1404300],"assets/v6/meeting-reflection.hdr":["8579f9c44a3a1c3e4fee9cc3321c89121d71","application/octet-stream",1404640],"pilot/poses.json":["67f7583cb975913c59e12be13fe1d4107166","application/json",1526],"pilot/office-context.glb":["6087fb81478ce2e49e8f3723260ad31023eb","model/gltf-binary",4960488],"pilot/shell-hd.glb":["fc7ae078bc7f304a0f411ea10cb4ffcc4310","model/gltf-binary",2667644],"pilot/fixtures-hd.glb":["c5681ed2f0bea5ac992322d339c902c62b24","model/gltf-binary",3450956],"pilot/hardware.glb":["86a3b06fd7e57bd2c9e05a9d96fe84ddd7ea","model/gltf-binary",1258420],"pilot/ceiling-v7.glb":["51118a3e322b79e4d6d5e2949b3ce1bfda87","model/gltf-binary",3684616],"pilot/entrance-reflection.hdr":["680e0047affc56883610a86da1bcf8462454","application/octet-stream",1500655],"pilot/light-fields/origin-depth.png":["bea769cd0ff39b6bf2b306dcf8d63d13c14d","image/png",276306],"pilot/light-fields/origin-diffuse.png":["5f7c07d96cbff208707067d5d27b9672f57c","image/png",702664],"pilot/light-fields/side-depth.png":["194a6055afe5adebabe2a9aafe32eb7e5523","image/png",282927],"pilot/light-fields/side-diffuse.png":["35a396d258a0c01c223bce682d1b7f97f82b","image/png",678593],"pilot/surfaces/blender-view-lut.bin":["5dff557bc3d2ac86994bd3e7a726b1b43c9c","application/octet-stream",1048576],"pilot/surfaces/carpet-detail.png":["2a413ebaff2626be58c18b4bebc9e75489d7","image/png",1361828],"pilot/surfaces/carpet-normal.png":["4e2f6a031abb257f36d1a8549373f91cec2a","image/png",444473],"pilot/panoramas/origin/preview.webp":["6df30f211ca9b94aef09e9c10610bee19a8b","image/webp",163596],"pilot/panoramas/origin/r0-c0.png":["09c699c71775ad7a8e907a1778e7f343c605","image/png",2064488],"pilot/panoramas/origin/r0-c1.png":["92fb642866c1885d5348f10442b7b08ade16","image/png",2634824],"pilot/panoramas/origin/r0-c2.png":["d76179ca31b0e68da79c1ca3d45a710f852d","image/png",3559910],"pilot/panoramas/origin/r0-c3.png":["c58fbad0761466a531d02d044d44d6450c8d","image/png",2808402],"pilot/panoramas/origin/r0-c4.png":["5771772dee7974279f62f024452b36e42b6c","image/png",2277654],"pilot/panoramas/origin/r0-c5.png":["2f5a8f648e3b4785c1be1fe12027752811b0","image/png",2345966],"pilot/panoramas/origin/r0-c6.png":["6c1db996ac819af53c9dfa687ffe1bab663f","image/png",2485836],"pilot/panoramas/origin/r0-c7.png":["7536f96cfbec4f35f0c5dc075e31b5029960","image/png",2666510],"pilot/panoramas/origin/r1-c0.png":["6a0632718157b38f6b51daf841ff0a8d7be7","image/png",1537116],"pilot/panoramas/origin/r1-c1.png":["1c510cc13daf6767670690655de489805e86","image/png",1477364],"pilot/panoramas/origin/r1-c2.png":["65543d8b5e28ac42c33664928e343964e8c3","image/png",3225620],"pilot/panoramas/origin/r1-c3.png":["1242ef927791b9f6abee4a9885d5baa4c5b3","image/png",3832587],"pilot/panoramas/origin/r1-c4.png":["ec8d6beb74204546ffe80ccca0eb43e2f31c","image/png",2935446],"pilot/panoramas/origin/r1-c5.png":["fffe013e0d2d1a75bf9b4e081f761b0f3d73","image/png",3246870],"pilot/panoramas/origin/r1-c6.png":["d519d7ba575de60e4894a17517468e613783","image/png",3601588],"pilot/panoramas/origin/r1-c7.png":["c483687c25a89ce255274f37ed4ef64b946a","image/png",1664096],"pilot/panoramas/origin/r2-c0.png":["eb11e5d62c8ca936ee9dd94e5b9a676e72ac","image/png",1546059],"pilot/panoramas/origin/r2-c1.png":["2ce983b06451a4ed01b5bf9ee2a83328b06f","image/png",1511264],"pilot/panoramas/origin/r2-c2.png":["f5d3186b128398c0fb57bd793e3d8c3a21d0","image/png",2984930],"pilot/panoramas/origin/r2-c3.png":["03f32da37b97184404f74e1712e336a86251","image/png",4221237],"pilot/panoramas/origin/r2-c4.png":["4991e569d6e528472af3ff0d7b3ee3831c36","image/png",4313757],"pilot/panoramas/origin/r2-c5.png":["80b17232934741b37b392d4b297eb42a7985","image/png",4522536],"pilot/panoramas/origin/r2-c6.png":["1737dfb0b8dab3f46191c7de9a7c6abacc0d","image/png",4151472],"pilot/panoramas/origin/r2-c7.png":["e4d7498684ffc922d672c8ca477837885387","image/png",1599506],"pilot/panoramas/origin/r3-c0.png":["498308ed869bf4534e7b27d8762c67a0a08b","image/png",2316530],"pilot/panoramas/origin/r3-c1.png":["54f244cddfe9fd3b7838cdabae8887d7bb4f","image/png",2544727],"pilot/panoramas/origin/r3-c2.png":["99737cec0ca704aca975f95283ba429bb98e","image/png",4504472],"pilot/panoramas/origin/r3-c3.png":["c6718d429ac633d161dcf181d110465b1585","image/png",5236877],"pilot/panoramas/origin/r3-c4.png":["0a26495e1e78dd265f18a859715d0322d601","image/png",4379835],"pilot/panoramas/origin/r3-c5.png":["8cbb49cdd1c47d60aa01d3db84dc5d37d8db","image/png",5055842],"pilot/panoramas/origin/r3-c6.png":["6239c63189c5de4580b19e2869d82231dcc9","image/png",5290258],"pilot/panoramas/origin/r3-c7.png":["02efa254b1cb485a181fa1a49503e316d4ac","image/png",3200205],"pilot/panoramas/side/preview.webp":["746b2b64a4f9612a62eb87685f7a0f3b9676","image/webp",178986],"pilot/panoramas/side/r0-c0.png":["e9fab224b15ab219e1672f9032b19b731bb6","image/png",2528202],"pilot/panoramas/side/r0-c1.png":["d01f6c0d9a6a4210a7262331b160e2ec3982","image/png",2997847],"pilot/panoramas/side/r0-c2.png":["0a27bd6f946319d43b5caa8c269d3cbb6486","image/png",2793871],"pilot/panoramas/side/r0-c3.png":["547de2a876d4ed3d831707d6c76876ac9cf1","image/png",2152969],"pilot/panoramas/side/r0-c4.png":["adb34e9e5aebbc1dc0bc11be5c1947343d82","image/png",2158470],"pilot/panoramas/side/r0-c5.png":["c40f495390bf1a42d305d757651c88d2128d","image/png",2174042],"pilot/panoramas/side/r0-c6.png":["3dfa50ec544036fa00b8490ab8e3ceb9906d","image/png",2403624],"pilot/panoramas/side/r0-c7.png":["b5ecd65d5277a68316d2adaaa4d3fb816644","image/png",3002384],"pilot/panoramas/side/r1-c0.png":["263e34e360f43d5f331e6bd062128d55766e","image/png",1615014],"pilot/panoramas/side/r1-c1.png":["7313b55027e87ee26d99623c98f0fa5669c9","image/png",1769439],"pilot/panoramas/side/r1-c2.png":["08de511bdd57a574f0997cf9ced5877213c0","image/png",3688894],"pilot/panoramas/side/r1-c3.png":["02f67cfa8b49d57f38ca390522c26e9c8f7d","image/png",3668395],"pilot/panoramas/side/r1-c4.png":["6cde1b125f3d139339112f8f4f92cb025727","image/png",2782693],"pilot/panoramas/side/r1-c5.png":["ace5a13a01c0f25df92f1a9c4e64e4adbe6e","image/png",3477780],"pilot/panoramas/side/r1-c6.png":["3a7c009384abe44ba144530c4fd427f62673","image/png",3830389],"pilot/panoramas/side/r1-c7.png":["4d15f1426517c349994d51b8a00fe6e3361b","image/png",2137580],"pilot/panoramas/side/r2-c0.png":["451c1f07cb7a321a6a83f6bed82e7388490e","image/png",1565454],"pilot/panoramas/side/r2-c1.png":["0d07829d4c8c957392618abb0e478a1dc7ef","image/png",1615079],"pilot/panoramas/side/r2-c2.png":["1b4335a973d39d0940565c2090ce6938dc00","image/png",3394016],"pilot/panoramas/side/r2-c3.png":["ce5982f55d7871ce68634fb1abe4ffe9ce10","image/png",4187042],"pilot/panoramas/side/r2-c4.png":["a1e1101ec946a8cf431151f0db8b4c56a785","image/png",3960410],"pilot/panoramas/side/r2-c5.png":["65200b1dda883bcb9d4254c02f45568ddcf7","image/png",4580261],"pilot/panoramas/side/r2-c6.png":["de30775d9105e5022bebb3f49b385e68ac6c","image/png",4207905],"pilot/panoramas/side/r2-c7.png":["a93add3dc757801a5ba91d39acec666bf6e7","image/png",1890643],"pilot/panoramas/side/r3-c0.png":["e66d70d0fa617a67196396a0d3479d1a658f","image/png",3109751],"pilot/panoramas/side/r3-c1.png":["2c5f5317c47ce1e7f0c22ec3acc729f0f365","image/png",3582094],"pilot/panoramas/side/r3-c2.png":["9b7482b749cff407f2519db767ad63584335","image/png",5199335],"pilot/panoramas/side/r3-c3.png":["894847229898fe6b98346aa305eefcc0a8bf","image/png",4239666],"pilot/panoramas/side/r3-c4.png":["85f06168824e695bcd6c6624f814c7dc387f","image/png",4927567],"pilot/panoramas/side/r3-c5.png":["cd67c31e3a16d21b52045368ecc14981abe6","image/png",5312365],"pilot/panoramas/side/r3-c6.png":["d864aa0a09b42f293f5bd2c17e40143b550c","image/png",5319919],"pilot/panoramas/side/r3-c7.png":["ef59fc5b9bf9fbdb34bd52160fd104087469","image/png",4303346]};
const encoder = new TextEncoder();
let keyPromise;

function backToGate() {
  studio.search = '?preview=lighting7';
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
