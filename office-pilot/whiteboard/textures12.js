import {readFile} from './storage12.js?v=guest-1';
import {compactWeights} from './field.js?v=guest-1';
export const carpetRects=[[-4.75,-4.12,-.15,2.28],[-.15,-4.12,4.45,2.28],[-.1,1.20,4.4,5.42],[-.1,5.42,4.4,9.64]];
class PixelDecoder{
  constructor(){
    this.seq=0;this.queue=new Map();this.worker=new Worker(new URL('pixels.js',import.meta.url));
    this.worker.onmessage=({data})=>{const task=this.queue.get(data.ticket);this.queue.delete(data.ticket);if(data.error)task.reject(Error(data.error));else task.resolve(data);};
    this.worker.onerror=e=>{for(const task of this.queue.values())task.reject(Error(e.message));this.queue.clear();};
  }
  async read(bytes){const ticket=++this.seq;return new Promise((resolve,reject)=>{this.queue.set(ticket,{resolve,reject});this.worker.postMessage({ticket,bytes},[bytes.buffer]);});}
}
export class SourceTextures{
  constructor(B,scene,material,field,mobile,redraw){
    this.B=B;this.scene=scene;this.mat=material;this.field=field;this.limit=mobile?5:6;this.redraw=redraw;
    this.decoder=new PixelDecoder();this.cache=new Map();this.pending=new Map();this.retry=new Map();this.active=[];this.request=[];this.tiles=new Map();this.tilePending=new Map();
    this.warm=new Map();this.inFlight=new Set();this.maxWarm=mobile?9:12;this.lastPreview=-1000;
    this.blank=this.raw(new Uint8Array([128]),1,1,false,false);
    this.mat.setTexture('leafPhoto',this.blank);this.mat.setTexture('streetPhoto',this.blank);this.mat.setFloat('streetReady',0);
    for(const [i,r] of carpetRects.entries()){material.setVector4('rect'+i,new B.Vector4(r[0],r[1],r[2]-r[0],r[3]-r[1]));material.setTexture('carpet'+i,this.blank);}
    material.setVector4('floorLevel',B.Vector4.Zero());
  }
  raw(data,w,h,depth,mip){
    const b=this.B,c=b.Constants;
    const t=new b.RawTexture(data,w,h,c.TEXTUREFORMAT_R,this.scene,mip,false,mip?b.Texture.TRILINEAR_SAMPLINGMODE:b.Texture.NEAREST_SAMPLINGMODE,depth?c.TEXTURETYPE_HALF_FLOAT:c.TEXTURETYPE_UNSIGNED_BYTE);
    t.wrapU=depth?b.Texture.WRAP_ADDRESSMODE:b.Texture.CLAMP_ADDRESSMODE;t.wrapV=b.Texture.CLAMP_ADDRESSMODE;t.gammaSpace=false;t.anisotropicFilteringLevel=depth?1:4;
    return t;
  }
  async rawFile(id,bytes){
    const q=await this.decoder.read(await (bytes||readFile(id)));
    return this.raw(q.two?new Uint16Array(q.buffer):new Uint8Array(q.buffer),q.width,q.height,q.two,!q.two);
  }
  async colour(id,preloaded){
    const bytes=await (preloaded||readFile(id)),b=this.B;
    const url=URL.createObjectURL(new Blob([bytes],{type:id.endsWith('.png')?'image/png':'image/webp'}));
    try{return await new Promise((resolve,reject)=>{
      const t=new b.Texture(url,this.scene,false,false,b.Texture.TRILINEAR_SAMPLINGMODE,()=>{
        t.wrapU=b.Texture.WRAP_ADDRESSMODE;t.wrapV=b.Texture.CLAMP_ADDRESSMODE;t.gammaSpace=false;t.anisotropicFilteringLevel=4;resolve(t);
      },(msg,err)=>reject(err||Error(msg)));
    });}finally{URL.revokeObjectURL(url);}
  }
  load(id){
    if(this.cache.has(id))return Promise.resolve(this.cache.get(id));
    if(this.pending.has(id))return this.pending.get(id);
    const root='view-'+String(id).padStart(2,'0');
    const bytes=this.warm.get(id);this.warm.delete(id);
    const task=Promise.allSettled([this.colour(root+'.webp',bytes?.[0]),this.rawFile(root+'-depth.bin.gz',bytes?.[1])]).then(result=>{
      if(result.some(x=>x.status==='rejected')){
        for(const value of result)if(value.status==='fulfilled')value.value.dispose();
        this.retry.set(id,performance.now()+2500);throw result.find(x=>x.status==='rejected').reason;
      }
      const now=performance.now(),data={colour:result[0].value,depth:result[1].value,used:now,born:now};
      this.cache.set(id,data);return data;
    }).finally(()=>{this.pending.delete(id);this.redraw();});
    this.pending.set(id,task);return task;
  }
  carpet(i){
    if(this.tiles.has(i))return Promise.resolve();
    if(this.tilePending.has(i))return this.tilePending.get(i);
    const task=this.rawFile('floor-'+i+'.bin.gz').then(t=>{
      this.tiles.set(i,t);this.mat.setTexture('carpet'+i,t);
      this.mat.setVector4('floorLevel',new this.B.Vector4(...carpetRects.map((_,j)=>this.tiles.has(j)?1:0)));
    }).catch(e=>{this.retry.set('floor'+i,performance.now()+10000);throw e;}).finally(()=>{this.tilePending.delete(i);this.redraw();});
    this.tilePending.set(i,task);return task;
  }
  exterior(){
    if(this.street)return this.street;
    this.street=Promise.all([this.colour('exterior.webp'),this.colour('branches.webp'),
      this.colour('world-right.webp').catch(()=>null)]).then(([city,leaves,right])=>{
      city.wrapU=leaves.wrapU=this.B.Texture.CLAMP_ADDRESSMODE;
      this.mat.setTexture('streetPhoto',city);this.mat.setTexture('leafPhoto',leaves);this.mat.setFloat('streetReady',1);
      if(right){this.rightWorld=right;this.mat.setTexture('exteriorWorld',right);this.mat.setFloat('rightStreetReady',1);}
      this.redraw();
    }).catch(e=>{this.street=null;this.retry.set('street',performance.now()+3500);throw e;});
    return this.street;
  }
  nearbyTiles(xy){
    return carpetRects.map(([x,y,r,t],i)=>[i,Math.hypot(Math.max(x-xy[0],0,xy[0]-r),Math.max(y-xy[1],0,xy[1]-t))]).filter(row=>row[1]<1.7).sort((a,b)=>a[1]-b[1]).map(row=>row[0]);
  }
  async settle(xy,floors=true){
    const wanted=this.field.weights(xy).weights.map(p=>p[0]);
    await Promise.all(wanted.map(id=>this.load(id)));
    if(floors)await Promise.all(this.nearbyTiles(xy).map(i=>this.carpet(i)));
    if(xy[1]>.65)await this.exterior();
  }
  predict(point){this.ahead=point;}
  preview(points){
    const ids=new Set();
    for(const point of points)for(const [id,weight] of this.field.weights(point).weights)if(weight>.035)ids.add(id);
    // Only compressed source files are read ahead. GPU residency stays bounded.
    for(const id of ids){
      if(this.inFlight.size>=3)break;
      if(this.cache.has(id)||this.pending.has(id)||this.warm.has(id)||(this.retry.get(id)||0)>performance.now())continue;
      while(this.warm.size>=this.maxWarm){
        const victim=[...this.warm.keys()].find(key=>!this.inFlight.has(key)&&!ids.has(key));
        if(victim===undefined)break;
        this.warm.delete(victim);
      }
      if(this.warm.size>=this.maxWarm)break;
      const root='view-'+String(id).padStart(2,'0');
      const pair=[readFile(root+'.webp'),readFile(root+'-depth.bin.gz')];
      this.warm.set(id,pair);this.inFlight.add(id);
      Promise.allSettled(pair).then(result=>{
        this.inFlight.delete(id);
        if(result.some(v=>v.status==='rejected')&&this.warm.get(id)===pair)this.warm.delete(id);
      });
    }
  }
  coverage(xy){
    const items=this.field.weights(xy).weights;
    let total=0;for(const [id,w] of items)if(this.cache.has(id))total+=w;
    if(total<.52){
      for(const [id] of items){if(this.pending.size>=2)break;
        if(!this.cache.has(id)&&!this.pending.has(id)&&(this.retry.get(id)||0)<performance.now())this.load(id).catch(()=>{});
      }
    }
    return total;
  }
  bind(xy,settled=false){
    const now=performance.now(),search=this.field.weights(xy),desired=search.weights,old=new Set(this.active);
    const want=desired.map(row=>row[0]);
    const warm=(this.ahead?this.field.weights(this.ahead).nearest:search.nearest).find(row=>!want.includes(row[0]));
    const priority=warm?[...want,warm[0]]:want;
    for(const id of priority){
      if(this.pending.size>=2)break;
      if(!this.cache.has(id)&&!this.pending.has(id)&&(this.retry.get(id)||0)<now)this.load(id).catch(()=>{});
    }
    const possible=search.nearest.filter(row=>this.cache.has(row[0]));
    if(!possible.length)return;
    const fallback=possible.find(row=>old.has(row[0]))?.[0]??possible[0][0];
    const mix=new Map();let spare=0,looking=false;
    for(const [id,w] of desired){
      const rec=this.cache.get(id),fade=rec?(settled?1:Math.min(1,(now-rec.born)/220)):0;
      if(rec)mix.set(id,w*fade);
      spare+=w*(1-fade);looking||=Boolean(rec&&fade<1);
    }
    mix.set(fallback,(mix.get(fallback)||0)+spare);
    const use=compactWeights(mix);this.active=use.map(row=>row[0]);
    if(!this.active.length)return;
    while(use.length<4)use.push([use[0][0],0]);
    this.mat.setVector4('weights',new this.B.Vector4(...use.map(row=>row[1])));
    use.forEach(([id],i)=>{
      const rec=this.cache.get(id);rec.used=now;
      this.mat.setVector3('eye'+i,this.B.Vector3.FromArray(this.field.locations[id]));
      this.mat.setTexture('colour'+i,rec.colour);this.mat.setTexture('depth'+i,rec.depth);
    });
    const reserved=new Set([...this.active,...priority]);
    const freed=[...this.cache].filter(([id])=>!reserved.has(id)).sort((a,b)=>a[1].used-b[1].used);
    while(this.cache.size>this.limit&&freed.length){const [id,rec]=freed.shift();this.cache.delete(id);rec.colour.dispose();rec.depth.dispose();}
    if(xy[1]>-.5&&!this.street&&(this.retry.get('street')||0)<now)this.exterior().catch(()=>{});
    const tile=this.nearbyTiles(xy).find(i=>!this.tiles.has(i)&&(this.retry.get('floor'+i)||0)<now);
    if(tile!==undefined&&!this.tilePending.size)this.carpet(tile).catch(()=>{});
    return looking;
  }
}
