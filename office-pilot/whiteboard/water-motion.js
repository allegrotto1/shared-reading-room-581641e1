// The collision is the existing counter boundary. Only attempts toward the jug can wake the ripple.
const x=4.03,y=-.86;
const duration=1.85;
export class WaterMotion {
  constructor(){this.start=-Infinity;this.latched=false;this.count=0;}
  age(now){const t=(now-this.start)*.001;return t>=0&&t<duration?t:-1;}
  trigger(now){
    if(now-this.start<950)return false;
    this.start=now;this.count++;return true;
  }
  release(){this.latched=false;}
  observe(before,after,vector,expected,now){
    const mag=Math.hypot(...vector);
    if(!mag||!expected){this.release();return;}
    const [vx,vy]=vector.map(v=>v/mag);
    const dx=x-after[0],dy=y-after[1],distance=Math.hypot(dx,dy);
    const towards=(dx*vx+dy*vy)/distance;
    const progress=(after[0]-before[0])*vx+(after[1]-before[1])*vy;
    const bump=after[0]>3.39&&distance<.71&&Math.abs(dy)<.37&&towards>.64&&progress<.27*expected;
    if(bump){
      if(!this.latched)this.trigger(now);
      this.latched=true;
    }else if(distance>.8||progress>.64*expected||towards<.25)this.release();
  }
  tap(point,eye,now){
    return Math.hypot(eye[0]-x,eye[1]-y)<1.08
      && point.x>3.803&&point.x<4.186&&Math.abs(-point.z-y)<.152
      && point.y>.91&&point.y<1.652&&this.trigger(now);
  }
}