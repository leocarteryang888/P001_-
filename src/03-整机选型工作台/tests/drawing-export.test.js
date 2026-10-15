'use strict';
const assert = require('node:assert/strict');
const Drawing = require('../js/drawing-export.js');

const snapshot = {
  schemaVersion: 2, activeUnitId: 'unit-1',
  project: { projectId: 'project-1', projectCode: 'P-001', name: '医院项目', customerName: '甲方', businessOwner: '工程部', technicalSupport: '设计组', status: '编辑中', units: [
    { unitId: 'unit-1', unitNo: 'AHU-01', resultRevision: 2, profile: { productName: '组合式空调机组' }, designConditions: { cabinetWidth: { value: 2000 }, cabinetHeight: { value: 1800 } }, segments: [
      { id: 'seg-1', name: '新风段', enabled: true, interface: { drawing: { length: 700 }, selection: { model: '' } } },
      { id: 'seg-2', name: '中效过滤段', enabled: true, selectionLevel: 'L2', interface: { drawing: { length: 900 }, selection: { model: 'F300' } } },
      { id: 'seg-off', name: '停用段', enabled: false, interface: { drawing: { length: 1000 } } }
    ] }
  ] }
};

const model = Drawing.makeDrawingModel(snapshot, { generatedAt: '2026-09-25T00:00:00.000Z' });
assert.equal(model.frame.width, 420);
assert.equal(model.unit.width, 2000);
assert.equal(model.unit.height, 1800);
assert.equal(model.unit.totalLength, 1600);
assert.deepEqual(model.axes, { width: 'X', length: 'Y', height: 'Z' });
assert.equal(model.segments.length, 2, 'disabled segment is not drawn');
assert.equal(model.project.customer, '甲方');
assert.equal(model.missing.length, 0);

const dxf = Drawing.createDxf(model);
assert.match(dxf, /AC1021/);
assert.match(dxf, /410/);
assert.match(dxf, /\\U\+673A\\U\+7EC4\\U\+5BBD\\U\+5EA6/);
assert.match(dxf, /\\U\+4E2D/, 'DXF Chinese text uses AutoCAD Unicode escapes');
assert.match(dxf, /\\U\+9879\\U\+76EE\\U\+7F16\\U\+53F7/);

const report = Drawing.csv(model);
assert.match(report, /^\uFEFF/);
assert.match(report, /宽度 X/);
assert.match(report, /1600/);
assert.match(report, /F300/);
assert.match(Drawing.htmlDocument(model), /@page\{size:A3 landscape/);
assert.match(Drawing.htmlDocument(model), /window\.print\(\)/);

const partial = structuredClone(snapshot);
delete partial.project.units[0].designConditions.cabinetWidth;
delete partial.project.units[0].segments[0].interface.drawing.length;
const partialModel = Drawing.makeDrawingModel(partial);
assert.equal(partialModel.unit.width, null, 'missing width is not replaced with a model default');
assert.equal(partialModel.unit.totalLength, null, 'partial segment lengths do not create a false total');
assert(partialModel.missing.includes('机组宽度 X'));
assert(partialModel.missing.includes('新风段段长 Y'));
assert.match(Drawing.createDxf(partialModel), /\\U\+51E0\\U\+4F55\\U\+4FE1\\U\+606F\\U\+4E0D\\U\+5B8C\\U\+6574/);
assert.match(Drawing.csv(partialModel), /未提供/);
const partialPdf = Drawing.htmlDocument(partialModel);
assert.match(partialPdf, /段长数据不完整，未绘制按比例段链/);
assert.doesNotMatch(partialPdf, /class="segment" style="flex:/, 'PDF does not invent segment proportions when a segment length is missing');
assert.throws(() => Drawing.makeDrawingModel({ project: { units: [] } }), /没有可导出的机组/);

console.log('drawing-export: A3 frame, DXF, print-ready PDF source, CSV report and missing-data handling passed');
