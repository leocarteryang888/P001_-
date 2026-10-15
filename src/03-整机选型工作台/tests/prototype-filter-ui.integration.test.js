const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('../js/selection-handoff.js');
const A = require('../js/prototype-selection-handoff.js');

// Static entry-contract checks and adapter-level assertions, not a browser/VM
// execution of the UI controller. Real browser acceptance is recorded separately.
const uiSource = fs.readFileSync(path.join(__dirname, '../js/prototype-project-ui.js'), 'utf8');
for (const token of ['window.prototypeSelectionBridge', 'state.source !== \'shared\'', 'receiveFilter', 'event.origin === location.origin', 'selectionBusy']) {
  assert.ok(uiSource.includes(token), `prototype UI must retain ${token} guard`);
}
const projectUiSource=fs.readFileSync(path.join(__dirname,'../js/prototype-project-ui.js'),'utf8');
for (const token of ['data-action="copy-unit"', 'data-action="delete-unit"', 'data-action="confirm-delete-unit"', 'id="undoUnitDelete"', 'data-action="edit-info"', "document.addEventListener('dblclick'", "infoStage.click()", "stage.dataset.stage !== '功能段配置'", "section?.confirmed === true"]) {
  assert.ok(projectUiSource.includes(token), `project/unit interaction must retain ${token}`);
}
assert.ok(!projectUiSource.includes('window.confirm(`删除机组'), 'unit deletion must use in-page confirmation, not a blocking browser dialog');
for(const token of ['listFaceSectionCandidates','calculateCoilFaceVelocity','calculateNominalFaceVelocity','data-section-confirm','manual-candidate-confirmation','sourceRecommendedFlag','invalidateUnitSections(current,\'箱体截面修改，旧专业结果失效\')','persistActiveUnit()'])assert.ok(projectUiSource.includes(token),`section candidate UI must retain ${token}`);
assert.ok(projectUiSource.includes('超出当前 ${min}–${max} m/s 筛选范围，请复核；截面未自动更换'),'airflow updates must warn without silently changing the selected section');
assert.ok(projectUiSource.includes('未选择 / 手工输入待确认'),'an unselected section must not be labeled as a WK candidate');
assert.ok(projectUiSource.includes("if (source !== 'manual' && source !== 'WK-无框架式盘管有效迎风尺寸候选') return '截面未确认，暂不计算风速。'"),'orphan dimensions must not be treated as a confirmed section for velocity display');
assert.ok(projectUiSource.includes("selection.confirmed !== false && (selection.confirmed === true || selection.status === 'user-confirmed')"),'section display must distinguish an invalidated selection from a confirmed one');
assert.ok(projectUiSource.includes("unit.cabinetSelection = { ...unit.cabinetSelection, confirmed: false, status: 'invalidated'"),'direct box-dimension edits must invalidate saved section confirmation metadata');
assert.ok(projectUiSource.includes("selected?.status === 'invalidated' ? '机组宽高已改变；原截面与候选确认已失效，请重新选中并确认。'"),'the dialog must warn that the previous confirmed section became invalid');
assert.ok(projectUiSource.includes('persistActiveUnit(); renderSegments(); renderOutputs(); renderView(); renderUnitOverview();'),'dimension edits must persist current unit state and refresh its visible workbench views');
assert.ok(projectUiSource.includes('isConfirmed&&selection.source===\'WK-无框架式盘管有效迎风尺寸候选\''),'invalidated candidate metadata must not be preselected as a confirmed section');
assert.ok(projectUiSource.includes("dialog.querySelector('[data-section-mode][value=\"candidate\"]').checked=true"),'selecting a candidate row must switch confirmation mode back to candidate');
assert.ok(projectUiSource.includes('送风量待填，名义截面风速示值未计算'),'manual nonstandard section confirmation must tolerate missing airflow');
assert.match(projectUiSource,/const nominalFaceVelocityMps=airVolume>0\?window\.CoilSelector\.calculateNominalFaceVelocity\([\s\S]*?\)\.nominalFaceVelocityMps:null;/,'manual dimensions may be confirmed without airflow and must not call the velocity calculator with an empty/zero flow');
assert.ok(projectUiSource.includes("meta={source:'manual',status:'user-confirmed',method:'manual-nonstandard',nominalFaceVelocityMps}"),'manual confirmation stores a null velocity when airflow is absent instead of throwing');
const finalHtml=fs.readFileSync(path.resolve(__dirname,'../../../outputs/03-整机选型工作台/工业工作台_ThreeJS原型.html'),'utf8');
assert.ok(finalHtml.indexOf('data/coil-section-database.js')<finalHtml.indexOf('js/coil-selector.js'),'workbench must load section source data before the specialist selector');
assert.ok(!projectUiSource.includes('标准截面列表尚未导入'),'obsolete no-candidate placeholder must be removed');
const project = { projectId: 'p-ui-1', code: 'P-UI', units: [] };
const unit = { unitId: 'u-ui-1', no: 'AHU-UI', designConditions: { cabinetWidth: { value: 2000 }, cabinetHeight: { value: 1800 } }, segments: [] };
const segment = { id: 's-ui-1', type: 'medium', sourceType: 'medium' };
unit.segments.push(segment); project.units.push(unit);
const context = A.begin(project, unit, segment, 'ui-nonce-1');
assert.equal(context.target.projectId, project.projectId);
assert.equal(context.target.unitId, unit.unitId);
assert.equal(context.target.segmentType, 'medium-filter');
assert.equal(H.fingerprint(context.workbenchSnapshot), context.workbenchFingerprint);
assert.throws(() => A.begin({ code: 'unstable' }, unit, segment, 'bad'), /稳定标识/);
assert.throws(() => A.begin(project, { unitId: 'u-ui-1', designConditions: {} }, segment, 'bad'), /真实箱体/);
// A rejected/stale result must not mutate the live flat segment.
const before = JSON.stringify(segment);
assert.equal(A.verify(project, unit, segment, context, { protocol: 'p001-selection-result-v1', nonce: 'wrong' }).ok, false);
assert.equal(JSON.stringify(segment), before);
console.log('通过：过滤器入口静态保护契约、适配层稳定 ID 与拒收不修改段数据；不代表浏览器交互验收。');
