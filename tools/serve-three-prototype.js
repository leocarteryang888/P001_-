const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..', 'outputs', '03-整机选型工作台');
const partRoot = path.resolve(__dirname, '..', 'src', '04-3D零件库');
const srcRoot = path.resolve(__dirname, '..', 'src');
const defaultPartDataFile = path.resolve(__dirname, '..', 'outputs', '04-3D零件库', 'shared-part-library.json');
const defaultPrototypeProjectsFile = path.resolve(__dirname, '..', 'outputs', '03-整机选型工作台', 'shared-prototype-projects.json');
const professionalModules = new Set(['01-过滤器选型', '02-盘管选型', '03-整机选型工作台']);
const port = 8765;
const maxBodyBytes = 16 * 1024 * 1024;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };
const workbenchFile = path.resolve(root, '工业工作台_ThreeJS原型.html');

function resolveServedFile(requestPath) {
  const normalized = requestPath.replace(/^\/+/, '');
  if (normalized === '工业工作台_ThreeJS原型.html') return workbenchFile;
  if (normalized.startsWith('src/')) {
    const [moduleName, ...parts] = normalized.slice(4).split('/');
    if (!professionalModules.has(moduleName)) return null;
    return path.resolve(srcRoot, moduleName, parts.join(path.sep));
  }
  if (normalized.startsWith('parts/')) return path.resolve(partRoot, normalized.slice(6));
  return path.resolve(root, normalized);
}

function collectWorkbenchDependencies() {
  const files = new Set([workbenchFile]);
  const pending = [workbenchFile];
  let importMap = {};
  try {
    const html = fs.readFileSync(workbenchFile, 'utf8');
    const mapMatch = html.match(/<script\s+type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/i);
    if (mapMatch) importMap = JSON.parse(mapMatch[1]).imports || {};
  } catch { importMap = {}; }
  const addReference = (sourceFile, reference) => {
    if (!reference || /^(?:https?:|data:|blob:|#|javascript:)/i.test(reference)) return;
    const mappedKey = Object.keys(importMap).sort((a, b) => b.length - a.length).find(key => reference === key || reference.startsWith(key));
    if (mappedKey) reference = `${importMap[mappedKey]}${reference.slice(mappedKey.length)}`;
    let target;
    try {
      const base = sourceFile === workbenchFile ? '/工业工作台_ThreeJS原型.html' : `/${path.relative(root, sourceFile).split(path.sep).join('/')}`;
      const route = new URL(reference, `http://127.0.0.1${base}`).pathname;
      target = resolveServedFile(decodeURIComponent(route));
    } catch { return; }
    if (!target || !target.startsWith(path.resolve(__dirname, '..') + path.sep) || !fs.existsSync(target)) return;
    const ext = path.extname(target).toLowerCase();
    if (!['.js', '.css', '.html'].includes(ext) || files.has(target)) return;
    files.add(target);
    if (ext === '.js' || ext === '.html') pending.push(target);
  };
  while (pending.length) {
    const file = pending.shift();
    let source;
    try { source = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const refs = [];
    for (const match of source.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) refs.push(match[1]);
    if (file.endsWith('.js')) {
      for (const match of source.matchAll(/(?:from\s*["']|import\s*\(\s*["'])([^"']+)["']/g)) refs.push(match[1]);
    }
    refs.forEach(reference => addReference(file, reference));
  }
  return [...files].sort();
}

function hashWorkbenchFiles(files) {
  const hash = crypto.createHash('sha256');
  for (const file of files) {
    hash.update(path.relative(path.resolve(__dirname, '..'), file).split(path.sep).join('/'));
    hash.update('\0');
    hash.update(fs.readFileSync(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

function getWorkbenchVersion() {
  const files = collectWorkbenchDependencies();
  return { hash: hashWorkbenchFiles(files), files: files.map(file => path.relative(path.resolve(__dirname, '..'), file).split(path.sep).join('/')) };
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  response.end(JSON.stringify(payload));
}

function isLoopback(request, servicePort = port) {
  const address = request.socket.remoteAddress || '';
  const host = String(request.headers.host || '').toLowerCase();
  return (address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1') &&
    (host === `127.0.0.1:${servicePort}` || host === `localhost:${servicePort}` || host === `[::1]:${servicePort}`);
}

function readDocument(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
      !Number.isSafeInteger(parsed.revision) || parsed.revision < 1 || !Array.isArray(parsed.parts) ||
      (parsed.categories !== undefined && (!Array.isArray(parsed.categories) || parsed.categories.some(item => !item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.name !== 'string')))) {
      throw new Error('共享零件库快照结构无效');
    }
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    request.on('data', chunk => {
      if (tooLarge) return;
      size += chunk.length;
      if (size > maxBodyBytes) {
        tooLarge = true;
        chunks.length = 0;
        reject(Object.assign(new Error('请求超过 16 MiB 限制'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (tooLarge) return;
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('请求体不是有效 JSON'), { status: 400 })); }
    });
    request.on('error', reject);
  });
}

function validateLibrary(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.parts)) return 'parts 必须是数组';
  if (value.categories !== undefined && (!Array.isArray(value.categories) || value.categories.some(item => !item || typeof item !== 'object' || typeof item.id !== 'string' || typeof item.name !== 'string'))) return 'categories 必须是包含字符串 id 和 name 的对象数组';
  if (value.parts.length > 5000) return '零件数量超过 5000';
  return null;
}

function atomicWrite(file, document) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const serialized = `${JSON.stringify(document, null, 2)}\n`;
  const temp = path.join(path.dirname(file), `.shared-part-library-${process.pid}-${crypto.randomBytes(8).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(temp, serialized, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temp, file);
  } finally {
    try { fs.unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function readPrototypeProjects(file) {
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!doc || typeof doc !== 'object' || Array.isArray(doc) || !Number.isSafeInteger(doc.revision) || doc.revision < 1 ||
        !Array.isArray(doc.projects) || doc.projects.some(p => !p || typeof p !== 'object' || typeof p.code !== 'string' || !Array.isArray(p.units) ||
          p.units.some(u => !u || typeof u !== 'object' || !Array.isArray(u.segments)))) throw new Error('共享原型项目快照结构无效');
    return doc;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function validatePrototypeProjects(value) {
  if (!Array.isArray(value)) return 'projects 必须是数组';
  if (value.length > 500) return '项目数量超过 500';
  let units = 0, segments = 0;
  for (const project of value) {
    if (!project || typeof project !== 'object' || typeof project.code !== 'string' || typeof project.name !== 'string' || !Array.isArray(project.units)) return '项目字段无效';
    units += project.units.length;
    for (const unit of project.units) {
      if (!unit || typeof unit !== 'object' || typeof unit.no !== 'string' || !Array.isArray(unit.segments)) return '机组字段无效';
      segments += unit.segments.length;
    }
  }
  if (units > 5000) return '机组数量超过 5000';
  if (segments > 50000) return '功能段数量超过 50000';
  return null;
}

function createServer(options = {}) {
  const partDataFile = path.resolve(options.partDataFile || defaultPartDataFile);
  const prototypeProjectsFile = path.resolve(options.prototypeProjectsFile || defaultPrototypeProjectsFile);
  const servicePort = options.port || port;
  let writeQueue = Promise.resolve();
  return http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname); }
    catch { response.writeHead(400).end(); return; }
    if (pathname === '/api/part-library' || pathname.startsWith('/api/part-library/')) {
      if (!isLoopback(request, servicePort)) { sendJson(response, 403, { error: '仅允许本机访问' }); return; }
      if (pathname !== '/api/part-library') { sendJson(response, 404, { error: '接口路径不存在' }); return; }
      if (request.method === 'GET') {
        try {
          const current = readDocument(partDataFile);
          if (!current) { sendJson(response, 200, { exists: false, revision: null, library: null }); return; }
          sendJson(response, 200, { exists: true, library: current }, { ETag: `"${current.revision}"` });
        } catch {
          sendJson(response, 500, { error: '共享零件库文件无法读取或格式损坏' });
        }
        return;
      }
      if (request.method !== 'PUT') { sendJson(response, 405, { error: '仅支持 GET 和 PUT' }, { Allow: 'GET, PUT' }); return; }
      writeQueue = writeQueue.then(async () => {
        let incoming;
        try { incoming = await readRequestBody(request); }
        catch (error) { sendJson(response, error.status || 400, { error: error.message }); return; }
        const invalid = validateLibrary(incoming?.library);
        if (invalid) { sendJson(response, 400, { error: invalid }); return; }
        if (!(incoming.expectedRevision === null || (Number.isSafeInteger(incoming.expectedRevision) && incoming.expectedRevision >= 1))) {
          sendJson(response, 400, { error: 'expectedRevision 必须是当前修订号或 null' }); return;
        }
        let current;
        try { current = readDocument(partDataFile); }
        catch { sendJson(response, 500, { error: '共享零件库文件格式损坏，已停止写入以保护现有数据' }); return; }
        const actualRevision = current ? current.revision : null;
        if (incoming.expectedRevision !== actualRevision) {
          sendJson(response, 409, { error: '修订冲突，请先读取最新快照', expectedRevision: incoming.expectedRevision, currentRevision: actualRevision }); return;
        }
        const next = { schemaVersion: Number.isSafeInteger(incoming.library.schemaVersion) ? incoming.library.schemaVersion : 2, revision: (current?.revision || 0) + 1, updatedAt: new Date().toISOString(), parts: incoming.library.parts, categories: incoming.library.categories || [] };
        try {
          if (current) {
            const backup = `${partDataFile}.rev-${current.revision}.json`;
            try { fs.copyFileSync(partDataFile, backup, fs.constants.COPYFILE_EXCL); }
            catch (error) {
              if (error.code !== 'EEXIST') throw error;
              const existingBackup = fs.readFileSync(backup, 'utf8');
              if (existingBackup !== fs.readFileSync(partDataFile, 'utf8')) throw new Error('前版本备份文件已存在且内容不匹配');
            }
          }
          atomicWrite(partDataFile, next);
          sendJson(response, 200, { exists: true, library: next }, { ETag: `"${next.revision}"` });
        } catch (error) {
          sendJson(response, 500, { error: `保存失败，当前快照未替换：${error.message}` });
        }
      }).catch(() => sendJson(response, 500, { error: '共享零件库写入失败' }));
      return;
    }
    if (pathname === '/api/prototype-projects') {
      if (!isLoopback(request, servicePort)) { sendJson(response, 403, { error: '仅允许本机访问' }); return; }
      if (request.method === 'GET') {
        try {
          const current = readPrototypeProjects(prototypeProjectsFile);
          if (!current) { sendJson(response, 200, { exists: false, revision: null, projects: null }); return; }
          sendJson(response, 200, { exists: true, revision: current.revision, projects: current.projects }, { ETag: `"${current.revision}"` });
        } catch { sendJson(response, 500, { error: '共享原型项目文件无法读取或格式损坏' }); }
        return;
      }
      if (request.method !== 'PUT') { sendJson(response, 405, { error: '仅支持 GET 和 PUT' }, { Allow: 'GET, PUT' }); return; }
      writeQueue = writeQueue.then(async () => {
        let incoming;
        try { incoming = await readRequestBody(request); }
        catch (error) { sendJson(response, error.status || 400, { error: error.message }); return; }
        const invalid = validatePrototypeProjects(incoming?.projects);
        if (invalid) { sendJson(response, 400, { error: invalid }); return; }
        if (!(incoming.expectedRevision === null || (Number.isSafeInteger(incoming.expectedRevision) && incoming.expectedRevision >= 1))) { sendJson(response, 400, { error: 'expectedRevision 必须是当前修订号或 null' }); return; }
        let current;
        try { current = readPrototypeProjects(prototypeProjectsFile); }
        catch { sendJson(response, 500, { error: '共享原型项目文件格式损坏，已停止写入以保护现有数据' }); return; }
        const actualRevision = current ? current.revision : null;
        if (incoming.expectedRevision !== actualRevision) { sendJson(response, 409, { error: '修订冲突，请先读取最新快照', expectedRevision: incoming.expectedRevision, currentRevision: actualRevision }); return; }
        const next = { schemaVersion: 1, revision: (current?.revision || 0) + 1, updatedAt: new Date().toISOString(), projects: incoming.projects };
        try {
          if (current) {
            const backup = `${prototypeProjectsFile}.rev-${current.revision}.json`;
            try { fs.copyFileSync(prototypeProjectsFile, backup, fs.constants.COPYFILE_EXCL); }
            catch (error) {
              if (error.code !== 'EEXIST') throw error;
              if (fs.readFileSync(backup, 'utf8') !== fs.readFileSync(prototypeProjectsFile, 'utf8')) throw new Error('前版本备份文件已存在且内容不匹配');
            }
          }
          atomicWrite(prototypeProjectsFile, next);
          sendJson(response, 200, { exists: true, revision: next.revision, projects: next.projects }, { ETag: `"${next.revision}"` });
        } catch (error) { sendJson(response, 500, { error: `保存失败，当前快照未替换：${error.message}` }); }
      }).catch(() => sendJson(response, 500, { error: '共享原型项目写入失败' }));
      return;
    }
    if (pathname === '/api/workbench-version') {
      if (!isLoopback(request, servicePort)) { sendJson(response, 403, { error: '仅允许本机访问' }); return; }
      if (request.method !== 'GET') { sendJson(response, 405, { error: '仅支持 GET' }, { Allow: 'GET' }); return; }
      try { sendJson(response, 200, { version: getWorkbenchVersion().hash }); }
      catch { sendJson(response, 500, { error: '工作台版本无法计算' }); }
      return;
    }
    if (pathname === '/health') { response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('P001 Three.js prototype'); return; }
    if (pathname === '/') {
      response.writeHead(302, { Location: `/${encodeURIComponent('工业工作台_ThreeJS原型.html')}`, 'Cache-Control': 'no-store' }).end();
      return;
    }
    const isPartLibrary = pathname === '/parts' || pathname.startsWith('/parts/');
    const isProfessional = pathname === '/src' || pathname.startsWith('/src/');
    if (pathname === '/src' || pathname === '/src/') {
      const query = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
      response.writeHead(302, { Location: `/${encodeURIComponent('工业工作台_ThreeJS原型.html')}${query}`, 'Cache-Control': 'no-store' }).end();
      return;
    }
    if (pathname === '/src/03-整机选型工作台' || pathname === '/src/03-整机选型工作台/' || pathname === '/src/03-整机选型工作台/index.html') {
      const query = request.url.includes('?') ? request.url.slice(request.url.indexOf('?')) : '';
      response.writeHead(302, { Location: `/${encodeURIComponent('工业工作台_ThreeJS原型.html')}${query}`, 'Cache-Control': 'no-store' }).end();
      return;
    }
    let selectedRoot, cleanPath;
    if (isPartLibrary) {
      selectedRoot = partRoot;
      cleanPath = pathname.replace(/^\/parts\/?/, '');
    } else if (isProfessional) {
      const [moduleName, ...modulePath] = pathname.replace(/^\/src\/?/, '').split('/');
      if (!professionalModules.has(moduleName)) { response.writeHead(404).end(); return; }
      selectedRoot = path.resolve(srcRoot, moduleName);
      cleanPath = modulePath.join('/');
    } else {
      selectedRoot = root;
      cleanPath = pathname.replace(/^\/+/, '');
    }
    if (!cleanPath) cleanPath = 'index.html';
    const relative = cleanPath.split('/').join(path.sep);
    const target = path.resolve(selectedRoot, relative);
    if (!target.startsWith(selectedRoot + path.sep)) { response.writeHead(403).end(); return; }
    const extension = path.extname(target).toLowerCase();
    if (!mime[extension]) { response.writeHead(403).end(); return; }
    fs.stat(target, (error, stat) => {
      if (error || !stat.isFile()) { response.writeHead(404).end(); return; }
      response.writeHead(200, { 'Content-Type': mime[extension], 'Cache-Control': 'no-store' });
      fs.createReadStream(target).pipe(response);
    });
  });
}

if (require.main === module) {
  createServer().listen(port, '127.0.0.1', () => {
    process.stdout.write(`P001 workbench: http://127.0.0.1:${port}/\n`);
  });
}

module.exports = { createServer, validatePrototypeProjects, readPrototypeProjects, collectWorkbenchDependencies, hashWorkbenchFiles, getWorkbenchVersion };
