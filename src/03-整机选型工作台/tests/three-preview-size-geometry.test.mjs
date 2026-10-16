import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const previewPath = path.join(root, 'src/03-整机选型工作台/js/three-preview.js');
const threePath = path.join(root, 'src/03-整机选型工作台/vendor/three/build/three.module.js');
const THREE = await import(pathToFileURL(threePath).href);
const source = await readFile(previewPath, 'utf8');
const scene = await readFile(path.join(root,'src/03-整机选型工作台/js/prototype-axonometric-scene.js'),'utf8');
const dimensionsDeclaration = scene.match(/^function previewDimensionsMm\(\).*$/m)?.[0];
assert.ok(dimensionsDeclaration,'actual workbench bootstrap dimensions resolver exists');
const actualDimensions = new Function('formalReadonly','formalInfo','projects','selectedProject','selectedUnit',`${dimensionsDeclaration}; return previewDimensionsMm();`);
for(const value of [Infinity,'Infinity','NaN','abc',null,'',0,-1]) {
  const result = actualDimensions(false,{},[{units:[{designConditions:{cabinetWidth:{value},cabinetHeight:{value}}}]}],0,0);
  assert.equal(result.widthKnown,false,`invalid actual width ${String(value)} must not become authoritative geometry`);
  assert.equal(result.heightKnown,false,`invalid actual height ${String(value)} must not become authoritative geometry`);
  const formal=actualDimensions(true,{width:value,height:value},[],0,0);
  assert.equal(formal.widthKnown,false,`invalid formal width ${String(value)} must not become authoritative geometry`);
  assert.equal(formal.heightKnown,false,`invalid formal height ${String(value)} must not become authoritative geometry`);
}
{
 const result=actualDimensions(false,{},[{units:[{designConditions:{cabinetWidth:{value:1910},cabinetHeight:{value:1370}}}]}],0,0);
 assert.equal(result.width,1910);assert.equal(result.height,1370);assert.equal(result.widthKnown,true);assert.equal(result.heightKnown,true);
}

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `actual preview must retain ${name}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index++) {
    if (source[index] === '{') depth++;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

const actual = ['linkedPartMaterial', 'linkedTrapezoid', 'linkedHollowCylinder', 'linkedGeometry', 'linkedAxisVector', 'linkedMountingQuaternion', 'addLinkedPart', 'box', 'cylinder', 'bentTube', 'plateFilterBank', 'bagFilterBank', 'densePleatFilterBank', 'coilBank', 'fanAssembly', 'dampers', 'addInterior', 'fitInternalGroup']
  .map(extractFunction).join('\n');
const portActual = ['box', 'cylinder', 'rectangularAirPort', 'addPort'].map(extractFunction).join('\n');
const doorActual = ['box', 'cylinder', 'addInspectionHandle', 'addInspectionHinge', 'buildSegment'].map(extractFunction).join('\n');

function factory(H, W, PANEL, parts = []) {
  const materials = Object.fromEntries(['filterMedia', 'frame', 'galvanized', 'handle', 'coilFins', 'copper', 'opening', 'fan', 'base', 'dark', 'port', 'profile1', 'actuator', 'actuatorMark'].map(key => [key, new THREE.MeshBasicMaterial()]));
  return new Function('THREE', 'materials', 'H', 'W', 'PANEL', 'parts', `${actual}\nfunction readPartLibrary(){ return parts; }\nreturn { addInterior, fitInternalGroup };`)(THREE, materials, H, W, PANEL, parts);
}

function portFactory(H, W, PANEL) {
  const materials = Object.fromEntries(['opening', 'port', 'dark', 'handle', 'galvanized', 'lockFace'].map(key => [key, new THREE.MeshBasicMaterial()]));
  return new Function('THREE', 'materials', 'H', 'W', 'PANEL', 'bridge', `const mm = value => Math.max(0, Number(value) || 0) / 1000;\n${portActual}\nreturn { addPort };`)(THREE, materials, H, W, PANEL, { state: () => ({ selectedId: 'not-selected' }) });
}

function portGroups(group) {
  return group.children.filter(child => child.isGroup && child.children.some(mesh => mesh.isMesh && mesh.geometry?.parameters?.width !== undefined));
}

function doorFactory(H, W, PANEL) {
  const materials = Object.fromEntries(['panel', 'panelSelected', 'roof', 'doorFrame', 'doorPanel', 'handle', 'dark', 'lockFace', 'frame'].map(key => [key, new THREE.MeshBasicMaterial()]));
  const prelude = `
    const model = new THREE.Group(); const panelRegistry = new Map(); const camera = { zoom: 1 }; const mm = value => Math.max(0, Number(value) || 0) / 1000;
    const casingRecords = [];
    function sandwichPanel(parent, width, height, depth, x, y, z) { const result = new THREE.Group(); casingRecords.push({width, height, depth, x, y, z}); parent.add(result); return result; }
    function panelSeam() {} function addEndCornerCaps() {} function shouldRenderPrototypeDoor(){ return false; }
    function differentialGauge() {} function addInterior() {} function fitInternalGroup() {} function addPort() {}
    function segmentDisplayLength(segment) { return Number(segment.length) / 1000; }
    function label() {} const cutaway = false;
  `;
  return new Function('THREE', 'materials', 'H', 'W', 'PANEL', `${prelude}\n${doorActual}\nreturn { buildSegment, model, materials, casingRecords };`)(THREE, materials, H, W, PANEL);
}

function localBounds(group) {
  const parent = group.parent;
  if (parent) parent.remove(group);
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  if (parent) parent.add(group);
  return bounds;
}

function assertFits(group, length, H, W, panel, label) {
  const bounds = localBounds(group);
  const size = bounds.getSize(new THREE.Vector3());
  const clear = [length - 2 * panel, H - 2 * panel, W - 2 * panel];
  for (const [index, axis] of ['length', 'height', 'width'].entries()) {
    assert.ok(size.getComponent(index) <= clear[index] + 1e-8, `${label}: ${axis} bounds must fit actual clear volume`);
  }
}

for (const panel of [.025, .05]) {
  const H = 1.37, W = 1.91, length = 2.43;
  const { buildSegment, casingRecords } = doorFactory(H, W, panel);
  const segment = { id: 'exact-shell', type: 'access', length: length * 1000, cadGeometry: { doors: [], ports: [] } };
  const before = JSON.stringify(segment);
  assert.equal(buildSegment(segment, 0, false, false, true, true), length);
  assert.equal(casingRecords.length, 6, 'actual buildSegment must construct six shell panels');
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of casingRecords) for (const [axis, size, centre] of [[0,p.width,p.x],[1,p.height,p.y],[2,p.depth,p.z]]) {
    min[axis] = Math.min(min[axis], centre - size/2);
    max[axis] = Math.max(max[axis], centre + size/2);
  }
  for (const [axis, expected] of [length,H,W].entries()) assert.ok(Math.abs(max[axis]-min[axis]-expected)<1e-10, `actual shell axis ${axis} preserves exact dimensions for ${panel*1000}W`);
  assert.equal(JSON.stringify(segment), before, 'shell construction cannot rewrite engineering data');
}

for (const panel of [.025, .05]) {
  const H = .5, W = .5, length = .12;
  const { addInterior, fitInternalGroup } = factory(H, W, panel);
  for (const type of ['primary', 'medium', 'high', 'coil', 'heat', 'fan', 'fresh', 'mix', 'silencer', 'humid', 'access']) {
    const parent = new THREE.Group();
    parent.position.set(4, -3, 2);
    parent.rotation.set(.31, -.46, .19);
    const interior = new THREE.Group();
    parent.add(interior);
    addInterior(interior, { id: type, type }, length);
    fitInternalGroup(interior, length);
    assert.equal(interior.visible, true, `${type} ${panel * 1000}W must be fit instead of hidden when clear volume exists`);
    assert.ok(interior.scale.x <= 1 && interior.scale.y <= 1 && interior.scale.z <= 1, `${type} may shrink but must never enlarge`);
    assertFits(interior, length, H, W, panel, `${type} ${panel * 1000}W short segment`);
  }
}

{
  const H = 2.3, W = 2.5, length = 3;
  const { fitInternalGroup } = factory(H, W, .05);
  const parent = new THREE.Group();
  parent.position.set(11, 7, -5);
  parent.rotation.set(.4, -.7, .2);
  const interior = new THREE.Group();
  parent.add(interior);
  const rotatedOffCentre = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.9, 3.1), new THREE.MeshBasicMaterial());
  rotatedOffCentre.position.set(1.1, -.35, .42);
  rotatedOffCentre.rotation.set(.31, .73, -.22);
  interior.add(rotatedOffCentre);
  fitInternalGroup(interior, length);
  assertFits(interior, length, H, W, .05, 'rotated off-centre linked part under translated parent');
  assert.ok(interior.scale.x < 1 || interior.scale.y < 1 || interior.scale.z < 1, 'oversized linked aggregate must shrink');
}

{
  const { buildSegment, model, materials } = doorFactory(.8, 1, .05);
  buildSegment({ id: 'doors', type: 'access', length: 1000, cadGeometry: { doors: [
    { face: 'front', width: 400, height: 300, offsetY: 100, offsetZ: 200 },
    { face: 'back', width: 200, height: 250, offsetY: 700, offsetZ: 400 },
    { face: 'front', width: 300, height: 200, offsetY: 800, offsetZ: 700 },
    { face: 'front', width: 200, height: 200, offsetY: 0, offsetZ: 0, enabled: false }
  ] } }, 0, false, false, true, true);
  const segment = model.children[0];
  const frames = [];
  segment.traverse(object => { if (object.isMesh && object.material === materials.doorFrame) frames.push(object); });
  assert.equal(frames.length, 2, 'actual door plan must render each valid enabled door and skip invalid/disabled records');
  assert.deepEqual(frames.map(mesh => mesh.geometry.parameters.width).sort(), [.2, .4], 'door widths retain exact millimetre values');
  assert.deepEqual(frames.map(mesh => mesh.geometry.parameters.height).sort(), [.25, .3], 'door heights retain exact millimetre values');
  const centres = frames.map(mesh => mesh.position.toArray().map(value => Number(value.toFixed(6))));
  assert.ok(centres.some(value => value[0] === .3 && value[1] === .35 && value[2] === .508) && centres.some(value => value[0] === .8 && value[1] === .525 && value[2] === -.508), `door mesh centres honor explicit side and offsets: ${JSON.stringify(centres)}`);
  assert.ok(segment.userData.geometryDiagnostics.some(value => /检修门定位无效/.test(value)), 'off-face door must diagnose rather than shrink');
}

{
  const H = .8, W = .8, length = 1;
  const { addPort } = portFactory(H, W, .05);
  const host = new THREE.Group();
  addPort(host, {
    id: 'ports',
    cadGeometry: { ports: [
      { face: 'front', width: 400, height: 200, offsetU: 100, offsetV: 300 },
      { face: 'top', width: 500, height: 300, offsetU: 400, offsetV: 100 },
      { face: 'rightEnd', width: 750, height: 200, offsetU: 50, offsetV: 0 },
      { face: 'back', width: 300, height: 200, offsetU: 0, offsetV: 0, enabled: false },
      { face: 'front', width: 400, height: 200, offsetU: 700, offsetV: 0 }
    ] }
  }, length);
  const ports = portGroups(host);
  assert.equal(ports.length, 3, 'actual addPort must draw every valid authoritative port and skip disabled/out-of-face records');
  assert.deepEqual(ports[0].position.toArray().map(value => Number(value.toFixed(6))), [.3, .4, .4], 'front port must use exact mm offset and dimensions');
  assert.deepEqual(ports[1].position.toArray().map(value => Number(value.toFixed(6))), [.65, .8, -.15], 'top port must use segment length on U and cabinet width on V');
  assert.deepEqual(ports[2].position.toArray().map(value => Number(value.toFixed(6))), [1, .1, .025], 'wide end port must use cabinet width, not segment length');
  assert.ok(host.userData.geometryDiagnostics.some(value => /接口越界/.test(value)), 'off-face explicit coordinate must diagnose instead of shrinking');
}

{
  const { addPort } = portFactory(.8, .8, .05);
  const legacyHost = new THREE.Group();
  addPort(legacyHost, { id: 'legacy', portSide: '右侧', portWidth: 400, portHeight: 300 }, 1);
  const legacy = portGroups(legacyHost);
  assert.equal(legacy.length, 1, 'legacy port without explicit CAD placement remains representable');
  assert.deepEqual(legacy[0].position.toArray().map(value => Number(value.toFixed(6))), [.5, .4, .4], 'legacy port is exactly centred without changing width or height');
  const tinyHost = new THREE.Group();
  addPort(tinyHost, { id: 'tiny', cadGeometry: { ports: [{ face: 'front', width: 4, height: 3, offsetU: 0, offsetV: 0 }] } }, 1);
  const opening = portGroups(tinyHost)[0].children[0].geometry.parameters;
  assert.equal(opening.width, .004, 'sub-5 mm opening width must not be silently increased');
  assert.equal(opening.height, .003, 'sub-5 mm opening height must not be silently increased');
}

{
  const H = 2.3, W = 2.5, length = 3;
  const linkedPart = {
    id: 'rotated-linked',
    mounting: { flow: '+z', up: '+y' },
    customScene: [{ name: 'off-centre rotor', geometry: { type: 'box', size: [4.2, 1.9, 3.1] }, position: [1.1, -.35, .42], rotation: [.31, .73, -.22], scale: [1, 1, 1], material: 'galvanized' }]
  };
  const { addInterior, fitInternalGroup } = factory(H, W, .05, [linkedPart]);
  const linkedBefore=JSON.stringify(linkedPart);
  const parent = new THREE.Group();
  parent.position.set(11, 7, -5);
  parent.rotation.set(.4, -.7, .2);
  const interior = new THREE.Group();
  parent.add(interior);
  addInterior(interior, { id: 'linked', type: 'fan', partRef: { partId: 'rotated-linked' } }, length);
  fitInternalGroup(interior, length);
  assertFits(interior, length, H, W, .05, 'actual addLinkedPart rotated off-centre aggregate');
  assert.ok(interior.scale.x < 1 || interior.scale.y < 1 || interior.scale.z < 1, 'actual linked aggregate must shrink without changing input geometry');
  assert.equal(JSON.stringify(linkedPart),linkedBefore,'display fitting must preserve the approved part geometry snapshot');
}

{
  const { addInterior, fitInternalGroup } = factory(.05, .05, .025);
  const interior = new THREE.Group();
  addInterior(interior, { id: 'fan', type: 'fan' }, .04);
  fitInternalGroup(interior, .04);
  assert.equal(interior.visible, false, 'no positive clear volume must diagnose/hide internals rather than invent a minimum size');
  assert.match(interior.userData.fitDiagnostic, /净空不足/);
}

for (const invalid of [null, '', '  ', undefined]) {
  const { addPort } = portFactory(.8, .8, .05), host = new THREE.Group();
  addPort(host, {id:'invalid-port',cadGeometry:{ports:[{face:'front',width:100,height:100,offsetU:invalid,offsetV:0}]}},1);
  assert.equal(portGroups(host).length,0,`explicit port coordinate ${String(invalid)} must not become zero`);
  assert.ok(host.userData.geometryDiagnostics.length>0);
  const { buildSegment, model, materials } = doorFactory(.8,.8,.05);
  buildSegment({id:'invalid-door',type:'access',length:1000,cadGeometry:{doors:[{face:'front',width:100,height:100,offsetY:invalid,offsetZ:0}]}},0,false,false,true,true);
  const frames=[];model.traverse(o=>{if(o.isMesh&&o.material===materials.doorFrame)frames.push(o);});
  assert.equal(frames.length,0,`explicit door coordinate ${String(invalid)} must not become zero`);
  assert.ok(model.children[0].userData.geometryDiagnostics.length>0);
}
{
 const {buildSegment}=doorFactory(.8,.8,.05);
 assert.doesNotThrow(()=>buildSegment({id:'cutaway-door',type:'access',length:1000,cadGeometry:{doors:[{face:'front',width:100,height:100,offsetY:0,offsetZ:0}]}},0,false,true,true,true),'explicit front door must not crash actual cutaway buildSegment when front panel is hidden');
}
{
  const { addPort } = portFactory(.8,.8,.05), host=new THREE.Group();
  addPort(host,{id:'zero-port',cadGeometry:{ports:[{face:'front',width:100,height:100,offsetU:0,offsetV:0}]}},1);
  assert.equal(portGroups(host).length,1,'explicit numeric zero port offsets remain valid');
  const {buildSegment,model,materials}=doorFactory(.8,.8,.05);
  buildSegment({id:'zero-door',type:'access',length:1000,cadGeometry:{doors:[{face:'front',width:100,height:100,offsetY:0,offsetZ:0}]}},0,false,false,true,true);
  const frames=[];model.traverse(o=>{if(o.isMesh&&o.material===materials.doorFrame)frames.push(o);});
  assert.equal(frames.length,1,'explicit numeric zero door offsets remain valid');
}
console.log('three-preview CPU geometry: exact shell dimensions, short 25W/50W, all internal types, transformed linked bounds, and invalid/zero coordinates passed');
