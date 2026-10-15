const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const compat = require('../js/prototype-airflow-compat.js');

assert.equal(compat.fromLegacy('26000 m³/h'), 26000);
assert.equal(compat.fromLegacy(' 26,000 m³/h '), 26000);
assert.equal(compat.fromLegacy('26000m3/h'), 26000);
assert.equal(compat.fromLegacy('26000'), 26000);
assert.equal(compat.fromLegacy(26000), 26000);
for (const value of ['', '未填写', '约26000 m³/h', '26000 / 18000 m³/h', '26000 m³/h（送风）', '-26000 m³/h', null, undefined, {}]) {
  assert.equal(compat.fromLegacy(value), null, `ambiguous/invalid legacy airflow must not parse: ${String(value)}`);
}
const legacyUnit = { airflow: '26000 m³/h' };
assert.equal(compat.resolve(legacyUnit), 26000);
assert.deepEqual(legacyUnit, { airflow: '26000 m³/h' }, 'fallback is read-only and must not migrate the source unit');
assert.equal(compat.resolve({ airflow: '26000 m³/h', designConditions: { airVolume: { value: '' } } }), '',
  'an explicitly present canonical field, including an empty value, must suppress the legacy fallback');
assert.equal(compat.resolve({ airflow: '约26000 m³/h' }), '', 'ambiguous legacy text remains blank in the UI');

const ui = fs.readFileSync(path.join(__dirname, '../js/prototype-project-ui.js'), 'utf8');
assert.ok(ui.includes("if (key === 'airVolume') return window.AHUPrototypeAirflowCompat?.resolve(unit) ?? ''"),
  'workbench reads airflow through the compatibility resolver');
const html = fs.readFileSync(path.resolve(__dirname, '../../../outputs/03-整机选型工作台/工业工作台_ThreeJS原型.html'), 'utf8');
assert.ok(html.indexOf('js/prototype-airflow-compat.js') < html.indexOf('js/prototype-project-ui.js'),
  'airflow compatibility helper must load before the workbench controller');

console.log('通过：旧 unit.airflow 仅解析明确单值；canonical 字段优先，模糊文本不导入。');
