const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
let JSDOM;
try {
  ({ JSDOM } = require(path.join(__dirname, '../../outputs/03-整机选型工作台/test-runtime/node_modules/jsdom')));
} catch (error) {
  if (error?.code !== 'MODULE_NOT_FOUND') throw error;
  throw new Error(
    '正式 DOM 集成测试缺少 jsdom。请在项目根目录执行：npm install --prefix outputs/03-整机选型工作台/test-runtime --no-save jsdom@30.1.3',
    { cause: error }
  );
}
const weather = require('../../src/03-整机选型工作台/js/prototype-weather');
const selection = require('../../src/03-整机选型工作台/js/prototype-selection-handoff');
const { createServer } = require('../serve-three-prototype');
const { createStore } = require('../../src/03-整机选型工作台/js/prototype-project-store');
const CenterView = require('../../src/03-整机选型工作台/js/prototype-project-center-view');

const projectRoot = path.resolve(__dirname, '../..');
const page = fs.readFileSync(path.join(projectRoot, 'src/03-整机选型工作台/index.html'), 'utf8');
const uiSource = fs.readFileSync(path.join(projectRoot, 'src/03-整机选型工作台/js/prototype-project-ui.js'), 'utf8');
const dom = new JSDOM(page, { url: 'http://p001.test/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
const { document } = window;
Object.defineProperty(document, 'readyState', { value: 'interactive', configurable: true });
const start = {
  projectId: 'project-main', lineageId: 'line-main', versionId: 'version-main', isFrozen: false,
  name: '集成验证项目', code: 'P-100', customer: '测试客户', salesCompany: '测试销售公司',
  salesCompanyCode: 'BJ', businessOwner: '测试承办人', technicalSupport: '测试支持', location: '上海',
  units: [{ unitId: 'unit-main', no: '001', sequenceNo: '001', schemeNo: '001', name: '', productType: '组合式空调', airflowForm: 'F3', segments: [] }]
};
const history = [{ project: { ...start, projectId: 'project-old', versionId: 'version-old', isFrozen: true, name: '历史项目名', code: 'P-099' }, archivedAt: '2026-10-01T00:00:00Z' }];
let persisted = [structuredClone(start)];
let trashed = [];
let revision = 1;
let createVersionCalls = 0, failNextSave = false;
let prompts = ['取消版名称', '确认版名称'];
const clone = value => JSON.parse(JSON.stringify(value));
const lifecycle = {
  async list({ includeHistory = true, includeTrash = false } = {}) {
    const trashedLineages = new Set(trashed.map(row => row.project.lineageId || row.project.projectId));
    const visibleHistory = includeHistory ? history.filter(row => includeTrash || !trashedLineages.has(row.project.lineageId || row.project.projectId)) : [];
    return { ok: true, revision, data: { projects: clone(persisted), history: clone(visibleHistory), trash: includeTrash ? clone(trashed) : [] } };
  },
  async get({ versionId }) {
    const project = [...persisted, ...history.map(item => item.project)].find(item => item.versionId === versionId);
    if (!project) throw Object.assign(new Error('版本不存在'), { status: 404 });
    return { ok: true, data: { project: clone(project) } };
  },
  async createVersion({ projectId, versionId, draft }) {
    createVersionCalls++;
    assert.equal(projectId, 'project-old'); assert.equal(versionId, 'version-old');
    const previousCurrent = clone(persisted.find(project => project.projectId === 'project-main'));
    assert.ok(previousCurrent, 'the current parent is present before version creation');
    history.push({ project: { ...previousCurrent, isFrozen: true, modifiedAt: '2026-10-17T11:59:00Z' }, archivedAt: '2026-10-17T12:00:00Z' });
    const project = { ...clone(draft), projectId: `project-version-${createVersionCalls}`, versionId: `version-created-${createVersionCalls}`, lineageId: 'line-main', parentProjectId: undefined, parentVersionId: 'version-main', pendingVersionDraft: undefined, isFrozen: false, modifiedAt: new Date(2026, 9, 17, 12, createVersionCalls).toISOString() };
    project.parentProjectId = 'project-old'; project.parentVersionId = 'version-old';
    persisted = [project]; revision++;
    return { ok: true, revision, data: { project: clone(project) } };
  },
  async trash({ projectId }) {
    const index = persisted.findIndex(project => project.projectId === projectId || project.lineageId === projectId);
    assert.notEqual(index, -1, 'trash uses the stable project ID');
    const [project] = persisted.splice(index, 1);
    trashed.push({ project: clone(project), deletedAt: '2026-10-17T12:10:00Z', retentionUntil: '2029-10-17T12:10:00Z' }); revision++;
    return { ok: true, revision, data: { project: clone(project) } };
  },
  async restore({ projectId }) {
    const index = trashed.findIndex(row => row.project.projectId === projectId || row.project.lineageId === projectId);
    assert.notEqual(index, -1, 'restore uses the stable trashed project ID');
    const [{ project }] = trashed.splice(index, 1); persisted.push(clone(project)); revision++;
    return { ok: true, revision, data: { project: clone(project) } };
  },
  async export() { throw new Error('本测试不调用导出'); },
  async listExports() { return { ok: true, data: { exports: [] } }; }
};

// Run the actual project-ui source against the formal page DOM and an isolated in-memory store.
window.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, revision, projects: clone(persisted) }) });
window.ahuCompactReady = true;
window.confirm = () => true;
window.prompt = () => prompts.shift() ?? '新版本名称';
window.alert = () => {};
window.AHUPrototypeProjectCenterView = require('../../src/03-整机选型工作台/js/prototype-project-center-view');
window.AHUPrototypeWeather = weather;
window.AHUPrototypeSelectionHandoff = selection;
window.AHUSelectionHandoff = selection;
window.AHUPrototypeProjectVersion = {
  makeId: kind => `${kind}-test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  inferSequenceNo: unitNo => String(unitNo || '').match(/(\d{3})/)?.[1] || null,
  equipmentNumberParts: () => true,
  nextEquipmentNumber: () => ({ no: '002', sequenceNo: '002' })
};
window.AHUPrototypeProjectStore = {
  createStore() {
    const store = {
      state: { revision, sharedKind: 'exists', source: 'shared', sharedProjects: clone(persisted), projects: clone(persisted) },
      lifecycle,
      async initialize(seed) { return { projects: clone(persisted.length ? persisted : seed), revision, source: 'shared', sharedKind: 'exists', error: null }; },
      async save(candidateProjects) { if (failNextSave) { failNextSave = false; throw Object.assign(new Error('409 isolated fixture conflict'), { status: 409 }); } persisted = clone(candidateProjects); revision++; store.state.revision = revision; store.state.projects = clone(persisted); return { projects: clone(persisted), revision }; },
      async saveBeforeSwitch() { return { projects: clone(persisted), revision }; },
      async beforeSelectionChange() { return true; },
      async publishLocal() { return { projects: clone(persisted), revision }; }
    };
    return store;
  }
};
window.projects = clone(persisted);
window.segments = [];
window.selectedProject = 0; window.selectedUnit = 0; window.selectedId = null;
window.formalReadonly = false;
window.$ = id => document.getElementById(id);
window.escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
window.renderManager = () => {};
window.renderAll = () => {};
window.renderInputs = () => {};
window.renderOutputs = () => {};
window.showManager = () => window.renderManager?.();
let openedUnit = null;
window.showWorkspace = index => { openedUnit = index; };
window.loadPrototypeUnit = () => {};
window.renderProjectForm = () => {};
window.notice = () => {};
window.refreshStoreNotice = () => {};
window.persistActiveUnit = () => {};
window.AHUPrototypeSelectionHandoff.clone = clone;
window.AHUPrototypeSelectionHandoff.ensureIds = projects => projects.forEach(project => {
  project.projectId ||= `project-generated-${Math.random().toString(16).slice(2)}`;
  project.units?.forEach(unit => { unit.unitId ||= `unit-generated-${Math.random().toString(16).slice(2)}`; });
});
window.AHUPrototypeSelectionHandoff.invalidate ||= () => {};

async function tick() { await new Promise(resolve => setTimeout(resolve, 0)); }
function click(target) { assert.ok(target, 'click target exists'); target.click(); }
async function waitFor(test, label) {
  for (let index = 0; index < 30; index++) { await tick(); if (test()) return; }
  assert.fail(`timed out waiting for ${label}`);
}
function fillProjectForm(name) {
  document.querySelector('#prototypeProjectName').value = name;
  document.querySelector('#prototypeProjectCustomer').value = '表单客户';
  document.querySelector('#prototypeSalesCompanyCode').value = 'BJ';
  document.querySelector('#prototypeSalesCompany').value = '表单销售公司';
  document.querySelector('#prototypeBusinessOwner').value = '表单承办人';
  document.querySelector('#prototypeTechnicalSupport').value = '表单支持';
  document.querySelector('#prototypeLocation').value = '上海';
}

(async () => {
  // Parse the actual formal HTML first and release the source's DOMContentLoaded gate.
  const instrumentedSource = uiSource.replace(/  showManager\(\);\s*\}\)\(\);\s*$/, '  window.__getProjectUiState = () => ({ projectSaveBusy, newProjectMode, editProjectIndex, selectedProject, centerSelectedVersion, activeProject: projects[selectedProject], centerBusy: projectCenterView?.getState?.().busy });\n  showManager();\n})();');
  assert.notEqual(instrumentedSource, uiSource, 'test-only state observer is injected at the source IIFE boundary');
  await window.eval(instrumentedSource);
  await waitFor(() => document.querySelector('.pcv-project-card'), 'initial project-center mount');
  assert.equal(document.querySelector('.pcv-unit-table tbody tr td:nth-child(3)').textContent, '001', 'an empty unit name falls back to its unit number');
  assert.equal(document.querySelector('.pcv-unit-table tbody tr td:nth-child(4)').textContent, '组合式空调机组', 'the project center shows the complete label for a retained short product type value');
  const centerSearch = document.querySelector('.pcv-search'); centerSearch.value = '双层双路 组合式空调机组'; centerSearch.dispatchEvent(new window.Event('input', { bubbles: true }));
  assert.ok(document.querySelector('.pcv-project-card'), 'the actual project-center search matches the workbench airflow label and complete product type with AND semantics');
  centerSearch.value = ''; centerSearch.dispatchEvent(new window.Event('input', { bubbles: true }));

  // New project: actual project center callback enters the actual legacy form, then cancel restores center.
  click(document.querySelector('.pcv-new-project'));
  assert.ok(document.querySelector('.project-form'), 'new-project action enters actual project form');
  assert.ok(document.querySelector('#projectSearch'), 'destroy restores the original sidebar search before form rendering');
  click(document.querySelector('#cancelProjectForm'));
  await waitFor(() => document.querySelector('.pcv-project-card'), 'project center after new-project cancel');
  assert.equal(persisted.length, 1, 'cancelled new project leaves isolated persisted store untouched');

  // Edit existing project: form cancel leaves original fields unchanged; confirmed save returns to center.
  click(document.querySelector('.pcv-detail [data-action="edit"]'));
  assert.ok(document.querySelector('.project-form'), 'edit action enters actual project form');
  fillProjectForm('取消修改');
  click(document.querySelector('#cancelProjectForm'));
  await waitFor(() => document.querySelector('.pcv-project-card'), 'project center after edit cancel');
  assert.equal(persisted[0].name, '集成验证项目', 'cancelled edit leaves store unchanged');
  click(document.querySelector('.pcv-detail [data-action="edit"]'));
  fillProjectForm('确认修改');
  click(document.querySelector('#saveBtn'));
  await waitFor(() => !window.__getProjectUiState().projectSaveBusy && !window.__getProjectUiState().newProjectMode && document.querySelector('.pcv-project-card') && persisted[0].name === '确认修改', 'project center after edit save and save lock release');
  assert.equal(persisted.length, 1, 'editing updates one current project, without a duplicate');

  // A historical version is read-only; creating a version from it enters a form and cancellation restores history context.
  const historyToggle = document.querySelector('[aria-label="包含历史版本"]'); historyToggle.checked = true;
  historyToggle.dispatchEvent(new window.Event('change', { bubbles: true })); await waitFor(() => document.querySelector('[data-version-id="version-old"]'), 'history list');
  click(document.querySelector('[data-version-id="version-old"]'));
  await waitFor(() => document.querySelector('#projectName').textContent === '历史项目名', 'history context in actual manager heading');
  assert.ok(document.querySelector('#saveBtn').hidden && document.querySelector('#saveBtn').disabled, 'history manager context cannot save the active project');
  assert.equal(document.querySelector('.pcv-detail [data-action="edit"]'), null, 'history view has no edit control');
  assert.equal(document.querySelector('.pcv-detail [data-action="open-unit"]'), null, 'history units cannot open for editing');
  click(document.querySelector('.pcv-detail [data-action="create-version"]'));
  assert.ok(document.querySelector('.project-form'), 'create-version action from history enters actual form');
  await waitFor(() => !window.__getProjectUiState().projectSaveBusy, 'center view action lock release before version cancellation');
  await waitFor(() => document.querySelector('#cancelProjectForm'), 'cancel control in pending version form');
  assert.equal(document.querySelector('#cancelProjectForm').disabled, false, 'new-version form controls remain enabled after center teardown');
  click(document.querySelector('#cancelProjectForm'));
  await waitFor(() => document.querySelector('#projectName').textContent === '历史项目名', 'history context after pending version cancel');
  assert.equal(createVersionCalls, 0, 'cancelled version draft creates no lifecycle version');
  assert.ok(document.querySelector('#saveBtn').hidden, 'cancelled pending version restores read-only history state');

  // Confirm a version from history. Only then does the lifecycle API receive the new version.
  click(document.querySelector('.pcv-detail [data-action="create-version"]'));
  assert.ok(document.querySelector('.project-form'), 'second new-version action opens the actual form');
  await waitFor(() => document.querySelector('#saveBtn') && !document.querySelector('#saveBtn').disabled, 'version form controls become available');
  fillProjectForm('确认版名称');
  click(document.querySelector('#saveBtn'));
  await waitFor(() => !window.__getProjectUiState().projectSaveBusy && !window.__getProjectUiState().newProjectMode && persisted.length === 1 && document.querySelector('.pcv-project-card'), 'project center after version confirmation and save lock release');
  assert.equal(createVersionCalls, 1, 'confirmed version invokes lifecycle exactly once');
  assert.equal(persisted[0].name, '确认版名称', 'confirmed draft becomes the current project version');
  assert.equal(persisted[0].lineageId, 'line-main', 'new version keeps the parent lineage');
  assert.equal(persisted.filter(project => project.lineageId === 'line-main').length, 1, 'a lineage has exactly one active version after branching');
  assert.ok(history.some(item => item.project.versionId === 'version-main' && item.project.name === '确认修改'), 'previous active version moves to history when a new version is confirmed');
  assert.equal(history.filter(item => item.project.versionId === 'version-old').length, 1, 'existing historical source remains in the archive');
  assert.equal(document.querySelector('#saveBtn').hidden, false, 'current version restores save entry');
  assert.equal(document.querySelector('#saveBtn').disabled, false, 'current version save entry is enabled');

  // New project: fail once, retain typed fields, retry and create exactly one project.
  click(document.querySelector('.pcv-new-project'));
  assert.ok(document.querySelector('.project-form'), 'new project can be created after version confirmation');
  await waitFor(() => document.querySelector('#saveBtn') && !document.querySelector('#saveBtn').disabled, 'new project form controls become available');
  fillProjectForm('重试新项目');
  failNextSave = true;
  click(document.querySelector('#saveBtn'));
  await waitFor(() => !window.__getProjectUiState().projectSaveBusy && document.querySelector('#projectFormNotice')?.textContent.includes('409'), 'failed new-project save retains form and releases lock');
  assert.equal(document.querySelector('#prototypeProjectName').value, '重试新项目', 'failed save preserves entered form fields');
  assert.equal(persisted.length, 1, 'failed new-project save leaves isolated store unchanged');
  click(document.querySelector('#saveBtn'));
  await waitFor(() => !window.__getProjectUiState().projectSaveBusy && !window.__getProjectUiState().newProjectMode && persisted.length === 2, 'new-project save retry returns to center');
  assert.equal(persisted.filter(project => project.name === '重试新项目').length, 1, 'retry creates one project only');

  // Trash and restore the active lineage, then prove the restored snapshot drives both open and edit actions.
  const activeLineCard = [...document.querySelectorAll('.pcv-project-card')].find(card => card.dataset.lineageId === 'line-main');
  click(activeLineCard.querySelector('[data-action="select-current"]'));
  await waitFor(() => document.querySelector('.pcv-detail h2')?.textContent === '确认版名称', 'active lineage selection before trash');
  click(document.querySelector('.pcv-detail [data-action="trash"]'));
  await waitFor(() => trashed.some(row => row.project.lineageId === 'line-main') && !persisted.some(project => project.lineageId === 'line-main'), 'active lineage enters the isolated trash');
  const trashToggle = document.querySelector('[aria-label="查看回收站"]'); trashToggle.checked = true;
  trashToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
  await waitFor(() => [...document.querySelectorAll('.pcv-project-card')].some(card => card.dataset.lineageId === 'line-main'), 'trashed lineage appears in the trash list');
  const trashedCard = [...document.querySelectorAll('.pcv-project-card')].find(card => card.dataset.lineageId === 'line-main');
  click(trashedCard.querySelector('[data-action="select-trash"]'));
  await waitFor(() => document.querySelector('.pcv-detail [data-action="restore"]'), 'trash selection renders restore actions');
  click(document.querySelector('.pcv-detail [data-action="restore"]'));
  await waitFor(() => persisted.some(project => project.lineageId === 'line-main') && !trashed.some(row => row.project.lineageId === 'line-main') && window.projects.some(project => project.lineageId === 'line-main'), 'restore synchronizes the global workbench project list');
  trashToggle.checked = false; trashToggle.dispatchEvent(new window.Event('change', { bubbles: true }));
  await waitFor(() => [...document.querySelectorAll('.pcv-project-card')].some(card => card.dataset.lineageId === 'line-main'), 'restored lineage returns to the active project list');
  const restoredCard = [...document.querySelectorAll('.pcv-project-card')].find(card => card.dataset.lineageId === 'line-main');
  click(restoredCard.querySelector('[data-action="select-current"]'));
  await waitFor(() => window.__getProjectUiState().activeProject?.lineageId === 'line-main', 'global selection follows the restored project');
  await waitFor(() => document.querySelector('.pcv-detail [data-action="open-unit"]'), 'restored unit becomes openable');
  click(document.querySelector('.pcv-detail [data-action="open-unit"]'));
  await waitFor(() => openedUnit === 0 && !window.__getProjectUiState().centerBusy, 'open action uses the restored project and unit in the global workbench state');
  click(document.querySelector('.pcv-detail [data-action="edit"]'));
  await waitFor(() => document.querySelector('.project-form'), 'restored project can enter the actual editor');
  assert.equal(document.querySelector('#prototypeProjectName').value, '确认版名称', 'restored project editing reads the synchronized project snapshot');
  click(document.querySelector('#cancelProjectForm'));
  await waitFor(() => document.querySelector('.pcv-project-card'), 'center after restored project edit cancellation');

  // Exercise the real store adapter against an isolated real HTTP server, then refresh the actual center view.
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'p001-center-adapter-'));
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.listen(0, '127.0.0.1', error => error ? reject(error) : resolve()));
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const server = createServer({
    port,
    prototypeProjectsFile: path.join(tempRoot, 'projects.json'),
    prototypeExportsDir: path.join(tempRoot, 'exports'),
    partDataFile: path.join(tempRoot, 'parts.json')
  });
  await new Promise((resolve, reject) => server.listen(port, '127.0.0.1', error => error ? reject(error) : resolve()));
  const requests = [];
  const endpoint = `http://127.0.0.1:${port}/api/prototype-projects`;
  const storage = { getItem: () => null, setItem() {} };
  const liveStore = createStore({ storage, endpoint, fetchImpl: (url, options) => { requests.push({ url: String(url), method: options?.method || 'GET' }); return fetch(url, options); } });
  const adapterDom = new JSDOM('<!doctype html><aside id="list"></aside><main id="details"></main>', { url: 'http://p001-adapter.test/' });
  const liveView = CenterView.mount({ sidebar: adapterDom.window.document.querySelector('#list'), detail: adapterDom.window.document.querySelector('#details'), lifecycle: liveStore.lifecycle, weather });
  try {
    await liveStore.initialize([]);
    const created = {
      projectId: 'real-adapter-project', lineageId: 'real-adapter-lineage', versionId: 'real-adapter-version',
      name: '真实适配器联测项目', code: '', customer: '联测客户', salesCompanyCode: 'BJ', businessOwner: '验收',
      units: [{ unitId: 'real-adapter-unit', unitLineageId: 'real-adapter-unit-lineage', no: 'BJ-001', sequenceNo: '001', name: '新风机组', productType: '组合式空调', segments: [], cabinetSelection: { confirmed: true, source: 'manual' }, pendingRecalculation: false }]
    };
    await liveStore.save([created]);
    await liveView.refresh();
    assert.ok(requests.some(row => row.method === 'POST' && row.url === `${endpoint}/lifecycle`), 'the real store adapter sends lifecycle POST to the server lifecycle route');
    assert.ok(requests.some(row => row.method === 'PUT' && row.url === endpoint), 'the real store adapter keeps project save on the base route');
    const adapterList = adapterDom.window.document.querySelector('#list');
    assert.equal(adapterList.querySelectorAll('.pcv-project-card').length, 1, 'the refreshed real view renders the newly saved project card');
    assert.match(adapterList.textContent, /真实适配器联测项目/);
    assert.match(adapterDom.window.document.querySelector('#details').textContent, /真实适配器联测项目/, 'the refreshed real view displays project details');
    assert.match(adapterDom.window.document.querySelector('#details').textContent, /新风机组/, 'the refreshed real view displays the saved unit details');
  } finally {
    liveView.destroy(); adapterDom.window.close();
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections?.(); });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  window.close?.(); dom.window.close();
  console.log('通过：正式 index DOM + 实际 UI bridge；新建/编辑/版本与回收站流程通过；真实 store adapter + 随机端口临时 server 已验证 lifecycle POST、保存后刷新卡片及详情。');
})().catch(error => { console.error(error); dom.window.close(); process.exitCode = 1; });
