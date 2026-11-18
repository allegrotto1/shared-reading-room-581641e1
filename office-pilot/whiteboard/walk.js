export function barycentric(p,tri,anchors){
  const [a,b,c]=tri.map(i=>anchors[i]);
  const det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
  const u=((b[1]-c[1])*(p[0]-c[0])+(c[0]-b[0])*(p[1]-c[1]))/det;
  const v=((c[1]-a[1])*(p[0]-c[0])+(a[0]-c[0])*(p[1]-c[1]))/det;
  return [u,v,1-u-v];
}
export class WalkArea{
  constructor(layout){this.layout=layout;}
  triangle(p){
    for(const ids of this.layout.triangles){
      const weights=barycentric(p,ids,this.layout.anchors);
      if(weights.every(w=>w>=-.00001))return {ids,weights:weights.map(w=>Math.max(0,w))};
    }
    return null;
  }
  move(p,dx,dy){
    const n=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.035));
    let q=p.slice();
    for(let i=0;i<n;i++){
      const a=[q[0]+dx/n,q[1]+dy/n];
      if(this.triangle(a)){q=a;continue;}
      if(this.triangle([a[0],q[1]]))q[0]=a[0];
      if(this.triangle([q[0],a[1]]))q[1]=a[1];
    }
    return q;
  }
  straight(a,b){
    const count=Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/.035);
    for(let i=1;i<=count;i++)if(!this.triangle([a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count]))return false;
    return true;
  }
  path(a,b){
    if(!this.triangle(b))return [];
    return this.straight(a,b)?[b]:[[1.08,-1.1],b];
  }
}
