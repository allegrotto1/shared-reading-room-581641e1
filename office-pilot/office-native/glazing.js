// Each reflection is drawn from the visitor's mirrored camera. All four desk
// panes share one pass; their source planes differ by only one millimetre.
export function installGlazing(B, scene, camera, layout, surfaces, eye) {
  class ClearFloatGlass extends B.MaterialPluginBase {
    constructor(material) {
      super(material, 'ClearFloatGlass', 180, {}, true, true);
    }
    isCompatible() { return true; }
    getCustomCode(stage, language) {
      if (stage !== 'fragment') return null;
      const variable = language === B.ShaderLanguage.WGSL ? 'let' : 'float';
      const ior = Number(layout.ior).toFixed(3);
      // Unpolarized dielectric Fresnel, including both surfaces of a thin sheet.
      return {CUSTOM_FRAGMENT_BEFORE_LIGHTS: `
        ${variable} cosIn = clamp(abs(dot(viewDirectionW, normalW)), 0.0, 1.0);
        ${variable} cosOut = sqrt(1.0 - (1.0 - cosIn*cosIn)/(${ior}*${ior}));
        ${variable} rs = (cosIn - ${ior}*cosOut)/(cosIn + ${ior}*cosOut);
        ${variable} rp = (${ior}*cosIn - cosOut)/(${ior}*cosIn + cosOut);
        ${variable} fresnel = 0.5*(rs*rs + rp*rp);
        alpha = 2.0*fresnel/(1.0 + fresnel);
      `};
    }
  }

  const engine = scene.getEngine();
  const groups = new Map();
  const off = B.Vector2.Zero();
  for (const group of new Set(layout.panes.map(pane => pane.group))) {
    const panes = layout.panes.filter(pane => pane.group === group);
    const planeX = panes.reduce((sum, pane) => sum + (pane.min[0]+pane.max[0])/2, 0)/panes.length;
    const mirror = new B.MirrorTexture(group+' reflection', {width:256,height:256}, scene, false);
    mirror.wrapU = mirror.wrapV = B.Texture.CLAMP_ADDRESSMODE;
    mirror.clearColor = scene.clearColor.clone();
    const material = new B.StandardMaterial(group+' | clear glass', scene);
    material.disableLighting = true;
    material.diffuseColor = material.ambientColor = material.specularColor = B.Color3.Black();
    material.reflectionTexture = mirror;
    material.transparencyMode = B.Material.MATERIAL_ALPHABLEND;
    material.alpha = .082;
    // Only the front-facing surface contributes. Fresnel already accounts for both.
    material.backFaceCulling = true;
    material.disableDepthWrite = true;
    new ClearFloatGlass(material);
    const clip = B.Vector2.Zero(), reflectedEye = B.Vector3.Zero();
    mirror.onBeforeRenderObservable.add(() => {
      reflectedEye.set(2*planeX-eye.x, eye.y, eye.z);
      for (const surface of surfaces.values()) {
        surface.setVector2('mirrorClip', clip);
        surface.setVector3('eye', reflectedEye);
      }
    });
    mirror.onAfterRenderObservable.add(() => {
      for (const surface of surfaces.values()) {
        surface.setVector2('mirrorClip', off);
        surface.setVector3('eye', eye);
      }
    });
    groups.set(group,{planeX,mirror,clip});
    for (const pane of panes) {
      const lo = pane.min, hi = pane.max;
      const mesh = B.MeshBuilder.CreateBox(pane.name, {
        width:hi[0]-lo[0], height:hi[2]-lo[2], depth:hi[1]-lo[1]
      }, scene);
      mesh.position.set((lo[0]+hi[0])/2,(lo[2]+hi[2])/2,-(lo[1]+hi[1])/2);
      mesh.material = material;
      mesh.isPickable = false;
      mesh.metadata = {role:'interior-glazing',group};
      mesh.freezeWorldMatrix();
    }
  }
  let meshCount = -1, width = 0, height = 0;
  return function prepareReflections() {
    const w = engine.getRenderWidth(), h = engine.getRenderHeight();
    const scale = Math.min(.45, 640/Math.max(w,h));
    if (meshCount !== scene.meshes.length) {
      // Keep straddling meshes in both lists. The shader clips their triangles at the pane.
      const visibleRoom = scene.meshes.filter(mesh => mesh.metadata?.role !== 'interior-glazing');
      for (const group of groups.values()) {
        group.negative = visibleRoom.filter(mesh => !mesh.isWorldMatrixFrozen ||
          mesh.getBoundingInfo().boundingBox.minimumWorld.x <= group.planeX+.004);
        group.positive = visibleRoom.filter(mesh => !mesh.isWorldMatrixFrozen ||
          mesh.getBoundingInfo().boundingBox.maximumWorld.x >= group.planeX-.004);
      }
      meshCount = scene.meshes.length;
    }
    for (const {planeX,mirror,clip,negative,positive} of groups.values()) {
      const sign = camera.position.x >= planeX ? -1 : 1;
      const room = sign < 0 ? positive : negative;
      if (mirror.renderList !== room) mirror.renderList = room;
      clip.set(sign,planeX);
      mirror.mirrorPlane.normal.set(sign,0,0);
      mirror.mirrorPlane.d = -sign*planeX;
      if (w!==width || h!==height) mirror.resize({width:Math.max(1,Math.round(w*scale)),height:Math.max(1,Math.round(h*scale))});
    }
    width=w; height=h;
  };
}
