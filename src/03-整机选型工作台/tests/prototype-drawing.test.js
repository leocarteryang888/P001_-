'use strict';
const assert = require('node:assert/strict');
const drawing = require('../js/prototype-drawing.js');

const snapshot = {
  project: { name: '项目甲', code: 'P-01' },
  unit: { no: 'AHU-01', cabinetSelection: { confirmed: true, width: { value: 2000 }, height: { value: 1800 } } },
  segments: [{ id: 'a', name: '新风段', length: 500 }, { id: 'b', name: '过滤段', length: 600 }]
};
const model = drawing.makeModel(snapshot, '2026-10-09T00:00:00.000Z');
assert.equal(model.width, 2000);
assert.equal(model.height, 1800);
assert.equal(model.totalLength, 1100);
assert.deepEqual(model.axes, { width: 'X', length: 'Y', height: 'Z' });
assert.deepEqual(drawing.exportGate(model), { blocked: false, issues: [] });
assert.deepEqual(drawing.geometry(model, 'front'), { width: 1100, height: 1800, valid: true, segmented: true });
assert.deepEqual(drawing.geometry(model, 'top'), { width: 1100, height: 2000, valid: true, segmented: true }, 'top view is horizontal Y length by vertical X width');
assert.deepEqual(drawing.geometry(model, 'left'), { width: 2000, height: 1800, valid: true, segmented: false });
for (const view of ['front', 'top', 'left']) assert.match(drawing.viewSvg(model, view), /role="img"/);
assert.match(model.disclaimer, /不是完整三维模型或制造图/);

function dxfEntities(source) {
  const section = source.split('2\nENTITIES\n')[1].split('0\nENDSEC')[0].trim();
  const pairs = section.split('\n'), entities = [];
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    if (pairs[i] === '0') entities.push({ type: pairs[i + 1] });
    else if (entities.length) entities[entities.length - 1][pairs[i]] = pairs[i + 1];
  }
  return entities;
}
function dxfLinesOnLayer(source, layer) {
  return dxfEntities(source).filter(entity => entity.type === 'LINE' && entity['8'] === layer).map(entity => [
    [Number(entity['10']), Number(entity['20']), Number(entity['30'])],
    [Number(entity['11']), Number(entity['21']), Number(entity['31'])]
  ]);
}
function dxf3dExtents(source) {
  const entities = dxfEntities(source).filter(entity => entity.type === '3DFACE' || ['SHELL','SEGMENTS','DOORS','PORTS'].includes(entity['8']));
  const points = [];
  entities.forEach(entity => {
    const slots = entity.type === '3DFACE' ? ['10','11','12','13'] : ['10','11'];
    slots.forEach(slot => {
      if (entity[slot] !== undefined) points.push([Number(entity[slot]),Number(entity[String(Number(slot)+10)]),Number(entity[String(Number(slot)+20)])]);
    });
  });
  return { min: [0,1,2].map(axis => Math.min(...points.map(point => point[axis]))), max: [0,1,2].map(axis => Math.max(...points.map(point => point[axis]))) };
}

const dxf = drawing.dxf(model);
assert.match(dxf, /AC1021/);
assert.match(dxf, /\$INSUNITS\n70\n4/);
assert.match(dxf, /8\nFRONT\n/);
assert.match(dxf, /8\nTOP\n/);
assert.match(dxf, /8\nLEFT\n/);
assert.match(dxf, /1100 mm/);
assert.match(dxf, /2000 mm/);
assert.match(dxf, /1800 mm/);
const offset = drawing.dxf3dOffset(model);
assert.deepEqual(offset, { x: 4600, y: 0, z: 0 });
assert.match(dxf, /3D \\U\+53C2\\U\+6570/);
const orthoMaxX = Math.max(...['FRONT','TOP','LEFT'].flatMap(layer => dxfLinesOnLayer(dxf, layer).flatMap(line => line.flatMap(point => point.slice(0,1)))));
const dxfEnvelope = dxf3dExtents(dxf);
assert(dxfEnvelope.min[0] > orthoMaxX, 'the translated 3D modelspace envelope does not overlap the orthographic view extents');
assert.deepEqual(dxfEnvelope.max.map((value,axis)=>value-dxfEnvelope.min[axis]), [model.width,model.totalLength,model.height], '3D translation preserves canonical X/Y/Z dimensions');

const featureSnapshot = structuredClone(snapshot);
featureSnapshot.segments[0].drawingGeometry = {
  doors: [{ face: 'front', offsetY: 100, offsetZ: 200, width: 200, height: 300 }],
  ports: [{ face: 'top', offsetU: 100, offsetV: 50, width: 120, height: 80 }]
};
const featured = drawing.makeModel(featureSnapshot);
assert.equal(featured.features.length, 2);
const frontDoor = featured.features[0];
assert.deepEqual(drawing.featureCorners(frontDoor, featured), [[0,100,200],[0,300,200],[0,300,500],[0,100,500]]);
assert.deepEqual(drawing.projectFeature(frontDoor, featured, 'front'), { x: 100, y: 200, width: 200, height: 300, kind: 'door' });
assert.equal(drawing.projectFeature(frontDoor, featured, 'top'), null, 'a door on the opposite face is not drawn as visible');
const topPort = featured.features[1];
assert.deepEqual(drawing.featureCorners(topPort, featured), [[50,100,1800],[50,220,1800],[130,220,1800],[130,100,1800]], 'top-face width follows Y and height follows X');
assert.deepEqual(drawing.projectFeature(topPort, featured, 'top'), { x: 100, y: 50, width: 120, height: 80, kind: 'port' });
assert.match(drawing.viewSvg(featured, 'top'), /feature-port/);
assert.doesNotMatch(drawing.viewSvg(featured, 'front'), /feature-port/, 'top port does not appear on the front view');

const featureDxf = drawing.dxf(featured);
assert.match(featureDxf, /3DFACE/, 'DXF retains the confirmed parametric exterior envelope');
assert.deepEqual(dxfLinesOnLayer(featureDxf, 'DOORS'), [
  [[4600,100,200],[4600,300,200]], [[4600,300,200],[4600,300,500]],
  [[4600,300,500],[4600,100,500]], [[4600,100,500],[4600,100,200]]
]);
const topPortEdges3d = dxfLinesOnLayer(featureDxf, 'PORTS');
assert.deepEqual(topPortEdges3d, [
  [[4650,100,1800],[4650,220,1800]], [[4650,220,1800],[4730,220,1800]],
  [[4730,220,1800],[4730,100,1800]], [[4730,100,1800],[4650,100,1800]]
]);
const topLayer = dxfEntities(featureDxf).filter(entity => entity.type === 'LINE' && entity['8'] === 'PORTS');
assert.equal(topLayer.length, 4, '3D DXF contains the port outline once at its exact coordinates');
const frontOrthoLines = dxfLinesOnLayer(featureDxf, 'FRONT');
assert(frontOrthoLines.some(([a,b]) => JSON.stringify([a.slice(0,2),b.slice(0,2)]) === JSON.stringify([[100,200],[300,200]])), 'front orthographic DXF door starts at the entered Y/Z coordinates');
assert(frontOrthoLines.some(([a,b]) => JSON.stringify([a.slice(0,2),b.slice(0,2)]) === JSON.stringify([[300,500],[100,500]])), 'front orthographic DXF door ends at the entered width and height');
const topOrthoLines = dxfLinesOnLayer(featureDxf, 'TOP');
assert(topOrthoLines.some(([a,b]) => JSON.stringify([a.slice(0,2),b.slice(0,2)]) === JSON.stringify([[100,-2450],[220,-2450]])), 'top orthographic DXF uses horizontal Y width and vertical X height');
assert.match(featureDxf, /8\nPORTS\n/);

const disabledSnapshot = structuredClone(snapshot);
disabledSnapshot.segments[0].drawingGeometry = {
  doors: [{ enabled: false, face: 'front', offsetY: 10, offsetZ: 20, width: 30, height: 40 }],
  ports: [{ enabled: false, face: 'top', offsetU: 10, offsetV: 20, width: 30, height: 40 }]
};
disabledSnapshot.segments[1].enabled = false;
const disabled = drawing.makeModel(disabledSnapshot);
assert.equal(disabled.features.length, 0, 'disabled doors, ports, and segments are omitted');
assert.equal(disabled.segments.length, 1);
assert.doesNotMatch(drawing.dxf(disabled), /8\nDOORS\n|8\nPORTS\n/);

const legacyMissing = structuredClone(snapshot);
legacyMissing.segments[0].doorSide = '检修侧';
legacyMissing.segments[0].portSide = '右侧';
legacyMissing.segments[0].drawingGeometry = { doors: [], ports: [] };
const missingPositioning = drawing.makeModel(legacyMissing);
assert(missingPositioning.diagnostics.some(message => /门定位待补/.test(message)));
assert(missingPositioning.diagnostics.some(message => /接口定位待补/.test(message)), 'legacy positions are diagnosed even when geometry arrays are empty');
assert.deepEqual(drawing.exportGate(missingPositioning).blocked, true);
assert.throws(() => drawing.dxf(missingPositioning), /阻止导出/);
assert.throws(() => drawing.pdf(missingPositioning, {}), /阻止导出/);

const previousDocument = global.document;
const previousBridge = global.AHUPrototypeDrawingBridge;
const renderHost = { hidden: true, innerHTML: '', querySelector: () => ({ addEventListener() {} }) };
global.document = { getElementById: () => renderHost };
global.AHUPrototypeDrawingBridge = { snapshot: () => legacyMissing };
drawing.render();
assert.match(renderHost.innerHTML, /class="drawing-export-gate"[^>]*role="alert"/);
assert.match(renderHost.innerHTML, /门定位待补/);
assert.match(renderHost.innerHTML, /接口定位待补/);
assert.equal((renderHost.innerHTML.match(/ disabled /g) || []).length, 2, 'both exports are visibly disabled when locations are missing');
assert.equal((renderHost.innerHTML.match(/aria-describedby="drawing-export-gate"/g) || []).length, 2);
if (previousDocument === undefined) delete global.document; else global.document = previousDocument;
if (previousBridge === undefined) delete global.AHUPrototypeDrawingBridge; else global.AHUPrototypeDrawingBridge = previousBridge;

const invalidPosition = structuredClone(snapshot);
invalidPosition.segments[0].drawingGeometry = { ports: [{ face: 'front', offsetU: '', offsetV: 0, width: 100, height: 100 }] };
const invalid = drawing.makeModel(invalidPosition);
assert(invalid.diagnostics.some(message => /定位无效或越界/.test(message)));
assert.throws(() => drawing.dxf(invalid), /阻止导出/);

const partial = structuredClone(snapshot);
partial.unit.cabinetSelection.confirmed = false;
partial.segments[1].length = null;
const missing = drawing.makeModel(partial);
assert.equal(missing.width, null);
assert.equal(missing.height, null);
assert.equal(missing.totalLength, null);
assert.match(drawing.viewSvg(missing, 'front'), /未按比例绘制/);
assert.throws(() => drawing.dxf(missing), /阻止导出/);

const jpg = Uint8Array.from([255, 216, 255, 217]);
const pdf = drawing.pdfBytesFromJpeg(jpg);
assert.equal(pdf.type, 'application/pdf');
pdf.arrayBuffer().then(buffer => {
  const bytes = new Uint8Array(buffer), source = Buffer.from(bytes).toString('latin1');
  assert.match(source, /^%PDF-1\.4/);
  assert.match(source, /\/Subtype \/Image/);
  assert.match(source, /startxref\n\d+\n%%EOF/);
  const offset = Number(source.match(/startxref\n(\d+)/)[1]);
  assert.equal(source.slice(offset, offset + 4), 'xref');
  console.log('prototype-drawing: canonical geometry, feature positions, disabled features, DXF coordinates, and PDF structure passed');
}).catch(error => { console.error(error); process.exitCode = 1; });
