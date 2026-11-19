// A common floor plan drives collision checks, path finding and the minimap.
function routeLimit(route){
  const limit=route.width*route.width;
  const segments=route.paths.flatMap(points=>points.slice(1).map(([x,y],i)=>{
    const [a,b]=points[i],dx=x-a,dy=y-b;
    return [a,b,dx,dy,1/(dx*dx+dy*dy)];
  }));
  return ([x,y])=>segments.some(([a,b,dx,dy,inv])=>{
    const t=Math.max(0,Math.min(1,((x-a)*dx+(y-b)*dy)*inv));
    return (x-a-t*dx)**2+(y-b-t*dy)**2<=limit;
  });
}
export class Navigation {
  constructor(layout,step=.10){this.layout=layout;this.inRoute=layout.guestRoute?routeLimit(layout.guestRoute):null;this.step=step;this.radius=layout.radius;this.bounds=layout.bounds;this.cols=Math.ceil((this.bounds[2]-this.bounds[0])/step);this.rows=Math.ceil((this.bounds[3]-this.bounds[1])/step);this.free=new Uint8Array(this.cols*this.rows);for(let i=0;i<this.free.length;i++)this.free[i]=+this.safe(this.point(i));}
  inside(p){return this.layout.walkable.some(r=>p[0]>=r[0]&&p[0]<=r[2]&&p[1]>=r[1]&&p[1]<=r[3]);}
  safe(p){const r=this.radius;if((this.inRoute&&!this.inRoute(p))||!this.inside(p))return false;for(let i=0;i<16;i++){const a=i*Math.PI/8;if(!this.inside([p[0]+Math.cos(a)*r,p[1]+Math.sin(a)*r]))return false;}for(const o of this.layout.obstacles){const x=Math.max(o.min[0],Math.min(p[0],o.max[0])),y=Math.max(o.min[1],Math.min(p[1],o.max[1]));if((p[0]-x)**2+(p[1]-y)**2<(r+.008)**2)return false;}return true;}
  point(i){return [this.bounds[0]+(i%this.cols+.5)*this.step,this.bounds[1]+(Math.floor(i/this.cols)+.5)*this.step];}
  cell(p){const c=Math.floor((p[0]-this.bounds[0])/this.step),r=Math.floor((p[1]-this.bounds[1])/this.step);return c<0||r<0||c>=this.cols||r>=this.rows?-1:r*this.cols+c;}
  nearest(p,max=.5){let best=null,d=max*max;for(let i=0;i<this.free.length;i++){if(!this.free[i])continue;const q=this.point(i),dd=(q[0]-p[0])**2+(q[1]-p[1])**2;if(dd<d){best=q;d=dd;}}return best;}
  clear(a,b){const d=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(d/(this.step*.45)));for(let i=0;i<=n;i++)if(!this.safe([a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n]))return false;return true;}
  move(p,dx,dy){const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.035));let q=[...p];for(let i=0;i<steps;i++){let t=[q[0]+dx/steps,q[1]+dy/steps];if(this.safe(t)){q=t;continue;}t=[q[0]+dx/steps,q[1]];if(this.safe(t))q=t;t=[q[0],q[1]+dy/steps];if(this.safe(t))q=t;}return q;}
  path(from,to){if(!this.safe(from)||!this.safe(to))return null;if(this.clear(from,to))return [to];const a=this.nearest(from,.3),b=this.nearest(to,.3);if(!a||!b)return null;const start=this.cell(a),end=this.cell(b),n=this.free.length,g=new Float64Array(n).fill(Infinity),parent=new Int32Array(n).fill(-1),closed=new Uint8Array(n),open=[start];g[start]=0;const h=i=>Math.hypot(...this.point(i).map((x,j)=>x-b[j]));while(open.length){let at=0;for(let i=1;i<open.length;i++)if(g[open[i]]+h(open[i])<g[open[at]]+h(open[at]))at=i;const cur=open.splice(at,1)[0];if(cur===end){const raw=[to];for(let k=end;k!==start;k=parent[k]){if(k<0)return null;raw.push(this.point(k));}raw.push(from);raw.reverse();const smooth=[];let i=0;while(i<raw.length-1){let j=raw.length-1;while(j>i+1&&!this.clear(raw[i],raw[j]))j--;smooth.push(raw[j]);i=j;}return smooth;}closed[cur]=1;const c=cur%this.cols,r=Math.floor(cur/this.cols);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const cc=c+dx,rr=r+dy;if(cc<0||rr<0||cc>=this.cols||rr>=this.rows)continue;const nxt=rr*this.cols+cc;if(!this.free[nxt]||closed[nxt])continue;if(dx&&dy&&(!this.free[r*this.cols+cc]||!this.free[rr*this.cols+c]))continue;if(!this.clear(this.point(cur),this.point(nxt)))continue;const ng=g[cur]+Math.hypot(dx,dy)*this.step;if(ng<g[nxt]){g[nxt]=ng;parent[nxt]=cur;if(!open.includes(nxt))open.push(nxt);}}}return null;}
  zone(p){let found=this.layout.zones[0];for(const z of this.layout.zones){const r=z.rect;if(p[0]>=r[0]&&p[0]<=r[2]&&p[1]>=r[1]&&p[1]<=r[3])found=z;}return found;}
}
