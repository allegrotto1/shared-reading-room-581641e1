// Positions and distances are in the original Blender floor coordinates, in metres.
function triangleWeights(p,ids,anchors){
  const [a,b,c]=ids.map(i=>anchors[i]),det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  const a0=((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/det;
  const a1=((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/det;
  return [a0,a1,1-a0-a1];
}
const smooth=t=>(t=t<0?0:t>1?1:t,t*t*(3-2*t));
export function compactWeights(items){
  const sorted=[...items.entries()].filter(x=>x[1]>1e-12).sort((a,b)=>b[1]-a[1]||a[0]-b[0]);
  const cutoff=sorted[4]?.[1]||0;
  const kept=sorted.slice(0,4).map(([id,w])=>[id,Math.max(0,w-cutoff)]);
  let sum=kept.reduce((s,row)=>s+row[1],0);
  if(sum<1e-8){for(const row of kept)row[1]=1;sum=kept.length;}
  for(const row of kept)row[1]/=sum;
  return kept;
}
export class CaptureField{
  constructor(layout,distances){
    this.locations=layout.anchors;this.grid=layout.grid;this.rows=layout.referenceTriangles;this.distances=distances;this.referenceGuard=layout.referenceGuard??7;
    const e=new Map();
    for(const tri of this.rows)for(let i=0;i<3;i++){const pair=[tri[i],tri[(i+1)%3]].sort((a,b)=>a-b),k=pair.join('/');if(e.has(k))e.delete(k);else e.set(k,pair);}
    this.border=[...e.values()];
    if(distances.length!==this.grid.rows*this.grid.cols*this.locations.length)throw Error('Incomplete walking-area data');
  }
  cells(p){
    const g=this.grid,fx=(p[0]-g.left)/g.step-.5,fy=(p[1]-g.bottom)/g.step-.5,c=Math.floor(fx),r=Math.floor(fy),x=fx-c,y=fy-r,out=[];
    for(const [cx,ry,w] of [[c,r,(1-x)*(1-y)],[c+1,r,x*(1-y)],[c,r+1,(1-x)*y],[c+1,r+1,x*y]]){
      if(w<=0||cx<0||ry<0||cx>=g.cols||ry>=g.rows)continue;
      const at=(ry*g.cols+cx)*this.locations.length;
      if(this.distances[at]!==65535)out.push([at,w]);
    }
    return out;
  }
  reachable(p){return this.cells(p).length>0;}
  original(p){
    for(const ids of this.rows){
      const ww=triangleWeights(p,ids,this.locations);
      if(ww.every(w=>w>=-1e-6)){
        const ret=new Map([[this.referenceGuard,.0007]]);
        ids.forEach((id,i)=>ret.set(id,(ret.get(id)||0)+Math.max(0,ww[i])));
        return ret;
      }
    }
    return null;
  }
  fieldDistance(p){
    const cells=this.cells(p),total=cells.reduce((s,v)=>s+v[1],0);
    return this.locations.map((point,i)=>{
      const direct=Math.hypot(p[0]-point[0],p[1]-point[1]);
      if(!total)return direct+2;
      const route=cells.reduce((s,[at,w])=>s+w*this.distances[at+i]*.01,0)/total;
      // Undo the centimetre quantisation and grid snapping where the surface is directly reachable.
      const excess=Math.max(0,route-direct-.11);
      return direct+excess*smooth(excess/.19);
    });
  }
  weights(p){
    const distances=this.fieldDistance(p);
    const nearest=distances.map((d,id)=>[id,d]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
    const reference=this.original(p);
    if(reference)return {weights:compactWeights(reference),nearest};
    const radius=Math.max(.20,nearest[4][1]),map=new Map();
    let sum=0;
    for(const [id,d] of nearest.slice(0,4)){const v=(Math.max(.018,1-(d/radius)**2)**2)/Math.max(.035,d)**2;sum+=v;map.set(id,v);}
    for(const [id,w] of map)map.set(id,w/sum);
    let proximity=.34,closest=null;
    for(const [ia,ib] of this.border){
      const a=this.locations[ia],b=this.locations[ib],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));
      const q=[a[0]+t*dx,a[1]+t*dy],d=Math.hypot(q[0]-p[0],q[1]-p[1]);
      if(d<proximity){proximity=d;closest=q;}
    }
    if(closest){const old=this.original(closest),fraction=smooth(proximity/.34);
      if(old){for(const [id,w] of map)map.set(id,w*fraction);for(const [id,w] of old)map.set(id,(map.get(id)||0)+w*(1-fraction));}
    }
    return {weights:compactWeights(map),nearest};
  }
}
