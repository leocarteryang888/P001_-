(function (root) {
  'use strict';

  const schemaVersion = 2;
  const storageKey = 'p001-ahu-part-library-v2';
  const legacyStorageKeys = ['p001-ahu-part-library-v1'];
  const databaseName = 'p001-ahu-part-library';
  const objectStoreName = 'libraries';
  const recordKey = 'current';
  const sharedEndpoint = '/api/part-library';
  const coordinateContract = 'p001-ahu-xyz-width-length-height-v1';
  const legacyGeometryFrame = 'three-local-x-width-y-height-z-depth-v1';
  const legacyGeometryAxisToSemantic = Object.freeze({ '+x': '-x', '-x': '+x', '+y': '+z', '-y': '-z', '+z': '+y', '-z': '-y' });
  function mapLegacyGeometryAxis(axis) { return legacyGeometryAxisToSemantic[axis] || null; }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function hash(value) {
    let result = 2166136261;
    for (const character of String(value)) {
      result ^= character.charCodeAt(0);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16).padStart(8, '0');
  }

  function createId(prefix = 'custom') {
    const uuid = root.crypto?.randomUUID?.();
    return `${prefix}-${uuid || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`}`;
  }

  function normalizePart(part, index = 0) {
    const value = clone(part || {});
    const seed = JSON.stringify({ ...value, id: undefined, index });
    value.id = String(value.id || '').trim() || `custom-${hash(seed)}-${index}`;
    value.name = String(value.name || '未命名零件').trim();
    value.model = String(value.model || '').trim();
    value.category = String(value.category || 'custom').trim() || 'custom';
    value.kind = String(value.kind || 'custom').trim() || 'custom';
    value.dimensions = value.dimensions && typeof value.dimensions === 'object' ? value.dimensions : {};
    value.params = value.params && typeof value.params === 'object' ? value.params : {};
    value.mounting = value.mounting && typeof value.mounting === 'object' ? value.mounting : {};
    // Existing customScene records remain byte-for-byte in their original local frame.
    // The editor and workbench adapt that frame at the display boundary.
    value.coordinateContract = coordinateContract;
    value.geometryFrame = value.geometryFrame || legacyGeometryFrame;
    value.mounting.flow = /^[+-][xyz]$/.test(value.mounting.flow) ? value.mounting.flow : '+z';
    value.mounting.up = /^[+-][xyz]$/.test(value.mounting.up) ? value.mounting.up : '+y';
    if (value.mounting.flow.slice(-1) === value.mounting.up.slice(-1)) value.mounting.up = value.mounting.flow.slice(-1) === 'y' ? '+z' : '+y';
    return value;
  }

  function normalizeParts(parts) {
    const used = new Set();
    return (Array.isArray(parts) ? parts : []).map((part, index) => {
      const value = normalizePart(part, index);
      const original = value.id;
      let suffix = 2;
      while (used.has(value.id)) value.id = `${original}-${suffix++}`;
      used.add(value.id);
      return value;
    });
  }

  function parse(raw) {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      if (!Array.isArray(value?.parts) || !value.parts.length) return null;
      return { schemaVersion: schemaVersion, parts: normalizeParts(value.parts), updatedAt: value.updatedAt || null };
    } catch {
      return null;
    }
  }

  function loadLocalRecord() {
    try {
      const current = parse(root.localStorage.getItem(storageKey));
      if (current) return current;
      for (const key of legacyStorageKeys) {
        const legacy = parse(root.localStorage.getItem(key));
        if (legacy) return legacy;
      }
    } catch {
      return null;
    }
    return null;
  }

  function loadSync() {
    return loadLocalRecord()?.parts || null;
  }

  function localSnapshot(categories = []) {
    const local = loadLocalRecord();
    if (!local?.parts?.length) return null;
    return { schemaVersion, parts: normalizeParts(local.parts), categories: Array.isArray(categories) ? clone(categories) : [], updatedAt: local.updatedAt || null };
  }

  let sharedState = { checked: false, exists: false, revision: null, library: null };
  let writeQueue = Promise.resolve();
  function snapshotSignature(value) {
    return JSON.stringify({ parts: normalizeParts(value?.parts || []), categories: value?.categories || [] });
  }
  async function getSharedSnapshot() {
    const response = await root.fetch(sharedEndpoint, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`读取共享零件库失败（HTTP ${response.status}）`);
    const body = await response.json();
    sharedState = { checked: true, exists: body.exists === true, revision: body.revision ?? body.library?.revision ?? null, library: body.exists && body.library?.parts?.length ? { schemaVersion, parts: normalizeParts(body.library.parts), categories: Array.isArray(body.library.categories) ? clone(body.library.categories) : [], updatedAt: body.library.updatedAt || null } : null };
    return sharedState;
  }
  async function loadEffectiveSnapshot(categories = []) {
    const durableParts = await load().catch(() => null);
    const baseLocal = localSnapshot(categories);
    const local = durableParts?.length ? { schemaVersion, parts: normalizeParts(durableParts), categories: Array.isArray(categories) ? clone(categories) : [], updatedAt: baseLocal?.updatedAt || null } : baseLocal;
    try {
      const state = await getSharedSnapshot();
      if (state.library) return { ...state.library, source: 'shared', local, differs: !!local && snapshotSignature(local) !== snapshotSignature(state.library), revision: state.revision };
      return { ...(local || {}), source: 'local', local, sharedEmpty: true, revision: null };
    } catch (error) {
      return { ...(local || {}), source: local ? 'local-fallback' : 'default', local, unavailable: true, error };
    }
  }
  async function putShared(library, expectedRevision) {
    const response = await root.fetch(sharedEndpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ expectedRevision, library: { schemaVersion, parts: normalizeParts(library.parts), categories: Array.isArray(library.categories) ? clone(library.categories) : [] } }) });
    if (response.status === 409) {
      const body = await response.json().catch(() => ({}));
      const error = new Error('共享零件库已被其他浏览器更新；本机修改仍已保存在本地，请先读取共享版本再处理。');
      error.name = 'SharedConflictError'; error.currentRevision = body.currentRevision; throw error;
    }
    if (!response.ok) throw new Error(response.status === 413 ? '共享零件库超过服务端 16 MiB 限制；本机版本已保存，请导出 JSON 备份并精简后重试。' : `同步共享零件库失败（HTTP ${response.status}）`);
    const body = await response.json();
    if (!body.exists || !body.library?.parts?.length) throw new Error('服务端没有确认共享零件库保存结果。');
    sharedState = { checked: true, exists: true, revision: body.library.revision, library: { schemaVersion, parts: normalizeParts(body.library.parts), categories: body.library.categories || [], updatedAt: body.library.updatedAt || null } };
    return sharedState;
  }
  function saveShared(library, categories = []) {
    const snapshot = { schemaVersion, parts: normalizeParts(library), categories: clone(categories) };
    const operation = writeQueue.catch(() => {}).then(async () => {
      if (!sharedState.checked) throw new Error('正在读取共享版本；本机已保存，请稍候再编辑或保存。');
      if (!sharedState.exists) throw new Error('共享库尚未建立。请使用“发布本机版本”明确建立共享库。');
      return putShared(snapshot, sharedState.revision);
    });
    writeQueue = operation.catch(() => {});
    return operation;
  }
  async function publishLocal(library, categories = []) {
    if (!sharedState.checked) await getSharedSnapshot();
    if (sharedState.exists) throw new Error('共享库已经建立，请先读取共享版本并通过显式覆盖操作更新。');
    return putShared({ parts: library, categories }, null);
  }
  async function replaceSharedWithLocal(library, categories = []) {
    if (!sharedState.checked) await getSharedSnapshot();
    if (!sharedState.exists) return publishLocal(library, categories);
    return putShared({ parts: library, categories }, sharedState.revision);
  }

  function openDatabase() {
    if (!root.indexedDB) return Promise.reject(new Error('当前浏览器不支持持久化数据库'));
    return new Promise((resolve, reject) => {
      const request = root.indexedDB.open(databaseName, 1);
      request.onerror = () => reject(request.error || new Error('打开零件库持久化数据库失败'));
      request.onupgradeneeded = () => request.result.createObjectStore(objectStoreName);
      request.onsuccess = () => resolve(request.result);
    });
  }

  function idbRead() {
    return openDatabase().then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction(objectStoreName, 'readonly');
      const request = transaction.objectStore(objectStoreName).get(recordKey);
      request.onerror = () => reject(request.error || new Error('读取零件库持久化数据失败'));
      request.onsuccess = () => resolve(request.result ? { parts: normalizeParts(request.result.parts), updatedAt: request.result.updatedAt || null } : null);
      transaction.oncomplete = () => db.close();
    }));
  }

  function idbWrite(parts) {
    return openDatabase().then(db => new Promise((resolve, reject) => {
      const transaction = db.transaction(objectStoreName, 'readwrite');
      transaction.objectStore(objectStoreName).put({ schemaVersion, parts: normalizeParts(parts), updatedAt: new Date().toISOString() }, recordKey);
      transaction.onerror = () => reject(transaction.error || new Error('写入零件库持久化数据失败'));
      transaction.oncomplete = () => { db.close(); resolve(true); };
    }));
  }

  function save(parts) {
    const normalized = normalizeParts(parts);
    const payload = JSON.stringify({ schemaVersion, parts: normalized, updatedAt: new Date().toISOString() });
    try {
      root.localStorage.setItem(storageKey, payload);
    } catch (error) {
      const durable = idbWrite(normalized);
      durable.catch(() => {});
      const wrapped = new Error('浏览器本地存储空间不足，已尝试写入持久化数据库；请同时导出 JSON 备份。');
      wrapped.name = error?.name || 'StorageError';
      throw wrapped;
    }
    idbWrite(normalized).catch(() => {});
    return normalized;
  }

  function load() {
    const local = loadLocalRecord();
    return idbRead().then(durable => {
      if (!durable?.parts?.length) return local?.parts || null;
      if (!local?.parts?.length) return durable.parts;
      const durableTime = Date.parse(durable.updatedAt || 0) || 0;
      const localTime = Date.parse(local.updatedAt || 0) || 0;
      return durableTime > localTime ? durable.parts : local.parts;
    }).catch(() => local?.parts || null);
  }

  root.AHUPartLibraryStore = { schemaVersion, storageKey, sharedEndpoint, coordinateContract, legacyGeometryFrame, legacyGeometryAxisToSemantic, mapLegacyGeometryAxis, createId, normalizePart, normalizeParts, loadSync, load, save, localSnapshot, getSharedSnapshot, loadEffectiveSnapshot, saveShared, publishLocal, replaceSharedWithLocal, sharedState: () => ({ ...sharedState }) };
})(typeof globalThis !== 'undefined' ? globalThis : window);
