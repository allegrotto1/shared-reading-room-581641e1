const stations = [
  { id: 'copier', place: 'Copier', title: 'Digital receipts', category: 'Waste', at: [-.45, .42, 1.43], range: 2.05,
    copy: 'At checkout, guests can choose to receive a receipt by email. Printed copies are available on request.' },
  { id: 'pantry', place: 'Water dispenser', title: 'Water refills', category: 'Waste', at: [3.93, -.98, 1.29], range: 1.45,
    copy: 'Guests can refill a reusable bottle at a drinking water station instead of taking a new disposable bottle.' },
  { id: 'window', place: 'Meeting room window', title: 'Daylight controls', category: 'Energy', at: [2.10, 9.43, 1.89], range: 1.60,
    copy: 'When there is enough daylight, sensors dim the lights near the window. Guests can still adjust the room lighting.' }
];

const brands = {
  aster: ['ASTER QUAY', 'star'],
  tern: ['TERN COURT', 'bird']
};

// World-space centre and plane of the native Reception institute sign artwork.
export const signTarget = [1.67, -3.873, 2.05];

// The authored mesh includes the whole street. Keep only triangles that can
// intersect an eye-to-marker ray within each stop's trigger radius.
function nearbyTriangles(station, pos, indices, eyeHeight) {
  const [x, y, h] = station.at, r = station.range + .05;
  const low = Math.min(h, eyeHeight) - .08, high = Math.max(h, eyeHeight) + .08;
  const triangles = [];
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ax = pos[a], bx = pos[b], cx = pos[c];
    if ((ax < x - r && bx < x - r && cx < x - r) || (ax > x + r && bx > x + r && cx > x + r)) continue;
    const ay = pos[a + 1], by = pos[b + 1], cy = pos[c + 1];
    if ((ay < low && by < low && cy < low) || (ay > high && by > high && cy > high)) continue;
    const az = pos[a + 2], bz = pos[b + 2], cz = pos[c + 2];
    if ((az < -y - r && bz < -y - r && cz < -y - r) || (az > -y + r && bz > -y + r && cz > -y + r)) continue;
    triangles.push(ax, ay, az, bx - ax, by - ay, bz - az, cx - ax, cy - ay, cz - az);
  }
  return new Float32Array(triangles);
}

function blockedBySurface(tris, eye, point) {
  const dx = point.x - eye.x, dy = point.y - eye.y, dz = point.z - eye.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < .1) return false;
  const rx = dx / distance, ry = dy / distance, rz = dz / distance;
  for (let i = 0; i < tris.length; i += 9) {
    const ux = tris[i + 3], uy = tris[i + 4], uz = tris[i + 5];
    const vx = tris[i + 6], vy = tris[i + 7], vz = tris[i + 8];
    const px = ry * vz - rz * vy, py = rz * vx - rx * vz, pz = rx * vy - ry * vx;
    const det = ux * px + uy * py + uz * pz;
    if (Math.abs(det) < 1e-7) continue;
    const tx = eye.x - tris[i], ty = eye.y - tris[i + 1], tz = eye.z - tris[i + 2];
    const u = (tx * px + ty * py + tz * pz) / det;
    if (u < 0 || u > 1) continue;
    const qx = ty * uz - tz * uy, qy = tz * ux - tx * uz, qz = tx * uy - ty * ux;
    const v = (rx * qx + ry * qy + rz * qz) / det;
    if (v < 0 || u + v > 1) continue;
    const t = (vx * qx + vy * qy + vz * qz) / det;
    if (t > .03 && t < distance - .04) return true;
  }
  return false;
}

function makeSign(B, scene) {
  const [x, y, h] = signTarget, z = -y, w = 1.694, height = .412;
  const face = new B.Mesh('Preview plaque artwork', scene);
  const mesh = new B.VertexData();
  mesh.positions = [w/2, -height/2, 0, -w/2, -height/2, 0,
    -w/2, height/2, 0, w/2, height/2, 0];
  face.position.set(x, h, z);
  mesh.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
  mesh.indices = [0, 1, 2, 0, 2, 3];
  mesh.normals = [0,0,-1,0,0,-1,0,0,-1,0,0,-1];
  mesh.applyToMesh(face);
  const tex = new B.DynamicTexture('Preview hotel artwork', { width: 1452, height: 354 }, scene, true);
  tex.wrapU = tex.wrapV = B.Texture.CLAMP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 4;
  const print = new B.StandardMaterial('Preview plaque paper', scene);
  print.disableLighting = true;
  print.backFaceCulling = false;
  print.diffuseColor = B.Color3.Black();
  print.specularColor = B.Color3.Black();
  print.emissiveTexture = tex;
  face.isPickable = false;
  face.material = print;
  face.setEnabled(false);

  const update = key => {
    const [name, symbol] = brands[key], ctx = tex.getContext();
    ctx.fillStyle = '#ded8cb';
    ctx.fillRect(0, 0, 1452, 354);
    ctx.strokeStyle = '#b0a495';
    ctx.lineWidth = 3;
    ctx.strokeRect(22, 22, 1408, 310);
    ctx.fillStyle = '#293c37';
    ctx.strokeStyle = '#293c37';
    ctx.save();
    ctx.translate(79, 26);
    ctx.scale(1.05, 1.05);
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (symbol === 'star') {
      ctx.moveTo(146, 62); ctx.quadraticCurveTo(154, 137, 229, 145);
      ctx.quadraticCurveTo(154, 153, 146, 228); ctx.quadraticCurveTo(138, 153, 63, 145);
      ctx.quadraticCurveTo(138, 137, 146, 62); ctx.fill();
    } else {
      ctx.moveTo(60, 118); ctx.quadraticCurveTo(101, 119, 143, 168);
      ctx.quadraticCurveTo(192, 118, 232, 112);
      ctx.moveTo(91, 147); ctx.quadraticCurveTo(124, 153, 143, 184);
      ctx.quadraticCurveTo(173, 155, 199, 149); ctx.stroke();
    }
    ctx.restore();
    ctx.textBaseline = 'middle';
    ctx.font = '600 107px Georgia, serif';
    ctx.fillText(name, 370, 150);
    ctx.font = '600 42px system-ui, sans-serif';
    ctx.fillText('H O T E L', 378, 231);
    tex.update(true);
    face.setEnabled(true);
  };
  update('aster');
  face.setEnabled(false);
  return { update, prepare: () => print.forceCompilationAsync(face) };
}

export function createEsgPilot({ canvas, go, stop, requestDraw }) {
  const $ = selector => document.querySelector(selector);
  const marker = $('#esg-marker'), guideButton = $('#esg-guide-button');
  const welcome = $('#esg-welcome'), card = $('#esg-card'), guide = $('#esg-guide');
  const enterOptions = [...document.querySelectorAll('[data-brand-enter]')], auto = $('#esg-auto');
  const switchBar = $('#esg-hotel-switch'), switches = [...switchBar.querySelectorAll('[data-brand-switch]')];
  const seen = new Set(), stopRows = new Map();
  let B, identity, sign, spatial = [], active = null, timer = 0, ready = false, brand = null, selected = null;

  const hasModal = () => welcome.open || card.open || guide.open;
  const focusCanvas = () => canvas.focus({ preventScroll: true });
  function clearTimer() { clearTimeout(timer); timer = 0; }
  function hideMarker() {
    clearTimer();
    active = null;
    if (document.activeElement === marker && !hasModal()) focusCanvas();
    marker.hidden = true;
  }
  function updateProgress() {
    $('#esg-count').textContent = seen.size + ' / ' + stations.length;
    guideButton.setAttribute('aria-label', 'Demo guide, ' + seen.size + ' of ' + stations.length + ' cards opened');
    for (const [id, row] of stopRows) row.textContent = seen.has(id) ? 'Opened' : 'Walk there';
  }
  function openCard(station) {
    if (hasModal()) return;
    stop();
    seen.add(station.id);
    updateProgress();
    $('#esg-card-category').textContent = 'Example hotel practice · ' + station.category;
    $('#esg-card-title').textContent = station.title;
    $('#esg-card-copy').textContent = station.copy;
    card.showModal();
    hideMarker();
  }

  for (const s of stations) {
    const btn = document.createElement('button'), label = document.createElement('span');
    const title = document.createElement('strong'), place = document.createElement('small'), status = document.createElement('span');
    title.textContent = s.title;
    place.textContent = s.place;
    status.className = 'esg-status';
    btn.type = 'button';
    btn.dataset.esgGo = s.id;
    label.append(title, place);
    btn.append(label, status);
    $('#esg-stops').append(btn);
    stopRows.set(s.id, status);
    btn.onclick = () => { guide.close(); go(s.id); };
  }
  updateProgress();

  welcome.addEventListener('cancel', event => event.preventDefault());
  auto.addEventListener('change', () => { clearTimer(); requestDraw(); });
  marker.onclick = () => { if (active) openCard(active); };
  guideButton.onclick = () => { stop(); guide.showModal(); hideMarker(); };
  for (const dialog of [card, guide]) {
    dialog.addEventListener('close', () => { if (!hasModal()) focusCanvas(); requestDraw(); });
  }
  function choose(selection) {
    if (!Object.hasOwn(brands, selection)) return;
    selected = selection;
    if (!ready) {
      for (const button of enterOptions) button.classList.toggle('chosen', button.dataset.brandEnter === selection);
      return;
    }
    if (brand !== selection) {
      brand = selection;
      sign.update(brand);
      for (const button of switches) button.setAttribute('aria-pressed', String(button.dataset.brandSwitch === selection));
    }
    if (welcome.open) {
      welcome.close();
      switchBar.hidden = guideButton.hidden = false;
      focusCanvas();
    }
    requestDraw();
  }
  for (const button of enterOptions) button.onclick = () => choose(button.dataset.brandEnter);
  for (const button of switches) button.onclick = () => choose(button.dataset.brandSwitch);
  welcome.showModal();

  return {
    mount(babylon, scene, positions, indices, eyeHeight) {
      B = babylon;
      identity = B.Matrix.Identity();
      sign = makeSign(B, scene);
      spatial = stations.map(s => {
        const [x, y, h] = s.at;
        return { ...s, point: new B.Vector3(x, h, -y), tris: nearbyTriangles(s, positions, indices, eyeHeight) };
      });
    },
    prepare() { return sign.prepare(); },
    loaded() {
      ready = true;
      $('#esg-start-note').textContent = 'Fictional hotels. Your selection is not recorded.';
      if (selected) choose(selected);
    },
    loadError() { if (welcome.open) welcome.close(); },
    blocksMovement: () => !brand || hasModal(),
    draw(cam, scene, engine) {
      if (!brand || hasModal()) return;
      const rw = engine.getRenderWidth(), rh = engine.getRenderHeight();
      const cw = canvas.clientWidth, ch = canvas.clientHeight;
      const vp = cam.viewport.toGlobal(rw, rh);
      const direction = cam.getForwardRay().direction;
      const options = [];
      for (const s of spatial) {
        const dx = s.point.x - cam.position.x, dz = s.point.z - cam.position.z;
        const d = Math.hypot(dx, dz);
        if (d > s.range || direction.x*dx + direction.y*(s.point.y - cam.position.y) + direction.z*dz <= 0) continue;
        const screen = B.Vector3.Project(s.point, identity, scene.getTransformMatrix(), vp);
        const sx = screen.x*cw/rw, sy = screen.y*ch/rh;
        if (screen.z < 0 || screen.z > 1 || sx < 30 || sx > cw - 30 || sy < 60 || sy > ch - 96) continue;
        if (blockedBySurface(s.tris, cam.position, s.point)) continue;
        options.push({ s, d, sx, sy });
      }
      options.sort((a, b) => a.d - b.d);
      const chosen = options[0];
      if (!chosen) { hideMarker(); return; }
      const { s, sx, sy } = chosen;
      if (active !== s) {
        clearTimer();
        active = s;
        marker.querySelector('strong').textContent = s.title;
        marker.setAttribute('aria-label', 'Read about ' + s.title.toLowerCase());
        marker.dataset.esgStation = s.id;
      }
      marker.dataset.read = String(seen.has(s.id));
      marker.hidden = false;
      const half = marker.offsetWidth/2 + 8;
      marker.style.left = Math.round(Math.min(cw - half, Math.max(half, sx))) + 'px';
      marker.style.top = Math.round(sy) + 'px';
      if (auto.checked && !seen.has(s.id) && !timer) {
        timer = setTimeout(() => {
          timer = 0;
          if (auto.checked && active === s && !seen.has(s.id)) openCard(s);
        }, 500);
      }
    }
  };
}