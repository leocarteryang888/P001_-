const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const XLSX = require('../vendor/xlsx.full.min.js');
const root = path.resolve(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
const copy = value => plain(value);
function setup(storage = new Map()) {
  const listeners = [];
  const elements = new Map();
  class Element {
    constructor() { this.value = ''; this.textContent = ''; this.innerHTML = ''; this.style = {}; this.hidden = false; this.disabled = false; this.events = {}; this.options = []; this.files = []; this.classList = {toggle() {}}; this.dataset = {}; }
    addEventListener(name, callback) { this.events[name] = callback; }
    add(option) { this.options.push(option); if (this.options.length === 1) this.value = option.value; }
    replaceChildren() { this.options = []; this.value = ''; }
    setAttribute() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.events.close?.(); }
  }
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const modes = ['pull','frame'].map(mode => {const element = new Element(); element.dataset.mode = mode; return element;});
  const views = ['types','width','height'].map(view => {const element = new Element(); element.dataset.view = view; return element;});
  const context = {
    window: {XLSX: {...XLSX}, localStorage: {getItem: key => storage.get(key) ?? null, setItem: (key,value) => storage.set(key,value)}},
    document: {getElementById: get, querySelectorAll: selector => selector === '[data-view]' ? views : modes, addEventListener: (name, callback) => listeners.push(callback)},
    Option: function(text, value) { this.text = text; this.value = String(value); },
    console
  };
  vm.createContext(context);
  for (const file of ['data/filter-database.js','js/filter-data-io.js','js/filter-selector.js','js/database-dialog.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'), context);
  listeners.forEach(callback => callback());
  return {context, get, modes, views, storage, io: context.window.FilterDataIO, selector: context.window.FilterSelector};
}
(async function () {
  const app = setup();
  const defaults = plain(app.selector.getDatabase());
  assert.equal(app.get('totalCount').textContent, '4 个');
  for (const bookType of ['xlsx', 'biff8']) {
    const bytes = XLSX.write(app.io.toWorkbook(defaults), {type:'buffer', bookType});
    const decoded = app.io.fromWorkbook(XLSX.read(bytes, {type:'buffer'}));
    assert.deepEqual(plain(decoded), defaults, bookType + ' roundtrip');
  }
  function badWorkbook(edit, message) {
    const book = app.io.toWorkbook(defaults);
    edit(book);
    assert.throws(() => app.io.fromWorkbook(book), message);
    assert.deepEqual(plain(app.selector.getDatabase()), defaults, 'invalid imports must not change runtime');
  }
  badWorkbook(b => delete b.Sheets['高度排布'], /缺少/);
  badWorkbook(b => b.Sheets['过滤器类型'].A1.v = '错误表头', /表头/);
  badWorkbook(b => b.Sheets['宽度排布'].A3.v = 6, /不重复/);
  badWorkbook(b => b.Sheets['宽度排布'].B2.v = '5+9', /组合格式/);
  badWorkbook(b => b.Sheets['宽度排布'].B2.f = '3+3', /公式/);
  badWorkbook(b => b.Sheets['宽度排布']['!ref'] = 'A1:C28', /完整/);
  badWorkbook(b => b.Sheets['过滤器类型'].A3.v = b.Sheets['过滤器类型'].A2.v, /不能重复/);
  badWorkbook(b => b.Sheets['高度排布']['!ref'] = 'A1:XFD1048576', /最多/);
  badWorkbook(b => b.Sheets['过滤器类型'].B2.v = '', /不能为空/);
  const updated = copy(defaults);
  updated.filterTypes[0].name = '导入测试类型 <img src=x onerror=alert(1)>';
  updated.arrangements.pull.width[10] = [4,6];
  const bytes = XLSX.write(app.io.toWorkbook(updated), {type:'array', bookType:'xlsx'});
  app.get('openDatabase').events.click();
  assert.equal(app.get('databaseDialog').open, true);
  app.get('viewDatabase').events.click();
  assert.equal(app.get('databaseViewer').open, true);
  assert.match(app.get('databaseViewTable').innerHTML, /初效板式 G 系列/);
  assert.equal(app.context.window.FilterDatabaseViewer.viewRows(defaults, 'width').rows.length, 28);
  assert.equal(app.context.window.FilterDatabaseViewer.viewRows(defaults, 'height').rows.length, 28);
  app.views.find(view => view.dataset.view === 'width').events.click();
  assert.match(app.get('databaseViewTable').innerHTML, /33M/);
  app.get('closeDatabaseViewer').events.click();
  assert.equal(app.get('databaseViewer').open, false);
  app.get('databaseFile').files = [{name:'数据库.xlsx', size:bytes.byteLength, arrayBuffer: async () => bytes}];
  await app.get('databaseFile').events.change();
  assert.equal(app.get('applyDatabase').disabled, false);
  assert.deepEqual(plain(app.selector.getDatabase()), defaults, 'preview must not apply');
  app.get('applyDatabase').events.click();
  assert.equal(app.get('selectedType').textContent, '导入测试类型 <img src=x onerror=alert(1)>');
  assert.equal(app.get('totalCount').textContent, '4 个');
  assert.equal(app.selector.calculate('pull',10,10).specifications.length, 2);
  assert.equal(app.get('applyDatabase').disabled, true);
  const refreshed = setup(app.storage);
  assert.equal(refreshed.get('selectedType').textContent, '导入测试类型 <img src=x onerror=alert(1)>');
  refreshed.get('viewDatabase').events.click();
  assert.match(refreshed.get('databaseViewTable').innerHTML, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(refreshed.get('databaseViewTable').innerHTML, /<img/);
  assert.deepEqual(plain(refreshed.selector.getDatabase()), updated);
  let exported;
  app.context.window.XLSX.writeFile = book => { exported = book; };
  app.get('exportDatabase').events.click();
  assert.deepEqual(plain(app.io.fromWorkbook(exported)), updated, 'export uses active database');
  app.get('databaseFile').files = [{name:'bad.xlsx', size:10, arrayBuffer: async () => new ArrayBuffer(0)}];
  await app.get('databaseFile').events.change();
  assert.equal(app.get('applyDatabase').disabled, true);
  assert.deepEqual(plain(app.selector.getDatabase()), updated);
  const oldStorage = app.context.window.localStorage.setItem;
  app.context.window.localStorage.setItem = () => { throw new Error('Quota exceeded'); };
  assert.throws(() => app.io.save(defaults), /Quota/);
  assert.deepEqual(plain(app.selector.getDatabase()), updated);
  app.context.window.localStorage.setItem = oldStorage;
  for (const key of app.storage.keys()) app.storage.set(key, '{bad json');
  const corrupt = setup(app.storage);
  assert.equal(corrupt.get('databaseNotice').hidden, false);
  assert.deepEqual(plain(corrupt.selector.getDatabase()), defaults);
  for (const mode of ['pull','frame']) for (let w=6;w<=33;w++) for (let h=6;h<=33;h++) {
    const result = refreshed.selector.calculate(mode,w,h);
    assert.equal(result.total, result.specifications.reduce((sum,spec)=>sum+spec.count,0));
  }
  console.log('通过：真实 XLSX/XLS 往返、9 类非法表格、窗口导入/导出事件、确认前不生效、刷新恢复、缓存故障回退及导入后 1568 个组合。');
})().catch(error => { console.error(error); process.exitCode = 1; });
