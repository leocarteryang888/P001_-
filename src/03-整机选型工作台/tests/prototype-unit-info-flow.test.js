const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const validator = require('../js/prototype-unit-info-validator.js');
const weather = require('../js/prototype-weather.js');
const airflow = require('../js/prototype-airflow-compat.js');
const handoff = require('../js/prototype-selection-handoff.js');
const source = fs.readFileSync(path.join(__dirname, '../js/prototype-project-ui.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../../../outputs/03-整机选型工作台/工业工作台_ThreeJS原型.html'), 'utf8');
// Extract complete actual declarations with brace, comment and literal tracking.
// Regex locates a declaration only; it never determines a function's end.
function declaration(name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert(match, `Missing actual declaration: ${name}`);
  const open = source.indexOf('{', match.index);
  return source.slice(match.index, open) + blockAt(open);
}
function blockAt(open, text = source) {
  let depth = 0, quote = null, comment = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (comment === 'line') { if (c === '\n') comment = null; continue; }
    if (comment === 'block') { if (c === '*' && next === '/') { comment = null; i++; } continue; }
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '/' && next === '/') { comment = 'line'; i++; continue; }
    if (c === '/' && next === '*') { comment = 'block'; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{') depth++;
    if (c === '}' && --depth === 0) return text.slice(open, i + 1);
  }
  throw new Error(`Unclosed source block at ${open}`);
}
const extraHelpers = ['validateUnitIdentityInput', 'guardPrototypeSave', 'homePendingGuard'].filter(name => new RegExp(`function\\s+${name}\\s*\\(`).test(source));
const code = [...extraHelpers, 'conditionValue', 'weatherSnapshot', 'unitInfoErrorTarget', 'showUnitInfoValidation', 'collectUnitInfoValidationInput', 'validateAndConfirmUnitInfo', 'onUnitInfoStageGate'].map(declaration).join('\n');
const clone = x => JSON.parse(JSON.stringify(x));
const weatherKeys = ['winterAirConditioningTemperature', 'winterAirConditioningRH', 'summerAirConditioningDryBulb', 'summerAirConditioningWetBulb'];
function node(dataset, value = '') {
  return { dataset, value, validity: { badInput: false }, attrs: {}, disabled: false, checked: true,
    setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, focus() { this.focused = true; }, scrollIntoView() { this.scrolled = true; },
    closest(s) { return s === '[data-verify-unit]' && 'verifyUnit' in this.dataset ? this : s === '.stage' && this.dataset.stage ? this : null; } };
}
function host(nodes) {
  function matches(n, s) {
    if (s === 'input') return !('openSection' in n.dataset);
    if (s === '[aria-invalid="true"]') return n.attrs['aria-invalid'] === 'true';
    const m = /^\[([\w-]+)(?:="([^"]*)")?\](:checked)?$/.exec(s);
    if (!m) return false;
    const k = m[1].replace(/^data-/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    return k in n.dataset && (m[2] === undefined || n.dataset[k] === m[2]) && (!m[3] || n.checked);
  }
  return { querySelector(s) { return nodes.find(n => s.split(',').some(p => matches(n, p.trim()))) || null; }, querySelectorAll(s) { return nodes.filter(n => s.split(',').some(p => matches(n, p.trim()))); } };
}
function fixture({ emptyHost = false, save, readonly = false } = {}) {
  const unit = { airflowForm: 'F1', designConditions: { freshAirVolume: { value: 0 }, airVolume: { value: 100 }, externalPressure: { value: 0 } }, cabinetSelection: { confirmed: true, status: 'confirmed', source: 'WK', width: { value: 1000 }, height: { value: 1200 } }, segments: [] };
  const nodes = [node({ overviewField: 'freshAirVolume' }, '0'), node({ overviewField: 'airVolume' }, '100'), node({ overviewField: 'externalPressure' }, '0'), ...['returnAirVolume', 'exhaustAirVolume', 'exhaustExternalPressure'].map(k => node({ overviewField: k })), node({ unitMeta: 'cabinetSeries' }, '25W'), node({ airflowForm: '' }, 'F1'), node({ openSection: '' }), ...weatherKeys.map((k, i) => node({ weatherOverride: k }, ['-5', '0', '30', '20'][i]))];
  const timers = [];
  const overviewHost = host(emptyHost ? [] : nodes), button = node({ verifyUnit: '' }), notice = { textContent: '' }, workspace = { hidden: false }, stageInfo = { click() { this.clicked = true; timers.push(() => ctx.renderUnitOverview()); } };
  let calls = 0, refreshes = 0;
  const ctx = { projects: [{ units: [unit], weatherOverride: Object.fromEntries(weatherKeys.map((k, i) => [k, { value: [-5, 0, 30, 20][i] }])) }], selectedProject: 0, selectedUnit: 0, pendingNewUnit: null, newUnitConfirmationAuthorized: false, segments: [], A: handoff, overviewHost, formalReadonly: readonly, projectSaveBusy: false, setTimeout(fn) { timers.push(fn); },
    window: { AHUPrototypeUnitInfoValidator: validator, AHUPrototypeWeather: weather, AHUPrototypeAirflowCompat: airflow, setTimeout(fn) { timers.push(fn); } }, document: { body: { inert: false }, querySelector() { return stageInfo; } },
    $(id) { return id === 'workspace' ? workspace : notice; }, persistActiveUnit() {}, renderUnitOverview() {}, refreshStoreNotice() { refreshes++; }, store: { async save(candidate) { calls++; return save ? save(candidate) : { projects: clone(candidate), revision: 2 }; } } };
  ctx.baseline = JSON.stringify(ctx.projects); vm.createContext(ctx); vm.runInContext(code, ctx, { filename: 'actual-prototype-project-ui-functions.js' });
  return { ctx, unit, nodes, button, notice, workspace, stageInfo, flushTimers() { while(timers.length) timers.shift()(); }, field(k) { return nodes.find(n => Object.values(n.dataset).includes(k)); }, get calls() { return calls; }, get refreshes() { return refreshes; }, click() { return ctx.validateAndConfirmUnitInfo({ target: button }); } };
}
const tests = [], test = (name, run) => tests.push({ name, run });
test('actual DOM preserves zero, defaults 25W and flattens section objects', () => {
  const f = fixture(), input = f.ctx.collectUnitInfoValidationInput(f.unit);
  assert.equal(input.freshAirVolume, '0'); assert.equal(input.externalPressure, '0'); assert.equal(input.weather.winterRh, '0'); assert.equal(input.cabinetSeries, '25W'); assert.equal(input.cabinetSelection.width, 1000); assert.equal(input.cabinetSelection.height, 1200); assert.equal(validator.validate(input).valid, true);
});
test('badInput weather fields map to canonical validator keys', () => {
  for (const [i, canonical] of ['winterDry', 'winterRh', 'summerDry', 'summerWet'].entries()) { const f = fixture(); f.field(weatherKeys[i]).validity.badInput = true; assert(f.ctx.collectUnitInfoValidationInput(f.unit).invalidFields.includes(canonical), `weather badInput must map to ${canonical}`); }
});
test('negative optional input rejects save and marks its own node', async () => {
  const f = fixture(); f.field('returnAirVolume').value = '-1'; await f.click(); assert.equal(f.calls, 0); assert.equal(f.field('returnAirVolume').attrs['aria-invalid'], 'true'); assert.equal(f.field('airVolume').attrs['aria-invalid'], undefined);
});
test('missing required input does not save', async () => { const f = fixture(); f.field('airVolume').value = ''; await f.click(); assert.equal(f.calls, 0); assert.match(f.notice.textContent, /送风量/); });
test('valid confirmation awaits one save and commits only afterward', async () => {
  let resolve; const pending = new Promise(r => { resolve = r; }), f = fixture({ save: () => pending }), before = f.ctx.baseline;
  const task = f.click(); assert.equal(f.calls, 1); assert.equal(f.button.disabled, true); assert.equal(f.ctx.document.body.inert, true); assert.equal(f.ctx.baseline, before); assert.equal(f.refreshes, 0);
  const saved = clone(f.ctx.projects); saved[0].savedRevision = 2; resolve({ projects: saved }); await task;
  assert.equal(f.calls, 1); assert.equal(f.refreshes, 1); assert.equal(f.ctx.projects[0].savedRevision, 2); assert.equal(f.ctx.baseline, JSON.stringify(saved)); assert.equal(f.button.disabled, false); assert.equal(f.ctx.document.body.inert, false); assert.match(f.notice.textContent, /验证通过并保存/);
});
test('busy concurrent clicks invoke store.save exactly once', async () => {
  let resolve; const f = fixture({ save: candidate => new Promise(r => { resolve = () => r({ projects: clone(candidate) }); }) }), first = f.click(), second = f.click(); assert.equal(f.calls, 1); resolve(); await Promise.all([first, second]); assert.equal(f.calls, 1);
});
test('CAS 409 preserves projects, baseline and input', async () => {
  const f = fixture({ save: async () => { const e = new Error('409 revision conflict'); e.status = 409; throw e; } }); f.field('airVolume').value = '123'; const before = JSON.stringify(f.ctx.projects), baseline = f.ctx.baseline;
  await f.click(); assert.equal(f.calls, 1); assert.equal(JSON.stringify(f.ctx.projects), before); assert.equal(f.ctx.baseline, baseline); assert.equal(f.field('airVolume').value, '123'); assert.match(f.notice.textContent, /409/); assert.equal(f.ctx.projectSaveBusy, false);
});
test('formal readonly confirmation refuses persistence', async () => { const f = fixture({ readonly: true }); await f.click(); assert.equal(f.calls, 0); });
test('successful validation clears previous invalid field markers', async () => { const f = fixture(); f.field('airVolume').value = ''; await f.click(); assert.equal(f.field('airVolume').attrs['aria-invalid'], 'true'); f.field('airVolume').value = '100'; await f.click(); assert.equal(f.calls, 1); assert.equal(f.nodes.filter(n => n.attrs['aria-invalid'] === 'true').length, 0); });
test('save race preserves new editing instead of replacing it with returned snapshot', async () => { let resolve; const f = fixture({ save: candidate => new Promise(r => { resolve = () => r({ projects: clone(candidate) }); }) }), before = f.ctx.baseline, task = f.click(); f.unit.designConditions.airVolume.value = 777; resolve(); await task; assert.equal(f.ctx.projects[0].units[0].designConditions.airVolume.value, 777); assert.equal(f.ctx.baseline, before); assert.match(f.notice.textContent, /编辑已变化/); });
test('successful save commits the actual validated DOM values rather than stale model', async () => {
  let saved; const f = fixture({ save: async candidate => { saved = clone(candidate); return { projects: clone(candidate) }; } });
  f.field('airVolume').value = '123'; f.field(weatherKeys[0]).value = '-8'; await f.click();
  assert.equal(f.calls, 1); assert.equal(saved[0].units[0].designConditions.airVolume.value, 123); assert.equal(saved[0].units[0].weatherOverride[weatherKeys[0]].value, -8);
  assert.equal(f.ctx.projects[0].units[0].designConditions.airVolume.value, 123);
});
test('save records default cabinet series without inventing unchanged weather overrides', async () => { const f = fixture(); await f.click(); assert.equal(f.ctx.projects[0].units[0].cabinetSeries, '25W'); assert.equal(f.ctx.projects[0].units[0].weatherOverride, undefined); });
test('validated DOM commit preserves field metadata and weather extensions', async () => { const f = fixture(); Object.assign(f.unit.designConditions.airVolume, { unit: 'm³/h', extension: { note: 'retain' } }); f.unit.weatherOverride = { customExtension: { value: 'retain' } }; f.field('airVolume').value = '123'; f.field(weatherKeys[0]).value = '-8'; await f.click(); const unit = f.ctx.projects[0].units[0]; assert.equal(unit.designConditions.airVolume.unit, 'm³/h'); assert.equal(unit.designConditions.airVolume.extension.note, 'retain'); assert.equal(unit.weatherOverride.customExtension.value, 'retain'); });
test('blank optional fields remain blank rather than converting to zero', async () => { const f = fixture(); await f.click(); for (const k of ['returnAirVolume', 'exhaustAirVolume', 'exhaustExternalPressure']) assert.notEqual(f.ctx.projects[0].units[0].designConditions[k]?.value, 0); });
test('DOM-only airflow form edits are committed', async () => { const f = fixture(); f.nodes.find(n => 'airflowForm' in n.dataset).value = 'F3'; await f.click(); assert.equal(f.ctx.projects[0].units[0].airflowForm, 'F3'); });
function professionalFixture(options) { const f = fixture(options); f.unit.segments = [{ id: 'segment-1', model: 'filter-old', confirmed: true, interface: { selection: { professionalResult: { selector: 'filter', rule: { id: 'rule' } } }, calculation: { professionalRule: {} }, output: { automatedSelection: {} } } }]; f.ctx.segments = clone(f.unit.segments); f.ctx.baseline = JSON.stringify(f.ctx.projects); return f; }
test('DOM-only edits invalidate professional results in candidate and sync active segments after save', async () => { const f = professionalFixture(); f.field('airVolume').value = '123'; await f.click(); const segment = f.ctx.projects[0].units[0].segments[0]; assert.equal(segment.interface.selection.professionalResult, undefined); assert.equal(segment.professionalHistory.length, 1); assert.equal(segment.confirmed, false); assert.equal(JSON.stringify(f.ctx.segments), JSON.stringify(f.ctx.projects[0].units[0].segments)); assert.match(f.notice.textContent, /验证通过并保存/); assert.equal(f.ctx.baseline, JSON.stringify(f.ctx.projects)); });
test('failed DOM candidate save preserves original professional result and active segments', async () => { const f = professionalFixture({ save: async () => { throw new Error('409'); } }); const before = JSON.stringify(f.ctx.projects), segmentBefore = JSON.stringify(f.ctx.segments), baseline = f.ctx.baseline; f.field('airVolume').value = '123'; await f.click(); assert.equal(JSON.stringify(f.ctx.projects), before); assert.equal(JSON.stringify(f.ctx.segments), segmentBefore); assert.equal(f.ctx.baseline, baseline); assert.equal(f.field('airVolume').value, '123'); });
test('all numeric, weather, airflow and cabinet edits invalidate main and branch results', async () => {
  for (const [key, value] of [['freshAirVolume','10'], ['returnAirVolume','50'], ['exhaustAirVolume','50'], ['exhaustExternalPressure','10'], [weatherKeys[0],'-8'], ['cabinetSeries','50W'], ['airflowForm','F2']]) { const f = professionalFixture(); f.unit.airflowBranches = [{ segments: clone(f.unit.segments) }]; const n = key === 'airflowForm' ? f.nodes.find(n => 'airflowForm' in n.dataset) : f.field(key); n.value = value; await f.click(); const unit = f.ctx.projects[0].units[0]; assert.equal(unit.segments[0].interface.selection.professionalResult, undefined, key); assert.equal(unit.airflowBranches[0].segments[0].interface.selection.professionalResult, undefined, `branch ${key}`); }
});
test('unchanged validation preserves professional results and history', async () => { const f = professionalFixture(); await f.click(); const segment = f.ctx.projects[0].units[0].segments[0]; assert.equal(segment.interface.selection.professionalResult.selector, 'filter'); assert.equal(segment.professionalHistory, undefined); });
function gate(f) { const e = { target: node({ stage: '功能段配置' }), preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } }; f.ctx.onUnitInfoStageGate(e); return e; }
test('stage gate rejects missing input despite confirmed section', () => { const f = fixture(); f.field('airVolume').value = ''; const e = gate(f); assert.equal(e.prevented, true); assert.equal(e.stopped, true); assert.equal(f.stageInfo.clicked, true); assert.equal(f.calls, 0); });
test('hidden workspace does not activate navigation gate', () => { const f = fixture(); f.workspace.hidden = true; f.field('airVolume').value = ''; const e = gate(f); assert.equal(e.prevented, undefined); assert.equal(e.stopped, undefined); });
test('busy persistence blocks stage navigation', () => { const f = fixture(); f.ctx.projectSaveBusy = true; const e = gate(f); assert.equal(e.prevented, true); assert.equal(e.stopped, true); });
test('stage error survives the scheduled overview renderer', () => { const f = fixture(); f.ctx.renderUnitOverview = () => { f.notice.textContent = ''; f.nodes.forEach(n => n.removeAttribute('aria-invalid')); }; f.field('airVolume').value = ''; gate(f); f.flushTimers(); assert.match(f.notice.textContent, /送风量/); assert.equal(f.field('airVolume').attrs['aria-invalid'], 'true'); });
test('empty host falls back to real model and effective weather', () => {
  const f = fixture({ emptyHost: true }), input = f.ctx.collectUnitInfoValidationInput(f.unit, f.ctx.overviewHost); assert.equal(input.airVolume, 100); assert.equal(input.freshAirVolume, 0); assert.equal(input.cabinetSeries, '25W'); assert.equal(input.weather.winterRh, 0); assert.equal(input.weather.winterDry, -5); assert.equal(validator.validate(input).valid, true); const e = gate(f); assert.equal(e.prevented, undefined); assert.equal(e.stopped, undefined); assert.equal(f.calls, 0);
});
test('each error maps to its own field and clears stale markers', () => {
  const f = fixture(), fields = ['freshAirVolume', 'airVolume', 'externalPressure', 'returnAirVolume', 'exhaustAirVolume', 'exhaustExternalPressure', 'cabinetSeries', 'winterDry', 'winterRh', 'summerDry', 'summerWet', 'cabinetSelection', 'airflowForm'];
  fields.forEach(k => { const expected = k === 'cabinetSelection' ? f.nodes.find(n => 'openSection' in n.dataset) : k === 'airflowForm' ? f.nodes.find(n => 'airflowForm' in n.dataset) : f.field(({ winterDry: weatherKeys[0], winterRh: weatherKeys[1], summerDry: weatherKeys[2], summerWet: weatherKeys[3] })[k] || k); assert.equal(f.ctx.unitInfoErrorTarget(f.ctx.overviewHost, k), expected, k); f.ctx.showUnitInfoValidation({ errors: [{ field: k, message: k }] }, f.ctx.overviewHost, f.notice); assert.equal(expected.attrs['aria-invalid'], 'true'); assert.equal(f.nodes.filter(n => n.attrs['aria-invalid'] === 'true').length, 1); assert.equal(expected.focused, true); });
});
test('missing validator fails closed for confirm and gate', async () => { const f = fixture(); delete f.ctx.window.AHUPrototypeUnitInfoValidator; await f.click(); assert.equal(f.calls, 0); assert.match(f.notice.textContent, /验证器未加载/); const e = gate(f); assert.equal(e.prevented, true); assert.equal(e.stopped, true); f.flushTimers(); assert.match(f.notice.textContent, /验证器未加载/); });
test('entry loads validator before UI and binds named listeners once', () => {
  const vi = html.indexOf('prototype-unit-info-validator.js'), ui = html.indexOf('prototype-project-ui.js'); assert(vi >= 0 && vi < ui);
  assert.equal(source.split("overviewHost.addEventListener('click', validateAndConfirmUnitInfo, true)").length - 1, 1); assert.equal(source.split("document.addEventListener('click', onUnitInfoStageGate, true)").length - 1, 1); assert.equal((source.match(/overviewHost\.addEventListener\('click',\s*async\s+event\s*=>/g) || []).length, 0);
});
test('static readonly metadata select contract disables cabinet and installation', () => {
  const card = source.slice(source.indexOf('const cabinetCard ='), source.indexOf('const weatherCard ='));
  for (const key of ['cabinetSeries', 'installationLocation']) assert.match(card, new RegExp(`<select data-unit-meta="${key}"[^>]*\\$\\{formalReadonly\\?'disabled':''\\}`), key);
});
test('static radio CSS keeps 14px controls outside 34px field cascade', () => {
  assert.match(html, /\.airflow-form-option input\{[^}]*width:14px;[^}]*height:14px/);
  assert.match(html, /\.app #stagePlaceholder \.unit-overview input:not\(\[type="radio"\]\):not\(\[type="checkbox"\]\),\s*\.app #stagePlaceholder \.unit-overview select\{height:34px!important/);
});
module.exports = { fixture, declaration, blockAt, source, clone, node, weatherKeys };
if (require.main === module) (async () => { let failed = 0; for (const t of tests) { try { await t.run(); console.log(`PASS ${t.name}`); } catch (e) { failed++; console.error(`FAIL ${t.name}\n${e.stack}`); } } console.log(`UI checks: ${tests.length - 3} actual function behavior cases + 3 static contracts; ${tests.length - failed} passed, ${failed} failed. Fake DOM/store only; no browser visual verification.`); if (failed) process.exitCode = 1; })();
