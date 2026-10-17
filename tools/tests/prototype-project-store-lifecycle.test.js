const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { test } = require('node:test');
const { createServer } = require('../serve-three-prototype');
const { createStore } = require('../../src/03-整机选型工作台/js/prototype-project-store');

function memoryStorage() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; }

test('real createStore lifecycle calls use the lifecycle route while shared GET/PUT stay on the base route', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'p001-store-lifecycle-'));
  const probe = net.createServer(); await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
  const server = createServer({ prototypeProjectsFile: path.join(dir, 'projects.json'), prototypeExportsDir: path.join(dir, 'exports'), port });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  try {
    const endpoint = `http://127.0.0.1:${port}/api/prototype-projects`;
    const store = createStore({ storage: memoryStorage(), fetchImpl: fetch, endpoint });
    await store.initialize([]);
    const saved = await store.save([{ projectId: 'integration-project', lineageId: 'integration-lineage', versionId: 'integration-version', code: '', name: '联测项目', salesCompanyCode: 'BJ', businessOwner: '测试', units: [{ unitId: 'integration-unit', unitLineageId: 'integration-unit-lineage', no: 'BJ-001', sequenceNo: '001', segments: [{ id: 's1', name: '新风段', confirmed: true, source: 'manual-confirmed', drawing: { length: 800 }, interface: { drawing: { length: 800 } } }], cabinetSelection: { confirmed: true, source: 'manual', width: { value: 1000 }, height: { value: 1200 } }, pendingRecalculation: false }] }]);
    assert.equal(saved.projects[0].code, 'BJ-2610-001');
    const listed = await store.lifecycle.list({ includeHistory: true });
    assert.equal(listed.data.projects[0].projectId, 'integration-project');
    const version = await store.lifecycle.createVersion({ projectId: 'integration-project', draft: { name: '联测新版本' } });
    assert.equal(version.data.project.name, '联测新版本');
    assert.equal(version.data.project.lineageId, 'integration-lineage');
    const exports = await store.lifecycle.listExports({ projectId: 'integration-lineage' });
    assert.deepEqual(exports.data.exports, []);
    const exported = await store.lifecycle.export({ projectId: version.data.project.projectId });
    assert.ok(exported.data.export.exportId);
    const after = await store.lifecycle.list({ includeHistory: true });
    assert.equal(after.data.projects[0].projectId, version.data.project.projectId);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
