(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AHUPrototypeProjectStore = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  function validProjects(value) {
    return Array.isArray(value) && value.every(p => p && typeof p === 'object' && typeof p.code === 'string' && Array.isArray(p.units) &&
      p.units.every(u => u && typeof u === 'object' && Array.isArray(u.segments)));
  }
  const clone = value => JSON.parse(JSON.stringify(value));
  function captureUnitSegments(projects, projectIndex, unitIndex, segments) {
    const unit = projects?.[projectIndex]?.units?.[unitIndex];
    if (!unit || !Array.isArray(segments)) return false;
    if (JSON.stringify(unit.segments) !== JSON.stringify(segments)) {
      unit.segments = clone(segments); unit.savedAt = new Date().toISOString();
    }
    return true;
  }
  function restoreUnitSegments(projects, projectIndex, unitIndex) {
    const segments = projects?.[projectIndex]?.units?.[unitIndex]?.segments;
    return Array.isArray(segments) ? clone(segments) : null;
  }

  const formalTypeMap = { 'fresh-air':'fresh', mixing:'mix', 'primary-filter':'primary', 'medium-filter':'medium', 'cooling-coil':'coil', 'heating-coil':'heat', humidifier:'humid', fan:'fan', silencer:'silencer', access:'access', 'supply-air':'supply', 'return-air':'return', 'exhaust-air':'supply', 'high-filter':'high', 'electric-heater':'heat', 'return-fan':'fan', 'exhaust-fan':'fan', empty:'empty', equalizer:'empty', eliminator:'empty', 'heat-recovery':'coil' };
  function createFormalPrototypeCopy(project, unit, idFactory = () => `copy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`) {
    if (!project || !unit || !Array.isArray(unit.segments)) throw new Error('正式项目或机组结构无效');
    const suffix = Date.now().toString(36);
    const segments = unit.segments.filter(segment => segment && typeof segment.type === 'string').map(segment => {
      const selection = segment.interface?.selection || {}, drawing = segment.interface?.drawing || {}, partRef = selection.partRef || {};
      return { id: idFactory(), type: formalTypeMap[segment.type] || 'empty', sourceType: segment.type,
        name: String(segment.name || segment.type), length: Number(drawing.length) || 0, confirmed: false,
        model: String(selection.model || selection.systemRecommended || partRef.model || ''),
        source: 'V2 输入副本 · 待复核', capacity: '', resistance: '',
        connections: Array.isArray(drawing.connections) ? clone(drawing.connections) : [], connectionsStatus: drawing.connectionsStatus || '',
        partRef: { partId: String(partRef.partId || ''), name: String(partRef.name || ''), model: String(partRef.model || ''), librarySchemaVersion: 2, updatedAt: partRef.updatedAt || null } };
    });
    return { name: `${project.name || '正式项目'}（原型副本）`, code: `${String(project.projectCode || project.projectId || 'PRJ').slice(0, 24)}-COPY-${suffix.toUpperCase()}`,
      customer: String(project.customer || '正式项目副本'), units: [{ no: `${unit.unitNo || 'AHU'}-COPY`, name: String(unit.profile?.productName || '导入机组副本'),
        airflow: String(unit.designConditions?.airVolume?.value ?? unit.designConditions?.airflow?.value ?? '未填写'),
        designConditions: { cabinetWidth: { value: unit.designConditions?.cabinetWidth?.value ?? unit.cabinetSelection?.width?.value ?? '' }, cabinetHeight: { value: unit.designConditions?.cabinetHeight?.value ?? unit.cabinetSelection?.height?.value ?? '' }, airVolume: { value: unit.designConditions?.airVolume?.value ?? '' } },
        state: '待复核', segments }] };
  }
  function normalizeFormalExport(raw) {
    let candidate = raw?.currentProject?.project ? raw.currentProject : raw;
    if (!candidate?.project && Array.isArray(raw?.projectIndex)) candidate = raw.projectIndex.find(item => item?.project?.project?.units?.length || item?.project?.units?.length)?.project || raw.currentProject;
    const metadata = candidate?.project || candidate, units = metadata?.units || candidate?.units;
    if (!Array.isArray(units) || !units.length) throw new Error('文件中没有 V2 项目机组');
    return { project: { ...metadata, units }, units };
  }
  async function saveImportedCopy({ store, source, projects, copy, dirty = false }) {
    if (source !== 'shared') throw new Error('请先显式保存当前演示或本机草稿，再从共享快照导入；导入不会自动发布其他数据');
    if (dirty) throw new Error('当前项目或机组有未保存修改；请先保存，再导入正式副本');
    const codes = new Set(projects.map(project => project.code));
    while (codes.has(copy.code)) copy.code = `${copy.code}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const result = await store.save([...clone(projects), clone(copy)]);
    return { ...result, importedProject: clone(copy) };
  }

  function createStore({ storage, fetchImpl, endpoint = '/api/prototype-projects', key = 'p001-ahu-prototype-projects-v1' }) {
    const state = { localKind: 'absent', localProjects: null, sharedKind: 'loading', sharedProjects: null, revision: null, projects: null, source: null, error: '' };
    async function request(method, body) {
      const response = await fetchImpl(endpoint, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
      let payload;
      try { payload = await response.json(); } catch { payload = {}; }
      if (!response.ok) {
        const error = new Error(payload.error || `共享存储失败（HTTP ${response.status}）`);
        error.status = response.status;
        error.currentRevision = payload.currentRevision;
        throw error;
      }
      return payload;
    }
    async function initialize(seedProjects) {
      let raw;
      try { raw = storage.getItem(key); }
      catch { state.localKind = 'unavailable'; }
      if (raw === null) state.localKind = 'absent';
      else if (raw !== undefined) {
        try {
          const parsed = JSON.parse(raw);
          if (!validProjects(parsed)) throw new Error('结构无效');
          state.localKind = 'valid'; state.localProjects = clone(parsed);
        } catch { state.localKind = 'invalid'; }
      }
      try {
        const shared = await request('GET');
        state.sharedKind = shared.exists ? 'exists' : 'absent';
        state.sharedProjects = shared.projects === null ? null : clone(shared.projects);
        state.revision = shared.revision;
      } catch (error) { state.sharedKind = 'unavailable'; state.error = error.message; }
      if (state.sharedKind === 'exists') { state.projects = clone(state.sharedProjects); state.source = 'shared'; }
      else if (state.sharedKind === 'absent' && state.localKind === 'valid') { state.projects = clone(state.localProjects); state.source = 'local'; }
      else if (state.sharedKind === 'unavailable' && state.localKind === 'valid') { state.projects = clone(state.localProjects); state.source = 'local'; }
      else { state.projects = clone(seedProjects); state.source = 'demo'; }
      return state;
    }
    async function save(projects) {
      if (!validProjects(projects)) throw new Error('项目数据格式无效');
      try {
        const result = await request('PUT', { expectedRevision: state.revision, projects: clone(projects) });
        state.sharedKind = 'exists'; state.sharedProjects = clone(result.projects); state.revision = result.revision;
        state.projects = clone(result.projects); state.source = 'shared'; state.error = '';
        return { ...result, projects: clone(result.projects) };
      } catch (error) { state.error = error.message; throw error; }
    }
    async function publishLocal() {
      if (state.localKind !== 'valid') throw new Error('没有可发布的有效旧浏览器草稿');
      return save(state.localProjects);
    }
    async function saveBeforeSwitch({ projects, capture, switchTo }) {
      const snapshot = capture();
      const result = await save(projects);
      await switchTo(snapshot);
      return result;
    }
    async function beforeSelectionChange({ projects, capture, switchTo }) {
      if (state.source === 'shared') return saveBeforeSwitch({ projects, capture, switchTo });
      const snapshot = capture();
      await switchTo(snapshot);
      return { saved: false, snapshot };
    }
    function viewLocal() {
      if (state.localKind !== 'valid') throw new Error('没有可查看的有效旧浏览器草稿');
      state.projects = clone(state.localProjects); state.source = 'local'; return state;
    }
    function useShared() {
      if (state.sharedKind !== 'exists') throw new Error('共享快照当前不可用');
      state.projects = clone(state.sharedProjects); state.source = 'shared'; return state;
    }
    return { state, initialize, save, saveBeforeSwitch, beforeSelectionChange, publishLocal, viewLocal, useShared };
  }
  return { createStore, validProjects, captureUnitSegments, restoreUnitSegments, createFormalPrototypeCopy, normalizeFormalExport, saveImportedCopy };
});
