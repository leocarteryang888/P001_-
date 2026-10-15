const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../js/project-model.js');
const H = require('../js/selection-handoff.js');

class Element {
  constructor(id = '') { this.id = id; this.value = ''; this.options = []; this.listeners = {}; this.style = {}; this.classList = { add() {}, remove() {}, toggle() {} }; this.hidden = false; this.checked = false; }
  add(option) { this.options.push(option); if (!this.value) this.value = option.value; }
  replaceChildren() { this.options = []; this.value = ''; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
}

const project = M.createProject();
const unit = M.activeUnit(project);
unit.designConditions.cabinetWidth.value = 2000;
unit.designConditions.cabinetHeight.value = 1800;
let segment = unit.segments.find(item => item.type === 'medium-filter');
if (!segment) { segment = M.segmentTemplate('medium-filter'); unit.segments.push(segment); }
project.segments = unit.segments;
const context = H.makeContext(project, unit, segment, 'integration-filter-f300');
const storageMap = new Map();
const elements = new Map();
const getElement = id => { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); };
const modeButtons = ['pull', 'frame'].map(mode => { const button = new Element(); button.dataset = { mode }; return button; });
let domReady;
const document = {
  getElementById: getElement,
  addEventListener(name, callback) { if (name === 'DOMContentLoaded') domReady = callback; },
  querySelectorAll(selector) { return selector === '[data-mode]' ? modeButtons : []; }
};
const window = {
  FilterDatabase: undefined,
  localStorage: {
    getItem(key) { return storageMap.get(key) ?? null; },
    setItem(key, value) { storageMap.set(key, String(value)); },
    removeItem(key) { storageMap.delete(key); }
  },
  opener: null
};
const location = { search: `?p001Handoff=${encodeURIComponent(encodeURIComponent(JSON.stringify(context)))}`, origin: 'http://127.0.0.1:8765' };
const sandbox = { window, document, location, localStorage: window.localStorage, URLSearchParams, Option: function Option(text, value) { this.text = text; this.value = String(value); }, console, URL };
vm.createContext(sandbox);
const moduleRoot = path.resolve(__dirname, '../../01-过滤器选型');
vm.runInContext(fs.readFileSync(path.join(moduleRoot, 'data/filter-database.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(moduleRoot, 'js/filter-selector.js'), 'utf8'), sandbox);
domReady();

assert.equal(getElement('filterType').value, 'f_300', '中效段应默认限制并选择 F300');
assert.equal(getElement('widthModule').value, '20');
assert.equal(getElement('heightModule').value, '18');
getElement('confirmFilterCriteria').checked = true;
getElement('confirmFilterCriteria').listeners.change();
assert.equal(getElement('applyToWorkbench').disabled, false);
getElement('applyToWorkbench').listeners.click();
assert.ok(storageMap.has(H.resultKey(context.nonce)), `专业子页未生成消息：${getElement('handoffStatus').textContent}`);
const message = JSON.parse(storageMap.get(H.resultKey(context.nonce)));
assert.equal(message.result.input.typeId, 'f_300');
assert.deepEqual(Array.from(message.result.data.arrangement.height), [5, 5, 6]);
const verified = H.verify(project, context, message, { filterDatabase: window.FilterDatabase });
assert.equal(verified.ok, true, verified.reason);
assert.equal(H.apply(project, verified), true);
const reopened = M.normalizeProject(JSON.parse(JSON.stringify(project)));
const reopenedSegment = reopened.segments.find(item => item.id === segment.id);
assert.equal(reopenedSegment.interface.selection.professionalResult.input.typeId, 'f_300');
assert.equal(reopenedSegment.interface.output.automatedSelection.result.arrangement.total, 12);
console.log('通过：正式过滤器子页 F300 的真实输出可被工作台回收、应用，并在序列化重开后保留。');
