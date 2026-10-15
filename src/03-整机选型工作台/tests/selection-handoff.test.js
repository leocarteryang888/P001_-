const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../js/project-model.js');
const H = require('../js/selection-handoff.js');
const filterSandbox = { window: {}, document: { addEventListener() {} }, console };
vm.createContext(filterSandbox);
const filterModuleRoot = path.resolve(__dirname, '../../01-过滤器选型');
vm.runInContext(fs.readFileSync(path.join(filterModuleRoot, 'data/filter-database.js'), 'utf8'), filterSandbox);
vm.runInContext(fs.readFileSync(path.join(filterModuleRoot, 'js/filter-selector.js'), 'utf8'), filterSandbox);
const filterDatabase = filterSandbox.window.FilterDatabase;
const calculateFilter = filterSandbox.window.FilterSelector.calculate;
const filterDatabaseFingerprint = (() => { let hash = 2166136261; for (const char of JSON.stringify(filterDatabase)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, '0'); })();
const verify = (project, context, message) => H.verify(project, context, message, { filterDatabase });

// 两个标签从修订版 4 打开：标签 A 保存后升至 5；标签 B 的旧快照必须被识别为冲突。
const tabARevision = 4, tabBRevision = 4;
const persistedAfterTabASave = { persistenceRevision: tabARevision + 1, savedUserChange: '标签 A 的修改' };
assert.equal(H.revisionMatches(tabARevision + 1, persistedAfterTabASave.persistenceRevision), true);
assert.equal(H.revisionMatches(tabBRevision, persistedAfterTabASave.persistenceRevision), false, '旧标签不能覆盖另一标签已保存的新版本');
assert.equal(H.revisionMatches(undefined, undefined), true, '旧项目没有修订号时按初始版兼容');
const appSource = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf8');
assert.equal((appSource.match(/\$\('saveProject'\)\.onclick=/g) || []).length, 1, '保存按钮只绑定一个保存入口');
assert.equal(appSource.includes("addEventListener('click',saveProjectIndex)"), false, '不允许第二个保存监听重复递增修订号');
assert.equal(H.filterTypeApplicable('primary-filter', 'g2_20'), true);
assert.equal(H.filterTypeApplicable('primary-filter', 'f_300'), false);
assert.equal(H.filterTypeApplicable('medium-filter', 'f_500'), true);
assert.equal(H.filterTypeApplicable('medium-filter', 'gf_300'), false, '复合型 G+F 未定义单段归属');
assert.equal(H.filterTypeApplicable('high-filter', 'h'), true);
assert.equal(H.filterTypeApplicable('high-filter', 'carbon'), false);

const project = M.createProject();
const unit = M.activeUnit(project);
const segment = unit.segments.find(item => item.type === 'primary-filter');
segment.interface.output.manual = { description: '已有人工说明', source: '人工输入' };
const context = H.makeContext(project, unit, segment, 'nonce-test-1');
const filterArrangement = calculateFilter('pull', 25, 22);
const filterType = filterDatabase.filterTypes.find(item => item.id === 'g2_20');
const result = {
  protocol: 'p001-selection-result-v1', nonce: context.nonce,
  result: { selector: 'filter', status: 'selected', model: '过滤器参考规格 g2_20: '+filterArrangement.specifications.map(item => `${item.code}×${item.count}`).join('、'),
    source: '过滤器标准排布数据库 v'+filterDatabase.version+' · 内容指纹 '+filterDatabaseFingerprint, rule: { id: 'filter-standard-arrangement', version: filterDatabase.version+'+'+filterDatabaseFingerprint },
    target: context.target, workbenchSnapshot: context.workbenchSnapshot, workbenchFingerprint: context.workbenchFingerprint,
    input: { mode: 'pull', typeId: filterType.id, widthModule: 25, heightModule: 22, widthMm: context.workbenchSnapshot.cabinetWidth, heightMm: context.workbenchSnapshot.cabinetHeight }, data: { filterType, arrangement: { mode: 'pull', width: filterArrangement.widths, height: filterArrangement.heights, total: filterArrangement.total, specifications: filterArrangement.specifications } }, warnings: [] }
};

let checked = verify(project, context, result);
assert.equal(checked.ok, true);
assert.equal(H.verify(project, context, result).ok, false, '缺少当前生效数据库时过滤器结果必须 fail-closed');
assert.equal(H.apply(project, checked), true);
assert.equal(segment.interface.selection.model, result.result.model);
assert.equal(segment.interface.selection.level, 'L2');
assert.equal(segment.interface.selection.professionalResult.rule.version, filterDatabase.version+'+'+filterDatabaseFingerprint);
assert.equal(segment.interface.output.automatedSelection.input.widthMm, 2500);
assert.equal(segment.interface.output.manual.description, '已有人工说明');
const reopenedL2Project = M.normalizeProject(JSON.parse(JSON.stringify(project)));
const reopenedFilter = reopenedL2Project.segments.find(item => item.id === segment.id);
assert.equal(reopenedFilter.interface.selection.professionalResult.model, result.result.model);
assert.equal(reopenedFilter.interface.output.automatedSelection.rule.id, 'filter-standard-arrangement');
assert.equal(reopenedL2Project.project.units[0].segments, reopenedL2Project.segments);

const stale = M.clone(project);
stale.project.units[0].designConditions.cabinetWidth.value += 100;
stale.project.units[0].segments = stale.project.units[0].segments.map(item => item.id === segment.id ? { ...item, interface: { ...item.interface, output: { manual: {} } } } : item);
assert.equal(verify(stale, context, result).ok, false);
assert.equal(verify(project, context, { ...result, nonce: 'wrong-nonce' }).ok, false);
assert.equal(verify(project, context, { ...result, result: { ...result.result, reviewRequired: true } }).ok, false);
const badSpec = structuredClone(result);
badSpec.result.input.widthMm += 100;
assert.equal(verify(project, context, badSpec).ok, false);
const mediumSegment = unit.segments.find(item => item.type === 'medium-filter');
const mediumContext = H.makeContext(project, unit, mediumSegment, 'nonce-medium');
const primaryAsMedium = structuredClone(result);
primaryAsMedium.nonce = mediumContext.nonce;
primaryAsMedium.result.target = mediumContext.target;
primaryAsMedium.result.workbenchSnapshot = mediumContext.workbenchSnapshot;
primaryAsMedium.result.workbenchFingerprint = mediumContext.workbenchFingerprint;
primaryAsMedium.result.input.widthMm = mediumContext.workbenchSnapshot.cabinetWidth;
primaryAsMedium.result.input.heightMm = mediumContext.workbenchSnapshot.cabinetHeight;
primaryAsMedium.result.input.typeId = 'g2_20';
primaryAsMedium.result.data.filterType.id = 'g2_20';
assert.equal(verify(project, mediumContext, primaryAsMedium).ok, false, '初效型号不可回写到中效段');

const coilContext = H.makeContext(project, unit, unit.segments.find(item => item.type === 'cooling-coil'), 'nonce-coil');
assert.equal(M.SEGMENT_LIBRARY.find(item => item.type === 'heating-coil').modulePath, null, '加热盘管不应开放仅适用于25W表冷器的专业模块');
const coilMessage = { protocol: 'p001-selection-result-v1', nonce: coilContext.nonce, result: {
  selector: 'coil', status: 'selected', model: 'φ9.52-STTL-4-2.5*2.2', source: '规范表',
  rule: { id: 'coil-standard-table-25w', version: '1.0.0+test' }, target: coilContext.target,
  workbenchSnapshot: coilContext.workbenchSnapshot, workbenchFingerprint: coilContext.workbenchFingerprint,
  input: { cabinetWidthMm: 2500, cabinetHeightMm: 2200, spec: '2225', series: '25W', installation: 'floor', rows: 4, tube: 9.52, header: 50 }, data: { status: 'selected', faceWidth: 2500, faceHeight: 2200, count: 1, thickness: 100 }, warnings: []
} };
assert.equal(verify(project, coilContext, coilMessage).ok, true);
assert.equal(verify(project, coilContext, { ...coilMessage, result: { ...coilMessage.result, input: { ...coilMessage.result.input, series: '50W' } } }).ok, false);
const heaterSegment = M.segmentTemplate('heating-coil');
unit.segments.push(heaterSegment);
const heaterContext = H.makeContext(project, unit, heaterSegment, 'nonce-heating-coil');
const coilAsHeater = structuredClone(coilMessage);
coilAsHeater.nonce = heaterContext.nonce;
coilAsHeater.result.target = heaterContext.target;
coilAsHeater.result.workbenchSnapshot = heaterContext.workbenchSnapshot;
coilAsHeater.result.workbenchFingerprint = heaterContext.workbenchFingerprint;
assert.equal(verify(project, heaterContext, coilAsHeater).ok, false, '25W表冷器结果不可写入加热盘管段');

const filterAsCoil = structuredClone(result);
filterAsCoil.result.target = coilContext.target;
filterAsCoil.result.workbenchSnapshot = coilContext.workbenchSnapshot;
filterAsCoil.result.workbenchFingerprint = coilContext.workbenchFingerprint;
assert.equal(verify(project, coilContext, filterAsCoil).ok, false);
const coilAsFilter = structuredClone(coilMessage);
coilAsFilter.nonce = context.nonce;
coilAsFilter.result.target = context.target;
coilAsFilter.result.workbenchSnapshot = context.workbenchSnapshot;
coilAsFilter.result.workbenchFingerprint = context.workbenchFingerprint;
coilAsFilter.result.input.cabinetWidthMm = context.workbenchSnapshot.cabinetWidth;
coilAsFilter.result.input.cabinetHeightMm = context.workbenchSnapshot.cabinetHeight;
coilAsFilter.result.input.spec = '2225';
assert.equal(verify(project, context, coilAsFilter).ok, false);
const missingSnapshot = structuredClone(result);
delete missingSnapshot.result.workbenchSnapshot;
assert.doesNotThrow(() => verify(project, context, missingSnapshot));
assert.equal(verify(project, context, missingSnapshot).ok, false);
const malformedWarnings = structuredClone(result);
malformedWarnings.result.warnings = 'bad';
assert.equal(verify(project, context, malformedWarnings).ok, false);
const corruptedArrangement = structuredClone(result);
corruptedArrangement.result.data.arrangement.width[0] = 6;
assert.equal(verify(project, context, corruptedArrangement).ok, false);
const changedDatabase = structuredClone(filterDatabase);
changedDatabase.arrangements.pull.height[22] = [4, 4, 5, 5, 5];
assert.equal(H.verify(project, context, result, { filterDatabase: changedDatabase }).ok, false, '当前数据库变化后不能接受基于旧排布规则的结果');
console.log('通过：类型隔离、输入快照、回传格式 fail-closed、选型数据复核、L2持久化和L1字段保护。');
