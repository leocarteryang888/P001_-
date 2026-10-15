const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, '../js/part-library-store.js'), 'utf8');
assert.match(source, /durableTime > localTime \? durable\.parts : local\.parts/, 'reload must choose the newest committed library instead of a stale local copy');
const values = new Map();
const sandbox = {
  console,
  crypto: { randomUUID: () => '11111111-1111-4111-8111-111111111111' },
  localStorage: { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) },
  indexedDB: null,
  setTimeout,
  Date,
  Math,
  JSON,
  Error,
  Promise
};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox);
const store = sandbox.AHUPartLibraryStore;
assert.equal(store.coordinateContract, 'p001-ahu-xyz-width-length-height-v1');
assert.deepEqual(JSON.parse(JSON.stringify(store.legacyGeometryAxisToSemantic)), { '+x': '-x', '-x': '+x', '+y': '+z', '-y': '-z', '+z': '+y', '-z': '-y' });
assert.equal(store.mapLegacyGeometryAxis('+z'), '+y', 'legacy depth/flow becomes semantic Y length/flow');
assert.equal(store.mapLegacyGeometryAxis('+y'), '+z', 'legacy height becomes semantic Z height');

const savedGeometry = [{ id: 'mesh-1', geometry: { type: 'buffer', position: [0, 1, 2], normal: [1, 0, 0] }, position: [3, 4, 5], rotation: [0.1, 0.2, 0.3], scale: [1, 2, 3] }];
const parts = store.normalizeParts([{ name: '缺少 ID', customScene: savedGeometry }, { id: 'stable', name: '稳定零件' }, { id: 'stable', name: '重复 ID' }]);
assert.match(parts[0].id, /^custom-[0-9a-f]{8}-0$/);
assert.equal(parts[0].geometryFrame, store.legacyGeometryFrame);
assert.deepEqual(JSON.parse(JSON.stringify(parts[0].customScene)), savedGeometry, 'coordinate tagging must preserve saved mesh vertices and transforms');
assert.equal(parts[1].id, 'stable');
assert.equal(parts[2].id, 'stable-2');
store.save(parts);
assert.equal(store.loadSync().length, 3);
assert.equal(store.loadSync()[1].id, 'stable');
assert.equal(JSON.parse(values.get(store.storageKey)).schemaVersion, 2);
assert.deepEqual(store.normalizePart({ id: '  x  ', dimensions: null }).id, 'x');
console.log('通过：零件库版本化持久化、稳定 ID、重复 ID 修复和本地恢复正常。');
