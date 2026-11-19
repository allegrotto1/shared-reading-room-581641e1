import {readFile} from './storage12.js?v=hotel-15c';
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
  constructor(B,scene,material,field,mobile,redraw,progressive=false){
    this.B=B;this.scene=scene;this.mat=material;this.field=field;this.limit=mobile?5:6;this.redraw=redraw;
    this.progressive=progressive;
    if(progressive)this.limit=mobile?12:16;
    this.detailLimit=mobile?3:4;this.detailTask=null;this.lastMotion=performance.now();
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
    const root=(this.progressive?'lite-':'view-')+String(id).padStart(2,'0');
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
  async settle(xy,floors=true,detail=true){
    const wanted=this.field.weights(xy).weights.map(p=>p[0]);
    await Promise.all(wanted.map(id=>this.load(id)));
    if(floors)await Promise.all(this.nearbyTiles(xy).map(i=>this.carpet(i)));
    if(xy[1]>.65)await this.exterior();
    if(detail&&this.progressive){
      for(const id of wanted.slice(0,this.detailLimit))await this.detail(id,true);
    }
  }
  async detail(id,force=false){
    const rec=this.cache.get(id);
    if(!rec||rec.detail||(!force&&(this.retry.get('detail'+id)||0)>performance.now()))return;
    if(this.detailTask){if(force){await this.detailTask;return this.detail(id,true);}return;}
    const root='view-'+String(id).padStart(2,'0');
    this.detailTask=(async()=>{
      const bytes=rec.detailBytes||await Promise.all([readFile(root+'.webp'),readFile(root+'-depth.bin.gz')]);
      delete rec.detailBytes;
      // A cold high-resolution upload can occupy several frames on mobile.
      // Park the bytes until the user pauses instead of uploading mid-stride.
      if(!force && (performance.now()-this.lastMotion<420||!this.active.includes(id))){
        if(this.cache.get(id)===rec)rec.detailBytes=bytes;
        return;
      }
      await this.uploadDetail(id,rec,bytes);
    })().catch(()=>this.retry.set('detail'+id,performance.now()+5000)).finally(()=>{this.detailTask=null;this.redraw();});
    return this.detailTask;
  }
  async uploadDetail(id,rec,bytes){
    const root='view-'+String(id).padStart(2,'0');
    const parts=await Promise.allSettled([this.colour(root+'.webp',bytes[0]),this.rawFile(root+'-depth.bin.gz',bytes[1])]);
    if(parts.some(p=>p.status==='rejected')||this.cache.get(id)!==rec){
      for(const part of parts)if(part.status==='fulfilled')part.value.dispose();
      if(parts.some(p=>p.status==='rejected'))throw Error('Detail texture upload failed');
      return;
    }
    rec.detail={colour:parts[0].value,depth:parts[1].value};
    const rich=[...this.cache.entries()].filter(([,r])=>r.detail);
    const count=rich.length-this.detailLimit;
    if(count<=0)return;
    const preferred=new Set(this.active.slice(0,this.detailLimit));
    const victims=rich.filter(([key])=>key!==id).sort(([a,first],[b,second])=>
      Number(preferred.has(a))-Number(preferred.has(b))||first.used-second.used);
    for(const [,old] of victims.slice(0,count)){
      old.detail.colour.dispose();old.detail.depth.dispose();old.detail=null;
    }
  }
  refine(moving,now){
    if(!this.progressive)return;
    if(moving){this.lastMotion=now;return;}
    if(now-this.lastMotion<420||this.pending.size||this.detailTask)return;
    const id=this.active.slice(0,this.detailLimit).find(key=>!this.cache.get(key)?.detail && (this.retry.get('detail'+key)||0)<now);
    if(id===undefined)return;
    const rec=this.cache.get(id);if(!rec)return;
    if(rec.detailBytes){
      const bytes=rec.detailBytes;delete rec.detailBytes;
      this.detailTask=this.uploadDetail(id,rec,bytes).catch(()=>this.retry.set('detail'+id,performance.now()+5000)).finally(()=>{this.detailTask=null;this.redraw();});
    }else this.detail(id);
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
      const root=(this.progressive?'lite-':'view-')+String(id).padStart(2,'0');
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
      const image=rec.detail||rec;
      this.mat.setTexture('colour'+i,image.colour);this.mat.setTexture('depth'+i,image.depth);
    });
    const reserved=new Set([...this.active,...priority]);
    const freed=[...this.cache].filter(([id])=>!reserved.has(id)).sort((a,b)=>a[1].used-b[1].used);
    while(this.cache.size>this.limit&&freed.length){const [id,rec]=freed.shift();this.cache.delete(id);rec.colour.dispose();rec.depth.dispose();rec.detail?.colour.dispose();rec.detail?.depth.dispose();}
    if(xy[1]>-.5&&!this.street&&(this.retry.get('street')||0)<now)this.exterior().catch(()=>{});
    const tile=this.nearbyTiles(xy).find(i=>!this.tiles.has(i)&&(this.retry.get('floor'+i)||0)<now);
    if(tile!==undefined&&!this.tilePending.size)this.carpet(tile).catch(()=>{});
    return looking;
  }
}
