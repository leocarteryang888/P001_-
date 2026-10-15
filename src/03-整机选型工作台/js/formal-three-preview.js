import * as THREE from '/parts/vendor/three/build/three.module.js';
import { OrbitControls } from '/parts/vendor/three/examples/jsm/controls/OrbitControls.js';

/*
 * Read-only workbench renderer.  Project V2 and the part library remain the
 * only sources of saved truth.  Any casing surfaces below are an envelope
 * visualization derived from saved dimensions and segment lengths; equipment
 * internals are drawn only when a stable part ID is linked to a saved model.
 * Shared coordinates: X=unit width, Y=air path/segment length, Z=unit height.
 */
const host = document.getElementById('unitDrawing');
const bridge = window.P001WorkbenchBridge;
if (!host || !bridge?.snapshot) {
  console.warn('正式机组 3D 预览未启动：缺少 unitDrawing 或正式工作台数据接口。');
} else {
  host.classList.add('three-preview-host');
  host.style.position ||= 'relative';

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0xeaf2f4, 1);
  renderer.domElement.setAttribute('aria-label', '机组装配三维预览');
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;outline:none;touch-action:none';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeaf2f4);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9aabb0, 2.0));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.25);
  keyLight.position.set(-4, -5, 9);
  scene.add(keyLight);
  const fillLight = new THREE.DirectionalLight(0xc9e6ed, 0.85);
  fillLight.position.set(6, 4, 3);
  scene.add(fillLight);

  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.01, 500);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minZoom = 0.35;
  controls.maxZoom = 5;
  controls.screenSpacePanning = true;
  controls.mouseButtons.RIGHT = null;
  controls.mouseButtons.MIDDLE = THREE.MOUSE.PAN;

  const grid = new THREE.GridHelper(24, 24, 0xaec3c8, 0xd4e1e3);
  // GridHelper is XZ by default; turn it onto the engineering XY ground plane.
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.06;
  scene.add(grid);

  const model = new THREE.Group();
  scene.add(model);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const mat = {
    case: new THREE.MeshStandardMaterial({ color: 0xb9c5c7, metalness: 0.46, roughness: 0.52, side: THREE.DoubleSide }),
    top: new THREE.MeshStandardMaterial({ color: 0xd5ddde, metalness: 0.42, roughness: 0.52, side: THREE.DoubleSide }),
    door: new THREE.MeshStandardMaterial({ color: 0xf1f4f3, metalness: 0.2, roughness: 0.62, side: THREE.DoubleSide }),
    caseSelected: new THREE.MeshStandardMaterial({ color: 0x76c4cc, metalness: 0.35, roughness: 0.42, side: THREE.DoubleSide }),
    topSelected: new THREE.MeshStandardMaterial({ color: 0x8fd4da, metalness: 0.3, roughness: 0.42, side: THREE.DoubleSide }),
    seam: new THREE.LineBasicMaterial({ color: 0x597980, transparent: true, opacity: 0.94 }),
    seamSelected: new THREE.LineBasicMaterial({ color: 0x078c9a, transparent: true, opacity: 1 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x9ca9ab, metalness: 0.55, roughness: 0.5 }),
    profile: new THREE.MeshStandardMaterial({ color: 0x87989c, metalness: 0.62, roughness: 0.43 }),
    base: new THREE.MeshStandardMaterial({ color: 0x7f8d91, metalness: 0.58, roughness: 0.48 }),
    inside: new THREE.MeshStandardMaterial({ color: 0x61747a, metalness: 0.34, roughness: 0.58 }),
    media: new THREE.MeshStandardMaterial({ color: 0xe8e5d6, roughness: 0.94, side: THREE.DoubleSide }),
    blue: new THREE.MeshStandardMaterial({ color: 0x168cbb, metalness: 0.38, roughness: 0.47 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb5794e, metalness: 0.72, roughness: 0.36 }),
    black: new THREE.MeshStandardMaterial({ color: 0x28343a, metalness: 0.25, roughness: 0.56 }),
    silver: new THREE.MeshStandardMaterial({ color: 0x9eafb3, metalness: 0.66, roughness: 0.4 }),
    actuator: new THREE.MeshStandardMaterial({ color: 0xd7e0e1, metalness: 0.14, roughness: 0.59 }),
    red: new THREE.MeshStandardMaterial({ color: 0xc44938, metalness: 0.1, roughness: 0.5 })
  };
  const partMats = {
    galvanized: mat.silver, aluminium: mat.silver, dark: mat.black, black: mat.black,
    blue: mat.blue, copper: mat.copper, filter: mat.media, actuator: mat.actuator,
    red: mat.red, white: mat.media
  };
  let hud;
  let lastGeometrySignature = '';
  let lastSelectionId = '';
  let lastPartSignature = '';
  let cachedState = null;
  let pointerStart = null;
  let fitRadius = 0.5;
  let fittedSpan = { x: 1, y: 1 };
  let viewMode = 'exterior';
  let viewToggle;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }
  function partRecords() {
    const snapshot=window.P001SharedPartSnapshot;
    if(Array.isArray(snapshot?.parts))return snapshot.parts;
    try {
      const raw = localStorage.getItem('p001-ahu-part-library-v2') || localStorage.getItem('p001-ahu-part-library-v1');
      const data = raw ? JSON.parse(raw) : null;
      return Array.isArray(data?.parts) ? data.parts : [];
    } catch { return []; }
  }
  function partRevision() {
    const snapshot=window.P001SharedPartSnapshot;
    if(Array.isArray(snapshot?.parts))return JSON.stringify({source:snapshot.source,revision:snapshot.revision,parts:snapshot.parts});
    try { return localStorage.getItem('p001-ahu-part-library-v2') || localStorage.getItem('p001-ahu-part-library-v1') || ''; }
    catch { return ''; }
  }
  window.addEventListener('p001-part-library-updated',()=>{lastPartSignature='';});
  function mm(value) { return Math.max(0, Number(value) || 0) / 1000; }
  function safeDimension(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback; }
  function addBox(parent, size, position, material, segmentId, rotation) {
    const geometry = new THREE.BoxGeometry(Math.max(size[0], 0.001), Math.max(size[1], 0.001), Math.max(size[2], 0.001));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.userData.segmentId = segmentId;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function addCylinder(parent, radius, length, position, material, axis = 'z', segmentId) {
    const geometry = new THREE.CylinderGeometry(radius, radius, length, 24);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (axis === 'z') mesh.rotation.x = Math.PI / 2;
    else if (axis === 'x') mesh.rotation.z = -Math.PI / 2;
    mesh.userData.segmentId = segmentId;
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function addRingFrame(parent, width, height, depth, rail, material, segmentId) {
    addBox(parent, [width, rail, depth], [0, -height / 2 + rail / 2, 0], material, segmentId);
    addBox(parent, [width, rail, depth], [0, height / 2 - rail / 2, 0], material, segmentId);
    addBox(parent, [rail, height - rail * 2, depth], [-width / 2 + rail / 2, 0, 0], material, segmentId);
    addBox(parent, [rail, height - rail * 2, depth], [width / 2 - rail / 2, 0, 0], material, segmentId);
  }
  function buildDefaultPart(part, parent, segmentId) {
    const d = part.dimensions || {}, p = part.params || {};
    const width = mm(d.width || d.diameter || 500), height = mm(d.height || d.diameter || 500), depth = mm(d.depth || 250);
    const kind = String(part.kind || '');
    if (['rectFlange', 'roundFlange'].includes(kind)) {
      if (kind === 'rectFlange') {
        const rail = Math.max(0.018, mm(p.flange || 40));
        addRingFrame(parent, width + rail * 2, height + rail * 2, Math.max(0.012, depth * 0.15), rail, mat.silver, segmentId);
        addRingFrame(parent, width, height, depth, Math.max(0.012, Math.min(width, height) * 0.025), mat.silver, segmentId);
        addBox(parent, [width * 0.94, height * 0.94, Math.max(0.003, depth * 0.025)], [0, 0, depth * 0.49], mat.inside, segmentId);
      } else {
        const radius = mm(d.diameter || 500) / 2, flange = Math.max(0.015, mm(p.flange || 40));
        addCylinder(parent, radius, depth, [0, 0, 0], mat.silver, 'z', segmentId);
        const torus = new THREE.Mesh(new THREE.TorusGeometry(radius + flange * 0.45, flange * 0.42, 12, 40), mat.silver);
        torus.position.z = depth / 2; torus.userData.segmentId = segmentId; parent.add(torus);
      }
      return;
    }
    if (kind === 'damper') {
      addRingFrame(parent, width, height, depth, Math.max(0.025, Math.min(width, height) * 0.055), mat.silver, segmentId);
      const count = Math.max(2, Math.min(24, Math.round(Number(p.blades) || 7)));
      const angle = THREE.MathUtils.degToRad(Number(p.angle) || 0);
      for (let index = 0; index < count; index++) {
        const y = -height * 0.38 + index * height * 0.76 / Math.max(1, count - 1);
        const reverse = p.mode === 'opposed' && index % 2 ? -1 : 1;
        addBox(parent, [width * 0.86, Math.max(0.018, height * 0.022), depth * 0.65], [0, y, 0], mat.silver, segmentId, [reverse * angle, 0, 0]);
      }
      return;
    }
    if (kind === 'actuator') {
      addBox(parent, [width * 0.76, height * 0.76, depth * 0.62], [0, 0, 0], mat.actuator, segmentId);
      addCylinder(parent, Math.min(width, height) * 0.17, depth * 0.22, [-width * 0.18, 0, depth * 0.43], mat.black, 'z', segmentId);
      addBox(parent, [width * 0.3, height * 0.05, depth * 0.08], [width * 0.18, height * 0.38, depth * 0.22], mat.red, segmentId);
      return;
    }
    if (['panelFilter', 'bagFilter', 'compactFilter'].includes(kind)) {
      const rail = Math.max(0.025, Math.min(width, height) * (kind === 'compactFilter' ? 0.06 : 0.04));
      addRingFrame(parent, width, height, Math.max(0.035, depth * 0.08), rail, kind === 'compactFilter' ? mat.black : mat.silver, segmentId);
      if (kind === 'bagFilter') {
        const bags = Math.max(2, Math.min(16, Math.round(Number(p.bags) || 6)));
        for (let index = 0; index < bags; index++) {
          const x = -width * 0.4 + (index + 0.5) * width * 0.8 / bags;
          addBox(parent, [width * 0.7 / bags, height * 0.72, depth * 0.78], [x, 0, -depth * 0.4], mat.media, segmentId);
        }
      } else {
        const columns = kind === 'panelFilter' ? Math.max(8, Math.min(48, Math.round(Number(p.pleats) || 18))) : Math.max(2, Math.min(12, Math.round(Number(p.columns) || 4)));
        for (let index = 0; index < columns; index++) {
          const x = -width * 0.39 + (index + 0.5) * width * 0.78 / columns;
          const elementWidth = kind === 'panelFilter' ? width * 0.78 / columns * 0.48 : width * 0.72 / columns;
          addBox(parent, [elementWidth, height * 0.78, depth * (kind === 'panelFilter' ? 0.78 : 0.82)], [x, 0, 0], mat.media, segmentId);
          if (kind === 'compactFilter') addBox(parent, [Math.max(0.012, width * 0.018), height * 0.84, depth * 0.9], [x - width * 0.78 / columns * 0.5, 0, 0], mat.black, segmentId);
        }
      }
      return;
    }
    if (kind === 'coil') {
      const rail = Math.max(0.026, Math.min(width, height) * 0.05);
      addRingFrame(parent, width, height, depth, rail, mat.silver, segmentId);
      addBox(parent, [width * 0.84, height * 0.82, depth * 0.62], [0, 0, 0], p.mode === 'heating' ? mat.copper : mat.blue, segmentId);
      const fins = 28;
      for (let index = 0; index < fins; index++) {
        const y = -height * 0.39 + index * height * 0.78 / (fins - 1);
        addBox(parent, [width * 0.84, 0.004, depth * 0.66], [0, y, 0], mat.silver, segmentId);
      }
      const rows = Math.max(2, Math.min(10, Math.round(Number(p.rows) || 4)));
      const circuits = Math.max(4, Math.min(20, Math.round(Number(p.circuits) || 10)));
      for (let row = 0; row < rows; row++) {
        const z = -depth * 0.24 + row * depth * 0.48 / (rows - 1);
        for (let circuit = 0; circuit < circuits; circuit++) {
          const y = -height * 0.34 + circuit * height * 0.68 / (circuits - 1);
          addCylinder(parent, Math.max(0.004, mm(p.pipeDiameter || 12.7) / 2), width * 0.78, [0, y, z], mat.copper, 'x', segmentId);
        }
      }
      return;
    }
    if (['centrifugal', 'plugFan', 'axialFan'].includes(kind)) {
      const diameter = mm(d.diameter || Math.min(d.width || 800, d.height || 800));
      const radius = Math.max(0.12, diameter / 2);
      const fanWidth = Math.max(width, radius * 2), fanHeight = Math.max(height, radius * 2);
      const count = Math.max(4, Math.min(24, Math.round(Number(p.blades) || 8)));
      if (kind === 'centrifugal') {
        const shellR = Math.min(fanWidth, fanHeight) * 0.38;
        addCylinder(parent, shellR, Math.max(0.025, depth * 0.06), [0, 0, -depth * 0.42], mat.silver, 'z', segmentId);
        addCylinder(parent, shellR, Math.max(0.025, depth * 0.06), [0, 0, depth * 0.42], mat.silver, 'z', segmentId);
        addBox(parent, [fanWidth * 0.68, Math.max(0.06, fanHeight * 0.06), depth * 0.8], [-fanWidth * 0.12, -fanHeight * 0.35, 0], mat.silver, segmentId);
        addBox(parent, [Math.max(0.06, fanWidth * 0.06), fanHeight * 0.72, depth * 0.8], [-fanWidth * 0.42, 0, 0], mat.silver, segmentId);
      } else if (kind === 'axialFan') {
        addCylinder(parent, radius, depth, [0, 0, 0], mat.silver, 'z', segmentId);
        addCylinder(parent, radius * 0.84, depth * 1.03, [0, 0, 0], mat.black, 'z', segmentId);
      } else {
        const torus = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.92, Math.max(0.025, radius * 0.06), 12, 40), mat.silver);
        torus.userData.segmentId = segmentId; parent.add(torus);
      }
      addCylinder(parent, radius * 0.2, depth * 0.58, [0, 0, 0], mat.black, 'z', segmentId);
      for (let index = 0; index < count; index++) {
        const angle = index * Math.PI * 2 / count;
        const blade = addBox(parent, [radius * 0.58, radius * 0.17, Math.max(0.025, depth * 0.24)], [Math.cos(angle) * radius * 0.4, Math.sin(angle) * radius * 0.4, depth * 0.1], mat.silver, segmentId);
        blade.rotation.z = angle + (p.style === 'forward' ? 0.52 : -0.36);
      }
      return;
    }
    // Unknown part kinds stay visibly unresolved rather than becoming a fake block.
  }
  function createPartGeometry(record) {
    const g = record || {}, s = g.size || [];
    if (g.type === 'buffer') {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(g.position || [], 3));
      if (g.normal?.length) geometry.setAttribute('normal', new THREE.Float32BufferAttribute(g.normal, 3));
      else geometry.computeVertexNormals();
      return geometry;
    }
    if (g.type === 'sphere') return new THREE.SphereGeometry(s[0] || 0.12, s[1] || 24, s[2] || 16);
    if (g.type === 'cylinder') return new THREE.CylinderGeometry(s[0] || 0.1, s[1] ?? s[0] ?? 0.1, s[2] || 0.3, s[3] || 24);
    if (g.type === 'torus') return new THREE.TorusGeometry(s[0] || 0.1, s[1] || 0.02, s[2] || 10, s[3] || 32, s[4] || Math.PI * 2);
    if (g.type === 'trapezoid') {
      const geometry = new THREE.BoxGeometry(s[0] || 0.24, s[1] || 0.2, s[2] || 0.2);
      const position = geometry.attributes.position;
      for (let index = 0; index < position.count; index++) if (position.getY(index) > 0) {
        position.setX(index, position.getX(index) * (s[3] || 0.62));
        position.setZ(index, position.getZ(index) * (s[3] || 0.62));
      }
      position.needsUpdate = true; geometry.computeVertexNormals(); return geometry;
    }
    if (g.type === 'hollowCylinder') {
      const shape = new THREE.Shape(); shape.absarc(0, 0, s[0] || 0.12, 0, Math.PI * 2, false);
      const hole = new THREE.Path(); hole.absarc(0, 0, s[1] || 0.075, 0, Math.PI * 2, true); shape.holes.push(hole);
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: s[2] || 0.24, bevelEnabled: false, curveSegments: 28 });
      geometry.translate(0, 0, -(s[2] || 0.24) / 2); return geometry;
    }
    return new THREE.BoxGeometry(s[0] || 0.1, s[1] || 0.1, s[2] || 0.1);
  }
  function axisVector(tag, fallback) {
    const match = /^([+-])([xyz])$/.exec(String(tag || ''));
    if (!match) return fallback.clone();
    const vector = new THREE.Vector3(); vector[match[2]] = match[1] === '+' ? 1 : -1; return vector;
  }
  // Convert the library's legacy X=width/Y=height/Z=depth frame to the shared
  // semantic frame, then line up the saved flow/up directions with +Y/+Z.
  const legacyToSemantic = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)
  ));
  function partPlacementRotation(part) {
    const flow = axisVector(part?.mounting?.flow, new THREE.Vector3(0, 0, 1)).applyQuaternion(legacyToSemantic);
    let up = axisVector(part?.mounting?.up, new THREE.Vector3(0, 1, 0)).applyQuaternion(legacyToSemantic);
    if (Math.abs(flow.dot(up)) > 0.001) up.set(0, 0, 1);
    const sourceRight = new THREE.Vector3().crossVectors(up, flow).normalize();
    up = new THREE.Vector3().crossVectors(flow, sourceRight).normalize();
    const source = new THREE.Matrix4().makeBasis(sourceRight, up, flow);
    const targetFlow = new THREE.Vector3(0, 1, 0), targetUp = new THREE.Vector3(0, 0, 1);
    const targetRight = new THREE.Vector3().crossVectors(targetUp, targetFlow).normalize();
    const target = new THREE.Matrix4().makeBasis(targetRight, targetUp, targetFlow);
    return new THREE.Quaternion().setFromRotationMatrix(target.multiply(source.invert())).multiply(legacyToSemantic);
  }
  function buildPart(part, segment, bay) {
    const segmentId = segment.id;
    const assembly = new THREE.Group();
    if (Array.isArray(part.customScene) && part.customScene.length) {
      for (const record of part.customScene) {
        const item = new THREE.Mesh(createPartGeometry(record.geometry), partMats[record.material] || mat.silver);
        item.position.fromArray(record.position || [0, 0, 0]);
        item.rotation.set(...(record.rotation || [0, 0, 0]));
        item.scale.fromArray(record.scale || [1, 1, 1]);
        item.userData.segmentId = segmentId;
        item.name = record.name || part.name || part.id;
        item.castShadow = true; item.receiveShadow = true; assembly.add(item);
      }
    } else {
      buildDefaultPart(part, assembly, segmentId);
    }
    if (!assembly.children.length) return false;
    assembly.updateMatrixWorld(true);
    const localBounds = new THREE.Box3().setFromObject(assembly);
    if (localBounds.isEmpty()) return false;
    const localCenter = localBounds.getCenter(new THREE.Vector3());
    const orientation = partPlacementRotation(part);
    const orientedBounds = localBounds.clone().applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(orientation));
    const size = orientedBounds.getSize(new THREE.Vector3());
    const fit = Math.min((bay.width * 0.82) / Math.max(size.x, 0.001), (bay.height * 0.82) / Math.max(size.z, 0.001), (bay.length * 0.82) / Math.max(size.y, 0.001));
    const placed = new THREE.Group();
    placed.position.set(0, bay.centerY, bay.centerZ);
    placed.quaternion.copy(orientation);
    placed.scale.setScalar(Math.max(0.001, fit));
    assembly.position.copy(localCenter).multiplyScalar(-1);
    assembly.userData.segmentId = segmentId;
    assembly.userData.partId = part.id;
    placed.userData.segmentId = segmentId;
    placed.userData.partId = part.id;
    placed.add(assembly);
    model.add(placed);
    return true;
  }
  function addPanel(parent, size, position, material, segmentId, selected) {
    const panel = addBox(parent, size, position, material, segmentId);
    panel.userData.casePanel = true;
    panel.userData.selected = selected;
    return panel;
  }
  function addExteriorDoor(parent, width, height, length, centerY, segmentId, selected) {
    // Visual-only service-side door leaf and hardware, proportioned from the
    // saved segment envelope. These shapes do not represent specified doors.
    const rail = Math.max(0.018, Math.min(width, height) * 0.014);
    const faceX = width / 2 + 0.018;
    const leafWidth = Math.max(0.06, length - rail * 2.8);
    const leafHeight = Math.max(0.06, height - rail * 2.5);
    const face = mat.door;
    addBox(parent, [0.026, leafWidth, leafHeight], [faceX, centerY, height / 2], face, segmentId);
    const frame = selected ? mat.seamSelected : mat.profile;
    for (const z of [rail, height - rail]) addBox(parent, [0.035, leafWidth + rail, rail], [faceX + 0.008, centerY, z], frame, segmentId);
    for (const y of [-leafWidth / 2, leafWidth / 2]) addBox(parent, [0.035, rail, leafHeight], [faceX + 0.008, centerY + y, height / 2], frame, segmentId);
    const hingeZs = [height * 0.2, height * 0.8];
    for (const z of hingeZs) {
      addBox(parent, [0.046, rail * 0.7, Math.max(0.06, height * 0.07)], [faceX + 0.028, centerY - leafWidth * 0.4, z], mat.silver, segmentId);
      addCylinder(parent, Math.max(0.009, rail * 0.28), Math.max(0.045, height * 0.07), [faceX + 0.05, centerY - leafWidth * 0.4, z], mat.black, 'z', segmentId);
    }
    const handleZ = height * 0.52;
    const handleY = centerY + leafWidth * 0.34;
    addCylinder(parent, 0.043, 0.016, [faceX + 0.047, handleY, handleZ], mat.black, 'x', segmentId);
    addCylinder(parent, 0.026, 0.045, [faceX + 0.082, handleY, handleZ], mat.silver, 'x', segmentId);
    const gripPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(faceX + 0.108, handleY, handleZ),
      new THREE.Vector3(faceX + 0.135, handleY + 0.006, handleZ - 0.055),
      new THREE.Vector3(faceX + 0.142, handleY + 0.012, handleZ - 0.145),
      new THREE.Vector3(faceX + 0.132, handleY + 0.015, handleZ - 0.22)
    ]);
    const grip = new THREE.Mesh(new THREE.TubeGeometry(gripPath, 12, 0.019, 8, false), mat.black);
    grip.userData.segmentId = segmentId;
    parent.add(grip);
  }
  function addBayOutline(parent, width, height, startY, endY, segmentId, selected) {
    const points = [
      [-width / 2, startY, 0], [width / 2, startY, 0], [width / 2, startY, height], [-width / 2, startY, height], [-width / 2, startY, 0],
      [-width / 2, endY, 0], [width / 2, endY, 0], [width / 2, endY, height], [-width / 2, endY, height], [-width / 2, endY, 0],
      [-width / 2, startY, height], [-width / 2, endY, height], [width / 2, startY, height], [width / 2, endY, height],
      [-width / 2, startY, 0], [-width / 2, endY, 0], [width / 2, startY, 0], [width / 2, endY, 0]
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point => new THREE.Vector3(...point)));
    const lines = new THREE.LineSegments(geometry, selected ? mat.seamSelected : mat.seam);
    lines.userData.segmentId = segmentId;
    parent.add(lines);
  }
  function addSectionFrame(parent, width, height, y, segmentId, selected) {
    // Visible section profiles are an envelope illustration scaled from the
    // saved cabinet dimensions; they do not claim a production profile size.
    const rail = Math.max(0.025, Math.min(width, height) * 0.014);
    const material = selected ? mat.seamSelected : mat.profile;
    addBox(parent, [width, rail, rail], [0, y, height], material, segmentId);
    addBox(parent, [width, rail, rail], [0, y, 0], material, segmentId);
    addBox(parent, [rail, rail, height], [-width / 2, y, height / 2], material, segmentId);
    addBox(parent, [rail, rail, height], [width / 2, y, height / 2], material, segmentId);
  }
  function addLongRail(parent, x, z, size, total, material) {
    addBox(parent, [size, total, size], [x, 0, z], material, null);
  }
  function clearModel() {
    while (model.children.length) {
      const child = model.children.pop();
      child.traverse?.(object => object.geometry?.dispose());
      model.remove(child);
    }
  }
  function buildModel(state) {
    clearModel();
    const width = mm(state.cabinetWidth), height = mm(state.cabinetHeight);
    const validSegments = (state.segments || []).filter(item => Number(item.length) > 0);
    const total = validSegments.reduce((sum, item) => sum + mm(item.length), 0);
    if (!width || !height || !total) return { width, height, total, missing: [], empty: true };
    let cursor = -total / 2;
    const parts = partRecords();
    const missing = [];
    const boundaries = [{ y: cursor, segmentId: validSegments[0]?.id }];
    for (const segment of validSegments) {
      const length = mm(segment.length), startY = cursor, endY = cursor + length, centerY = (startY + endY) / 2;
      const selected = segment.id === state.selectedId;
      const bay = { width, height, length, startY, endY, centerY, centerZ: height / 2 };
      const group = new THREE.Group();
      group.userData.segmentId = segment.id;
      group.userData.segmentName = segment.name;
      model.add(group);
      const sideMaterial = selected ? mat.caseSelected : mat.case;
      const topMaterial = selected ? mat.topSelected : mat.top;
      // Saved segments define the envelope and panel breaks.
      addPanel(group, [width, length, Math.min(0.04, height * 0.012)], [0, centerY, height], topMaterial, segment.id, selected);
      addPanel(group, [width, length, Math.min(0.04, height * 0.012)], [0, centerY, 0], selected ? mat.caseSelected : mat.case, segment.id, selected);
      addPanel(group, [Math.min(0.035, width * 0.012), length, height], [-width / 2, centerY, height / 2], sideMaterial, segment.id, selected);
      addBayOutline(group, width, height, startY, endY, segment.id, selected);

      if (viewMode === 'exterior') addExteriorDoor(group, width, height, length, centerY, segment.id, selected);

      const linked = segment.partId ? parts.find(item => item.id === segment.partId) : null;
      const displayed = viewMode === 'internal' && linked && buildPart(linked, segment, bay);
      if (!linked || (viewMode === 'internal' && !displayed)) missing.push({ name: segment.name || segment.id, reason: segment.partId ? `零件 ${segment.partId} 没有可显示的模型记录` : '未关联零件' });
      cursor = endY;
      boundaries.push({ y: endY, segmentId: segment.id });
    }
    if (viewMode === 'exterior') {
      // Close the two Y-end faces in the appearance view. The internal view
      // leaves them open so saved linked equipment can still be inspected.
      const endThickness = Math.min(0.035, Math.min(width, height) * 0.012);
      addPanel(model, [width, endThickness, height], [0, -total / 2, height / 2], mat.top, validSegments[0]?.id, false);
      addPanel(model, [width, endThickness, height], [0, total / 2, height / 2], mat.top, validSegments.at(-1)?.id, false);
    }
    // Corner rails, segment frame breaks and a continuous base make the
    // enclosure readable while keeping every undocumented bay empty.
    const profileSize = Math.max(0.035, Math.min(width, height) * 0.018);
    for (const x of [-width / 2 + profileSize / 2, width / 2 - profileSize / 2]) {
      for (const z of [profileSize / 2, height - profileSize / 2]) addLongRail(model, x, z, profileSize, total, mat.profile);
    }
    for (const boundary of boundaries) addSectionFrame(model, width, height, boundary.y, boundary.segmentId, boundary.segmentId === state.selectedId);
    const baseHeight = Math.max(0.075, Math.min(width, height) * 0.032);
    const baseWidth = Math.max(0.08, Math.min(width, height) * 0.04);
    for (const x of [-width / 2 + baseWidth / 2, width / 2 - baseWidth / 2]) {
      addBox(model, [baseWidth, total + profileSize, baseHeight], [x, 0, -baseHeight / 2], mat.base, null);
    }
    for (const boundary of boundaries) {
      addBox(model, [width * 0.9, baseWidth * 0.75, baseHeight * 0.6], [0, boundary.y, -baseHeight * 0.52], mat.profile, boundary.segmentId);
    }
    const floor = new THREE.Mesh(new THREE.BoxGeometry(width * 0.9, total * 0.92, 0.022), mat.floor);
    floor.position.set(0, 0, -baseHeight * 0.12); model.add(floor);
    return { width, height, total, missing, empty: false };
  }
  function setCameraFit(dimensions) {
    if (dimensions.empty) return;
    const bounds = new THREE.Box3().setFromObject(model);
    if (bounds.isEmpty()) return;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const radius = Math.max(0.5, size.length() / 2);
    fitRadius = radius;
    const direction = new THREE.Vector3(2.4, -0.65, 0.8).normalize();
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, radius * 3.4);
    camera.up.set(0, 0, 1);
    camera.near = Math.max(0.01, radius / 200);
    camera.far = Math.max(100, radius * 24);
    camera.zoom = 1;
    controls.update();
    fittedSpan = projectedSpan(bounds, center);
    updateFrustum();
    grid.scale.setScalar(Math.max(1, radius * 0.52));
    grid.position.z = bounds.min.z - 0.07;
  }
  function ensureHud() {
    if (hud?.isConnected) return;
    hud = document.createElement('div');
    hud.className = 'formal-three-preview-status';
    hud.style.cssText = 'position:absolute;left:12px;top:10px;z-index:2;max-width:min(520px,78%);padding:7px 10px;border:1px solid #c7d9dd;border-radius:4px;background:#ffffffde;color:#36525b;font:12px/1.55 "Microsoft YaHei",sans-serif;box-shadow:0 2px 8px #31505b14;pointer-events:none';
    host.appendChild(hud);
    viewToggle = document.createElement('button');
    viewToggle.type = 'button';
    viewToggle.className = 'formal-three-view-toggle';
    viewToggle.setAttribute('aria-label', '切换外观与内部视图');
    viewToggle.addEventListener('click', () => {
      viewMode = viewMode === 'exterior' ? 'internal' : 'exterior';
      lastGeometrySignature = '';
      render();
    });
    host.appendChild(viewToggle);
  }
  function updateHud(state, dimensions) {
    ensureHud();
    viewToggle.textContent = viewMode === 'exterior' ? '内部视图' : '完整外观';
    viewToggle.setAttribute('aria-pressed', String(viewMode === 'internal'));
    if (dimensions.empty) {
      hud.innerHTML = '<strong>暂不能绘制整机外形</strong><br>正式项目数据缺少有效的箱体宽度、高度或功能段长度。';
      return;
    }
    const selected = (state.segments || []).find(item => item.id === state.selectedId);
    const missingNames = dimensions.missing.map(item => escapeHtml(item.name)).join('、');
    hud.innerHTML = `<strong>${escapeHtml(state.projectName || '项目')} · ${escapeHtml(state.unitNo || '机组')}</strong><br>箱体 ${Math.round(dimensions.width * 1000)} × ${Math.round(dimensions.height * 1000)} mm · 总长 ${Math.round(dimensions.total * 1000)} mm${selected ? `<br>当前功能段：${escapeHtml(selected.name)} · ${Number(selected.length) || 0} mm` : ''}<br><span style="color:#70868c">${viewMode === 'exterior' ? '完整外观示意；门板、结构比例用于形体表达，未声明生产尺寸。' : '内部视图；仅显示已关联零件，未关联功能段保持空舱。'}</span>${missingNames ? `<br><span style="color:#70868c">未关联/不可显示：${missingNames}（${dimensions.missing[0].reason}）</span>` : ''}`;
  }
  function geometrySignature(state, revision) {
    return JSON.stringify([viewMode, state.cabinetWidth, state.cabinetHeight, revision, (state.segments || []).map(item => [item.id, item.type, item.length, item.partId, item.name])]);
  }
  function render() {
    if (!host.isConnected) return;
    const state = bridge.snapshot();
    if (!state) return;
    cachedState = state;
    if (renderer.domElement.parentElement !== host) host.replaceChildren(renderer.domElement);
    ensureHud();
    const partState = partRevision();
    const nextGeometrySignature = geometrySignature(state, partState);
    const nextSelection = String(state.selectedId || '');
    if (nextGeometrySignature !== lastGeometrySignature || nextSelection !== lastSelectionId || partState !== lastPartSignature) {
      const details = buildModel(state);
      if (nextGeometrySignature !== lastGeometrySignature) setCameraFit(details);
      updateHud(state, details);
      lastGeometrySignature = nextGeometrySignature;
      lastSelectionId = nextSelection;
      lastPartSignature = partState;
    }
    resize();
    renderer.render(scene, camera);
  }
  function resize() {
    if (!renderer.domElement.isConnected) return;
    const rect = host.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    renderer.setSize(rect.width, rect.height, false);
    if (model.children.length) {
      const bounds = new THREE.Box3().setFromObject(model);
      fittedSpan = projectedSpan(bounds, bounds.getCenter(new THREE.Vector3()));
    }
    updateFrustum();
  }
  function projectedSpan(bounds, center) {
    camera.updateMatrixWorld(true);
    const view = camera.getWorldDirection(new THREE.Vector3()).normalize();
    const up = new THREE.Vector3(0, 0, 1).addScaledVector(view, -view.z).normalize();
    if (up.lengthSq() < 1e-6) up.set(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(view, up).normalize();
    const min = new THREE.Vector2(Infinity, Infinity), max = new THREE.Vector2(-Infinity, -Infinity);
    for (let mask = 0; mask < 8; mask++) {
      const corner = new THREE.Vector3(mask & 1 ? bounds.max.x : bounds.min.x, mask & 2 ? bounds.max.y : bounds.min.y, mask & 4 ? bounds.max.z : bounds.min.z).sub(center);
      const x = corner.dot(right), y = corner.dot(up);
      min.x = Math.min(min.x, x); max.x = Math.max(max.x, x);
      min.y = Math.min(min.y, y); max.y = Math.max(max.y, y);
    }
    return { x: Math.max(0.5, max.x - min.x), y: Math.max(0.5, max.y - min.y) };
  }
  function updateFrustum() {
    const rect = host.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    const aspect = rect.width / rect.height;
    // Fit the actual projected envelope (tighter than a sphere) with a fixed
    // 34% safety margin to fill the viewport without clipping.
    const viewHeight = Math.max(0.5, Math.max(fittedSpan.y, fittedSpan.x / aspect) * 1.34);
    camera.left = -viewHeight * aspect / 2;
    camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
  }
  renderer.domElement.addEventListener('pointerdown', event => { pointerStart = { x: event.clientX, y: event.clientY }; });
  renderer.domElement.addEventListener('pointerup', event => {
    if (!pointerStart || event.button !== 0 || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) { pointerStart = null; return; }
    pointerStart = null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height * 2 - 1));
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(model.children, true).find(item => {
      let node = item.object;
      while (node && !node.userData.segmentId) node = node.parent;
      return node?.userData.segmentId;
    });
    if (!hit) return;
    let node = hit.object;
    while (node && !node.userData.segmentId) node = node.parent;
    if (node?.userData.segmentId) bridge.select(node.userData.segmentId);
  });
  renderer.domElement.addEventListener('pointercancel', () => { pointerStart = null; });
  window.addEventListener('p001:workbench-render', render);
  window.addEventListener('storage', event => { if (!event.key || event.key.startsWith('p001-ahu-part-library-')) render(); });
  new ResizeObserver(() => { resize(); if (cachedState) renderer.render(scene, camera); }).observe(host);
  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });
  host.replaceChildren(renderer.domElement);
  render();
}
