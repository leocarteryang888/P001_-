const assert = require('node:assert/strict');
const View = require('../js/prototype-project-center-view');

class Element {
  constructor(tag = 'div', ownerDocument = null) {
    this.tagName = tag.toUpperCase(); this.ownerDocument = ownerDocument; this.children = []; this.parentNode = null;
    this.dataset = {}; this.attributes = {}; this.listeners = {}; this.checked = false; this.value = ''; this.disabled = false;
    this._text = ''; this._html = ''; this.className = ''; this.synthetic = {};
    this.classList = { add: name => { if (!this.className.split(/\s+/).includes(name)) this.className = `${this.className} ${name}`.trim(); } };
  }
  append(...nodes) { for (const node of nodes) { if (node && typeof node === 'object') { node.parentNode = this; this.children.push(node); } } }
  prepend(node) { if (!node || typeof node !== 'object') return; node.parentNode = this; this.children.unshift(node); }
  replaceChildren(...nodes) { this.children = []; this._html = ''; this._text = ''; this.append(...nodes); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener(type, listener) { (this.listeners[type] ||= []).push(listener); }
  removeEventListener(type, listener) { this.listeners[type] = (this.listeners[type] || []).filter(item => item !== listener); }
  dispatch(type, target = this) { for (const listener of this.listeners[type] || []) listener({ target }); }
  contains(node) { for (let current = node; current; current = current.parentNode) if (current === this) return true; return false; }
  closest(selector) {
    for (let current = this; current; current = current.parentNode) {
      if (selector === '[data-action]' && current.dataset?.action) return current;
      if (selector === '[data-action="select-current"]' && current.dataset?.action === 'select-current') return current;
      if (selector === '.pcv-project-card' && current.className?.split(/\s+/).includes('pcv-project-card')) return current;
    }
    return null;
  }
  set innerHTML(value) { this.children = []; this.synthetic = {}; this._html = String(value); }
  get innerHTML() { return this._html; }
  set textContent(value) { this.children = []; this._text = String(value); }
  get textContent() { return [this._text, ...this.children.map(child => child.textContent)].filter(Boolean).join(''); }
  querySelector(selector) {
    const all = this.querySelectorAll(selector); if (all.length) return all[0];
    if (!this._html) return null;
    if (selector === '.pcv-actions' && this._html.includes('pcv-actions') || selector === 'dl' && this._html.includes('<dl') ||
      selector === '.pcv-weather-grid' && this._html.includes('pcv-weather-grid') || selector === 'tbody' && this._html.includes('<tbody') ||
      selector === '.pcv-status' && this._html.includes('pcv-status') || selector === '.pcv-change-list' && this._html.includes('pcv-change-list')) {
      const child = this.synthetic[selector] ||= new Element(selector.startsWith('.') ? 'div' : selector, this.ownerDocument);
      child.className = selector.startsWith('.') ? selector.slice(1) : ''; child.parentNode = this; this.children.push(child); return child;
    }
    return null;
  }
  querySelectorAll(selector) {
    const found = [];
    const visit = node => { for (const child of node.children || []) { if (selector === 'button' && child.tagName === 'BUTTON') found.push(child); visit(child); } };
    visit(this); return found;
  }
}
const document = {
  createElement: tag => new Element(tag, document),
  createTextNode: text => Object.assign(new Element('#text', document), { _text: text })
};

const oldProject = { name: '医院项目', code: 'BJ-2610-001', customer: '甲医院', projectId: 'p-old', lineageId: 'line-1', versionId: 'v1', isFrozen: true, modifiedAt: '2026-10-10T10:00:00Z', units: [{ unitId: 'u1', no: '001', profile: { customerUnitNo: 'AHU-X1', unitType: '组合式空调机组' }, segments: [{ name: '初效过滤段', type: 'filter' }] }] };
const currentProject = { ...oldProject, projectId: 'p-new', versionId: 'v2', isFrozen: false, modifiedAt: '2026-10-16T10:00:00Z', name: '医院扩建项目', units: [{ ...oldProject.units[0], name: '一层大厅', model: '机型A', segments: [{ name: '冷水盘管', type: 'coil' }] }] };

assert.equal(View.matchesSearch(currentProject, '医院 机型A'), true, 'all query terms may match across project and unit fields');
assert.equal(View.matchesSearch(currentProject, '医院 不存在'), false, 'every query term must match');
assert.equal(View.matchesSearch(currentProject, 'AHU-X1'), true, 'customer unit number is searchable');
assert.equal(View.matchesSearch(currentProject, '冷水盘管'), true, 'segment name is searchable');
const airflowFixture = { ...currentProject, technicalSupport: '李工', units: [{ ...currentProject.units[0], airflowForm: 'F3', productType: '新风处理' }] };
const airflowForms = [['F1', '单层单路'], ['F2', '单层单路折返'], ['F3', '双层双路'], ['F4', '前后双路']];
assert.equal(View.matchesSearch(airflowFixture, '双层双路 李工', airflowForms), true, 'Chinese airflow label and technical support match with AND semantics');
assert.equal(View.matchesSearch(airflowFixture, '新风处理', airflowForms), true, 'product type is searchable');
assert.equal(View.matchesSearch({ ...airflowFixture, units: [{ productType: '组合式空调' }] }, '组合式空调机组'), true, 'the visible complete product type label is searchable with a retained short data value');
assert.equal(View.matchesSearch(currentProject, ''), true, 'empty query returns the project');

const groups = View.groupVersions([oldProject, currentProject], [{ project: oldProject }]);
assert.equal(groups.length, 1, 'versions group under one stable lineage');
assert.equal(groups[0].current.versionId, 'v2', 'the latest editable project is the main row');
assert.equal(groups[0].versions.length, 2, 'duplicate history rows do not create duplicate versions');
assert.equal(View.groupVersions([{ ...oldProject, modifiedAt: '2026-10-16T11:00:00Z' }, currentProject])[0].current.versionId, 'v2', 'the frozen version does not replace the current editable version');
const recentlyChanged = { ...currentProject, lineageId: 'line-2', projectId: 'p2', versionId: 'v3', modifiedAt: '2026-10-17T10:00:00Z' };
const inputOrder = [currentProject, recentlyChanged];
assert.deepEqual(View.groupVersions(inputOrder).map(group => group.lineageId), ['line-2', 'line-1'], 'project cards sort by their actual modifiedAt values');
assert.deepEqual(inputOrder, [currentProject, recentlyChanged], 'sorting the project center does not reorder persisted data');

const weather = {
  resolve: () => ({ winter: { dryBulb: -8, rh: 45 }, summer: { dryBulb: 34, wetBulb: 26 } }),
  getLocations: () => [{ province: '北京', city: '北京', station: '观象台' }]
};
const weatherRows = View.conditionRows({ weatherReference: { province: '北京', city: '北京', station: '观象台' }, weatherOverride: { winterAirConditioningTemperature: { value: -6, source: '项目手动调整' } } }, weather);
assert.equal(weatherRows[0].source, '项目手动调整');
assert.equal(weatherRows[1].source, '气象台站参考', 'one override does not label every condition as manual');
const inheritedRows = View.conditionRows({ weatherReference: { province: '北京', city: '北京', station: '观象台' }, weatherOverride: { winterAirConditioningTemperature: { value: -6 } } }, weather, { unitId: 'u1' });
assert.equal(inheritedRows[0].source, '继承项目手动调整', 'new units display project override inheritance');
assert.equal(inheritedRows[1].source, '继承气象台站', 'new units display inherited station values');

(async () => {
  let listOptions, created = 0;
  const sidebar = new Element('aside', document), detail = new Element('div', document);
  const controller = View.mount({
    sidebar, detail,
    lifecycle: { async list(options) { listOptions = options; return { ok: true, data: { projects: [], history: [], trash: [] } }; } },
    weather, onNewProject: async () => { created++; }
  });
  await controller.refresh();
  assert.match(sidebar.children[3].innerHTML, /没有匹配项目/, 'empty results show a real empty state');
  const newButton = sidebar.children[2].children[0];
  sidebar.dispatch('click', newButton);
  assert.equal(created, 1, 'the visible new-project button dispatches its event once');
  const historyToggle = sidebar.children[2].children[1].children[0];
  historyToggle.checked = true;
  historyToggle.dispatch('change', historyToggle);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(controller.getState().includeHistory, true, 'history toggle updates rendered state');
  assert.equal(listOptions.includeHistory, true, 'history toggle requests history from lifecycle API');
  assert.equal(listOptions.includeTrash, false, 'normal project center does not request archived trash records');
  const trashToggle = sidebar.children[2].children[2].children[0];
  trashToggle.checked = true;
  trashToggle.dispatch('change', trashToggle);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(controller.getState().includeTrash, true, 'trash view switches its independent filter state');
  assert.equal(listOptions.includeTrash, true, 'only the explicit trash view requests trash records');
  controller.destroy();

  let listFailure = true, listAttempts = 0;
  const failureSidebar = new Element('aside', document), failureDetail = new Element('div', document);
  const failureView = View.mount({ sidebar: failureSidebar, detail: failureDetail, weather,
    lifecycle: { async list() { listAttempts++; if (listFailure) throw new Error('临时断连'); return { data: { projects: [currentProject], history: [], trash: [] } }; } }
  });
  await assert.rejects(failureView.refresh(), /临时断连/);
  const failureStatus = failureDetail.children[0].children.find(node => node.className === 'pcv-status');
  assert.match(failureStatus.textContent, /项目列表加载失败.*临时断连/);
  const retryButton = failureStatus.children[0];
  assert.equal(retryButton?.dataset.action, 'retry-refresh');
  assert.equal(retryButton?.textContent, '重试');
  assert.match(failureSidebar.children[3].innerHTML, /没有匹配项目/, 'initial failure presents an explicit error status alongside the empty placeholder');
  listFailure = false;
  retryButton.dispatch('click', retryButton);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(listAttempts, 2, 'retry requests the project list again');
  assert.match(failureSidebar.children[3].children[0].innerHTML, /医院扩建项目/, 'successful retry replaces the empty placeholder with a project card');
  listFailure = true;
  await assert.rejects(failureView.refresh(), /临时断连/);
  assert.match(failureSidebar.children[3].children[0].innerHTML, /医院扩建项目/, 'a later refresh failure preserves already loaded project records');
  failureView.destroy();

  let selectedProjectId = null, editedProjectId = null, newUnitProjectId = null;
  const interactionSidebar = new Element('aside', document), interactionDetail = new Element('div', document);
  const frozenProject = { ...oldProject, projectId: 'frozen-project', lineageId: 'frozen-lineage', versionId: 'frozen-v1', isFrozen: true };
  const interactionView = View.mount({ sidebar: interactionSidebar, detail: interactionDetail, weather,
    lifecycle: { async list(options) { return { data: { projects: [currentProject, recentlyChanged, frozenProject], history: [{ project: oldProject }], trash: options?.includeTrash ? [{ project: currentProject, deletedAt: '2026-10-16T00:00:00Z', retentionUntil: '2029-10-16T00:00:00Z' }] : [] } }; } },
    onSelectVersion: ({ project }) => { selectedProjectId = project.projectId; },
    onEditProject: project => { editedProjectId = project.projectId; },
    onNewUnit: project => { newUnitProjectId = project.projectId; }
  });
  await interactionView.refresh();
  const targetCard = interactionSidebar.children[3].children.find(card => card.dataset.lineageId === 'line-2');
  const targetControl = new Element('button', document); targetControl.dataset.action = 'select-current'; targetCard.append(targetControl);
  const cardIdentity = targetCard;
  interactionSidebar.dispatch('click', targetControl);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(interactionSidebar.children[3].children.find(card => card.dataset.lineageId === 'line-2'), cardIdentity, 'first click preserves the project card node needed for a real double-click');
  assert.equal(selectedProjectId, 'p2', 'single click selects the exact project without editing');
  assert.equal(editedProjectId, null, 'single click only selects the project');
  interactionSidebar.dispatch('click', targetControl);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(interactionSidebar.children[3].children.find(card => card.dataset.lineageId === 'line-2'), cardIdentity, 'second click also preserves the same project card node');
  interactionSidebar.dispatch('dblclick', targetControl);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(editedProjectId, 'p2', 'double-click edits the exact active project once');
  const newUnitHeading = interactionDetail.children[0].children.find(node => node.className === 'pcv-project-heading').querySelector('.pcv-actions');
  const topNewUnit = new Element('button', document); topNewUnit.dataset.action = 'new-unit'; newUnitHeading.append(topNewUnit);
  interactionDetail.dispatch('click', topNewUnit);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(newUnitProjectId, 'p2', 'the prominent selected-project action targets the active project');
  const frozenCard = interactionSidebar.children[3].children.find(card => card.dataset.lineageId === 'frozen-lineage');
  const frozenControl = new Element('button', document); frozenControl.dataset.action = 'select-current'; frozenCard.append(frozenControl);
  interactionSidebar.dispatch('dblclick', frozenControl);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(editedProjectId, 'p2', 'double-click cannot bypass frozen-project read-only behavior');
  const historyToggleForInteraction = interactionSidebar.children[2].children[1].children[0];
  historyToggleForInteraction.checked = true; historyToggleForInteraction.dispatch('change');
  await new Promise(resolve => setImmediate(resolve));
  const historicalButton = interactionSidebar.children[3].children[0].querySelectorAll('button').find(node => node.dataset.action === 'select-version');
  interactionSidebar.dispatch('dblclick', historicalButton);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(editedProjectId, 'p2', 'double-clicking an archived version cannot bypass historical read-only behavior');
  const trashToggleForInteraction = interactionSidebar.children[2].children[2].children[0];
  trashToggleForInteraction.checked = true; trashToggleForInteraction.dispatch('change');
  await new Promise(resolve => setImmediate(resolve));
  const trashCard = interactionSidebar.children[3].children[0];
  const trashControl = new Element('button', document); trashControl.dataset.action = 'select-trash'; trashCard.append(trashControl);
  interactionSidebar.dispatch('dblclick', trashControl);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(editedProjectId, 'p2', 'double-clicking a trash record cannot bypass read-only behavior');
  const editCountBeforeDestroy = editedProjectId;
  interactionView.destroy();
  const remounted = View.mount({ sidebar: interactionSidebar, detail: interactionDetail, weather,
    lifecycle: { async list() { return { data: { projects: [currentProject], history: [], trash: [] } }; } },
    onEditProject: project => { editedProjectId = `${editedProjectId},${project.projectId}`; }
  });
  await remounted.refresh();
  const remountCard = interactionSidebar.children[3].children[0];
  const remountControl = new Element('button', document); remountControl.dataset.action = 'select-current'; remountCard.append(remountControl);
  interactionSidebar.dispatch('dblclick', remountControl);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(editedProjectId, `${editCountBeforeDestroy},p-new`, 'destroy/remount binds one double-click handler');
  remounted.destroy();

  let currentCalls = 0, historicalSelection = null, trashCalls = 0;
  const sidebar2 = new Element('aside', document), detail2 = new Element('div', document);
  const controller2 = View.mount({ sidebar: sidebar2, detail: detail2, weather,
    lifecycle: {
      async list() { return { data: { projects: [currentProject], history: [{ project: oldProject }], trash: [] } }; },
      async get({ versionId }) { return { data: { project: versionId === 'v1' ? oldProject : currentProject } }; },
      async trash() { trashCalls++; throw new Error('模拟保存服务不可用'); }
    },
    onSelectVersion: async value => { historicalSelection = value.versionId; },
    onCreateVersion: async () => { currentCalls++; }
  });
  await controller2.refresh();
  sidebar2.children[2].children[1].children[0].checked = true;
  sidebar2.children[2].children[1].children[0].dispatch('change');
  await new Promise(resolve => setImmediate(resolve));
  const historyButton = sidebar2.children[3].children[0].children[0].children.find(node => node.dataset.versionId === 'v1');
  sidebar2.dispatch('click', historyButton);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(historicalSelection, 'v1', 'history selection calls the version reader');
  const historicalActions = detail2.children[0].querySelectorAll('button').map(node => node.dataset.action);
  assert.equal(historicalActions.includes('edit'), false, 'history details do not expose editing');
  assert.equal(historicalActions.includes('open-unit'), false, 'history unit rows remain read-only');
  assert.equal(historicalActions.includes('create-version'), true, 'history details can start a new version');
  detail2.dispatch('click', historicalActions.includes('create-version') ? detail2.children[0].querySelectorAll('button')[0] : null);
  assert.equal(currentCalls, 1, 'the create-version action is available from history');
  controller2.destroy();

  const failingSidebar = new Element('aside', document), failingDetail = new Element('div', document);
  const failing = View.mount({ sidebar: failingSidebar, detail: failingDetail, weather,
    lifecycle: { async list() { return { data: { projects: [currentProject], history: [], trash: [] } }; }, async trash() { trashCalls++; throw new Error('模拟保存服务不可用'); } }
  });
  await failing.refresh();
  const trashButton = failingDetail.children[0].querySelectorAll('button').find(node => node.dataset.action === 'trash');
  failingDetail.dispatch('click', trashButton);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(trashCalls, 1, 'the project trash control dispatches one lifecycle action');
  assert.match(failing.getState().message, /操作失败.*模拟保存服务不可用/, 'failed operations retain a visible failure state');
  assert.equal(failing.getState().selected.versionId, 'v2', 'failed operations preserve the selected version');
  failing.destroy();

  const deletedCurrent = { ...currentProject, projectId: 'deleted-current', lineageId: 'line-deleted', versionId: 'deleted-v2' };
  const deletedHistory = { ...oldProject, projectId: 'deleted-old', lineageId: 'line-deleted', versionId: 'deleted-v1' };
  const archiveSidebar = new Element('aside', document), archiveDetail = new Element('div', document);
  const archiveView = View.mount({ sidebar: archiveSidebar, detail: archiveDetail, weather,
    lifecycle: { async list() { return { data: { projects: [currentProject, deletedCurrent], history: [{ project: oldProject }, { project: deletedHistory }], trash: [{ project: deletedCurrent, deletedAt: '2026-10-16T00:00:00Z', retentionUntil: '2029-10-16T00:00:00Z' }] } }; } }
  });
  await archiveView.refresh();
  assert.deepEqual(archiveSidebar.children[3].children.map(card => card.dataset.lineageId), ['line-1'], 'trashed lineages stay out of the ordinary project list');
  const archiveToggle = archiveSidebar.children[2].children[1].children[0]; archiveToggle.checked = true; archiveToggle.dispatch('change');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(archiveSidebar.children[3].children.map(card => card.dataset.lineageId), ['line-1'], 'ordinary history browsing never reintroduces trashed lineages');
  const archiveTrashToggle = archiveSidebar.children[2].children[2].children[0]; archiveTrashToggle.checked = true; archiveTrashToggle.dispatch('change');
  await new Promise(resolve => setImmediate(resolve));
  const trashedCard = archiveSidebar.children[3].children[0];
  assert.match(trashedCard.innerHTML, /保留至 .*到期后提醒用户决定是否永久删除/, 'trash entries show the three-year retention date and expiration decision reminder');
  const archivedVersionButtons = trashedCard.children.find(child => child.className.includes('pcv-trash-versions')).children;
  assert.deepEqual(archivedVersionButtons.map(button => button.dataset.versionId).sort(), ['deleted-v1', 'deleted-v2'], 'trash view shows the deleted current snapshot and every archived history version');
  archiveSidebar.dispatch('click', archivedVersionButtons.find(button => button.dataset.versionId === 'deleted-v1'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(archiveView.getState().selected.versionId, 'deleted-v1', 'an archived version can be opened from the trash');
  assert.equal(archiveDetail.children[0].querySelectorAll('button').some(button => button.dataset.action === 'edit'), false, 'trashed versions remain read-only');
  archiveView.destroy();

  const expiredSidebar = new Element('aside', document), expiredDetail = new Element('div', document);
  const expiredView = View.mount({ sidebar: expiredSidebar, detail: expiredDetail, weather,
    lifecycle: { async list() { return { data: { projects: [], history: [], trash: [{ project: deletedCurrent, retentionUntil: '2020-01-01T00:00:00Z' }] } }; } }
  });
  await expiredView.refresh();
  const expiredToggle = expiredSidebar.children[2].children[2].children[0]; expiredToggle.checked = true; expiredToggle.dispatch('change');
  await new Promise(resolve => setImmediate(resolve));
  assert.match(expiredSidebar.children[3].children[0].innerHTML, /保留期已到期，请决定是否永久删除/, 'an expired retention period prompts a user decision');
  assert.equal(expiredView.getState().records.trash.length, 1, 'expired records remain in trash until the user decides');
  expiredView.destroy();

  const compareProject = { ...currentProject, isFrozen: true, lastExportId: 'export-new' };
  const compareSidebar = new Element('aside', document), compareDetail = new Element('div', document);
  const compareView = View.mount({ sidebar: compareSidebar, detail: compareDetail, weather,
    lifecycle: {
      async list() { return { data: { projects: [], history: [{ project: compareProject }], trash: [] } }; },
      async listExports() { return { data: { exports: [
        { exportId: 'export-old', lineageId: 'line-1', exportedAt: '2026-10-10T00:00:00Z' },
        { exportId: 'export-new', lineageId: 'line-1', exportedAt: '2026-10-11T00:00:00Z', snapshot: compareProject }
      ] } }; },
      async compareExports() { return { data: { overview: { added: 0, modified: 1, deleted: 0 }, fields: [
        { change: 'modified', path: 'conditions', before: { value: 1 }, after: { value: 2 } },
        { change: 'modified', path: 'units[unit-1].model', before: 'A', after: 'B' }
      ], units: [{ unitNo: '001', changes: {
        parameters: [{ change: 'modified', path: '机型', before: { name: 'A' }, after: { name: 'B' } }],
        configuration: [{ change: 'added', path: '加湿器', before: null, after: '湿膜' }],
        drawings: [{ change: 'modified', path: '图纸文件', before: 'old.dxf', after: 'new.dxf' }]
      } }] } }; }
    }
  });
  await compareView.refresh();
  const compareHistoryToggle = compareSidebar.children[2].children[1].children[0]; compareHistoryToggle.checked = true; compareHistoryToggle.dispatch('change');
  await new Promise(resolve => setImmediate(resolve));
  const compareButton = compareDetail.children[0].querySelectorAll('button').find(node => node.dataset.action === 'compare');
  compareDetail.dispatch('click', compareButton);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(compareDetail.textContent, /\{"value":1\}/, 'project comparison renders object-valued before and after values as readable JSON');
  assert.match(compareDetail.textContent, /\{"name":"A"\}/, 'unit changes render structured values without object coercion');
  assert.doesNotMatch(compareDetail.textContent, /\[object Object\]/, 'change records never display object coercion text');
  assert.match(compareDetail.textContent, /参数变化/, 'unit parameter changes have a visible category');
  assert.match(compareDetail.textContent, /配置变化/, 'unit configuration changes have a visible category');
  assert.match(compareDetail.textContent, /图纸\/图样变化/, 'unit drawing changes have a visible category');
  assert.doesNotMatch(compareDetail.textContent, /units\[unit-1\]/, 'project-level comparison rows do not duplicate unit details');
  compareView.destroy();

  const frozenActive = { ...currentProject, isFrozen: true, lastExportId: 'frozen-export' };
  const frozenSidebar = new Element('aside', document), frozenDetail = new Element('div', document);
  const frozenView = View.mount({ sidebar: frozenSidebar, detail: frozenDetail, weather,
    lifecycle: {
      async list() { return { data: { projects: [frozenActive], history: [], trash: [] } }; },
      async listExports() { return { data: { exports: [{ exportId: 'frozen-export', lineageId: 'line-1', snapshot: frozenActive }] } }; }
    }
  });
  await frozenView.refresh();
  const frozenActions = frozenDetail.children[0].querySelectorAll('button').map(node => node.dataset.action);
  assert.equal(frozenActions.includes('edit'), false, 'the active frozen snapshot does not expose editing');
  assert.equal(frozenActions.includes('trash'), true, 'the active frozen project can still be moved to the trash');
  assert.equal(frozenActions.includes('download'), true, 'the active frozen snapshot exposes its archived download');
  frozenView.destroy();
  console.log('通过：项目版本分组、最近修改主记录、AND 检索、气象来源和项目中心事件。');
})().catch(error => { console.error(error); process.exitCode = 1; });
