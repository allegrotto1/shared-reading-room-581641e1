// Blender floor coordinates for a readable, walkable view of the interior plaque.
export const meetingSignView={id:'meeting-sign',eye:[2.15,3.60],portraitEye:[3.85,5.10],art:[.128,3.80,2.05]};
export const destinations=[
 ['board','Teal-framed whiteboard',[2.31,-1.993,1.0]],['reception','Reception',[-.52,-4.,1.45]],['plant','ZZ plant',[-1.436,-2.68,1.08]],
 ['office','Workstations',[-2.50,-.64,1.05]],['copier','Copier',[-.23,.29,.95]],['pantry','Pantry',[4.02,-.90,1.39]],
 ['meeting','Meeting room',[1.83,5.02,.99]],['window','Meeting room window',[2.10,9.50,1.89]],
 [meetingSignView.id,'Meeting room sign',meetingSignView.art]
];
// Locate future points along the same route used for walking, including its corners.
export function previewPath(start,waypoints,distances){
 const result=[];let from=start,travelled=0,i=0;
 for(const to of waypoints){
   const dx=to[0]-from[0],dy=to[1]-from[1],length=Math.hypot(dx,dy);
   while(i<distances.length&&length>0&&distances[i]<=travelled+length){
     const fraction=(distances[i++]-travelled)/length;
     result.push([from[0]+fraction*dx,from[1]+fraction*dy]);
   }
   travelled+=length;from=to;if(i===distances.length)break;
 }
 if(waypoints.length&&i===0)result.push(waypoints[waypoints.length-1]);
 return result;
}
export function lookAt(eye,height,point){
  const dx=point[0]-eye[0],dy=point[1]-eye[1];return [Math.atan2(dx,dy),Math.atan2(point[2]-height,Math.hypot(dx,dy))];
}
export function stepManual(view,keys,nav,dt){
  const front=Number(keys.has('w')||keys.has('arrowup'))-Number(keys.has('s')||keys.has('arrowdown'));
  const side=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
  const spin=Number(keys.has('e'))-Number(keys.has('q'));
  view.yaw+=dt*1.3*spin;
  if(front||side){const k=dt*(keys.has('shift')?1.50:.92)/Math.hypot(front,side),s=Math.sin(view.yaw),c=Math.cos(view.yaw);view.xy=nav.move(view.xy,(s*front+c*side)*k,(c*front-s*side)*k);}
  return Boolean(front||side||spin);
}
function turn(from,to,amount){
 const delta=Math.atan2(Math.sin(to-from),Math.cos(to-from));return from+Math.max(-amount,Math.min(amount,delta));
}
export function stepGuide(view,route,nav,dt,height=1.62){
 const target=route.points[0];if(!target)return false;
 const dx=target[0]-view.xy[0],dy=target[1]-view.xy[1],dist=Math.hypot(dx,dy);
 const step=Math.min(dt*.98,dist);
 if(dist>1e-5)view.xy=nav.move(view.xy,dx*step/dist,dy*step/dist);
 if(dist<step+.012){view.xy=target.slice();route.points.shift();}
 if(route.autoLook){
   const follow=route.points[0]||target,station=route.destination&&destinations.find(row=>row[0]===route.destination);
   const gap=station?Math.hypot(view.xy[0]-route.end[0],view.xy[1]-route.end[1]):Infinity;
   if(station&&gap<.62){const [az,el]=lookAt(view.xy,height,route.lookTarget||station[2]);const arrived=route.lookTarget&&!route.points.length;view.yaw=arrived?az:turn(view.yaw,az,2.8*dt);view.pitch=arrived?el:turn(view.pitch,el,1.25*dt);}
   else if(Math.hypot(follow[0]-view.xy[0],follow[1]-view.xy[1])>.015){
     view.yaw=turn(view.yaw,Math.atan2(follow[0]-view.xy[0],follow[1]-view.xy[1]),2.8*dt);
     view.pitch=turn(view.pitch,-.075,1.25*dt);
   }
 }
 return true;
}
