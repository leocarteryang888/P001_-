import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const bridge = window.AHUThreeBridge;
const area = document.getElementById('viewArea');
let H = 2.3;
let W = 2.5;
let panelSeries = '50W';
let PANEL = 0.05;
let OUTER_SHEET = 0.0006;
const INNER_SHEET = 0.0004;
// Profile values and assembly references come from the supplied drawings; they are not a physical or project-specific assembly check.
const PROFILE_SPECS = {
  '25W': {
    1: { outerInset: 0.0395, innerInset: 0.0295, face: 0.0059, depth: 0.0485 },
    2: { outerInset: 0.011, innerInset: 0.003, face: 0.020, depth: 0.0228 },
    3: { outerInset: 0.011, innerInset: 0.003, face: 0.020, depth: 0.0228 }
  },
  '50W': {
    1: { outerInset: 0.063, innerInset: 0.0555, face: 0.006, depth: 0.072 },
    2: { outerInset: 0.034, innerInset: 0.0265, face: 0.0469, depth: 0.0477461 },
    3: { outerInset: 0.034, innerInset: 0.0265, face: 0.043, depth: 0.0477461 }
  }
};
const mm = value => Math.max(0, Number(value) || 0) / 1000;
const safeText = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
} catch (error) {
  area.innerHTML = '<div class="result-empty">此设备无法初始化 WebGL。请使用支持 WebGL 2 的浏览器查看 Three.js 原型。</div>';
  throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.8;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8f0f3);
const camera = new THREE.OrthographicCamera(-5, 5, 3, -3, 0.01, 200);
// Legacy geometry uses X=length, Y=height, Z=width; this root rotation exposes X=width, Y=length, Z=height.
const legacyWorkbenchToSemantic = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)));
camera.up.set(0, 0, 1);
camera.position.set(7, 5.5, 7).applyQuaternion(legacyWorkbenchToSemantic);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = false;
controls.minPolarAngle = 0.08;
controls.maxPolarAngle = Math.PI * 0.91;
controls.minZoom = 0.6;
controls.maxZoom = 3.5;
controls.target.set(0, H / 2, 0).applyQuaternion(legacyWorkbenchToSemantic);
controls.update();

scene.add(new THREE.HemisphereLight(0xffffff, 0x788e9a, 2.4));
const sun = new THREE.DirectionalLight(0xffffff, 3.2);
sun.position.set(-4, 9, 8).applyQuaternion(legacyWorkbenchToSemantic);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -12;
sun.shadow.camera.right = 12;
sun.shadow.camera.top = 12;
sun.shadow.camera.bottom = -12;
scene.add(sun);
const grid = new THREE.GridHelper(28, 28, 0xb9cbd1, 0xd3e0e4);
grid.quaternion.copy(legacyWorkbenchToSemantic);
grid.position.z = -0.22;
scene.add(grid);
let model = new THREE.Group();
model.quaternion.copy(legacyWorkbenchToSemantic);
scene.add(model);

const materials = {
  panel: new THREE.MeshStandardMaterial({ color: 0xe2e7e6, metalness: 0.24, roughness: 0.53, side: THREE.DoubleSide }),
  panelSelected: new THREE.MeshStandardMaterial({ color: 0xc9dfe0, metalness: 0.24, roughness: 0.53, side: THREE.DoubleSide }),
  galvanized: new THREE.MeshStandardMaterial({ color: 0xb9c6c8, metalness: 0.6, roughness: 0.43 }),
  foam: new THREE.MeshStandardMaterial({ color: 0xe4dbb9, metalness: 0, roughness: 0.9 }),
  profile1: new THREE.MeshStandardMaterial({ color: 0xb5c0c2, metalness: 0.56, roughness: 0.47 }),
  profile2: new THREE.MeshStandardMaterial({ color: 0xaabec2, metalness: 0.56, roughness: 0.47 }),
  profile3: new THREE.MeshStandardMaterial({ color: 0xaab8bb, metalness: 0.55, roughness: 0.48 }),
  roof: new THREE.MeshStandardMaterial({ color: 0xedf1f0, metalness: 0.2, roughness: 0.56 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x819197, metalness: 0.48, roughness: 0.48 }),
  doorFrame: new THREE.MeshStandardMaterial({ color: 0xaebbc0, metalness: 0.38, roughness: 0.5 }),
  doorPanel: new THREE.MeshStandardMaterial({ color: 0xe9edeb, metalness: 0.2, roughness: 0.55 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x26343b, metalness: 0.35, roughness: 0.55 }),
  handle: new THREE.MeshStandardMaterial({ color: 0x171b1d, metalness: 0.12, roughness: 0.58, side: THREE.DoubleSide }),
  lockFace: new THREE.MeshStandardMaterial({ color: 0xb3b4ae, metalness: 0.76, roughness: 0.38 }),
  coil: new THREE.MeshStandardMaterial({ color: 0x77bac5, metalness: 0.52, roughness: 0.38 }),
  coilFins: new THREE.MeshStandardMaterial({ color: 0x317faa, metalness: 0.4, roughness: 0.46 }),
  copper: new THREE.MeshStandardMaterial({ color: 0xb98558, metalness: 0.68, roughness: 0.38 }),
  fan: new THREE.MeshStandardMaterial({ color: 0x5d8e9c, metalness: 0.5, roughness: 0.35, side: THREE.DoubleSide }),
  port: new THREE.MeshStandardMaterial({ color: 0x8b9ba0, metalness: 0.52, roughness: 0.45 }),
  opening: new THREE.MeshStandardMaterial({ color: 0x344a53, metalness: 0.12, roughness: 0.7 }),
  base: new THREE.MeshStandardMaterial({ color: 0x98a6a8, metalness: 0.67, roughness: 0.5 }),
  baseBracket: new THREE.MeshStandardMaterial({ color: 0xaab5b5, metalness: 0.66, roughness: 0.47 }),
  baseBolt: new THREE.MeshStandardMaterial({ color: 0x5e696c, metalness: 0.72, roughness: 0.43 }),
  seamCap: new THREE.MeshStandardMaterial({ color: 0xb9c7c8, metalness: 0.49, roughness: 0.55, side: THREE.DoubleSide }),
  actuator: new THREE.MeshStandardMaterial({ color: 0xdce3e2, metalness: 0.12, roughness: 0.63 }),
  actuatorMark: new THREE.MeshStandardMaterial({ color: 0xb84232, metalness: 0.1, roughness: 0.55 }),
  gaugeFace: new THREE.MeshStandardMaterial({ color: 0xf5f6f2, metalness: 0.03, roughness: 0.8 }),
  gaugeNeedle: new THREE.MeshBasicMaterial({ color: 0x2a3133, depthTest: true }),
  gaugeTube: new THREE.MeshStandardMaterial({ color: 0x98a1a0, metalness: 0.82, roughness: 0.36 }),
  filterMedia: new THREE.MeshStandardMaterial({ color: 0xf0f2ee, metalness: 0, roughness: 0.92, side: THREE.DoubleSide })
};

function readPartLibraryRaw() {
  try { return localStorage.getItem('p001-ahu-part-library-v2') || localStorage.getItem('p001-ahu-part-library-v1') || ''; }
  catch { return ''; }
}
function readPartLibrary() {
  try { const data = JSON.parse(readPartLibraryRaw() || 'null'); return Array.isArray(data?.parts) ? data.parts : []; }
  catch { return []; }
}
function partLibraryRevision() {
  const value = readPartLibraryRaw(); let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return `${value.length}:${hash >>> 0}`;
}
function linkedPartMaterial(key) {
  return ({ galvanized:materials.galvanized, aluminium:materials.profile1, dark:materials.dark, black:materials.handle, blue:materials.coilFins, copper:materials.copper, filter:materials.filterMedia, actuator:materials.actuator, red:materials.actuatorMark })[key] || materials.galvanized;
}
function linkedTrapezoid(size) {
  const [width=.24,height=.2,depth=.2,top=.62]=size||[],geometry=new THREE.BoxGeometry(width,height,depth),position=geometry.attributes.position;
  for(let index=0;index<position.count;index++)if(position.getY(index)>0){position.setX(index,position.getX(index)*top);position.setZ(index,position.getZ(index)*top)}
  position.needsUpdate=true;geometry.computeVertexNormals();return geometry;
}
function linkedHollowCylinder(size) {
  const [outer=.12,inner=.075,length=.24]=size||[],shape=new THREE.Shape();shape.absarc(0,0,outer,0,Math.PI*2,false);const hole=new THREE.Path();hole.absarc(0,0,inner,0,Math.PI*2,true);shape.holes.push(hole);const geometry=new THREE.ExtrudeGeometry(shape,{depth:length,bevelEnabled:false,curveSegments:36});geometry.translate(0,0,-length/2);return geometry;
}
function linkedGeometry(record) {
  const size=record?.size||[];
  if(record?.type==='buffer'){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(record.position||[],3));if(record.normal?.length)geometry.setAttribute('normal',new THREE.Float32BufferAttribute(record.normal,3));else geometry.computeVertexNormals();return geometry}
  if(record?.type==='sphere')return new THREE.SphereGeometry(size[0]||.12,size[1]||32,size[2]||20);
  if(record?.type==='cylinder')return new THREE.CylinderGeometry(size[0]||.1,size[1]??size[0]??.1,size[2]||.3,size[3]||28);
  if(record?.type==='trapezoid')return linkedTrapezoid(size);
  if(record?.type==='hollowCylinder')return linkedHollowCylinder(size);
  if(record?.type==='torus')return new THREE.TorusGeometry(size[0]||.1,size[1]||.02,size[2]||10,size[3]||32,size[4]||Math.PI*2);
  return new THREE.BoxGeometry(size[0]||.1,size[1]||.1,size[2]||.1);
}
function linkedAxisVector(value,fallback) {
  const match=/^([+-])([xyz])$/.exec(String(value||''));if(!match)return fallback.clone();
  const vector=new THREE.Vector3();vector[match[2]]=match[1]==='-'?-1:1;return vector;
}
function linkedMountingQuaternion(part) {
  const flow=linkedAxisVector(part?.mounting?.flow,new THREE.Vector3(0,0,1)),up=linkedAxisVector(part?.mounting?.up,new THREE.Vector3(0,1,0));
  if(Math.abs(flow.dot(up))>.001)up.set(0,Math.abs(flow.y)<.5?1:0,Math.abs(flow.y)>=.5?1:0);
  const right=new THREE.Vector3().crossVectors(up,flow).normalize(),source=new THREE.Matrix4().makeBasis(right,up,flow),targetFlow=new THREE.Vector3(1,0,0),targetUp=new THREE.Vector3(0,1,0),targetRight=new THREE.Vector3().crossVectors(targetUp,targetFlow).normalize(),target=new THREE.Matrix4().makeBasis(targetRight,targetUp,targetFlow),rotation=new THREE.Matrix4().multiplyMatrices(target,source.invert());
  return new THREE.Quaternion().setFromRotationMatrix(rotation);
}
function addLinkedPart(group,segment,length) {
  const partId=segment.partRef?.partId;if(!partId)return false;
  const part=readPartLibrary().find(item=>item.id===partId),records=Array.isArray(part?.customScene)?part.customScene:[];
  if(!records.length)return false;
  const wrapper=new THREE.Group(),assembly=new THREE.Group();wrapper.add(assembly);group.add(wrapper);
  for(const record of records){const object=new THREE.Mesh(linkedGeometry(record.geometry||{}),linkedPartMaterial(record.material));object.position.fromArray(record.position||[0,0,0]);object.rotation.set(...(record.rotation||[0,0,0]));object.scale.fromArray(record.scale||[1,1,1]);object.castShadow=true;object.receiveShadow=true;object.userData.segmentId=segment.id;object.userData.linkedPartId=partId;object.name=record.name||part.name||partId;assembly.add(object)}
  assembly.updateMatrixWorld(true);assembly.position.copy(new THREE.Box3().setFromObject(assembly).getCenter(new THREE.Vector3())).multiplyScalar(-1);wrapper.quaternion.copy(linkedMountingQuaternion(part));wrapper.position.set(length/2,H*.5,0);wrapper.userData.segmentId=segment.id;wrapper.userData.linkedPartId=partId;wrapper.userData.partName=part.name||partId;wrapper.userData.partMounting={flow:part.mounting?.flow||'+z',up:part.mounting?.up||'+y'};
  return true;
}

// Internal geometry is fitted as one assembly against the real clear volume.
// The shell and external mounts remain at their exact dimensions.
function fitInternalGroup(group, length) {
  const parent = group.parent;
  if (parent) parent.remove(group);
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  if (parent) parent.add(group);
  if (bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3());
  const available = new THREE.Vector3(length - 2 * PANEL, H - 2 * PANEL, W - 2 * PANEL);
  if (available.x <= 0 || available.y <= 0 || available.z <= 0) { group.visible = false; group.userData.fitDiagnostic = '箱体净空不足，内部件未绘制'; return; }
  const scale = new THREE.Vector3(Math.min(1, available.x / Math.max(size.x, .001)), Math.min(1, available.y / Math.max(size.y, .001)), Math.min(1, available.z / Math.max(size.z, .001)));
  const center = bounds.getCenter(new THREE.Vector3());
  group.scale.copy(scale);
  group.position.x += length / 2 - center.x * scale.x;
  group.position.y += H / 2 - center.y * scale.y;
  group.position.z -= center.z * scale.z;
}

function box(parent, sx, sy, sz, x, y, z, material, id) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.max(sx, 0.005), Math.max(sy, 0.005), Math.max(sz, 0.005)), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (id) mesh.userData.segmentId = id;
  parent.add(mesh);
  return mesh;
}
const panelRegistry = new Map();
const separatedPanels = new Set();
let selectedPanelId = null;
let disassemblyMode = false;
function sandwichPanel(parent, sx, sy, sz, x, y, z, normal, exterior, id, spec) {
  const panelGroup = new THREE.Group();
  panelGroup.userData.segmentId = id;
  panelGroup.userData.panelId = spec.id;
  parent.add(panelGroup);
  const edgeMaterial = { 1: materials.profile1, 2: materials.profile2, 3: materials.profile3 };
  const size = [sx, sy, sz];
  const center = [x, y, z];
  const axis = Math.abs(normal[0]) ? 0 : Math.abs(normal[1]) ? 1 : 2;
  const sign = normal[axis];
  const thickness = size[axis];
  const tangents = [0, 1, 2].filter(index => index !== axis);
  const profileFor = edgeName => PROFILE_SPECS[panelSeries][spec.edges[edgeName]];
  const edgeWidthFor = edgeName => profileFor(edgeName).outerInset;
  const outerSize = [...size];
  const outerCenter = [...center];
  const innerSize = [...size];
  const innerCenter = [...center];
  for (const [index, tangent] of tangents.entries()) {
    const [lowerEdge, upperEdge] = spec.edgeNames[1 - index];
    const lower = profileFor(lowerEdge);
    const upper = profileFor(upperEdge);
    outerSize[tangent] -= lower.outerInset + upper.outerInset;
    outerCenter[tangent] += (lower.outerInset - upper.outerInset) / 2;
    innerSize[tangent] -= lower.innerInset + upper.innerInset;
    innerCenter[tangent] += (lower.innerInset - upper.innerInset) / 2;
  }
  for (const [edgeIndex, along] of tangents.entries()) {
    const across = tangents[1 - edgeIndex];
    for (const direction of [-1, 1]) {
      const rail = [...size];
      const edgeName = spec.edgeNames[edgeIndex][direction < 0 ? 0 : 1];
      const edgeWidth = edgeWidthFor(edgeName);
      rail[across] = edgeWidth;
      if (edgeIndex === 1) {
        const [lowerEdge, upperEdge] = spec.edgeNames[0];
        rail[along] -= edgeWidthFor(lowerEdge) + edgeWidthFor(upperEdge);
      }
      const position = [...center];
      position[across] += direction * (size[across] - edgeWidth) / 2;
      if (edgeIndex === 1) {
        const [lowerEdge, upperEdge] = spec.edgeNames[0];
        position[along] += (edgeWidthFor(lowerEdge) - edgeWidthFor(upperEdge)) / 2;
      }
      const mesh = box(panelGroup, ...rail, ...position, edgeMaterial[spec.edges[edgeName]], id);
      mesh.userData.panelId = spec.id;
      mesh.userData.edgeName = edgeName;
      mesh.userData.profileNo = spec.edges[edgeName];
      if (spec.edges[edgeName] === 2 || spec.edges[edgeName] === 3) {
        const keySize = [...rail];
        keySize[across] = Math.min(0.006, edgeWidth * 0.35);
        keySize[axis] = Math.min(thickness * 0.28, 0.012);
        const keyPosition = [...position];
        keyPosition[across] -= direction * edgeWidth * 0.34;
        keyPosition[axis] += sign * thickness * 0.28;
        const key = box(panelGroup, ...keySize, ...keyPosition, spec.edges[edgeName] === 2 ? materials.profile2 : materials.profile3, id);
        key.userData.panelId = spec.id;
      }
    }
  }
  const core = [...innerSize];
  core[axis] = thickness - OUTER_SHEET - INNER_SHEET;
  const coreCenter = [...innerCenter];
  coreCenter[axis] += sign * (INNER_SHEET - OUTER_SHEET) / 2;
  const foam = box(panelGroup, ...core, ...coreCenter, materials.foam, id);
  foam.userData.panelId = spec.id;
  for (const [sheet, side, material, layerSize, layerCenter, layerName] of [[OUTER_SHEET, sign, exterior, outerSize, outerCenter, '外层彩钢板'], [INNER_SHEET, -sign, materials.galvanized, innerSize, innerCenter, '内层镀锌板']]) {
    const layer = [...layerSize];
    layer[axis] = sheet;
    const position = [...layerCenter];
    position[axis] += side * (thickness - sheet) / 2;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...layer), material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.segmentId = id;
    mesh.userData.panelId = spec.id;
    mesh.userData.layerName = layerName;
    panelGroup.add(mesh);
  }
  const cornerSize = panelSeries === '25W' ? 0.018 : 0.030;
  for (const a of [-1, 1]) for (const b of [-1, 1]) {
    const insertSize = [...size];
    insertSize[axis] = Math.min(thickness * 0.52, 0.018);
    insertSize[tangents[0]] = cornerSize;
    insertSize[tangents[1]] = cornerSize;
    const insertPosition = [...center];
    insertPosition[axis] -= sign * thickness * 0.22;
    insertPosition[tangents[0]] += a * (size[tangents[0]] - cornerSize) / 2;
    insertPosition[tangents[1]] += b * (size[tangents[1]] - cornerSize) / 2;
    const insert = box(panelGroup, ...insertSize, ...insertPosition, materials.dark, id);
    insert.userData.panelId = spec.id;
    insert.userData.partName = '型材插角';
  }
  const finished = target => tangents.map(tangent => Math.round(Math.max(0, target[tangent]) * 1000));
  panelRegistry.set(spec.id, {
    group: panelGroup,
    ...spec,
    nominalMm: tangents.map(tangent => Math.round(size[tangent] * 1000)),
    outerSheetMm: finished(outerSize),
    innerSheetMm: finished(innerSize),
    cornerCount: 4,
    drawingSource: '型材图及配合装配图.dwg'
  });
  if (separatedPanels.has(spec.id)) panelGroup.position.set(...spec.detach);
  return panelGroup;
}
function cylinder(parent, top, bottom, height, x, y, z, material, rotation, id) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(top, bottom, height, 28), material);
  mesh.position.set(x, y, z);
  if (rotation) mesh.rotation.set(...rotation);
  mesh.castShadow = true;
  if (id) mesh.userData.segmentId = id;
  parent.add(mesh);
  return mesh;
}
function line(parent, points, color = 0x537482) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point => new THREE.Vector3(...point)));
  const object = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, depthTest: false }));
  object.renderOrder = 20;
  parent.add(object);
}
function bentTube(parent, points, radius, material, id) {
  const curve = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)), false, 'centripetal');
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(10, points.length * 7), radius, 8, false), material);
  mesh.castShadow = true;
  mesh.userData.segmentId = id;
  parent.add(mesh);
  return mesh;
}
function panelSeam(parent, x, cutaway, id) {
  const seamMaterial = new THREE.LineBasicMaterial({ color: 0x607b85, depthTest: true, depthWrite: false });
  const paths = [
    [[x, H + 0.002, -W / 2 + PANEL], [x, H + 0.002, W / 2 - PANEL]],
    [[x, PANEL, -W / 2 - 0.002], [x, H - PANEL, -W / 2 - 0.002]]
  ];
  if (!cutaway) paths.push([[x, PANEL, W / 2 + 0.002], [x, H - PANEL, W / 2 + 0.002]]);
  for (const points of paths) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point => new THREE.Vector3(...point)));
    const seam = new THREE.Line(geometry, seamMaterial);
    seam.userData.segmentId = id;
    parent.add(seam);
  }
}
function label(parent, text, x, y, z, scale = 0.66) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 112;
  const context = canvas.getContext('2d');
  context.fillStyle = 'rgba(244,250,251,.92)';
  context.fillRect(0, 4, 640, 96);
  context.strokeStyle = '#a9c5ce';
  context.strokeRect(1, 5, 638, 94);
  context.fillStyle = '#173e4a';
  context.font = 'bold 47px "Microsoft YaHei", sans-serif';
  context.textAlign = 'center';
  context.fillText(text, 320, 69, 610);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true }));
  sprite.position.set(x, y, z);
  sprite.scale.set(scale * 2.6, scale * 0.46, 1);
  sprite.renderOrder = 30;
  parent.add(sprite);
  return sprite;
}
function plateFilterBank(group, length, id) {
  const x = length * 0.52;
  const panelH = H * 0.68;
  const panelW = W * 0.245;
  for (const centerZ of [-W * 0.265, 0, W * 0.265]) {
    box(group, 0.095, panelH, panelW, x, H * 0.51, centerZ, materials.filterMedia, id);
    for (const side of [-1, 1]) {
      box(group, 0.115, 0.035, panelW, x, H * 0.51 + side * panelH / 2, centerZ, materials.galvanized, id);
      box(group, 0.115, panelH, 0.031, x, H * 0.51, centerZ + side * panelW / 2, materials.galvanized, id);
    }
    for (let pleat = 0; pleat < 13; pleat++) {
      const rib = box(group, 0.013, panelH - 0.065, 0.008, x + 0.051, H * 0.51, centerZ - panelW * 0.44 + pleat * panelW * 0.073, materials.frame, id);
      rib.rotation.y = pleat % 2 ? 0.16 : -0.16;
    }
  }
}
function bagFilterBank(group, length, id) {
  const frontX = length * 0.27;
  const frameH = H * 0.71;
  const frameW = W * 0.76;
  const depth = length * 0.48;
  for (const side of [-1, 1]) {
    box(group, 0.065, 0.044, frameW, frontX, H * 0.51 + side * frameH / 2, 0, materials.galvanized, id);
    box(group, 0.065, frameH, 0.043, frontX, H * 0.51, side * frameW / 2, materials.galvanized, id);
  }
  for (let n = 0; n < 6; n++) {
    const z = -frameW * 0.41 + n * frameW * 0.164;
    box(group, depth, frameH - 0.07, frameW * 0.115, frontX + depth / 2, H * 0.51, z, materials.filterMedia, id);
    box(group, 0.072, frameH - 0.045, 0.018, frontX, H * 0.51, z + frameW * 0.078, materials.galvanized, id);
    box(group, depth * 0.91, 0.006, frameW * 0.115, frontX + depth * 0.53, H * 0.51 + (frameH - 0.07) / 2, z, materials.galvanized, id);
  }
}
function densePleatFilterBank(group, length, id) {
  const x = length * 0.52;
  const height = H * 0.73;
  const width = W * 0.77;
  const depth = Math.min(length * 0.48, 0.34);
  for (const side of [-1, 1]) box(group, depth + 0.014, 0.065, width, x, H * 0.51 + side * height / 2, 0, materials.handle, id);
  for (let column = 0; column <= 4; column++) {
    const z = -width / 2 + column * width / 4;
    box(group, depth + 0.014, height, 0.062, x, H * 0.51, z, materials.handle, id);
  }
  for (let column = 0; column < 4; column++) {
    const z = -width * 0.375 + column * width / 4;
    box(group, depth, height - 0.12, width / 4 - 0.08, x, H * 0.51, z, materials.filterMedia, id);
    for (let pleat = 0; pleat < 32; pleat++) box(group, 0.004, 0.004, width / 4 - 0.08, x + depth / 2 + 0.003, H * 0.51 - height * 0.43 + pleat * height * 0.0277, z, materials.frame, id);
  }
}
function differentialGauge(parent, length, id, side) {
  // Above the door: a square folded bracket, dial and two separate pressure tubes.
  const gaugeGroup = new THREE.Group();
  gaugeGroup.userData.segmentId = id;
  parent.add(gaugeGroup);
  const z = side * (W / 2 + 0.085);
  const x = length * 0.55;
  const y = H - 0.19;
  const bracketSpan = Math.min(0.17, Math.max(0.02, H / 2 - 0.06));
  box(gaugeGroup, 0.37, 0.30, 0.045, x, y, z, materials.galvanized, id);
  box(gaugeGroup, 0.33, 0.035, 0.075, x, y + bracketSpan, z - side * 0.018, materials.galvanized, id);
  box(gaugeGroup, 0.33, 0.035, 0.075, x, y - bracketSpan, z - side * 0.018, materials.galvanized, id);
  const faceZ = z + side * 0.027;
  cylinder(gaugeGroup, 0.126, 0.126, 0.014, x, y, faceZ, materials.handle, [Math.PI / 2, 0, 0], id);
  cylinder(gaugeGroup, 0.111, 0.111, 0.004, x, y, faceZ + side * 0.010, materials.gaugeFace, [Math.PI / 2, 0, 0], id);
  for (let n = 0; n <= 10; n++) {
    const a = Math.PI * (0.87 - n * 0.074);
    const tx = x + Math.cos(a) * 0.087;
    const ty = y + Math.sin(a) * 0.087;
    box(gaugeGroup, 0.003, 0.009, 0.002, tx, ty, faceZ + side * 0.013, materials.gaugeNeedle, id).rotation.z = a - Math.PI / 2;
  }
  const needle = box(gaugeGroup, 0.075, 0.003, 0.002, x - 0.034, y + 0.005, faceZ + side * 0.016, materials.gaugeNeedle, id);
  needle.rotation.z = -0.16;
  cylinder(gaugeGroup, 0.008, 0.008, 0.003, x, y, faceZ + side * 0.017, materials.dark, [Math.PI / 2, 0, 0], id);
  const tubeZ = side * (W / 2 + 0.045);
  bentTube(gaugeGroup, [[x-0.15,y-0.025,tubeZ],[x-0.25,y-0.025,tubeZ],[x-0.29,y+0.03,tubeZ],[x-0.29,H-0.055,tubeZ],[x-0.02,H-0.055,tubeZ]], 0.006, materials.gaugeTube, id);
  bentTube(gaugeGroup, [[x-0.15,y-0.105,tubeZ],[x-0.34,y-0.105,tubeZ],[x-0.39,y-0.055,tubeZ],[x-0.39,y+0.035,tubeZ]], 0.006, materials.gaugeTube, id);
  for (const tapX of [x-0.02, x-0.39]) cylinder(gaugeGroup, 0.012, 0.012, 0.011, tapX, tapX === x-0.02 ? H-0.055 : y+0.035, side*(W/2+0.009), materials.handle, [Math.PI/2,0,0], id);
  gaugeGroup.updateMatrixWorld(true);
  parent.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(gaugeGroup);
  const width = bounds.max.x - bounds.min.x, height = bounds.max.y - bounds.min.y;
  const scale = Math.min(1, length / Math.max(width, 0.001), H / Math.max(height, 0.001));
  gaugeGroup.scale.set(scale, scale, 1);
  const worldCenter = bounds.getCenter(new THREE.Vector3());
  const localCenter = parent.worldToLocal(worldCenter);
  gaugeGroup.position.x = length / 2 - localCenter.x * scale;
  gaugeGroup.position.y = H / 2 - localCenter.y * scale;
}
function coilBank(group, length, id, heated) {
  const coreX = length * 0.60;
  const coreZ = W * 0.31;
  box(group, length * 0.30, H * 0.76, W * 0.62, coreX, H * 0.51, 0, heated ? materials.copper : materials.coilFins, id);
  for (let level = 0; level < 28; level++) box(group, length * 0.30, 0.006, 0.008, coreX, 0.33 + level * 0.062, coreZ + 0.006, materials.frame, id);
  const bendX = length * 0.29;
  box(group, length * 0.24, H * 0.78, 0.012, bendX, H * 0.51, coreZ, materials.galvanized, id);
  for (let row = 0; row < 18; row++) {
    const y = 0.36 + row * 0.097;
    for (const col of [-1, 1]) {
      const cx = bendX + col * length * 0.052;
      bentTube(group, [[cx-0.035,y,coreZ+0.012],[cx-0.035,y,coreZ+0.065],[cx,y+0.022,coreZ+0.090],[cx+0.035,y,coreZ+0.065],[cx+0.035,y,coreZ+0.012]], 0.009, materials.copper, id);
    }
  }
  // Opposite side: twin vertical headers and two take-off pipes toward the casing.
  if (!heated) {
    const headerX = length * 0.77;
    for (const dx of [-0.055, 0.055]) {
      cylinder(group, 0.038, 0.038, H * 0.67, headerX + dx, H * 0.51, -coreZ - 0.025, materials.galvanized, null, id);
      for (let n = 0; n < 12; n++) cylinder(group, 0.008, 0.008, 0.065, headerX + dx, 0.43 + n * 0.13, -coreZ + 0.025, materials.copper, [Math.PI/2,0,0], id);
    }
    for (const y of [H-0.24, H-0.54]) cylinder(group, 0.045, 0.045, W * 0.28, headerX, y, -W * 0.37, materials.galvanized, [Math.PI/2,0,0], id);
  }
  box(group, length * 0.62, 0.04, W * 0.8, length / 2, 0.22, 0, materials.frame, id);
}
function fanAssembly(group, length, id) {
  const x = length / 2;
  cylinder(group, 0.75, 0.75, 0.16, x, H * 0.54, 0, materials.frame, [0, 0, Math.PI / 2], id);
  cylinder(group, 0.62, 0.62, 0.18, x + 0.12, H * 0.54, 0, materials.opening, [0, 0, Math.PI / 2], id);
  cylinder(group, 0.13, 0.13, 0.21, x + 0.24, H * 0.54, 0, materials.copper, [0, 0, Math.PI / 2], id);
  for (let n = 0; n < 6; n++) {
    const angle = n * Math.PI / 3;
    const blade = box(group, 0.03, 0.53, 0.12, x + 0.31, H * 0.54 + Math.cos(angle) * 0.24, Math.sin(angle) * 0.24, materials.fan, id);
    blade.rotation.x = angle;
  }
  box(group, length * 0.45, 0.13, W * 0.55, x, 0.28, 0, materials.base, id);
}
function dampers(group, length, id, mixed = false) {
  const count = mixed ? 2 : 1;
  for (let bank = 0; bank < count; bank++) {
    const x = length * (mixed ? 0.32 + bank * 0.35 : 0.5);
    // Perimeter rails leave the damper throat open rather than filling it with a solid block.
    for (const side of [-1, 1]) {
      box(group, 0.09, 0.055, W * 0.79, x, H * 0.5 + side * H * 0.39, 0, materials.galvanized, id);
      box(group, 0.09, H * 0.78, 0.055, x, H * 0.5, side * W * 0.395, materials.galvanized, id);
    }
    for (let n = 0; n < 7; n++) {
      const slat = box(group, 0.07, 0.045, W * 0.73, x + 0.055, 0.43 + n * 0.23, 0, materials.galvanized, id);
      slat.rotation.z = n % 2 ? 0.23 : -0.23;
    }
    const actuatorZ = W * 0.35;
    box(group, 0.38, 0.024, 0.26, x, H + 0.018, actuatorZ, materials.galvanized, id);
    box(group, 0.29, 0.13, 0.21, x, H + 0.095, actuatorZ, materials.actuator, id);
    box(group, 0.12, 0.014, 0.055, x + 0.055, H + 0.169, actuatorZ, materials.actuatorMark, id);
    const frontZ = actuatorZ + 0.112;
    cylinder(group, 0.067, 0.067, 0.016, x - 0.045, H + 0.094, frontZ, materials.handle, [Math.PI/2,0,0], id);
    box(group, 0.037, 0.037, 0.058, x - 0.045, H + 0.094, frontZ + 0.037, materials.galvanized, id);
    for (const screwX of [x-0.14,x+0.14]) cylinder(group, 0.009, 0.009, 0.003, screwX, H+0.034, actuatorZ+0.135, materials.dark, [Math.PI/2,0,0], id);
  }
}
function addInterior(group, segment, length) {
  const type = segment.type, id = segment.id;
  if (addLinkedPart(group, segment, length)) return;
  if (segment.isFormalSegment) return;
  if (type === 'primary') plateFilterBank(group, length, id);
  else if (type === 'medium') bagFilterBank(group, length, id);
  else if (type === 'high') densePleatFilterBank(group, length, id);
  else if (type === 'coil' || type === 'heat') coilBank(group, length, id, type === 'heat');
  else if (type === 'fan') fanAssembly(group, length, id);
  else if (['fresh', 'return', 'supply', 'mix'].includes(type)) dampers(group, length, id, type === 'mix');
  else if (type === 'silencer') for (let n = -2; n <= 2; n++) box(group, length * 0.75, H * 0.68, 0.11, length / 2, H * 0.51, n * 0.34, materials.dark, id);
  else if (type === 'humid') for (let n = -3; n <= 3; n++) {
    cylinder(group, 0.027, 0.027, H * 0.6, length / 2, H * 0.52, n * 0.27, materials.copper, null, id);
    cylinder(group, 0.08, 0.08, 0.05, length / 2, H * 0.79, n * 0.27, materials.port, null, id);
  }
  else if (type === 'access') box(group, 0.08, H * 0.68, W * 0.58, length / 2, H * 0.49, 0, materials.frame, id);
}
function rectangularAirPort(parent, width, height, position, rotation, id) {
  const port = new THREE.Group();
  port.position.set(...position);
  port.rotation.set(...rotation);
  port.userData.segmentId = id;
  parent.add(port);
  const lip = 0.04; // User-specified 40 mm outward flange return.
  const projection = 0.05; // User-specified 50 mm axial flange depth.
  const gauge = 0.006; // Visual placeholder; sheet thickness was not supplied.
  const openingMesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, gauge), materials.opening);
  openingMesh.position.set(0, 0, 0.002);
  openingMesh.castShadow = true;
  openingMesh.receiveShadow = true;
  openingMesh.userData.segmentId = id;
  port.add(openingMesh);
  for (const side of [-1, 1]) {
    box(port, gauge, height, projection, side * width / 2, 0, projection / 2, materials.port, id);
    box(port, width, gauge, projection, 0, side * height / 2, projection / 2, materials.port, id);
    box(port, lip, height + 2 * lip, gauge, side * (width / 2 + lip / 2), 0, projection, materials.port, id);
    box(port, width, lip, gauge, 0, side * (height / 2 + lip / 2), projection, materials.port, id);
    for (const y of [-height / 3, height / 3]) cylinder(port, 0.007, 0.007, 0.002, side * (width / 2 + lip / 2), y, projection + gauge / 2, materials.dark, [Math.PI / 2, 0, 0], id);
    for (const x of [-width / 3, width / 3]) cylinder(port, 0.007, 0.007, 0.002, x, side * (height / 2 + lip / 2), projection + gauge / 2, materials.dark, [Math.PI / 2, 0, 0], id);
  }
  return port;
}
function addInspectionHandle(parent, x, y, z, sign, id) {
  const forward = value => z + sign * value;
  // Round mounting plate, raised hub and the lock barrel visible above the grip.
  cylinder(parent, 0.075, 0.075, 0.02, x, y, forward(0.034), materials.handle, [Math.PI / 2, 0, 0], id);
  cylinder(parent, 0.053, 0.053, 0.035, x, y, forward(0.059), materials.handle, [Math.PI / 2, 0, 0], id);
  cylinder(parent, 0.04, 0.04, 0.071, x + 0.025, y + 0.043, forward(0.093), materials.handle, [Math.PI / 2, 0, 0], id);
  cylinder(parent, 0.027, 0.027, 0.005, x + 0.025, y + 0.043, forward(0.132), materials.lockFace, [Math.PI / 2, 0, 0], id);
  box(parent, 0.006, 0.021, 0.006, x + 0.025, y + 0.043, forward(0.137), materials.dark, id);
  // Curved downward lever, modeled as a shallow solid instead of a straight box.
  const grip = new THREE.Shape();
  grip.moveTo(-0.03, 0.018);
  grip.quadraticCurveTo(-0.04, -0.02, -0.025, -0.055);
  grip.lineTo(0.006, -0.115);
  grip.quadraticCurveTo(0.02, -0.17, 0.014, -0.24);
  grip.quadraticCurveTo(0.012, -0.274, -0.01, -0.282);
  grip.lineTo(-0.034, -0.274);
  grip.quadraticCurveTo(-0.046, -0.268, -0.039, -0.253);
  grip.lineTo(-0.022, -0.215);
  grip.quadraticCurveTo(-0.025, -0.155, -0.046, -0.118);
  grip.quadraticCurveTo(-0.075, -0.065, -0.07, -0.025);
  grip.quadraticCurveTo(-0.06, 0.012, -0.03, 0.018);
  const lever = new THREE.Mesh(new THREE.ExtrudeGeometry(grip, { depth: 0.026, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.003, bevelThickness: 0.003 }), materials.handle);
  lever.position.set(x, y, forward(0.073));
  lever.scale.z = sign;
  lever.castShadow = true;
  lever.userData.segmentId = id;
  parent.add(lever);
}
function addInspectionHinge(parent, axisX, y, z, sign, id) {
  // Twin black leaves with a horizontal split, visible fastener pockets and a vertical pin.
  const front = z + sign * 0.053;
  for (const half of [-1, 1]) {
    const leafY = y + half * 0.024;
    box(parent, 0.11, 0.044, 0.012, axisX + 0.055, leafY, front, materials.handle, id);
    box(parent, 0.029, 0.044, 0.012, axisX - 0.0145, leafY, front, materials.handle, id);
    cylinder(parent, 0.012, 0.012, 0.044, axisX, leafY, front + sign * 0.002, materials.handle, null, id);
    for (const screwX of [axisX + 0.039, axisX + 0.079]) {
      cylinder(parent, 0.008, 0.008, 0.003, screwX, leafY, front + sign * 0.008, materials.dark, [Math.PI / 2, 0, 0], id);
      cylinder(parent, 0.003, 0.003, 0.004, screwX, leafY, front + sign * 0.01, materials.lockFace, [Math.PI / 2, 0, 0], id);
    }
  }
}
function addPort(group, segment, length) {
  if (segment.isFormalSegment) return;
  const diagnostics = group.userData.geometryDiagnostics || (group.userData.geometryDiagnostics = []);
  const source = segment.cadGeometry;
  const authoritative = Array.isArray(source?.ports);
  const records = authoritative ? source.ports : [{ face: segment.portSide, width: segment.portWidth, height: segment.portHeight, offsetU: null, offsetV: null }];
  const faceMap = { front:'front', back:'back', top:'top', bottom:'bottom', leftEnd:'leftEnd', rightEnd:'rightEnd', '右侧':'front', '左侧':'back', '上方':'top', '下方':'bottom', '左端':'leftEnd', '右端':'rightEnd' };
  const plan = [];
  for (const record of records) {
    if (!record || record.enabled === false) continue;
    const canonical = faceMap[record.face];
    const width = Number(record.width), height = Number(record.height);
    const legacy = !authoritative;
    const hasOffset = value => !(value == null || (typeof value === 'string' && value.trim() === ''));
    const u = !hasOffset(record.offsetU) ? (legacy ? (['左端', '右端', 'leftEnd', 'rightEnd'].includes(record.face) ? (W * 1000 - width) / 2 : (length * 1000 - width) / 2) : NaN) : Number(record.offsetU);
    const v = !hasOffset(record.offsetV) ? (legacy ? (['上方', '下方', 'top', 'bottom'].includes(record.face) ? (W * 1000 - height) / 2 : (H * 1000 - height) / 2) : NaN) : Number(record.offsetV);
    if (!canonical || ![width, height].every(Number.isFinite) || width <= 0 || height <= 0 || !Number.isFinite(u) || !Number.isFinite(v) || u < 0 || v < 0) { diagnostics.push(`接口定位无效：${record.face || '面未提供'}`); continue; }
    const faceU = canonical === 'leftEnd' || canonical === 'rightEnd' ? W * 1000 : length * 1000;
    const faceV = canonical === 'top' || canonical === 'bottom' ? W * 1000 : H * 1000;
    if (u + width > faceU || v + height > faceV) { diagnostics.push(`接口越界：${canonical} ${width}×${height} mm`); continue; }
    plan.push({ record, canonical, width: mm(width), height: mm(height), u: mm(u), v: mm(v) });
  }
  for (const item of plan) {
    const { record, canonical, width: a, height: b, u, v } = item;
    let opening;
    if (canonical === 'front' || canonical === 'back') {
      const sign = canonical === 'front' ? 1 : -1;
      if (!authoritative && (segment.type === 'coil' || segment.type === 'heat') && a <= 0.18 && b <= 0.18) {
      const radius = Math.max(a, b) / 2;
      // Small coil pipes sit in the upper downstream corner, clear of the access door.
      const pipeX = length - Math.max(radius * 1.5 + 0.04, 0.13);
      const pipeY = H - PANEL - radius * 1.5 - 0.005;
      const outward = distance => sign * (W / 2 + distance);
      const pair = segment.type === 'coil' ? [{ y: pipeY, inlet: true }, { y: pipeY - 0.31, inlet: false }] : [{ y: pipeY, inlet: false }];
      for (const pipe of pair) {
        cylinder(group, radius * 1.5, radius * 1.5, 0.018, pipeX, pipe.y, outward(0.009), materials.handle, [Math.PI / 2, 0, 0], segment.id);
        cylinder(group, radius * 1.06, radius * 1.06, 0.014, pipeX, pipe.y, outward(0.022), materials.dark, [Math.PI / 2, 0, 0], segment.id);
        const shaft = cylinder(group, radius, radius, 0.15, pipeX, pipe.y, outward(0.092), materials.galvanized, [Math.PI / 2, 0, 0], segment.id);
        if (!opening) opening = shaft;
        cylinder(group, radius * 1.02, radius * 1.02, 0.052, pipeX, pipe.y, outward(0.168), materials.handle, [Math.PI / 2, 0, 0], segment.id);
        cylinder(group, radius * 0.95, radius * 0.95, 0.003, pipeX, pipe.y, outward(0.196), materials.lockFace, [Math.PI / 2, 0, 0], segment.id);
        if (pipe.inlet && !/(出水|回水|出口)/.test(segment.interfaceName || '')) {
          const tapZ = outward(0.095);
          cylinder(group, 0.012, 0.012, 0.011, pipeX, pipe.y - radius - 0.003, tapZ, materials.port, null, segment.id);
          cylinder(group, 0.008, 0.008, 0.003, pipeX, pipe.y - radius - 0.009, tapZ, materials.lockFace, null, segment.id);
          const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.002, 6), materials.dark);
          socket.position.set(pipeX, pipe.y - radius - 0.011, tapZ);
          socket.userData.segmentId = segment.id;
          group.add(socket);
        }
      }
      } else {
        opening = rectangularAirPort(group, a, b, [u + a / 2, v + b / 2, sign * W / 2], [0, sign > 0 ? 0 : Math.PI, 0], segment.id);
      }
    } else if (canonical === 'top' || canonical === 'bottom') {
      const sign = canonical === 'top' ? 1 : -1;
      opening = rectangularAirPort(group, a, b, [u + a / 2, sign > 0 ? H : 0, v + b / 2 - W / 2], [sign > 0 ? -Math.PI / 2 : Math.PI / 2, 0, 0], segment.id);
    } else {
      const sign = canonical === 'rightEnd' ? 1 : -1;
      opening = rectangularAirPort(group, a, b, [sign > 0 ? length : 0, v + b / 2, u + a / 2 - W / 2], [0, sign > 0 ? Math.PI / 2 : -Math.PI / 2, 0], segment.id);
    }
    if (segment.id === bridge.state().selectedId && opening) {
      label(group, `${segment.interfaceName || '接口'} ${record.width}×${record.height} mm`, length / 2, H + 0.67, opening.position.z, 0.75);
      line(group, [[length / 2, H + 0.44, opening.position.z], [opening.position.x, opening.position.y, opening.position.z]], 0xb4772c);
    }
  }
}
function addEndCornerCaps(parent, endX, faceSign) {
  // L-shaped upper end-face corner caps; the source photo does not show lower corners.
  const outline = new THREE.Shape();
  outline.moveTo(0, 0);
  outline.lineTo(0.18, 0);
  outline.lineTo(0.18, -0.075);
  outline.lineTo(0.075, -0.075);
  outline.lineTo(0.075, -0.18);
  outline.lineTo(0, -0.18);
  outline.closePath();
  for (const side of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.008, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.002, bevelThickness: 0.002 }), materials.seamCap);
    cap.position.set(endX + faceSign * 0.006, H + 0.003, side * W / 2);
    cap.rotation.y = faceSign * Math.PI / 2;
    cap.scale.x = faceSign * side;
    cap.castShadow = true;
    parent.add(cap);
    const screwZ = side * (W / 2 - 0.135);
    cylinder(parent, 0.013, 0.013, 0.006, endX + faceSign * 0.019, H - 0.056, screwZ, materials.lockFace, [0, 0, Math.PI / 2]);
    box(parent, 0.005, 0.003, 0.009, endX + faceSign * 0.023, H - 0.056, screwZ, materials.baseBolt);
  }
}
function buildSegment(segment, offset, selected, cutaway, isFirst, isLast) {
  const length = segmentDisplayLength(segment);
  const group = new THREE.Group();
  group.position.x = offset;
  group.userData.segmentId = segment.id;
  model.add(group);
  const panel = selected ? materials.panelSelected : materials.panel;
  if (segment.isFormalSegment && length < PANEL * 2) {
    const casing = new THREE.Mesh(new THREE.BoxGeometry(length, H, W), panel);
    casing.position.set(length / 2, H / 2, 0);
    casing.castShadow = true;
    casing.receiveShadow = true;
    casing.userData.segmentId = segment.id;
    group.add(casing);
    label(group, `${segment.name} · ${segment.length} mm`, length / 2, H + 0.28, 0, 0.62);
    return length;
  }
  const start = isFirst ? PANEL : 0;
  const end = isLast ? length - PANEL : length;
  const panelLength = end - start;
  const panelCenter = (start + end) / 2;
  // Top and bottom fit inside the sides; the two end panels cover every long panel edge.
  const top = sandwichPanel(group, panelLength, PANEL, W - 2 * PANEL, panelCenter, H - PANEL / 2, 0, [0, 1, 0], materials.roof, segment.id, { id: `${segment.id}:top`, name: `${segment.name} · 顶板`, edges: { 左: 2, 右: 2, 前: 2, 后: 2 }, edgeNames: [['左', '右'], ['前', '后']], detach: [0, 0.42, 0] });
  const bottom = sandwichPanel(group, panelLength, PANEL, W - 2 * PANEL, panelCenter, PANEL / 2, 0, [0, -1, 0], materials.panel, segment.id, { id: `${segment.id}:bottom`, name: `${segment.name} · 底板`, edges: { 左: 2, 右: 2, 前: 2, 后: 2 }, edgeNames: [['左', '右'], ['前', '后']], detach: [0, -0.42, 0] });
  const sideEdges = { 左: isFirst ? 2 : 3, 右: 2, 下: 1, 上: 1 };
  const leftSide = sandwichPanel(group, panelLength, H, PANEL, panelCenter, H / 2, -W / 2 + PANEL / 2, [0, 0, -1], panel, segment.id, { id: `${segment.id}:leftSide`, name: `${segment.name} · 左侧板`, edges: sideEdges, edgeNames: [['左', '右'], ['下', '上']], detach: [0, 0, -0.42] });
  let rightSide = null;
  if (!cutaway) {
    rightSide = sandwichPanel(group, panelLength, H, PANEL, panelCenter, H / 2, W / 2 - PANEL / 2, [0, 0, 1], panel, segment.id, { id: `${segment.id}:rightSide`, name: `${segment.name} · 右侧板`, edges: sideEdges, edgeNames: [['左', '右'], ['下', '上']], detach: [0, 0, 0.42] });
    const endEdges = { 上: 1, 下: 1, 左: 1, 右: 1 };
    if (isFirst) {
      const endPanel = sandwichPanel(group, PANEL, H, W, PANEL / 2, H / 2, 0, [-1, 0, 0], panel, segment.id, { id: `${segment.id}:frontEnd`, name: '前端面板', edges: endEdges, edgeNames: [['下', '上'], ['左', '右']], detach: [-0.48, 0, 0] });
      addEndCornerCaps(endPanel, 0, -1);
    }
    if (isLast) {
      const endPanel = sandwichPanel(group, PANEL, H, W, length - PANEL / 2, H / 2, 0, [1, 0, 0], panel, segment.id, { id: `${segment.id}:rearEnd`, name: '后端面板', edges: endEdges, edgeNames: [['下', '上'], ['左', '右']], detach: [0.48, 0, 0] });
      addEndCornerCaps(endPanel, length, 1);
    }
  }
  // Each panel owns its flush extrusion perimeter; no separate end or corner frame.
  if (!isFirst) panelSeam(group, 0, cutaway, segment.id);
  const cadDoors = Array.isArray(segment.cadGeometry?.doors) ? segment.cadGeometry.doors : null;
  if (cadDoors ? cadDoors.some(door => door && door.enabled !== false) : shouldRenderPrototypeDoor(segment, cutaway)) {
    const doors = cadDoors || [{ face: segment.doorSide === '反侧' ? 'back' : 'front', offsetY: Math.max(0, (length * 1000 - Math.min(length * 1000 * .72, 820)) / 2), offsetZ: Math.max(0, (H * 1000 - Math.min(1550, Math.max(120, H * 1000 - 2 * PANEL * 1000 - 40))) / 2), width: Math.min(length * 1000 * .72, 820), height: Math.min(1550, Math.max(120, H * 1000 - 2 * PANEL * 1000 - 40)) }];
    const doorDiagnostics = group.userData.geometryDiagnostics || (group.userData.geometryDiagnostics = []);
    for (const door of doors) {
      if (!door || door.enabled === false) continue;
      const face = ({ front: 'front', back: 'back', '右侧': 'front', '左侧': 'back' })[door.face];
      const hasOffset = value => !(value == null || (typeof value === 'string' && value.trim() === ''));
      const dw = Number(door.width), dh = Number(door.height), du = hasOffset(door.offsetY) ? Number(door.offsetY) : NaN, dv = hasOffset(door.offsetZ) ? Number(door.offsetZ) : NaN;
      if (!face || ![dw, dh, du, dv].every(Number.isFinite) || dw <= 0 || dh <= 0 || du < 0 || dv < 0 || du + dw > length * 1000 || dv + dh > H * 1000) { doorDiagnostics.push(`检修门定位无效：${door.face || '面未提供'}`); continue; }
      const sign = face === 'back' ? -1 : 1;
      const z = sign * (W / 2 + 0.008), doorWidth = mm(dw), doorHeight = mm(dh), doorY = mm(dv) + doorHeight / 2, doorX = mm(du) + doorWidth / 2;
      const doorGroup = sign > 0 ? rightSide : leftSide;
      if (!doorGroup) { doorDiagnostics.push(`检修门所在面当前剖切隐藏：${door.face || '面未提供'}`); continue; }
      box(doorGroup, doorWidth, doorHeight, 0.018, doorX, doorY, z, materials.doorFrame, segment.id);
      box(doorGroup, Math.max(0.001, doorWidth - 0.075), Math.max(0.001, doorHeight - 0.075), 0.012, doorX, doorY, z + sign * 0.018, materials.doorPanel, segment.id);
      const hingeX = doorX - doorWidth / 2 + 0.018;
      for (const y of [doorY - doorHeight * .34, doorY, doorY + doorHeight * .34]) addInspectionHinge(doorGroup, hingeX, y, z, sign, segment.id);
      addInspectionHandle(doorGroup, doorX + doorWidth * 0.31, doorY, z, sign, segment.id);
    }
  }
  if (!segment.isFormalSegment && ['primary', 'medium', 'high'].includes(segment.type) && !cutaway) differentialGauge(segment.doorSide === '反侧' ? leftSide : rightSide, length, segment.id, segment.doorSide === '反侧' ? -1 : 1);
  if (!segment.isFormalSegment) {
    const interior = new THREE.Group();
    group.add(interior);
    addInterior(interior, segment, length);
    fitInternalGroup(interior, length);
  }
  const portParent = segment.portSide === '上方' ? top : segment.portSide === '下方' ? bottom : segment.portSide === '右侧' ? rightSide : segment.portSide === '左侧' ? leftSide : segment.portSide === '左端' ? panelRegistry.get(`${segment.id}:frontEnd`)?.group : segment.portSide === '右端' ? panelRegistry.get(`${segment.id}:rearEnd`)?.group : null;
  addPort(portParent || group, segment, length);
  label(group, selected ? `${segment.name} · ${segment.length} mm` : String(model.children.length).padStart(2, '0'), length / 2, H + (selected ? 0.28 : 0.16), 0, selected ? 0.62 : 0.23);
  return length;
}
function disposeModel() {
  scene.remove(model);
  model.traverse(object => {
    if (object.geometry) object.geometry.dispose();
    if (object.material?.map) object.material.map.dispose();
    if (object.isSprite) object.material.dispose();
    if (object.isLine) object.material.dispose();
  });
  model = new THREE.Group();
  model.quaternion.copy(legacyWorkbenchToSemantic);
  scene.add(model);
}
function buildSegmentBase(start, length, isFirst, isLast) {
  // Each segment carries its own folded sheet-metal perimeter.
  const gauge = 0.006;
  const webHeight = 0.145;
  const webY = -0.085;
  const footY = -0.16;
  const center = start + length / 2;
  const railLength = length - gauge;
  for (const side of [-1, 1]) {
    const z = side * (W / 2 - gauge / 2);
    box(model, railLength, webHeight, gauge, center, webY, z, materials.base);
    box(model, railLength, gauge, 0.105, center, -0.009, side * (W / 2 - 0.0525), materials.base);
    box(model, railLength, gauge, 0.115, center, footY, side * (W / 2 - 0.0075), materials.base);
    const x = center + side * (length - gauge) / 2;
    box(model, gauge, webHeight, W, x, webY, 0, materials.base);
    box(model, 0.105, gauge, W, x - side * 0.0495, -0.009, 0, materials.base);
    box(model, 0.115, gauge, W, x + side * 0.0545, footY, 0, materials.base);
  }
  // The exposed first/last end corners use lapped angles and paired fasteners.
  for (const xSign of [-1, 1]) {
    if ((xSign < 0 && !isFirst) || (xSign > 0 && !isLast)) continue;
    for (const zSign of [-1, 1]) {
    const endX = center + xSign * length / 2;
    const cornerX = endX - xSign * 0.055;
    const cornerZ = zSign * (W / 2 - 0.055);
    box(model, 0.11, 0.13, gauge, cornerX, webY, zSign * (W / 2 + gauge / 2), materials.baseBracket);
    box(model, gauge, 0.13, 0.11, endX + xSign * gauge / 2, webY, cornerZ, materials.baseBracket);
    for (const y of [-0.045, -0.11]) {
      cylinder(model, 0.013, 0.013, 0.012, cornerX, y, zSign * (W / 2 + 0.012), materials.baseBolt, [Math.PI / 2, 0, 0]);
      cylinder(model, 0.013, 0.013, 0.012, endX + xSign * 0.012, y, cornerZ, materials.baseBolt, [0, 0, Math.PI / 2]);
    }
    }
  }
}
function buildBaseJoint(x) {
  // Two segment bases meet here: separate side plates, upright tabs and a transverse bolt.
  for (const side of [-1, 1]) {
    const z = side * (W / 2 + 0.004);
    for (const direction of [-1, 1]) {
      const plateX = x + direction * 0.078;
      box(model, 0.12, 0.125, 0.008, plateX, -0.085, z, materials.baseBracket);
      for (const y of [-0.05, -0.11]) cylinder(model, 0.013, 0.013, 0.012, plateX, y, z + side * 0.011, materials.baseBolt, [Math.PI / 2, 0, 0]);
      box(model, 0.006, 0.12, 0.09, x + direction * 0.015, -0.085, side * (W / 2 - 0.045), materials.baseBracket);
    }
    cylinder(model, 0.008, 0.008, 0.075, x, -0.08, side * (W / 2 - 0.045), materials.baseBolt, [0, 0, Math.PI / 2]);
    for (const direction of [-1, 1]) cylinder(model, 0.015, 0.015, 0.012, x + direction * 0.043, -0.08, side * (W / 2 - 0.045), materials.baseBolt, [0, 0, Math.PI / 2]);
  }
}
function buildSeamCap(x) {
  // Small T-shaped cosmetic cover over the top of each vertical segment seam.
  const outline = new THREE.Shape();
  outline.moveTo(-0.115, 0.015);
  outline.lineTo(0.115, 0.015);
  outline.lineTo(0.115, -0.075);
  outline.lineTo(0.056, -0.075);
  outline.lineTo(0.056, -0.12);
  outline.lineTo(-0.056, -0.12);
  outline.lineTo(-0.056, -0.075);
  outline.lineTo(-0.115, -0.075);
  outline.closePath();
  for (const side of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.ExtrudeGeometry(outline, { depth: 0.007, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: 0.0015, bevelThickness: 0.0015 }), materials.seamCap);
    cap.position.set(x, H - 0.006, side * (W / 2 + 0.007));
    cap.scale.z = side;
    cap.castShadow = true;
    model.add(cap);
    for (const offset of [-0.082, 0.082]) {
      cylinder(model, 0.011, 0.011, 0.004, x + offset, H - 0.059, side * (W / 2 + 0.017), materials.lockFace, [Math.PI / 2, 0, 0]);
      box(model, 0.008, 0.002, 0.005, x + offset, H - 0.059, side * (W / 2 + 0.02), materials.baseBolt);
    }
  }
}
function buildScene() {
  disposeModel();
  panelRegistry.clear();
  const state = bridge.state();
  const total = state.segments.reduce((sum, item) => sum + segmentDisplayLength(item), 0);
  let cursor = -total / 2;
  state.segments.forEach((segment, index) => {
    const start = cursor;
    const length = buildSegment(segment, start, segment.id === state.selectedId, state.cutaway, index === 0, index === state.segments.length - 1);
    buildSegmentBase(start, length, index === 0, index === state.segments.length - 1);
    cursor += length;
    if (index < state.segments.length - 1) { buildBaseJoint(cursor); buildSeamCap(cursor); }
  });
  for (const id of separatedPanels) if (!panelRegistry.has(id)) separatedPanels.delete(id);
  line(model, [[-total / 2, H + 0.5, -W / 2], [total / 2, H + 0.5, -W / 2]]);
  label(model, `整机 L ${Math.round(total * 1000)} mm`, 0, H + 0.52, -W / 2, 0.8);
  line(model, [[-total / 2 - 0.24, 0, -W / 2], [-total / 2 - 0.24, H, -W / 2]]);
  const dimensions=state.cabinetDimensions||{},heightLabel=dimensions.mode==='formal'?(dimensions.height===null?'H 未提供（示意）':`H ${dimensions.height} mm`):`H ${Math.round(H*1000)} mm`;
  label(model, heightLabel, -total / 2 - 0.37, H / 2, -W / 2, 0.6);
  renderer.shadowMap.needsUpdate = true;
  return total;
}
function setCameraView(kind, total, aspect) {
  const radius = Math.max(total * 1.25, 6);
  const target = new THREE.Vector3(0, H / 2, 0).applyQuaternion(legacyWorkbenchToSemantic);
  const positions = {
    iso: [radius * 0.68, radius * 0.54, radius * 0.78],
    side: [0, H * 0.58, radius],
    top: [0, radius, 0.001],
    end: [radius, H * 0.58, 0.001],
    front: [0, H * 0.58, radius],
    rear: [0, H * 0.58, -radius],
    left: [-radius, H * 0.58, 0.001],
    right: [radius, H * 0.58, 0.001],
    bottom: [0, -radius, 0.001]
  };
  const [x, y, z] = positions[kind] || positions.iso;
  const span = kind === 'side' || kind === 'top' || kind === 'front' || kind === 'rear' ? Math.max(total + 1, 4.3) : kind === 'end' || kind === 'left' || kind === 'right' ? 4.6 : Math.max(total + 2.2, 6.8);
  camera.left = -span / 2;
  camera.right = span / 2;
  camera.top = span / (2 * Math.max(0.7, aspect));
  camera.bottom = -camera.top;
  camera.updateProjectionMatrix();
  camera.up.set(0, 0, 1);
  if (kind === 'top' || kind === 'bottom') camera.up.set(0, 1, 0);
  camera.position.set(x, y, z).applyQuaternion(legacyWorkbenchToSemantic);
  camera.lookAt(target);
  controls.target.copy(target);
  controls.update();
}
let viewportWidth = 0;
let viewportHeight = 0;
function setViewport(width, height) {
  const nextWidth = Math.max(1, Math.round(width));
  const nextHeight = Math.max(1, Math.round(height));
  if (nextWidth === viewportWidth && nextHeight === viewportHeight) return;
  viewportWidth = nextWidth;
  viewportHeight = nextHeight;
  renderer.setSize(nextWidth, nextHeight, false);
}
const views = [['front', '前面'], ['rear', '后面'], ['left', '左面'], ['right', '右面'], ['top', '顶面'], ['bottom', '底面']];
let mountedView = null;
let modelSignature = null;
let modelLength = 0;
const hud = document.createElement('div');
hud.className = 'three-hud';
const guide = document.createElement('div');
guide.className = 'three-guide';
const orbitButtons = document.createElement('div');
orbitButtons.className = 'three-orbit-buttons';
orbitButtons.innerHTML = '<span>视角</span><button type="button" data-orbit="left" title="向左旋转">◀</button><button type="button" data-orbit="up" title="向上旋转">▲</button><button type="button" data-orbit="down" title="向下旋转">▼</button><button type="button" data-orbit="right" title="向右旋转">▶</button><button type="button" data-orbit="reset" title="恢复当前标准视角">复位</button>';
const disassemblyButton = document.createElement('button');
disassemblyButton.type = 'button';
disassemblyButton.id = 'disassemblyBtn';
disassemblyButton.textContent = '逐板拆分';
const seriesSelect = document.createElement('select');
seriesSelect.id = 'panelSeriesSelect';
seriesSelect.setAttribute('aria-label', '护板系列');
seriesSelect.innerHTML = '<option value="50W">50W · 50 mm</option><option value="25W">25W · 25 mm</option>';
const cadBadge = document.createElement('span');
cadBadge.className = 'cad-source-badge';
cadBadge.textContent = '型材 DWG · 3D结构示意';
document.querySelector('.composition-title').append(cadBadge, seriesSelect, disassemblyButton);
function updateJointDrawing() {
  const image = document.getElementById('jointDrawing');
  if (image) {
    image.src = window.AHU_PROFILE_NODE_IMAGES[panelSeries];
    image.alt = `${panelSeries}一二三号型材截面及一加二、二加三装配节点CAD图`;
  }
  document.querySelector('#jointDialog .joint-head b').textContent = `护板节点结构示意 · ${panelSeries}`;
  document.querySelector('#jointDialog .joint-body p').innerHTML = `${panelSeries} 节点几何按用户提供的 <b>型材图及配合装配图.dwg</b> 生成，并在示意模型中查看方向关系；这不代表当前正式方案已完成整机或实物校核。1+2 用于端面箱角；2号公头与3号母头用于功能段拼接。护板厚 ${Math.round(PANEL * 1000)} mm，外层 RAL9003 彩钢板 t${OUTER_SHEET * 1000} mm，内层镀锌板 t0.4 mm，中间为聚氨酯发泡。`;
}
seriesSelect.addEventListener('change', () => {
  panelSeries = seriesSelect.value;
  PANEL = panelSeries === '25W' ? 0.025 : 0.05;
  OUTER_SHEET = panelSeries === '25W' ? 0.00035 : 0.0006;
  updateJointDrawing();
  showScene();
});
const panelInspector = document.createElement('div');
panelInspector.className = 'panel-inspector';
function updatePanelInspector() {
  panelInspector.hidden = !disassemblyMode;
  if (!disassemblyMode) return;
  const entries = [...panelRegistry.values()];
  if (!panelRegistry.has(selectedPanelId)) selectedPanelId = entries[0]?.id || null;
  const selected = panelRegistry.get(selectedPanelId);
  const sizeInfo = selected ? `<div class="panel-sizes"><span>护板名义尺寸 <strong>${selected.nominalMm.join(' × ')} mm</strong></span><span>外彩钢板成品 <strong>${selected.outerSheetMm.join(' × ')} mm</strong></span><span>内镀锌板成品 <strong>${selected.innerSheetMm.join(' × ')} mm</strong></span><span>型材插角 <strong>${selected.cornerCount} 件</strong></span></div>` : '';
  panelInspector.innerHTML = `<b>单块护板 · ${panelSeries} 结构参考 · ${separatedPanels.size} 块已拆</b><select aria-label="选择护板">${entries.map(item => `<option value="${safeText(item.id)}" ${item.id === selectedPanelId ? 'selected' : ''}>${safeText(item.name)}</option>`).join('')}</select><div class="panel-edges">${selected ? Object.entries(selected.edges).map(([edge, number]) => `<span>${edge}边 <strong>${number}号</strong></span>`).join('') : ''}</div>${sizeInfo}<small>参考数据：型材 DWG + ${panelSeries} 结构示意<br>${panelSeries === '25W' ? '1号总高48.5；2/3号槽深22.8' : '1号总高72.0；2/3号槽深47.75'} mm。未对当前方案或实物进行校核。</small><div class="panel-actions"><button type="button" data-panel-action="toggle">${separatedPanels.has(selectedPanelId) ? '装回本板' : '拆下本板'}</button><button type="button" data-panel-action="reset">全部装回</button></div><small>点击模型可选中单板；板件沿其外法线拆离。</small>`;
}
function togglePanel(id) {
  const item = panelRegistry.get(id);
  if (!item) return;
  if (separatedPanels.has(id)) { separatedPanels.delete(id); item.group.position.set(0, 0, 0); }
  else { separatedPanels.add(id); item.group.position.set(...item.detach); }
  selectedPanelId = id;
  renderer.shadowMap.needsUpdate = true;
  updatePanelInspector();
  renderer.render(scene, camera);
}
disassemblyButton.addEventListener('click', () => {
  disassemblyMode = !disassemblyMode;
  disassemblyButton.classList.toggle('active', disassemblyMode);
  disassemblyButton.textContent = disassemblyMode ? '退出拆分' : '逐板拆分';
  if (disassemblyMode && bridge.state().cutaway) document.getElementById('cutawayBtn').click();
  if (disassemblyMode && bridge.state().view !== 'iso') document.querySelector('[data-view="iso"]').click();
  updatePanelInspector();
  showScene();
});
panelInspector.addEventListener('change', event => {
  if (event.target.tagName !== 'SELECT') return;
  selectedPanelId = event.target.value;
  updatePanelInspector();
});
panelInspector.addEventListener('click', event => {
  const action = event.target.closest('[data-panel-action]')?.dataset.panelAction;
  if (action === 'toggle') togglePanel(selectedPanelId);
  if (action === 'reset') {
    for (const item of panelRegistry.values()) item.group.position.set(0, 0, 0);
    separatedPanels.clear();
    renderer.shadowMap.needsUpdate = true;
    updatePanelInspector();
    renderer.render(scene, camera);
  }
});
function updateAngleGuide() {
  const offset = camera.position.clone().sub(controls.target);
  const azimuth = Math.round(THREE.MathUtils.radToDeg(Math.atan2(offset.x, offset.z)));
  const elevation = Math.round(THREE.MathUtils.radToDeg(Math.atan2(offset.y, Math.hypot(offset.x, offset.z))));
  guide.textContent = `左键旋转 · 滚轮缩放 · 右键平移 · 方位 ${azimuth}° · 俯仰 ${elevation}°`;
}
controls.addEventListener('change', updateAngleGuide);
orbitButtons.addEventListener('click', event => {
  const action = event.target.closest('[data-orbit]')?.dataset.orbit;
  if (!action) return;
  if (action === 'reset') {
    const bounds = area.getBoundingClientRect();
    setCameraView(bridge.state().view, modelLength, bounds.width / Math.max(1, bounds.height));
  } else {
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    const step = THREE.MathUtils.degToRad(15);
    spherical.theta += action === 'left' ? -step : action === 'right' ? step : 0;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + (action === 'up' ? -step : action === 'down' ? step : 0), controls.minPolarAngle, controls.maxPolarAngle);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    camera.lookAt(controls.target);
    controls.update();
  }
  updateAngleGuide();
  renderer.render(scene, camera);
});
function renderSix(total) {
  const originalPosition = camera.position.clone();
  const originalTarget = controls.target.clone();
  const originalZoom = camera.zoom;
  const images = views.map(([key, title]) => {
    setViewport(480, 260);
    setCameraView(key, total, 480 / 260);
    renderer.render(scene, camera);
    return `<div class="face"><span>${title}</span><img alt="${title} 3D 模型视图" src="${renderer.domElement.toDataURL('image/png')}"></div>`;
  });
  area.classList.remove('three-mode');
  area.innerHTML = `<div class="six-grid">${images.join('')}</div>`;
  camera.position.copy(originalPosition);
  controls.target.copy(originalTarget);
  camera.zoom = originalZoom;
  camera.updateProjectionMatrix();
  controls.update();
  mountedView = 'six';
}
function shouldRenderPrototypeDoor(segment, cutaway) {
  return !segment?.isFormalSegment && Boolean(segment?.doorSide) && segment.doorSide !== '无' && !cutaway;
}
function isFormalViewSupported(state) {
  return !state?.readOnly || ['iso', 'end'].includes(state.view);
}
function segmentDisplayLength(segment) {
  const measuredLength = mm(segment.length);
  return measuredLength;
}
function hasDisplayableFormalPart(segment) {
  const partId = segment?.partRef?.partId;
  if (!segment?.isFormalSegment || !partId) return false;
  const part = readPartLibrary().find(item => item.id === partId);
  return Array.isArray(part?.customScene) && part.customScene.length > 0;
}
function invalidFormalLengthSegments(state) {
  return (state?.segments || []).filter(segment => !Number.isFinite(Number(segment.length)) || Number(segment.length) <= 0);
}
function showScene() {
  const state = bridge.state();
  const dimensions=state.cabinetDimensions||{};
  if (dimensions.cabinetSeries === '25W' || dimensions.cabinetSeries === '50W') {
    panelSeries = dimensions.cabinetSeries;
    PANEL = panelSeries === '25W' ? 0.025 : 0.05;
    OUTER_SHEET = panelSeries === '25W' ? 0.00035 : 0.0006;
    if (seriesSelect) { seriesSelect.value = panelSeries; seriesSelect.disabled = true; }
  } else if (state.readOnly || state.formalReadonly) {
    if (modelSignature !== null) { disposeModel(); modelSignature = null; }
    area.classList.remove('three-mode');
    const notice = document.createElement('div'); notice.className = 'result-empty';
    notice.textContent = '正式方案缺少 25W/50W 结构系列，无法确认护板厚度和真实净空，已停止三维绘制。';
    area.replaceChildren(notice); mountedView = state.view; return;
  }
  const rawW = Number(dimensions.width), rawH = Number(dimensions.height);
  W=Number.isFinite(rawW) ? mm(rawW) : 0;
  H=Number.isFinite(rawH) ? mm(rawH) : 0;
  if (!Number.isFinite(rawW) || !Number.isFinite(rawH) || !(W > 2 * PANEL) || !(H > 2 * PANEL)) {
    if (modelSignature !== null) { disposeModel(); modelSignature = null; }
    area.classList.remove('three-mode');
    const notice = document.createElement('div'); notice.className = 'result-empty';
    notice.textContent = '箱体真实宽度/高度缺失或无效，无法按 1:1 实际尺寸绘制。请补齐并确认机组资料。';
    area.replaceChildren(notice); mountedView = state.view; return;
  }
  const invalidLengths = invalidFormalLengthSegments(state);
  const invalidClearance = (state.segments || []).filter(segment => !(segmentDisplayLength(segment) > 2 * PANEL));
  if (invalidLengths.length || invalidClearance.length) {
    if (modelSignature !== null) { disposeModel(); modelSignature = null; }
    area.classList.remove('three-mode');
    const notice = document.createElement('div');
    notice.className = 'result-empty';
    notice.textContent = invalidLengths.length ? `段 ${invalidLengths.map(segment => segment.name || segment.id).join('、')} 缺少有效正段长，无法按比例绘制。请补齐并保存。` : `段 ${invalidClearance.map(segment => segment.name || segment.id).join('、')} 的长度不大于两侧板厚，净空为零，无法绘制真实箱体。`;
    area.replaceChildren(notice);
    mountedView = state.view;
    return;
  }
  const signature = JSON.stringify([state.segments, state.selectedId, state.cutaway, state.cabinetDimensions, panelSeries, partLibraryRevision()]);
  if (signature !== modelSignature) {
    modelLength = buildScene();
    modelSignature = signature;
  }
  const geometryDiagnostics = [];
  model.traverse(object => { if (object.userData?.geometryDiagnostics) geometryDiagnostics.push(object.userData.geometryDiagnostics); if (object.userData?.fitDiagnostic) geometryDiagnostics.push(object.userData.fitDiagnostic); });
  const total = modelLength;
  if (!isFormalViewSupported(state)) {
    area.classList.remove('three-mode');
    const notice = document.createElement('div');
    notice.className = 'result-empty';
    notice.textContent = '此视图尚未绑定正式方案的接口方位数据。请使用三维轴测或端视；接口原始记录见右侧。';
    area.replaceChildren(notice);
    mountedView = state.view;
    return;
  }
  if (state.view === 'six') { renderSix(total); return; }
  const viewChanged = mountedView !== state.view;
  area.classList.add('three-mode');
  if (renderer.domElement.parentElement !== area) {
    area.replaceChildren(renderer.domElement, hud, guide, orbitButtons, panelInspector);
  }
  const selected = state.segments.find(item => item.id === state.selectedId);
  const dimensionLabel=`箱体截面 ${dimensions.width==null?'宽度未提供':`${safeText(dimensions.width)} mm`} × ${dimensions.height==null?'高度未提供':`${safeText(dimensions.height)} mm`}<br>气流段长合计 ${Math.round(total*1000)} mm`;
  const connectionLabel=selected?.isFormalSegment?(selected.connections?.length?`<br>接口记录：${selected.connections.map(connection=>`${safeText(connection.name||'未命名')} · ${safeText(connection.face||'所在面未提供')} · ${connection.width==null||connection.width===''?'宽未提供':safeText(connection.width)} × ${connection.height==null||connection.height===''?'高未提供':safeText(connection.height)} mm`).join('；')}`:`<br>${selected.connectionsStatus==='none'?'正式数据明确无接口':'正式数据未提供接口记录'}`):selected?.portSide&&selected.portSide!=='无'?`<br>原型接口示意：${safeText(selected.portSide)} · ${safeText(selected.portWidth)} × ${safeText(selected.portHeight)} mm`:'';
  const formalPartNote=state.readOnly&&selected?.isFormalSegment&&!hasDisplayableFormalPart(selected)?'<br>未关联可显示零件；当前只显示箱体':'';
  hud.innerHTML = `<b>${safeText(dimensions.unitNo||'AHU-03')} · ${state.readOnly?'正式方案只读':'原型演示'}</b>${dimensionLabel}<br>内部构件按真实净空独立适配，外壳保持 1:1${selected ? `<br>当前段：${safeText(selected.name)} · ${safeText(selected.length)} mm` : ''}${selected?.partRef?.partId ? `<br>零件库：${safeText(selected.partRef.name||selected.partRef.partId)}${selected.partRef.model?' · '+safeText(selected.partRef.model):''}` : ''}${connectionLabel}${formalPartNote}${geometryDiagnostics.length ? `<br>几何诊断：${geometryDiagnostics.map(safeText).join('；')}` : ''}`;
  const bounds = area.getBoundingClientRect();
  setViewport(bounds.width, bounds.height);
  if (viewChanged) setCameraView(state.view, total, bounds.width / Math.max(1, bounds.height));
  mountedView = state.view;
  updatePanelInspector();
  updateAngleGuide();
  renderer.render(scene, camera);
}
bridge.replaceRenderer(showScene);
renderer.domElement.addEventListener('pointerup', event => {
  const start = pointerDown;
  pointerDown = null;
  if (!start || event.button !== 0 || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const point = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(point, camera);
  const hits = raycaster.intersectObjects(model.children, true);
  if (disassemblyMode) {
    const panelHit = hits.find(hit => {
      let object = hit.object;
      while (object && !object.userData.panelId) object = object.parent;
      return object?.userData.panelId;
    });
    if (panelHit) {
      let object = panelHit.object;
      while (object && !object.userData.panelId) object = object.parent;
      selectedPanelId = object.userData.panelId;
      updatePanelInspector();
    }
    return;
  }
  const match = hits.find(hit => hit.object.userData.segmentId);
  if (match) bridge.select(match.object.userData.segmentId);
});
let pointerDown = null;
renderer.domElement.addEventListener('pointerdown', event => { pointerDown = { x: event.clientX, y: event.clientY }; });
renderer.domElement.addEventListener('pointercancel', () => { pointerDown = null; });
renderer.setAnimationLoop(() => {
  controls.update();
  if (!area.hidden && bridge.state().view !== 'six' && renderer.domElement.isConnected) renderer.render(scene, camera);
});
new ResizeObserver(() => {
  if (!renderer.domElement.isConnected) return;
  const bounds = area.getBoundingClientRect();
  if (bounds.width < 2 || bounds.height < 2) return;
  setViewport(bounds.width, bounds.height);
  const aspect = bounds.width / bounds.height;
  const vertical = (camera.right - camera.left) / (2 * aspect);
  camera.top = vertical;
  camera.bottom = -vertical;
  camera.updateProjectionMatrix();
}).observe(area);
showScene();





