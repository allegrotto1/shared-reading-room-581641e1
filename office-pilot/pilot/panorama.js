import * as THREE from 'three';
import {loadMedia} from './media.js?rev=lighting7';

const columns = 8, rows = 4, size = 1024, border = 4;
const names = ['origin', 'side'];
const imagePath = (name, file) => './pilot/panoramas/' + name + '/' + file;

// u grows rightwards from the panorama seam, v downwards from the zenith.
function spherePatch(column, row, whole = false) {
  const nx = whole ? 128 : 24, ny = whole ? 64 : 24;
  const positions = [], uv = [], index = [], direction = new THREE.Vector3();
  for (let j = 0; j <= ny; j++) {
    const t = j / ny, lat = Math.PI * (.5 - (whole ? t : (row + t) / rows));
    for (let i = 0; i <= nx; i++) {
      const s = i / nx, lon = 2 * Math.PI * ((whole ? s : (column + s) / columns) - .5);
      positions.push(Math.sin(lon)*Math.cos(lat), Math.sin(lat), -Math.cos(lon)*Math.cos(lat));
      uv.push(whole ? s : (border+s*size)/(size+2*border), whole ? 1-t : 1-(border+t*size)/(size+2*border));
      if (i < nx && j < ny) {
        const a = j*(nx+1)+i, b = a+nx+1;
        index.push(a, b, a+1, a+1, b, b+1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  direction.copy(geometry.boundingSphere.center).normalize();
  const material = new THREE.MeshBasicMaterial({side:THREE.DoubleSide, toneMapped:false, depthTest:false, depthWrite:false});
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.direction = direction;
  mesh.renderOrder = whole ? 0 : 1;
  return mesh;
}

export class PanoramaViewer {
  constructor(renderer, heading, redraw, report) {
    this.renderer = renderer;
    this.redraw = redraw;
    this.report = report;
    this.scene = new THREE.Scene();
    this.scene.rotation.y = heading;
    this.camera = new THREE.PerspectiveCamera(67, 1, .01, 2);
    this.frustum = new THREE.Frustum();
    this.matrix = new THREE.Matrix4();
    this.look = new THREE.Vector3();
    this.loader = new THREE.TextureLoader();
    this.base = spherePatch(0,0,true);
    this.scene.add(this.base);
    this.patches = [];
    this.active = null;
    this.inFlight = 0;
    for (let y=0; y<rows; y++) for (let x=0; x<columns; x++) {
      const mesh = spherePatch(x,y);
      mesh.visible = false;
      this.scene.add(mesh);
      this.patches.push(mesh);
    }
    this.scene.updateMatrixWorld(true);
    for(const patch of this.patches) {
      // A tile's bounding sphere spills over its angular edges. Keep exact projected geometry
      // for a conservative plane test so an HD download is only requested near the viewport.
      patch.userData.worldVertices=patch.geometry.attributes.position.clone().applyMatrix4(patch.matrixWorld).array;
    }
    this.stations = new Map(names.map(name => [name, {
      tiles:this.patches.map((mesh,i)=>({i, file:'r'+Math.floor(i/columns)+'-c'+i%columns+'.png',
        direction:mesh.userData.direction.clone().applyQuaternion(this.scene.quaternion),
        texture:null, loading:false, failed:false, used:0})),
      preview:null, promise:null
    }]));
    this.visibleCount = 0;
    this.loadedCount = 0;
  }

  async texture(path) {
    const t = await loadMedia(this.loader, path);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    return t;
  }

  async prepare(name) {
    const set = this.stations.get(name);
    if (!set.preview && !set.promise) {
      set.promise = this.texture(imagePath(name,'preview.webp')).then(texture => { set.preview = texture; })
        .finally(()=> { set.promise=null; });
    }
    await set.promise;
  }

  activate(name) {
    this.active = name;
    this.base.material.map = this.stations.get(name).preview;
    this.base.material.needsUpdate = true;
    this.redraw();
  }

  leave() {
    this.active = null;
    this.redraw();
  }

  retry() {
    this.stations.get(this.active)?.tiles.forEach(t=>{t.failed=false;});
    this.redraw();
  }

  loadTile(name, t) {
    this.inFlight++;
    t.loading = true;
    this.texture(imagePath(name,t.file))
      .then(texture=>{ t.texture=texture; t.used=performance.now(); })
      .catch(()=>{ t.failed=true; })
      .finally(()=>{ this.inFlight--; t.loading=false; this.redraw(); });
  }

  intersectsView(mesh) {
    if(!this.frustum.intersectsObject(mesh))return false;
    const a=mesh.userData.worldVertices;
    for(const plane of this.frustum.planes) {
      const {x,y,z}=plane.normal;
      let inside=false;
      for(let i=0;i<a.length;i+=3) {
        if(x*a[i]+y*a[i+1]+z*a[i+2]+plane.constant>=-1e-6){inside=true;break;}
      }
      if(!inside)return false;
    }
    return true;
  }

  render(view) {
    const cam=this.camera;
    cam.quaternion.copy(view.quaternion);
    if (cam.fov!==view.fov || cam.aspect!==view.aspect) {
      cam.fov=view.fov; cam.aspect=view.aspect; cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();
    cam.getWorldDirection(this.look);
    this.matrix.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.matrix);
    const set=this.stations.get(this.active), visible=[];
    const now=performance.now();
    for (const tile of set.tiles) {
      const mesh=this.patches[tile.i], inView=this.intersectsView(mesh);
      if (inView) { tile.used=now; visible.push(tile); }
      mesh.visible = inView && !!tile.texture;
      if (mesh.visible && mesh.material.map!==tile.texture) {
        mesh.material.map=tile.texture; mesh.material.needsUpdate=true;
      }
    }
    visible.sort((a,b)=>this.look.dot(b.direction)-this.look.dot(a.direction));
    for (const tile of visible) {
      if (this.inFlight>=4) break;
      if (!tile.texture && !tile.loading && !tile.failed) this.loadTile(this.active,tile);
    }
    const keep = new Set(visible);
    const loaded=[...this.stations.values()].flatMap(s=>s.tiles).filter(t=>t.texture);
    let excess = loaded.length - Math.max(visible.length, matchMedia('(pointer:coarse)').matches ? 12 : 20);
    for (const t of loaded.filter(t=>!keep.has(t)).sort((a,b)=>a.used-b.used)) {
      if (excess--<=0) break;
      const mesh=this.patches[t.i];
      if(mesh.material.map===t.texture) {mesh.material.map=null;mesh.visible=false;}
      t.texture.dispose(); t.texture=null;
    }
    this.visibleCount=visible.length;
    this.loadedCount=visible.filter(t=>t.texture).length;
    this.renderer.render(this.scene,cam);
    this.report(this.loadedCount,this.visibleCount,visible.some(t=>t.failed));
  }
}
