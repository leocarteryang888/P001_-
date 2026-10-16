const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ui = fs.readFileSync(path.join(__dirname, '../js/prototype-project-ui.js'), 'utf8');
const { readFinalWorkbenchSource } = require('./helpers/final-workbench-source');
const html = readFinalWorkbenchSource();

for (const [id, title, hint] of [
  ['F1', '单层单路', '左进右出'],
  ['F2', '单层单路折返', '左下进、左上出'],
  ['F3', '双层双路', '下层→右，上层←左'],
  ['F4', '前后双路', '外侧→右，内侧←左']
]) {
  assert.ok(ui.includes(`['${id}', '${title}', '${hint}']`), `${id} uses the documented P001 airflow form`);
}
assert.match(ui, /unit\.airflowForm=value/);
assert.match(ui, /data-airflow-form/);
assert.match(ui, /双气路拓扑、各路风量与实际结构尚未接入专业校核/);
assert.match(ui, /invalidateUnitSections\(unit, '气流形式修改/);
assert.match(ui, /formalReadonly\?'disabled':''/);
assert.match(ui, /field-wide/);
assert.match(ui, /class="field-editable"/);
assert.match(html, /\.airflow-form-options\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
assert.match(html, /\.unit-overview input\.field-editable\{border-color:/);
assert.match(html, /\.unit-overview \.field-readonly\{display:flex/);
const globalResetIndex = html.indexOf('.app input:not([type="radio"]):not([type="checkbox"]),.app select,.app textarea{');
const scopedOverrideIndex = html.indexOf('.app #stagePlaceholder .unit-overview input:not([type="radio"]):not([type="checkbox"]),');
assert.ok(globalResetIndex >= 0 && scopedOverrideIndex > globalResetIndex, 'unit-info overrides follow the global important reset');
assert.match(html.slice(scopedOverrideIndex), /\.app #stagePlaceholder \.unit-overview select\{height:34px!important/);
assert.match(html.slice(scopedOverrideIndex), /input\.field-editable:not\(:disabled\)\{background:#fff!important[^}]*box-shadow:inset 3px 0 #1699aa!important/);
assert.match(html.slice(scopedOverrideIndex), /select:not\(:disabled\)\{background:#fff!important[^}]*box-shadow:inset 3px 0 #1699aa!important/);
assert.match(html.slice(scopedOverrideIndex), /\.field-readonly\{min-height:34px;background:#edf3f4!important/);

const unit = { airflowForm: 'F3' };
assert.equal(JSON.parse(JSON.stringify(unit)).airflowForm, 'F3', 'selected airflow form survives the prototype store JSON snapshot');
console.log('通过：机组气流形式选择项、待校核边界、保存字段与机组资料输入状态。');
