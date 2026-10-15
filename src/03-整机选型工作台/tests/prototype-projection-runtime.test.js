const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const htmlPath = path.join(__dirname, '../../../outputs/03-整机选型工作台/工业工作台_ThreeJS原型.html');
const source = fs.readFileSync(htmlPath, 'utf8');
const uiSource = fs.readFileSync(path.join(__dirname, '../js/prototype-project-ui.js'), 'utf8');

function blockAt(open, text = source) {
  let depth = 0;
  let quote = null;
  let comment = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
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

function declaration(name, text = source) {
  const match = new RegExp(`function\\s+${name}\\s*\\(`).exec(text);
  assert(match, `Missing actual inline declaration: ${name}`);
  const open = text.indexOf('{', match.index);
  return text.slice(match.index, open) + blockAt(open, text);
}

const interfaceDefaults = {
  fresh: ['新风入口', '左端', 900, 700], return: ['回风入口', '上方', 800, 600], mix: ['混风入口', '上方', 700, 500],
  supply: ['送风出口', '右端', 900, 700], primary: ['无接口', '无', 0, 0], medium: ['无接口', '无', 0, 0], high: ['无接口', '无', 0, 0],
  coil: ['冷水接管', '右侧', 80, 80], heat: ['热水接管', '右侧', 80, 80], humid: ['加湿介质', '右侧', 50, 50], fan: ['送风出口', '右端', 900, 700],
  silencer: ['无接口', '无', 0, 0], access: ['无接口', '无', 0, 0], empty: ['无接口', '无', 0, 0]
};

function makeContext(segments, options = {}) {
  const viewArea = { innerHTML: '' };
  const context = {
    interfaceDefaults,
    segments,
    selectedId: options.selectedId ?? segments[0]?.id ?? null,
    view: options.view ?? 'side',
    escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    $(id) { assert.equal(id, 'viewArea'); return viewArea; }
  };
  vm.createContext(context);
  vm.runInContext(['ensureGeometry', 'symbol', 'portDrawing', 'projection'].map(name => declaration(name)).join('\n'), context, { filename: 'actual-workbench-projection.js' });
  return { context, viewArea };
}

const tests = [];
const test = (name, run) => tests.push({ name, run });
const clone = value => JSON.parse(JSON.stringify(value));

test('actual ensureGeometry remains an in-place void helper and portDrawing honors that contract', () => {
  const segment = { id: 'fresh', type: 'fresh', length: 500 };
  const { context } = makeContext([segment]);
  assert.equal(context.ensureGeometry(segment), undefined);
  assert.equal(segment.interfaceName, '新风入口');
  assert.doesNotThrow(() => context.portDrawing(segment, 55, 63, 120, 168));
  assert.match(context.portDrawing(segment, 55, 63, 120, 168), /class="port"/);
});

test('actual projection renders representative inlet, filter, fan, coil, empty and outlet segments', () => {
  const segments = [
    { id: 'fresh', type: 'fresh', length: 500 },
    { id: 'filter', type: 'primary', length: 600 },
    { id: 'fan', type: 'fan', length: 800 },
    { id: 'coil', type: 'coil', length: 700 },
    { id: 'empty', type: 'empty', length: 500 },
    { id: 'end', type: 'supply', length: 500 }
  ];
  const { context } = makeContext(segments);
  for (const which of ['side', 'top', 'front', 'rear', 'left', 'right', 'bottom', 'end']) {
    const svg = context.projection(which, false);
    assert.match(svg, /^<svg[\s\S]*<\/svg>$/, which);
    assert.doesNotMatch(svg, /undefined|NaN/, which);
  }
  assert.equal(context.selectedId, 'fresh');
  assert.deepEqual(segments.map(s => s.interfaceName), ['新风入口', '无接口', '送风出口', '冷水接管', '无接口', '送风出口']);
  const persisted = clone(segments);
  const stripContext = {};
  vm.createContext(stripContext);
  vm.runInContext(declaration('stripDisplayGeometryDefaults', uiSource), stripContext);
  persisted.forEach(stripContext.stripDisplayGeometryDefaults);
  assert.deepEqual(persisted.map(s => Object.keys(s).sort()), segments.map(() => ['id', 'length', 'type']));
});

test('six-view actual renderView sequence completes after geometry initialization', () => {
  const segments = [{ id: 'fresh', type: 'fresh', length: 500 }, { id: 'fan', type: 'fan', length: 800 }, { id: 'end', type: 'supply', length: 500 }];
  const { context, viewArea } = makeContext(segments, { view: 'six' });
  const marker = 'renderView=function(){const area=';
  const start = source.indexOf(marker);
  assert(start >= 0, 'actual six-view renderView assignment exists');
  const open = source.indexOf('{', start);
  vm.runInContext(`renderView=function()${blockAt(open)}`, context);
  assert.doesNotThrow(() => { segments.forEach(context.ensureGeometry); context.renderView(); });
  assert.match(viewArea.innerHTML, /class="six-grid"/);
  assert.equal((viewArea.innerHTML.match(/class="face"/g) || []).length, 6);
  assert.doesNotMatch(viewArea.innerHTML, /undefined|NaN/);
});

test('actual renderAll startup order reaches projection without throwing', () => {
  const segments = [{ id: 'fresh', type: 'fresh', length: 500 }, { id: 'coil', type: 'coil', length: 700 }];
  const { context, viewArea } = makeContext(segments);
  const calls = [];
  Object.assign(context, {
    renderPalette() { calls.push('palette'); }, renderSegments() { calls.push('segments'); },
    renderInputs() { calls.push('inputs'); context.ensureGeometry(segments[0]); }, renderOutputs() { calls.push('outputs'); },
    renderView() { calls.push('view'); viewArea.innerHTML = context.projection('side', false); }
  });
  vm.runInContext(declaration('renderAll'), context);
  assert.doesNotThrow(() => context.renderAll());
  assert.deepEqual(calls, ['palette', 'segments', 'inputs', 'outputs', 'view']);
  assert.match(viewArea.innerHTML, /<svg/);
});

test('null guard and existing interface, formal-readonly and explicit zero-empty values stay unchanged', () => {
  const explicit = { id: 'explicit', type: 'fresh', length: 500, interfaceName: '', portSide: '', portWidth: 0, portHeight: 0, doorSide: '' };
  const existing = { id: 'existing', type: 'fan', length: 500, interfaceName: '用户接口', portSide: '左侧', portWidth: 320, portHeight: 240, doorSide: '无' };
  const formal = { id: 'formal', type: 'coil', length: 700, isFormalSegment: true, interfaceName: '正式接管', portSide: '右侧', portWidth: 80, portHeight: 80, doorSide: '检修侧' };
  const before = [clone(explicit), clone(existing), clone(formal)];
  const { context } = makeContext([explicit, existing, formal]);
  assert.equal(context.portDrawing(null, 0, 0, 100, 100), '');
  assert.equal(context.portDrawing(undefined, 0, 0, 100, 100), '');
  assert.equal(context.portDrawing(explicit, 0, 0, 100, 100), '');
  assert.match(context.portDrawing(existing, 0, 0, 100, 100), /class="port"/);
  assert.match(context.portDrawing(formal, 0, 0, 100, 100), /class="port"/);
  assert.deepEqual([explicit, existing, formal], before);
  assert.doesNotThrow(() => context.projection('side', false));
});

let failed = 0;
for (const item of tests) {
  try { item.run(); console.log(`PASS ${item.name}`); }
  catch (error) { failed++; console.error(`FAIL ${item.name}\n${error.stack}`); }
}
console.log(`Projection runtime: ${tests.length - failed}/${tests.length} passed; actual inline source in VM, no browser visual claim.`);
if (failed) process.exitCode = 1;
