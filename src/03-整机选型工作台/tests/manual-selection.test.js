const assert = require('node:assert/strict');
const model = require('../js/project-model.js');
const manual = require('../js/manual-selection.js');

const project = model.createProject();
manual.ensureProject(project);
const unit = project.project.units[0];
unit.segments.slice(1).forEach(s => { s.enabled = false; });
const segment = unit.segments[0];
segment.interface.drawing.length = 500;
segment.interface.output.manual = { description: '镀锌钢板新风箱体', source: '厂家样本 2026A' };
assert.equal(manual.validateSegment(project, unit.unitId, segment.id).length, 0);
segment.interface.drawing.connections.push({ name: '新风口', face: 'end', width: 500, height: 400, x: 500 });
assert.equal(manual.validateSegment(project, unit.unitId, segment.id).length, 0);
segment.interface.drawing.connections[0].x = 501;
assert.equal(manual.validateSegment(project, unit.unitId, segment.id).some(i => i.code === 'boundary'), true);
segment.interface.drawing.connections[0].x = 500;
assert.equal(manual.confirmSegment(project, unit.unitId, segment.id, '张工').ok, true);
segment.interface.output.manual.description = '';
assert.equal(manual.segmentStatus(project, unit.unitId, segment.id).confirmed, false);
segment.interface.output.manual.description = '镀锌钢板新风箱体';

unit.manual.schemeName = '手工方案 A'; unit.manual.revision = 'R1'; unit.manual.airflowDirection = '左至右'; unit.manual.accessSide = '右侧';
assert.equal(manual.confirmUnit(project, unit.unitId, '李工').ok, true);
assert.equal(manual.unitStatus(project, unit.unitId).confirmed, true);
unit.designConditions.airVolume.value += 1;
assert.equal(manual.unitStatus(project, unit.unitId).confirmed, false);

unit.designConditions.cabinetWidth.value = 1200; unit.designConditions.cabinetHeight.value = 1000; unit.manual.baseHeight = 100; unit.profile.installationType = '卧式';
assert.deepEqual(manual.getUnitDimensions(project, unit.unitId), { orientation:'horizontal', width:1200, height:1100, length:500, airflowAxisLength:500, baseHeight:100, segmentLengths:[500] });
unit.profile.installationType = '立式';
assert.deepEqual(manual.getUnitDimensions(project, unit.unitId), { orientation:'vertical', width:1200, height:600, length:1000, airflowAxisLength:500, baseHeight:100, segmentLengths:[500] });

const roundTrip = JSON.parse(JSON.stringify(project));
manual.ensureProject(roundTrip);
assert.equal(manual.captureUnitSnapshot(project, unit.unitId) .fingerprint, undefined);
assert.equal(manual.fingerprint(manual.captureUnitSnapshot(project, unit.unitId)), manual.fingerprint(manual.captureUnitSnapshot(roundTrip, unit.unitId)));
roundTrip.project.units[0].segments[0].type = 'imported-unknown';
assert.equal(manual.validateSegment(roundTrip, unit.unitId, segment.id).some(i => i.code === 'unknown'), true);
const second = model.createUnit(project, 'AHU-02'); second.segments.forEach(s => { s.enabled = false; });
assert.notEqual(manual.projectStatus(project).units[0].unitId, manual.projectStatus(project).units[1].unitId);
assert.equal(manual.unitStatus(project, second.unitId).confirmed, false);
console.log('通过：人工字段、边界、确认快照、JSON往返、卧立尺寸和多机组隔离。');
