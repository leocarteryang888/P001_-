const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const uiSource = fs.readFileSync(path.join(__dirname, '../js/prototype-project-ui.js'), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(__dirname, '../js/prototype-workbench-bootstrap.js'), 'utf8');
const gateBody = uiSource.match(/function onConfirmSegmentFields\(event\) \{([\s\S]*?)\}\n  window\.onConfirmSegmentFields/);
const persistBody = uiSource.match(/function commitConfirmedSegment\(event\) \{([\s\S]*?)\n  \}\n  \$\('confirmSegment'\)\.addEventListener\('click', commitConfirmedSegment\)/);
const baseBody = bootstrapSource.match(/\$\('confirmSegment'\)\.addEventListener\('click',\(\)=>\{([\s\S]*?)\}\);/);
assert(gateBody && persistBody && baseBody, 'actual confirmation gate, base confirm and auto-save callbacks are extractable');

function button() {
  const captures = [], bubbles = [];
  return {
    addEventListener(type, fn, capture) { if (type === 'click') (capture ? captures : bubbles).push(fn); },
    click() { const event = { defaultPrevented: false, preventDefault(){this.defaultPrevented=true;}, stopImmediatePropagation(){this.stopped=true;} }; for (const fn of captures) { fn(event); if (event.stopped) return event; } for (const fn of bubbles) { fn(event); if (event.stopped) break; } return event; }
  };
}

function fixture({ fail = false, initiallyConfirmed = false } = {}) {
  const unit = { unitId: 'u1', no: 'V-BJ2609-F6-001', segments: [{ id: 's1', name: '新风段', length: 800, source: 'manual-confirmed', confirmed: initiallyConfirmed, interface: { output: { manual: { source: 'manual-confirmed' } } } }] };
  const project = { projectId: 'p1', code: 'BJ-2610-001', units: [unit] }, projects = [project], selectedId = 's1';
  let segments = unit.segments, baseline = JSON.stringify(projects), projectSaveBusy = false, saveCalls = 0, rendered = 0;
  const state = { source: 'shared' }, inputNotice = { textContent: '' }, noticeMessages = [];
  const grid = { querySelectorAll: () => [] }, $ = id => id === 'inputGrid' ? grid : id === 'inputNotice' ? inputNotice : { textContent: '' };
  const window = { AHUPrototypeSegmentFields: { typeOf: () => 'manual', validateManualField: () => ({ valid: true }) } };
  const store = { save: async data => { saveCalls++; if (fail && saveCalls === 1) throw new Error('模拟409'); return { projects: structuredClone(data), revision: 2 }; } };
  const persistActiveUnit = () => { projects[0].units[0].segments = structuredClone(segments); };
  const loadPrototypeUnit = () => { segments = projects[0].units[0].segments; };
  const renderAll = () => { rendered++; };
  const refreshStoreNotice = () => {};
  const notice = (text, error) => noticeMessages.push({ text, error });
  const factory = new Function('segments','selectedId','$','window','formalReadonly','projectSaveBusy','notice','projects','baseline','state','store','persistActiveUnit','loadPrototypeUnit','renderAll','refreshStoreNotice','renderSegments','renderOutputs','getSaveCalls','selectedProject','selectedUnit','newProjectMode','pendingNewUnit','setTimeout', `
    const gate=event=>{${gateBody[1]}};
    const commit=event=>{${persistBody[1]}};
    const base=()=>{${baseBody[1]}};
    return {gate,commit,base,get state(){return {segments,baseline,projectSaveBusy,saveCalls:getSaveCalls()};},setBusy(value){projectSaveBusy=value;}};
  `);
  const handlers = factory(segments, selectedId, $, window, false, projectSaveBusy, notice, projects, baseline, state, store, persistActiveUnit, loadPrototypeUnit, renderAll, refreshStoreNotice, () => rendered++, () => rendered++, () => saveCalls, 0, 0, false, null, globalThis.setTimeout);
  const target = button(); target.addEventListener('click', handlers.base); target.addEventListener('click', handlers.gate, true); target.addEventListener('click', handlers.commit);
  return { target, handlers, projects, get baseline(){return baseline;}, get saveCalls(){return saveCalls;}, get rendered(){return rendered;}, noticeMessages, unit };
}

(async () => {
  const saved = fixture();
  saved.target.click(); await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(saved.saveCalls, 1, 'successful segment confirmation immediately commits through the actual save callback');
  assert.equal(saved.projects[0].units[0].segments[0].confirmed, true); assert.equal(saved.handlers.state.baseline, JSON.stringify(saved.projects));

  const failed = fixture({ fail: true });
  failed.target.click(); await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(failed.saveCalls, 1); assert.equal(failed.projects[0].units[0].segments[0].confirmed, true, 'save failure keeps the confirmed segment and inputs available');
  assert.notEqual(failed.handlers.state.baseline, JSON.stringify(failed.projects));
  failed.target.click(); await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(failed.saveCalls, 2, 'a repeated confirmation retries without losing the edited values'); assert.equal(failed.handlers.state.baseline, JSON.stringify(failed.projects));

  const unchanged = fixture({ initiallyConfirmed: true });
  unchanged.target.click(); await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(unchanged.saveCalls, 0, 'viewing or confirming unchanged segment data does not create a new save revision');
  assert.equal(unchanged.handlers.state.baseline, unchanged.baseline);
  console.log('PASS actual confirmation click persists once after valid input, preserves values on failed save for retry, and leaves unchanged viewing alone.');
})().catch(error => { console.error(error); process.exitCode = 1; });
