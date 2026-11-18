import {mediaLocation} from './media.js?rev=babylon9a';
const B=globalThis.BABYLON, cols=8,rows=4,tile=1024,pad=4;
function makePatch(scene,heading,col,row,whole=false){
  const name=whole?'Preview':'Tile '+row+'/'+col, mesh=new B.Mesh(name,scene), geom=new B.VertexData();
  const xyz=[],uv=[],ids=[],nx=whole?96:16,ny=whole?48:16;
  for(let j=0;j<=ny;j++)for(let i=0;i<=nx;i++){
    const s=i/nx,t=j/ny,lon=2*Math.PI*((whole?s:(col+s)/cols)-.5)-heading, lat=Math.PI*(.5-(whole?t:(row+t)/rows));
    const rad=whole?1.01:1;
    xyz.push(rad*Math.sin(lon)*Math.cos(lat),rad*Math.sin(lat),rad*Math.cos(lon)*Math.cos(lat));
    uv.push(whole?s:(pad+s*tile)/(tile+2*pad),whole?1-t:1-(pad+t*tile)/(tile+2*pad));
    if(i<nx&&j<ny){let a=j*(nx+1)+i,b=a+nx+1;ids.push(a,b,a+1,a+1,b,b+1);}
  }
  geom.positions=xyz;geom.indices=ids;geom.uvs=uv;const normals=[];B.VertexData.ComputeNormals(xyz,ids,normals);geom.normals=normals;geom.applyToMesh(mesh);
  const mat=new B.PBRMaterial(name+' display',scene);mat.unlit=true;mat.backFaceCulling=false;mat.albedoColor=B.Color3.White();mat.metallic=0;mat.roughness=1;
  mesh.material=mat;mesh.isPickable=false;mesh.setEnabled(false);return {mesh,points:xyz};
}
export class SphericalViews{
  constructor(engine,heading,redraw,report){
    this.engine=engine;this.scene=new B.Scene(engine);this.scene.clearColor=new B.Color4(.12,.12,.13,1);
    this.camera=new B.FreeCamera('Blender originals',B.Vector3.Zero(),this.scene);this.camera.minZ=.01;this.camera.maxZ=2;
    this.camera.inputs.clear();this.scene.activeCamera=this.camera;this.redraw=redraw;this.report=report;
    this.base=makePatch(this.scene,heading,0,0,true);this.patches=Array.from({length:32},(_,i)=>makePatch(this.scene,heading,i%8,Math.floor(i/8)));
    this.stations=new Map(['origin','side','meeting'].map(id=>[id,{preview:null,tiles:this.patches.map((_,i)=>({i,key:'r'+Math.floor(i/8)+'-c'+i%8+'.png',use:0}))}]));
    this.active=null;this.inFlight=0;this.visibleCount=0;this.loadedCount=0;
  }
  async texture(name,file){
    const h=await mediaLocation('./pilot/panoramas/'+name+'/'+file);
    return new Promise((resolve,reject)=>{
      const t=new B.Texture(h.url,this.scene,false,true,B.Texture.TRILINEAR_SAMPLINGMODE,()=>{h.release();resolve(t);},(_msg,error)=>{h.release();t.dispose();reject(error||Error('Image unavailable'));});
      t.wrapU=t.wrapV=B.Texture.CLAMP_ADDRESSMODE;t.anisotropicFilteringLevel=4;
    });
  }
  async prepare(name){const s=this.stations.get(name);if(!s.preview){
    s.promise??=this.texture(name,'preview.webp').then(tex=>s.preview=tex).finally(()=>s.promise=null);await s.promise;}
  }
  activate(name){this.active=name;this.base.mesh.material.albedoTexture=this.stations.get(name).preview;this.base.mesh.setEnabled(true);this.redraw();}
  leave(){this.active=null;this.redraw();}
  retry(){this.stations.get(this.active)?.tiles.forEach(t=>t.failed=false);this.redraw();}
  render(yaw,pitch,fov){
    const cam=this.camera,cp=Math.cos(pitch);cam.setTarget(new B.Vector3(-Math.sin(yaw)*cp,Math.sin(pitch),Math.cos(yaw)*cp));cam.fov=fov*Math.PI/180;
    const projection=cam.getViewMatrix(true).multiply(cam.getProjectionMatrix(true));const planes=B.Frustum.GetPlanes(projection);
    const s=this.stations.get(this.active),visible=[],now=performance.now();
    for(const t of s.tiles){
      const p=this.patches[t.i];let seen=true;
      for(const plane of planes){let inside=false;const n=plane.normal,a=p.points;for(let j=0;j<a.length;j+=3){
        if(n.x*a[j]+n.y*a[j+1]+n.z*a[j+2]+plane.d>=-.00001){inside=true;break;}}
        if(!inside){seen=false;break;}}
      if(seen){t.use=now;visible.push(t);}
      p.mesh.setEnabled(seen&&!!t.texture);
      if(seen&&t.texture)p.mesh.material.albedoTexture=t.texture;
    }
    for(const t of visible){
      if(this.inFlight>=4)break;if(t.texture||t.loading||t.failed)continue;
      t.loading=true;this.inFlight++;
      this.texture(this.active,t.key).then(tex=>{t.texture=tex;t.use=performance.now();}).catch(()=>t.failed=true).finally(()=>{t.loading=false;this.inFlight--;this.redraw();});
    }
    const all=[...this.stations.values()].flatMap(s=>s.tiles).filter(t=>t.texture).sort((a,b)=>a.use-b.use);
    const allowed=Math.max(visible.length,matchMedia('(pointer:coarse)').matches?12:20);
    let excess=all.length-allowed;
    for(const t of all){if(excess<=0)break;if(visible.includes(t))continue;
      if(this.patches[t.i].mesh.material.albedoTexture===t.texture)this.patches[t.i].mesh.material.albedoTexture=null;
      t.texture.dispose();t.texture=null;excess--;}
    this.scene.render();this.visibleCount=visible.length;this.loadedCount=visible.filter(t=>t.texture).length;
    this.report(this.loadedCount,this.visibleCount,visible.some(t=>t.failed));
  }
}
