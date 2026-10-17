const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { createServer } = require('../serve-three-prototype');

(async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'p001-prototype-api-'));
  const dataFile = path.join(temp, 'shared-prototype-projects.json');
  const partFile = path.join(temp, 'untouched-part-library.json');
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const testPort = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const server = createServer({ prototypeProjectsFile: dataFile, partDataFile: partFile, port: testPort });
  await new Promise(resolve => server.listen(testPort, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${testPort}/api/prototype-projects`;
  const call = (method, body) => fetch(url, { method, headers: { Host: `127.0.0.1:${testPort}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    for (const legacy of ['/src', '/src/', '/src/03-整机选型工作台', '/src/03-整机选型工作台/', '/src/03-整机选型工作台/index.html']) {
      const routed = await fetch(`http://127.0.0.1:${testPort}${legacy}?from=old-entry`, { redirect: 'manual', headers: { Host: `127.0.0.1:${testPort}` } });
      assert.equal(routed.status, 302, `${legacy} redirects to the selected whole-unit entry`);
      const location = new URL(routed.headers.get('location'), `http://127.0.0.1:${testPort}`);
      assert.equal(decodeURIComponent(location.pathname), '/工业工作台_ThreeJS原型.html');
      assert.equal(location.search, '?from=old-entry');
    }
    for (const asset of ['/src/03-整机选型工作台/js/app.js', '/src/03-整机选型工作台/css/industrial-assembly-workspace.css', '/src/01-过滤器选型/index.html', '/src/02-盘管选型/index.html']) {
      const response = await fetch(`http://127.0.0.1:${testPort}${asset}`, { headers: { Host: `127.0.0.1:${testPort}` } });
      assert.equal(response.status, 200, `specialist page or asset remains reachable: ${asset}`);
    }
    const unified = await fetch(`http://127.0.0.1:${testPort}/工业工作台_ThreeJS原型.html`, { headers: { Host: `127.0.0.1:${testPort}` } });
    assert.equal(unified.status, 200);
    const unifiedHtml = await unified.text();
    assert.doesNotMatch(unifiedHtml, />\s*正式项目工作台\s*</u, 'the selected workbench page has no second-workbench navigation');
    for (const asset of ['/src/03-整机选型工作台/js/prototype-project-store.js', '/src/03-整机选型工作台/js/prototype-project-ui.js', '/src/03-整机选型工作台/js/three-preview.js']) {
      const assetResponse = await fetch(`http://127.0.0.1:${testPort}${asset}`, { headers: { Host: `127.0.0.1:${testPort}` } });
      assert.equal(assetResponse.status, 200, `prototype asset route serves ${asset}`);
    }
    let response = await call('GET');
    assert.deepEqual(await response.json(), { exists: false, revision: null, projects: null });
    const projectSet = [{ code: 'A', name: 'Project A', units: [{ no: 'AHU-A', segments: [{ id: 'old' }] }, { no: 'AHU-B', segments: [] }] }];
    response = await call('PUT', { expectedRevision: null, projects: projectSet });
    assert.equal(response.status, 200, await response.clone().text());
    const saved = await response.json();
    assert.equal(saved.revision, 1);
    assert.deepEqual(saved.projects[0].units[1].segments, [], 'an explicitly empty unit remains empty');
    const changed = structuredClone(saved.projects); changed[0].units[0].segments = [{ id: 'edited-A' }];
    response = await call('PUT', { expectedRevision: 1, projects: changed });
    assert.equal(response.status, 200);
    const backup = JSON.parse(fs.readFileSync(`${dataFile}.rev-1.json`, 'utf8'));
    assert.equal(backup.revision, saved.revision); assert.deepEqual(backup.projects, saved.projects);
    response = await call('PUT', { expectedRevision: 1, projects: projectSet });
    assert.equal(response.status, 409);
    response = await call('PUT', { expectedRevision: 2, projects: Array.from({ length: 501 }, (_, i) => ({ code: `P${i}`, name: `P${i}`, units: [] })) });
    assert.equal(response.status, 400, 'oversized project sets are rejected without changing the committed snapshot');
    assert.equal((await call('GET').then(r => r.json())).revision, 2);
    assert.equal((await call('GET')).status, 200);
    assert.equal(fs.existsSync(partFile), false, 'project API does not touch the part-library snapshot');
    fs.writeFileSync(dataFile, '{broken', 'utf8');
    response = await call('GET'); assert.equal(response.status, 500);
    response = await call('PUT', { expectedRevision: null, projects: [] }); assert.equal(response.status, 500);
    assert.equal(fs.readFileSync(dataFile, 'utf8'), '{broken');
    console.log('通过：共享原型项目 API 隔离文件、零段、修订冲突、备份和损坏保护正常。');
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
