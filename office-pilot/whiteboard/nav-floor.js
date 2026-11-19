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
const rim=Array.from({length:16},(_,i)=>[Math.cos(i*Math.PI/8),Math.sin(i*Math.PI/8)]);
const adjacent=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
class Frontier {
  constructor(){this.heap=[];}
  add(index,score){
    const node={index,score},heap=this.heap;let pos=heap.length;
    heap.push(node);
    while(pos){const parent=(pos-1)>>1;if(heap[parent].score<=score)break;heap[pos]=heap[parent];pos=parent;}
    heap[pos]=node;
  }
  take(){
    const h=this.heap,first=h[0],last=h.pop();
    if(!h.length)return first.index;
    let i=0;
    while(2*i+1<h.length){let k=2*i+1;if(k+1<h.length&&h[k+1].score<h[k].score)k++;
      if(h[k].score>=last.score)break;h[i]=h[k];i=k;}
    h[i]=last;return first.index;
  }
}
export class Navigation {
  constructor(layout,step=.10){this.layout=layout;this.inRoute=layout.guestRoute?routeLimit(layout.guestRoute):null;this.step=step;this.radius=layout.radius;this.bounds=layout.bounds;this.cols=Math.ceil((this.bounds[2]-this.bounds[0])/step);this.rows=Math.ceil((this.bounds[3]-this.bounds[1])/step);this.free=new Uint8Array(this.cols*this.rows);for(let i=0;i<this.free.length;i++)this.free[i]=+this.safe(this.point(i));this.edgeCache=new Int8Array(this.free.length*8);}
  inside(p){return this.layout.walkable.some(r=>p[0]>=r[0]&&p[0]<=r[2]&&p[1]>=r[1]&&p[1]<=r[3]);}
  safe(p){const r=this.radius;if((this.inRoute&&!this.inRoute(p))||!this.inside(p))return false;for(const [dx,dy] of rim)if(!this.inside([p[0]+dx*r,p[1]+dy*r]))return false;for(const o of this.layout.obstacles){const x=Math.max(o.min[0],Math.min(p[0],o.max[0])),y=Math.max(o.min[1],Math.min(p[1],o.max[1]));if((p[0]-x)**2+(p[1]-y)**2<(r+.008)**2)return false;}return true;}
  point(i){return [this.bounds[0]+(i%this.cols+.5)*this.step,this.bounds[1]+(Math.floor(i/this.cols)+.5)*this.step];}
  cell(p){const c=Math.floor((p[0]-this.bounds[0])/this.step),r=Math.floor((p[1]-this.bounds[1])/this.step);return c<0||r<0||c>=this.cols||r>=this.rows?-1:r*this.cols+c;}
  nearest(p,max=.5){let best=null,d=max*max;for(let i=0;i<this.free.length;i++){if(!this.free[i])continue;const q=this.point(i),dd=(q[0]-p[0])**2+(q[1]-p[1])**2;if(dd<d){best=q;d=dd;}}return best;}
  clear(a,b){const d=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(d/(this.step*.45)));for(let i=0;i<=n;i++)if(!this.safe([a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n]))return false;return true;}
  move(p,dx,dy){const steps=Math.max(1,Math.ceil(Math.hypot(dx,dy)/.035));let q=[...p];for(let i=0;i<steps;i++){let t=[q[0]+dx/steps,q[1]+dy/steps];if(this.safe(t)){q=t;continue;}t=[q[0]+dx/steps,q[1]];if(this.safe(t))q=t;t=[q[0],q[1]+dy/steps];if(this.safe(t))q=t;}return q;}
  path(from,to){
    if(!this.safe(from)||!this.safe(to))return null;
    if(this.clear(from,to))return [to];
    const closest=p=>{const i=this.cell(p);if(i>=0&&this.free[i]&&this.clear(p,this.point(i)))return i;
      const q=this.nearest(p,.30);return q&&this.clear(p,q)?this.cell(q):-1;};
    const start=closest(from),end=closest(to);if(start<0||end<0)return null;
    const n=this.free.length,cost=new Float64Array(n).fill(Infinity),parent=new Int32Array(n).fill(-1);
    const closed=new Uint8Array(n),frontier=new Frontier();
    const ex=end%this.cols,ey=Math.floor(end/this.cols);cost[start]=0;frontier.add(start,0);
    while(frontier.heap.length){
      const cur=frontier.take();if(closed[cur])continue;
      if(cur===end){
        const raw=[to];for(let k=end;k!==start;k=parent[k])raw.push(this.point(k));
        raw.push(this.point(start),from);raw.reverse();
        const result=[];let i=0;
        while(i<raw.length-1){let j=raw.length-1;while(j>i+1&&!this.clear(raw[i],raw[j]))j--;result.push(raw[j]);i=j;}
        return result;
      }
      closed[cur]=1;const x=cur%this.cols,y=Math.floor(cur/this.cols);
      for(let k=0;k<adjacent.length;k++){
        const [dx,dy]=adjacent[k],nx=x+dx,ny=y+dy;
        if(nx<0||nx>=this.cols||ny<0||ny>=this.rows)continue;
        const next=ny*this.cols+nx;if(!this.free[next]||closed[next])continue;
        if(dx&&dy&&(!this.free[y*this.cols+nx]||!this.free[ny*this.cols+x]))continue;
        const score=cost[cur]+(dx&&dy?Math.SQRT2:1);if(score>=cost[next])continue;
        const edge=cur*8+k;
        if(!this.edgeCache[edge])this.edgeCache[edge]=this.clear(this.point(cur),this.point(next))?1:-1;
        if(this.edgeCache[edge]<0)continue;
        parent[next]=cur;cost[next]=score;frontier.add(next,score+Math.hypot(nx-ex,ny-ey));
      }
    }
    return null;
  }
  zone(p){let found=this.layout.zones[0];for(const z of this.layout.zones){const r=z.rect;if(p[0]>=r[0]&&p[0]<=r[2]&&p[1]>=r[1]&&p[1]<=r[3])found=z;}return found;}
}
