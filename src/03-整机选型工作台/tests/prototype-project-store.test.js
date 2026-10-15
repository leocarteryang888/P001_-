const assert = require('node:assert/strict');
const { createStore, captureUnitSegments, restoreUnitSegments, createFormalPrototypeCopy, normalizeFormalExport, saveImportedCopy } = require('../js/prototype-project-store');

function mockStorage(raw) { return { getItem: () => raw }; }
function mockFetch(shared, failStatus = 0) {
  return async (_url, options = {}) => {
    if (options.method === 'PUT' && failStatus) return { ok: false, status: failStatus, json: async () => ({ error: 'write rejected', currentRevision: 2 }) };
    if (options.method === 'PUT') {
      const body = JSON.parse(options.body); shared.revision = (shared.revision || 0) + 1; shared.projects = body.projects;
      return { ok: true, status: 200, json: async () => ({ exists: true, revision: shared.revision, projects: shared.projects }) };
    }
    return { ok: true, status: 200, json: async () => shared.revision ? { exists: true, revision: shared.revision, projects: shared.projects } : { exists: false, revision: null, projects: null } };
  };
}

(async () => {
  const localProjects = [{ code: 'OLD', name: 'Old browser', units: [{ no: 'AHU-OLD', segments: [{ id: 'legacy' }] }] }];
  const shared = { revision: 1, projects: [{ code: 'SHARED', name: 'Shared', units: [{ no: 'AHU-1', segments: [] }] }] };
  let writes = 0; const fetchShared = mockFetch(shared);
  let store = createStore({ storage: mockStorage(JSON.stringify(localProjects)), fetchImpl: async (...args) => { if (args[1]?.method === 'PUT') writes++; return fetchShared(...args); } });
  await store.initialize([]);
  assert.equal(writes, 0, 'initialization must not publish or autosave local data');
  assert.equal(store.state.localKind, 'valid'); assert.equal(store.state.source, 'shared');
  assert.equal(store.state.projects[0].code, 'SHARED', 'old local data cannot silently replace shared data');
  store.state.projects[0].units[0].segments.push({ id: 'dirty-copy' });
  assert.equal(store.state.sharedProjects[0].units[0].segments.length, 0, 'working edits cannot mutate the preserved shared snapshot');
  store.viewLocal(); assert.equal(store.state.projects[0].code, 'OLD');
  store.state.projects[0].units[0].segments[0].id = 'edited-local-view';
  store.useShared(); assert.equal(store.state.projects[0].code, 'SHARED');
  assert.equal(store.state.localProjects[0].units[0].segments[0].id, 'legacy', 'editing a local view cannot mutate the preserved legacy snapshot');

  store = createStore({ storage: mockStorage('[]'), fetchImpl: mockFetch({}) }); await store.initialize([{ code: 'DEMO', units: [] }]);
  assert.equal(store.state.localKind, 'valid'); assert.deepEqual(store.state.projects, [], 'valid empty local set remains distinguishable');
  store = createStore({ storage: mockStorage('{broken'), fetchImpl: mockFetch({}) }); await store.initialize([{ code: 'DEMO', units: [] }]);
  assert.equal(store.state.localKind, 'invalid'); assert.equal(store.state.source, 'demo');

  const active = [{ code: 'A', name: 'A', units: [{ no: 'A1', segments: [{ id: 'before' }] }, { no: 'B1', segments: [] }] }];
  const failing = createStore({ storage: mockStorage(null), fetchImpl: mockFetch({}, 409) }); await failing.initialize(active);
  const editedSegments = [{ id: 'edited-A' }]; let currentUnit = 0;
  let switched = false;
  await assert.rejects(failing.saveBeforeSwitch({ projects: active, capture: () => { active[0].units[currentUnit].segments = structuredClone(editedSegments); return currentUnit; }, switchTo: () => { currentUnit = 1; switched = true; } }), /write rejected/);
  assert.match(failing.state.error, /write rejected/, 'write failure remains available for a visible UI message');
  assert.equal(switched, false, 'failed save blocks selection change');
  assert.equal(editedSegments[0].id, 'edited-A', 'failed save keeps the live edited segment list');
  assert.equal(currentUnit, 0, 'failed save keeps the old selected unit');

  const ok = createStore({ storage: mockStorage(null), fetchImpl: mockFetch({}) }); await ok.initialize(active);
  const savedA = await ok.saveBeforeSwitch({ projects: active, capture: () => { active[0].units[currentUnit].segments = structuredClone(editedSegments); return currentUnit; }, switchTo: () => { currentUnit = 1; switched = true; } });
  assert.equal(savedA.projects[0].units[0].segments[0].id, 'edited-A'); assert.equal(switched, true); assert.equal(currentUnit, 1);
  assert.equal(ok.state.projects[0].units[1].segments.length, 0, 'save does not move A edits into B');
  const prototypeUnits = [{ code: 'P', name: 'P', units: [{ no: 'A', segments: [{ id: 'original' }] }, { no: 'B', segments: [] }] }];
  let liveSegments = [{ id: 'edited-before-formal-view' }];
  assert.equal(captureUnitSegments(prototypeUnits, 0, 0, liveSegments), true);
  liveSegments = [{ id: 'formal-readonly-only' }];
  liveSegments = restoreUnitSegments(prototypeUnits, 0, 0);
  assert.equal(liveSegments[0].id, 'edited-before-formal-view', 'returning from formal read-only restores active prototype unit');
  assert.deepEqual(restoreUnitSegments(prototypeUnits, 0, 1), [], 'restoring another empty unit does not fall back to demo segments');

  const formal = { projectId: 'v2-p', projectCode: 'V2-1', name: 'Formal', units: [{ unitId: 'v2-u', unitNo: 'AHU-1', profile: { productName: 'AHU' }, segments: [{ id: 'v2-s', type: 'medium-filter', name: '中效段', status: 'confirmed', interface: { selection: { model: 'F300', professionalResult: { secret: true }, partRef: { partId: 'part-1' } }, drawing: { length: 900, connections: [{ name: '接口' }] } } }] }] };
  assert.equal(normalizeFormalExport({ project: formal }).project.projectId, 'v2-p', 'ordinary V2 JSON export parses');
  assert.equal(normalizeFormalExport({ currentProject: { project: formal } }).units[0].unitId, 'v2-u', 'file shell currentProject export parses');
  assert.equal(normalizeFormalExport({ projectIndex: [{ project: { project: formal } }] }).units[0].unitId, 'v2-u', 'file shell projectIndex project.project.units parses');
  let copyId = 0;
  const imported = createFormalPrototypeCopy(formal, formal.units[0], () => `new-${++copyId}`);
  assert.notEqual(imported.code, formal.projectCode);
  assert.notEqual(imported.units[0].segments[0].id, formal.units[0].segments[0].id);
  assert.equal(imported.units[0].segments[0].type, 'medium');
  assert.equal(imported.units[0].segments[0].confirmed, false);
  assert.equal(imported.units[0].segments[0].partRef.partId, 'part-1');
  assert.equal('isFormalSegment' in imported.units[0].segments[0], false, 'formal preview keeps its read-only flag, imported copy is editable');
  assert.equal('professionalResult' in imported.units[0].segments[0], false, 'seven-part professional result is not copied');
  assert.equal(formal.units[0].segments[0].id, 'v2-s', 'import leaves original V2 unit untouched');
  let importWrites = 0;
  const importShared = createStore({ storage: mockStorage(null), fetchImpl: async (_url, options = {}) => {
    if (options.method === 'PUT') { importWrites++; const payload = JSON.parse(options.body); return { ok: true, status: 200, json: async () => ({ revision: 2, projects: payload.projects }) }; }
    return { ok: true, status: 200, json: async () => ({ exists: true, revision: 1, projects: [{ code: imported.code, name: 'same-code', units: [{ no: 'AHU-SAVED', segments: [{ id: 'saved-segment' }] }] }] }) };
  } });
  await importShared.initialize([]);
  const beforeImport = structuredClone(importShared.state.projects);
  await assert.rejects(saveImportedCopy({ store: importShared, source: 'local', projects: beforeImport, copy: imported }), /不会自动发布其他数据/);
  assert.equal(importWrites, 0, 'import cannot publish local or demo datasets');
  const dirtySharedProjects = structuredClone(importShared.state.projects);
  captureUnitSegments(dirtySharedProjects, 0, 0, [{ id: 'active-edit-before-import' }]);
  await assert.rejects(saveImportedCopy({ store: importShared, source: 'shared', projects: dirtySharedProjects, copy: imported, dirty: true }), /未保存修改/);
  assert.equal(importWrites, 0, 'dirty shared edits block import without issuing a PUT');
  assert.equal(dirtySharedProjects[0].units[0].segments[0].id, 'active-edit-before-import', 'dirty active-unit edits remain captured in memory');
  const importResult = await saveImportedCopy({ store: importShared, source: 'shared', projects: beforeImport, copy: imported });
  assert.equal(importWrites, 1);
  assert.equal(importResult.projects.length, 2);
  assert.notEqual(importResult.projects[1].code, importResult.projects[0].code, 'repeated import receives a unique project code');
  assert.deepEqual(beforeImport, importShared.state.projects.slice(0, 1), 'CAS import appends a copy without altering existing shared source');

  for (const source of ['demo', 'local']) {
    const projects = [{ code: 'P', name: 'Draft', customer: 'C', units: [
      { no: 'A', segments: [{ id: 'a-original' }] }, { no: 'B', segments: [{ id: 'b-original' }] }
    ] }];
    let puts = 0;
    const fetchImpl = async (_url, options = {}) => {
      if (options.method === 'PUT') { puts++; return { ok: true, status: 200, json: async () => ({ exists: true, revision: 1, projects }) }; }
      return { ok: true, status: 200, json: async () => ({ exists: false, revision: null, projects: null }) };
    };
    const storage = source === 'local' ? mockStorage(JSON.stringify(projects)) : mockStorage(null);
    const draftStore = createStore({ storage, fetchImpl });
    await draftStore.initialize(source === 'demo' ? projects : []);
    assert.equal(draftStore.state.source, source);
    let activeProject = 0; let activeUnit = 0; let activeSegments = [{ id: 'a-edited' }]; let view = 'workspace';
    const capture = () => {
      captureUnitSegments(projects, activeProject, activeUnit, activeSegments);
      return { project: activeProject, unit: activeUnit };
    };
    await draftStore.beforeSelectionChange({ projects, capture, switchTo: ({ project, unit }) => {
      activeProject = project; activeUnit = 1; activeSegments = restoreUnitSegments(projects, project, 1); view = 'workspace';
    } });
    assert.equal(projects[0].units[0].segments[0].id, 'a-edited', `${source}: opening B captures edited A in memory`);
    assert.equal(activeSegments[0].id, 'b-original', `${source}: B restores its own segment data`);
    activeSegments = [{ id: 'b-edited' }];
    await draftStore.beforeSelectionChange({ projects, capture, switchTo: () => { view = 'manager'; } });
    assert.equal(view, 'manager', `${source}: returning to the project center succeeds`);
    assert.equal(projects[0].units[1].segments[0].id, 'b-edited', `${source}: return captures B in memory`);
    assert.equal(puts, 0, `${source}: navigation must not publish a draft`);
    assert.equal(draftStore.state.source, source, `${source}: navigation must keep its source identity`);
  }

  const conflictedShared = createStore({ storage: mockStorage(null), fetchImpl: mockFetch({ revision: 1, projects: [{ code: 'SHARED', units: [{ no: 'A', segments: [] }] }] }, 409) });
  await conflictedShared.initialize([{ code: 'SHARED', units: [{ no: 'A', segments: [] }] }]);
  let conflictSwitched = false;
  await assert.rejects(conflictedShared.beforeSelectionChange({
    projects: conflictedShared.state.projects,
    capture: () => ({ project: 0, unit: 0 }),
    switchTo: () => { conflictSwitched = true; }
  }), /write rejected/);
  assert.equal(conflictSwitched, false, 'shared CAS conflict still blocks project or unit switching');
  console.log('通过：本机草稿显式分流、共享优先、旧草稿保留、409 阻断和 A/B 数据隔离正常。');
})().catch(error => { console.error(error); process.exitCode = 1; });
