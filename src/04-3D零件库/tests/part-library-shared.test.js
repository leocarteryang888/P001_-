const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/part-library-store.js'), 'utf8');

async function run() {
  const local = new Map([['p001-ahu-part-library-v2', JSON.stringify({ schemaVersion: 2, updatedAt: '2026-09-25T00:00:00Z', parts: [{ id: 'old-edge', name: 'Edge旧版' }] })]]);
  let puts = 0;
  const context = {
    localStorage: { getItem: key => local.get(key) || null, setItem: (key, value) => local.set(key, value) },
    fetch: async (_url, options = {}) => {
      if (options.method === 'PUT') { puts++; return { ok: true, json: async () => ({ exists: true, library: { revision: 1, parts: [{ id: 'new-iab', name: 'IAB新版' }], categories: [] } }) }; }
      return { ok: true, json: async () => ({ exists: false, revision: null, library: null }) };
    },
    indexedDB: null,
    crypto: { randomUUID: () => 'test' }
  };
  vm.runInNewContext(source, context);
  const store = context.AHUPartLibraryStore;
  const localBefore = local.get(store.storageKey);
  const empty = await store.loadEffectiveSnapshot([]);
  assert.equal(empty.sharedEmpty, true);
  assert.equal(empty.parts[0].id, 'old-edge');
  assert.equal(puts, 0, 'opening an empty shared store must never publish local data');
  assert.equal(local.get(store.storageKey), localBefore, 'loading must not rewrite the local backup');
  await assert.rejects(store.saveShared([{ id: 'old-edge', name: 'Edge旧版' }], []), /尚未建立/);
  assert.equal(puts, 0, 'ordinary save must not create the shared library');
  const published = await store.publishLocal([{ id: 'new-iab', name: 'IAB新版' }], [{ id: 'custom', name: '自定义' }]);
  assert.equal(published.revision, 1);
  assert.equal(puts, 1, 'only an explicit publish may initialize the shared library');
  assert.equal(local.get(store.storageKey), localBefore);
  const remoteContext = {
    localStorage: { getItem: key => key === store.storageKey ? JSON.stringify({ schemaVersion: 2, parts: [{ id: 'old-edge', name: 'Edge旧版' }] }) : null, setItem: () => assert.fail('loading shared data must not mutate local storage') },
    fetch: async (_url, options = {}) => {
      if (options.method === 'PUT') { puts++; return { ok: true, json: async () => ({ exists: true, library: { revision: 8, parts: [{ id: 'shared-new', name: '共享新版' }], categories: [] } }) }; }
      return { ok: true, json: async () => ({ exists: true, revision: 8, library: { revision: 8, parts: [{ id: 'shared-new', name: '共享新版' }], categories: [] } }) };
    }, indexedDB: null, crypto: { randomUUID: () => 'test' }
  };
  vm.runInNewContext(source, remoteContext);
  const remoteStore = remoteContext.AHUPartLibraryStore;
  const remoteSnapshot = await remoteStore.loadEffectiveSnapshot([]);
  assert.equal(remoteSnapshot.source, 'shared');
  assert.equal(remoteSnapshot.differs, true, 'a different local copy must be retained and detected');
  assert.equal(remoteSnapshot.parts[0].id, 'shared-new', 'the shared copy is the default view');
  assert.equal(puts, 1, 'opening an existing shared library must not overwrite it');
  let queuedPuts=0;
  const queueContext={localStorage:{getItem:()=>null,setItem:()=>{}},fetch:async(_url,options={})=>{if(options.method==='PUT'){queuedPuts++;if(queuedPuts===1)return{status:409,ok:false,json:async()=>({currentRevision:9})};return{ok:true,json:async()=>({exists:true,library:{revision:10,parts:[{id:'next',name:'后续保存'}],categories:[]}})}}return{ok:true,json:async()=>({exists:true,revision:9,library:{revision:9,parts:[{id:'current',name:'当前共享'}],categories:[]}})}},indexedDB:null,crypto:{randomUUID:()=> 'test'}};
  vm.runInNewContext(source,queueContext);const queueStore=queueContext.AHUPartLibraryStore;await queueStore.getSharedSnapshot();
  await assert.rejects(queueStore.saveShared([{id:'current',name:'本次冲突'}],[]),error=>error.name==='SharedConflictError');
  const afterFailure=await queueStore.saveShared([{id:'next',name:'后续保存'}],[]);
  assert.equal(afterFailure.revision,10,'a failed write must not poison later saves');
  assert.equal(queuedPuts,2);
  console.log('通过：空共享库不自动发布本机旧库，显式发布保留本机备份，写入失败后队列可恢复。');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
