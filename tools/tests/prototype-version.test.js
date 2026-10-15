const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { createServer, collectWorkbenchDependencies, hashWorkbenchFiles } = require('../serve-three-prototype');

(async () => {
  const probe = net.createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const server = createServer({ port });
  await new Promise(resolve => server.listen(port, '127.0.0.1', resolve));
  const headers = { Host: `127.0.0.1:${port}` };
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'p001-workbench-version-'));
  const fixtureFile = path.join(fixture, 'dependency.js');
  try {
    let response = await fetch(`http://127.0.0.1:${port}/api/workbench-version`, { headers });
    assert.equal(response.status, 200);
    const first = await response.json();
    assert.match(first.version, /^[0-9a-f]{64}$/);
    response = await fetch(`http://127.0.0.1:${port}/api/workbench-version`, { headers });
    assert.equal((await response.json()).version, first.version, 'unchanged code keeps the same version');
    const files = collectWorkbenchDependencies();
    assert.equal(files.some(file => file.endsWith('shared-prototype-projects.json')), false, 'mutable project data is excluded');
    fs.writeFileSync(fixtureFile, 'const version = 1;\n', 'utf8');
    const fixtureVersion = hashWorkbenchFiles([fixtureFile]);
    fs.appendFileSync(fixtureFile, '\n/* version test */\n', 'utf8');
    assert.notEqual(hashWorkbenchFiles([fixtureFile]), fixtureVersion, 'a code dependency changes the version');
    response = await fetch(`http://127.0.0.1:${port}/api/workbench-version`, { method: 'POST', headers });
    assert.equal(response.status, 405);
    console.log('通过：工作台版本接口稳定、排除用户数据、检测代码依赖变化且只读。');
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
