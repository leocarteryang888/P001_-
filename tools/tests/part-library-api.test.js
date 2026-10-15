const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../serve-three-prototype');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'p001-part-api-'));
  const dataFile = path.join(temp, 'shared-part-library.json');
  const testPort = 18765;
  const server = createServer({ partDataFile: dataFile, port: testPort });
  await new Promise(resolve => server.listen(testPort, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/part-library`;
  const call = (method, body) => fetch(url, {
    method,
    headers: { Host: `127.0.0.1:${testPort}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  try {
    let response = await call('GET');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { exists: false, revision: null, library: null }, 'empty store must not be mistaken for publishable data');
    const first = { schemaVersion: 2, parts: [{ id: 'flange-a' }], categories: [{ id: 'flange', name: '风口法兰' }] };
    response = await call('PUT', { expectedRevision: null, library: first });
    assert.equal(response.status, 200);
    const saved1 = (await response.json()).library;
    assert.equal(saved1.revision, 1);
    assert.equal(saved1.parts[0].id, 'flange-a');
    assert.deepEqual(saved1.categories, [{ id: 'flange', name: '风口法兰' }]);
    response = await call('PUT', { expectedRevision: null, library: { schemaVersion: 2, parts: [], categories: [] } });
    assert.equal(response.status, 409, 'stale or first-write token cannot overwrite a committed snapshot');
    response = await call('PUT', { expectedRevision: 1, library: { ...first, parts: [{ id: 'flange-b' }] } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).library.revision, 2);
    assert.deepEqual(JSON.parse(fs.readFileSync(`${dataFile}.rev-1.json`, 'utf8')), saved1, 'prior revision is retained as an exclusive backup');
    response = await call('GET');
    const got = await response.json();
    assert.equal(got.library.revision, 2);
    assert.equal(got.library.parts[0].id, 'flange-b');
    response = await call('PUT', { expectedRevision: 2, library: { parts: 'invalid' } });
    assert.equal(response.status, 400);
    assert.equal(fs.existsSync(`${dataFile}.rev-2.json`), false, 'rejected payload must not create backup or modify snapshot');
    const damaged = '{"revision":null,"parts":"not-an-array"}';
    fs.writeFileSync(dataFile, damaged, 'utf8');
    response = await call('GET');
    assert.equal(response.status, 500, 'an invalid existing snapshot must not be reported as an empty store');
    response = await call('PUT', { expectedRevision: null, library: { schemaVersion: 2, parts: [], categories: [] } });
    assert.equal(response.status, 500, 'first publish must fail closed when a damaged snapshot exists');
    assert.equal(fs.readFileSync(dataFile, 'utf8'), damaged, 'damaged user data must remain untouched');
    console.log('通过：本机 API 空快照、写入、冲突保护、原子修订与历史备份正常。');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
