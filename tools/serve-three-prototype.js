const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ProjectVersion = require('../src/03-整机选型工作台/js/prototype-project-version');
const DrawingExport = require('../src/03-整机选型工作台/js/drawing-export');
const PrototypeWeather = require('../src/03-整机选型工作台/js/prototype-weather');

const root = path.resolve(__dirname, '..', 'src', '03-整机选型工作台');
const runtimeRoot = path.resolve(__dirname, '..', 'outputs', '03-整机选型工作台');
const partRoot = path.resolve(__dirname, '..', 'src', '04-3D零件库');
const srcRoot = path.resolve(__dirname, '..', 'src');
const defaultPartDataFile = path.resolve(__dirname, '..', 'outputs', '04-3D零件库', 'shared-part-library.json');
const defaultPrototypeProjectsFile = path.resolve(runtimeRoot, 'shared-prototype-projects.json');
const professionalModules = new Set(['01-过滤器选型', '02-盘管选型', '03-整机选型工作台']);
const port = 8765;
const maxBodyBytes = 16 * 1024 * 1024;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png' };
const workbenchFile = path.resolve(root, 'index.html');

function createZip(entries) {
  const crcTable = createZip.crcTable || (createZip.crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; }));
  const crc32 = buffer => { let crc = 0xffffffff; for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; };
  const now = new Date(), dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2), dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const locals = [], centrals = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8'), data = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(String(entry.content), 'utf8'), crc = crc32(data);
    if (name.length > 0xffff || data.length > 0xffffffff || offset > 0xffffffff) throw new Error('导出文件超过标准 ZIP 单文件限制');
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8); local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, name, data);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(dosTime, 12); central.writeUInt16LE(dosDate, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    centrals.push(central, name); offset += local.length + name.length + data.length;
  }
  const centralData = Buffer.concat(centrals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(centralData.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, centralData, end]);
}

function resolveServedFile(requestPath) {
  const normalized = requestPath.replace(/^\/+/, '');
  if (normalized === '工业工作台_ThreeJS原型.html' || normalized === 'index.html') return workbenchFile;
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
      const base = sourceFile === workbenchFile ? '/src/03-整机选型工作台/index.html' : `/${path.relative(root, sourceFile).split(path.sep).join('/')}`;
      const route = new URL(reference, `http://127.0.0.1${base}`).pathname;
      target = resolveServedFile(decodeURIComponent(route));
    } catch { return; }
    if (!target || !target.startsWith(path.resolve(__dirname, '..') + path.sep) || !fs.existsSync(target)) return;
    const ext = path.extname(target).toLowerCase();
    if (!['.js', '.css', '.html', '.png', '.svg', '.webp', '.jpg', '.jpeg'].includes(ext) || files.has(target)) return;
    files.add(target);
    if (ext === '.js' || ext === '.html' || ext === '.css') pending.push(target);
  };
  while (pending.length) {
    const file = pending.shift();
    let source;
    try { source = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const refs = [];
    for (const match of source.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) refs.push(match[1]);
    if (file.endsWith('.js')) {
      for (const match of source.matchAll(/(?:from\s*["']|import\s*\(\s*["'])([^"']+)["']/g)) refs.push(match[1]);
      for (const match of source.matchAll(/["']((?:\/src\/|\.\.?\/)[^"']+\.(?:png|svg|webp|jpe?g))["']/gi)) refs.push(match[1]);
    }
    if (file.endsWith('.css')) {
      for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) refs.push(match[1]);
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

function confirmedUnit(unit) {
  const width = Number(unit?.cabinetSelection?.width?.value ?? unit?.cabinetSelection?.width), height = Number(unit?.cabinetSelection?.height?.value ?? unit?.cabinetSelection?.height);
  return unit?.pendingRecalculation !== true && unit?.cabinetSelection?.confirmed === true && width > 0 && height > 0 && Array.isArray(unit?.segments) && unit.segments.length > 0 && unit.segments.every(segment => segment?.confirmed === true && !!segment?.source && segment?.status !== 'invalidated');
}
function confirmedUnitFingerprint(unit, project) {
  const technical = new Set(['unitId','unitLineageId','createdAt','modifiedAt','savedAt','updatedAt','revisionNo','lastConfirmedFingerprint','sequenceNo','no','confirmed','confirmedAt','manualConfirmation','pendingRecalculation','state','status','displayGeometryDefaults','__displayGeometryDefaults']);
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().filter(key => !technical.has(key)).map(key => [key, canonical(value[key])])) : value;
  const weather = PrototypeWeather.resolve(project, unit);
  const effectiveWeather = { winterDry: weather.winter?.dryBulb ?? null, winterRh: weather.winter?.rh ?? null, summerDry: weather.summer?.dryBulb ?? null, summerWet: weather.summer?.wetBulb ?? null };
  return crypto.createHash('sha256').update(JSON.stringify(canonical({ unit, effectiveWeather }))).digest('hex');
}

function validatePrototypeProjects(value) {
  if (!Array.isArray(value)) return 'projects 必须是数组';
  if (value.length > 500) return '项目数量超过 500';
  let units = 0, segments = 0;
  for (const project of value) {
    if (!project || typeof project !== 'object' || typeof project.code !== 'string' || typeof project.name !== 'string' || !Array.isArray(project.units)) return '项目字段无效';
    units += project.units.length;
    const unitNos = new Set();
    for (const unit of project.units) {
      if (!unit || typeof unit !== 'object' || typeof unit.no !== 'string' || !Array.isArray(unit.segments)) return '机组字段无效';
      const normalizedNo = unit.no.trim().toUpperCase();
      if (normalizedNo && unitNos.has(normalizedNo)) return '同一项目内机组编号不得重复';
      unitNos.add(normalizedNo);
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
  const prototypeExportsDir = path.resolve(options.prototypeExportsDir || path.join(runtimeRoot, 'exports'));
  const servicePort = options.port || port;
  const clock = typeof options.clock === 'function' ? options.clock : () => new Date();
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
        const hadCurrent = Boolean(current);
        const actualRevision = current ? current.revision : null;
        if (incoming.expectedRevision !== actualRevision) { sendJson(response, 409, { error: '修订冲突，请先读取最新快照', expectedRevision: incoming.expectedRevision, currentRevision: actualRevision }); return; }
        current ||= { schemaVersion: 1, revision: 0, projects: [], history: [], trash: [], exports: [], cleanupPending: [], numberCounters: {} };
        current.projects ||= []; current.history ||= []; current.trash ||= []; current.exports ||= []; current.cleanupPending ||= []; current.numberCounters ||= {};
        for (const previous of current?.projects || []) {
          const retained = incoming.projects.some(item => (previous.projectId && item.projectId === previous.projectId) || (!previous.projectId && item.code === previous.code));
          if (!retained) { sendJson(response, 409, { error: '项目必须从项目中心移入回收站，不能通过保存直接移除' }); return; }
        }
        const now = clock(), nowIso = now.toISOString();
        const projects = structuredClone(incoming.projects);
        const idOf = project => String(project?.projectId || project?.code || '');
        for (const project of projects) {
          const previous = current?.projects?.find(item => (project.projectId && item.projectId === project.projectId) || (!project.projectId && item.code === project.code));
          if (previous && JSON.stringify(previous) === JSON.stringify(project)) continue;
          if (previous?.isFrozen) { sendJson(response, 409, { error: '已导出的项目版本只读，请从该版本创建新版本后修改' }); return; }
          if (!project.projectId) project.projectId = ProjectVersion.makeId('project');
          if (previous) {
            if (String(project.code || '') !== String(previous.code || '')) {
              sendJson(response, 409, { error: '项目编号在项目生命周期内固定，不能修改' }); return;
            }
            project.lineageId = previous.lineageId || previous.projectId || previous.code;
            project.versionId = previous.versionId || ProjectVersion.makeId('version');
            project.createdAt = previous.createdAt || nowIso;
            project.modifiedAt = JSON.stringify(previous) === JSON.stringify(project) ? (previous.modifiedAt || previous.createdAt || nowIso) : nowIso;
          } else {
            project.createdAt ||= nowIso; project.modifiedAt = nowIso; project.lineageId ||= project.projectId;
            project.versionId ||= ProjectVersion.makeId('version');
            if (!project.code) {
              const company = String(project.salesCompanyCode || '').trim().toUpperCase();
              if (!company) { sendJson(response, 400, { error: '请填写销售公司代码后分配项目编号' }); return; }
              const localNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
              const yearMonth = `${String(localNow.getFullYear()).slice(-2)}${String(localNow.getMonth() + 1).padStart(2, '0')}`;
              project.creationYearMonth = yearMonth;
              const prefix = `${company}-${yearMonth}-`;
              const historicalProjects = [...(current?.history || []).map(item => item.project), ...(current?.trash || []).map(item => item.project)];
              const highest = Math.max(Number(current?.numberCounters?.[prefix] || 1) - 1, 0,
                ...[...(current?.projects || []), ...historicalProjects, ...projects.filter(item => item !== project)].map(item => String(item?.code || '').startsWith(prefix) ? Number(item.code.slice(prefix.length)) || 0 : 0));
              try { project.code = ProjectVersion.projectCode(project, yearMonth, highest + 1); current.numberCounters[prefix] = highest + 2; }
              catch (error) { sendJson(response, 400, { error: error.message }); return; }
            }
          }
          const candidateLineage = project.lineageId || project.projectId || project.code;
          const sameCodeElsewhere = [
            ...(current?.projects || []),
            ...(current?.history || []).map(row => row.project),
            ...(current?.trash || []).map(row => row.project),
            ...projects.filter(item => item !== project)
          ].find(item => String(item?.code || '').trim().toUpperCase() === String(project.code || '').trim().toUpperCase() &&
            (item?.lineageId || item?.projectId || item?.code) !== candidateLineage);
          if (sameCodeElsewhere) { sendJson(response, 409, { error: `项目编号 ${project.code} 已属于其他项目沿袭` }); return; }
          for (const unit of project.units || []) {
            unit.unitId ||= ProjectVersion.makeId('unit');
            unit.unitLineageId ||= unit.unitId;
          }
          const lineage = project.lineageId || project.projectId || project.code;
          const priorVersions = [...(current?.history || []).map(item => item.project), ...(current?.trash || []).map(item => item.project)]
            .filter(item => (item?.lineageId || item?.projectId || item?.code) === lineage);
          const prior = previous || (current?.projects || []).find(item => item.projectId === project.projectId);
          for (const unit of project.units || []) {
            const priorUnit = (prior?.units || []).find(old => (unit.unitLineageId && old.unitLineageId === unit.unitLineageId) || old.unitId === unit.unitId);
            if (!priorUnit) continue;
            unit.no = priorUnit.no;
            unit.revisionNo = priorUnit.revisionNo;
            const priorFingerprint = priorUnit.lastConfirmedFingerprint || (confirmedUnit(priorUnit) ? confirmedUnitFingerprint(priorUnit, prior) : null);
            if (priorFingerprint) unit.lastConfirmedFingerprint = priorFingerprint;
            if (confirmedUnit(unit)) {
              const nextFingerprint = confirmedUnitFingerprint(unit, project);
              const previousFingerprint = priorFingerprint;
              if (previousFingerprint && previousFingerprint !== nextFingerprint) {
                const flags = `${unit.nonstandardFlag === true ? 'T' : ''}${unit.parameterAdjustmentFlag === true ? 'E' : ''}`;
                const currentFlags = `${priorUnit.nonstandardFlag === true ? 'T' : ''}${priorUnit.parameterAdjustmentFlag === true ? 'E' : ''}`;
                const nextNo = ProjectVersion.nextRevision(priorUnit, [], { currentRevision: priorUnit.revisionNo, currentFlags, flags });
                const withoutFlags = flags ? nextNo.slice(0, -(flags.length + 1)) : nextNo;
                unit.no = nextNo; unit.revisionNo = withoutFlags.match(/-([A-Z])$/i)?.[1] || withoutFlags.match(/(?<=\d{3})([A-Z])$/i)?.[1] || null;
              }
              unit.lastConfirmedFingerprint = nextFingerprint;
            }
          }
          const reservedRows = [...(project.usedUnitNumbers || []), ...(prior?.usedUnitNumbers || []), ...(prior?.units || []).map(unit => ({ no: unit.no, sequenceNo: unit.sequenceNo, unitId: unit.unitId, unitLineageId: unit.unitLineageId })), ...priorVersions.flatMap(item => item?.usedUnitNumbers || []), ...priorVersions.flatMap(item => item?.units || []).map(unit => ({ no: unit.no, sequenceNo: unit.sequenceNo, unitId: unit.unitId, unitLineageId: unit.unitLineageId }))];
          const reserved = new Map(reservedRows.filter(item => item?.no).map(item => [String(item.no).trim().toUpperCase(), item]));
          const reservedSequences = new Map();
          for (const row of reservedRows) {
            const sequenceNo = String(row?.sequenceNo || ProjectVersion.inferSequenceNo(row?.no) || '');
            if (/^\d{3}$/.test(sequenceNo) && !reservedSequences.has(sequenceNo)) reservedSequences.set(sequenceNo, row);
          }
          for (const unit of project.units || []) {
            const number = String(unit.no || '').trim().toUpperCase(), existing = reserved.get(number);
            const knownUnit = existing && (existing.unitLineageId && unit.unitLineageId ? existing.unitLineageId === unit.unitLineageId : existing.unitId === unit.unitId);
            if (existing && !knownUnit) { sendJson(response, 409, { error: `机组编号 ${unit.no} 已在项目历史中使用，不得复用` }); return; }
            const sequenceNo = String(unit.sequenceNo || ProjectVersion.inferSequenceNo(unit.no) || ''), sequenceOwner = /^\d{3}$/.test(sequenceNo) ? reservedSequences.get(sequenceNo) : undefined;
            const sameSequenceOwner = sequenceOwner && (sequenceOwner.unitLineageId && unit.unitLineageId ? sequenceOwner.unitLineageId === unit.unitLineageId : sequenceOwner.unitId === unit.unitId);
            if (sequenceOwner && !sameSequenceOwner) { sendJson(response, 409, { error: `机组流水号 ${sequenceNo} 已由其他机组历史使用，不得复用` }); return; }
            const currentReservation = { no: unit.no, sequenceNo, unitId: unit.unitId, unitLineageId: unit.unitLineageId };
            reserved.set(number, currentReservation); if (/^\d{3}$/.test(sequenceNo)) reservedSequences.set(sequenceNo, currentReservation);
          }
          project.usedUnitNumbers = [...reserved.values()].map(item => ({ no: item.no, sequenceNo: item.sequenceNo || ProjectVersion.inferSequenceNo(item.no), unitId: item.unitId || null, unitLineageId: item.unitLineageId || null }));
        }
        const next = { ...(current || {}), schemaVersion: 1, revision: (current?.revision || 0) + 1, updatedAt: nowIso, projects };
        try {
          if (hadCurrent) {
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
    if (pathname === '/api/prototype-projects/lifecycle') {
      if (!isLoopback(request, servicePort)) { sendJson(response, 403, { error: '仅允许本机访问' }); return; }
      if (request.method !== 'POST') { sendJson(response, 405, { error: '仅支持 POST' }, { Allow: 'POST' }); return; }
      writeQueue = writeQueue.then(async () => {
        let incoming;
        try { incoming = await readRequestBody(request); } catch (error) { sendJson(response, error.status || 400, { error: error.message }); return; }
        let current;
        try { current = readPrototypeProjects(prototypeProjectsFile); } catch { sendJson(response, 500, { error: '共享原型项目文件格式损坏，已停止操作以保护现有数据' }); return; }
        if (!current) current = { schemaVersion: 1, revision: 0, projects: [], history: [], trash: [], exports: [] };
        current.history ||= []; current.trash ||= []; current.exports ||= []; current.cleanupPending ||= [];
        current.cleanupPending = current.cleanupPending.filter(item => {
          try {
            const target = path.resolve(item.file), base = path.resolve(prototypeExportsDir);
            if (path.dirname(target) !== base || !path.basename(target).includes('.delete-')) return true;
            fs.unlinkSync(target); return false;
          } catch (error) { return error.code !== 'ENOENT'; }
        });
        const idOf = project => String(project?.projectId || project?.versionId || project?.code || '');
        const body = incoming || {}, action = String(body.action || ''), projectId = String(body.projectId || ''), exportId = String(body.exportId || '');
        let data; const filesToDelete = []; const exportFilesToRollback = [];
        const safe = value => String(value || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').trim() || '未命名';
        let suppliedDrawing = null;
        const project = current.projects.find(item => idOf(item) === projectId || item.lineageId === projectId);
        try {
          if (action === 'list') {
            const trashedLineages = new Set(current.trash.map(row => row.project?.lineageId || idOf(row.project)));
            data = { projects: current.projects, history: body.includeHistory ? current.history.filter(row => body.includeTrash || !trashedLineages.has(row.project?.lineageId || idOf(row.project))) : [], trash: body.includeTrash ? current.trash : [] };
          }
          else if (action === 'get') data = { project: [...current.projects, ...current.history.map(row => row.project)].find(item => idOf(item) === projectId || item.versionId === body.versionId) || null };
          else if (action === 'trash') {
            if (!project) throw Object.assign(new Error('项目不存在'), { status: 404 });
            current.projects = current.projects.filter(item => item !== project);
            const now = clock(), retention = new Date(now); retention.setFullYear(retention.getFullYear() + 3);
            current.trash.push({ project, deletedAt: now.toISOString(), retentionUntil: retention.toISOString() });
          } else if (action === 'restore') {
            const row = current.trash.find(item => idOf(item.project) === projectId || item.project.lineageId === projectId);
            if (!row) throw Object.assign(new Error('回收站项目不存在'), { status: 404 });
            current.trash = current.trash.filter(item => item !== row); current.projects.push(row.project); data = { project: row.project };
          } else if (action === 'permanently-delete') {
            if (body.confirmed !== true) throw Object.assign(new Error('永久删除需要二次确认'), { status: 400 });
            const row = current.trash.find(item => idOf(item.project) === projectId || item.project.lineageId === projectId);
            if (!row) throw Object.assign(new Error('回收站项目不存在'), { status: 404 });
            current.trash = current.trash.filter(item => item !== row);
            const lineage = row.project.lineageId || idOf(row.project);
            const removedHistory = current.history.filter(item => item.project?.lineageId === lineage || item.project?.projectId === idOf(row.project));
            const removedExports = current.exports.filter(item => item.lineageId === lineage || item.snapshot?.lineageId === lineage || item.snapshot?.projectId === idOf(row.project));
            const insideExports = file => { const relative = path.relative(prototypeExportsDir, path.resolve(String(file || ''))); return !!relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative); };
            const archiveFiles = [...new Set(removedExports.flatMap(item => [item.file, item.manifestFile, ...(item.artifactFiles || []).map(file => file.path)]).filter(Boolean))];
            if (archiveFiles.some(file => !insideExports(file))) throw Object.assign(new Error('归档文件路径超出项目归档目录，已停止永久删除以保护数据'), { status: 400 });
            for (const file of archiveFiles) if (fs.existsSync(file) && !fs.statSync(file).isFile()) throw Object.assign(new Error('归档路径不是普通文件，已停止永久删除'), { status: 400 });
            current.history = current.history.filter(item => !removedHistory.includes(item));
            current.exports = current.exports.filter(item => !removedExports.includes(item));
            filesToDelete.push(...archiveFiles);
            for (const file of archiveFiles) {
              const quarantine = `${file}.delete-${ProjectVersion.makeId('pending')}`;
              if (fs.existsSync(file)) { fs.renameSync(file, quarantine); current.cleanupPending.push({ file: quarantine, queuedAt: clock().toISOString() }); }
            }
          } else if (action === 'create-version' || action === 'copy') {
            const activeSource = current.projects.find(item => (body.projectId && idOf(item) === body.projectId) || (body.versionId && item.versionId === body.versionId));
            const historicalSource = current.history.find(item => (body.projectId && idOf(item.project) === body.projectId) || (body.versionId && item.project?.versionId === body.versionId))?.project;
            const source = activeSource || historicalSource || project;
            if (!source) throw Object.assign(new Error('来源项目不存在'), { status: 404 });
            if (action === 'copy' && body.cancelled === true) { data = { cancelled: true, project: source }; }
            else {
              const lineageId = source.lineageId || idOf(source), lineageCurrent = current.projects.filter(item => (item.lineageId || idOf(item)) === lineageId);
              for (const active of lineageCurrent) if (!current.history.some(row => row.project?.versionId === active.versionId)) current.history.push({ project: { ...structuredClone(active), isFrozen: true }, archivedAt: clock().toISOString() });
              if (!current.history.some(row => row.project?.versionId === source.versionId)) current.history.push({ project: { ...structuredClone(source), isFrozen: true }, archivedAt: clock().toISOString() });
              current.projects = current.projects.filter(item => (item.lineageId || idOf(item)) !== lineageId);
              const next = { ...structuredClone(source), ...(body.draft || {}), projectId: ProjectVersion.makeId('project'), lineageId, versionId: ProjectVersion.makeId('version'), parentVersionId: source.versionId || null, isFrozen: false, createdAt: new Date().toISOString(), modifiedAt: new Date().toISOString() };
              next.units = (body.draft?.units || source.units || []).map(unit => ({ ...unit, unitLineageId: unit.unitLineageId || unit.unitId || ProjectVersion.makeId('unit-lineage') }));
              next.code = source.code;
              const invalid = validatePrototypeProjects([next]); if (invalid) throw Object.assign(new Error(invalid), { status: 400 });
              current.projects.push(next); data = { project: next };
            }
          } else if (action === 'export') {
            if (!project) throw Object.assign(new Error('项目不存在'), { status: 404 });
            const incomplete = (project.units || []).filter(unit => {
              const width = Number(unit.cabinetSelection?.width?.value ?? unit.cabinetSelection?.width), height = Number(unit.cabinetSelection?.height?.value ?? unit.cabinetSelection?.height);
              return unit.pendingRecalculation === true || !Array.isArray(unit.segments) || !unit.segments.length || !(width > 0) || !(height > 0) || unit.cabinetSelection?.confirmed !== true || unit.segments.some(segment => segment?.confirmed !== true || !segment?.source || segment?.status === 'invalidated');
            });
            if (!(project.units || []).length || incomplete.length) throw Object.assign(new Error(`项目尚不能下发：${incomplete.length ? `机组 ${incomplete.map(unit => unit.no || unit.unitId).join('、')} 尚未完成有效确认` : '至少需要一台已完成确认的机组'}`), { status: 422 });
            if (body.drawingArtifact !== undefined) {
              const artifact = body.drawingArtifact;
              if (!artifact || !['pdf','dxf'].includes(artifact.kind) || typeof artifact.contentBase64 !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(artifact.contentBase64)) throw Object.assign(new Error('图纸归档内容格式无效'), { status: 400 });
              const unit = (project.units || []).find(item => item.unitId === String(artifact.unitId || ''));
              const content = Buffer.from(artifact.contentBase64, 'base64');
              if (!unit || !content.length || content.length > 12 * 1024 * 1024) throw Object.assign(new Error('图纸归档机组或文件大小无效'), { status: 400 });
              const expectedExtension = `.${artifact.kind}`;
              let filename = safe(artifact.filename);
              if (!filename.toLowerCase().endsWith(expectedExtension)) filename += expectedExtension;
              suppliedDrawing = { unitId: unit.unitId, unitNo: unit.no, kind: artifact.kind, filename, content, contentType: artifact.kind === 'pdf' ? 'application/pdf' : 'application/dxf; charset=utf-8' };
            }
            const now = clock(); const localNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' })); const exportedAt = now.toISOString();
            const stamp = `${localNow.getFullYear()}${String(localNow.getMonth()+1).padStart(2,'0')}${String(localNow.getDate()).padStart(2,'0')}`;
            const filename = `${safe(project.code)}-${stamp}-${safe(project.businessOwner)}-${safe(project.name)}.zip`;
            const record = ProjectVersion.freezeExport(project, { exportedAt, filename });
            const file = path.join(prototypeExportsDir, `${record.exportId}.zip`), manifestFile = path.join(prototypeExportsDir, `${record.exportId}-manifest.json`); record.file = file; record.manifestFile = manifestFile; exportFilesToRollback.push(file, manifestFile);
            const frozen = { ...structuredClone(project), isFrozen: true, lastExportId: record.exportId };
            current.projects = current.projects.map(item => item === project ? frozen : item);
            const artifacts = frozen.units.map(unit => {
              const width = unit.cabinetSelection?.width?.value ?? unit.cabinetSelection?.width, height = unit.cabinetSelection?.height?.value ?? unit.cabinetSelection?.height;
              const drawingProject = { ...frozen, projectCode: frozen.code, customerName: frozen.customer, units: [{ ...unit, unitNo: unit.no, profile: { ...(unit.profile || {}), customerUnitNo: unit.customerUnitNo }, designConditions: { cabinetWidth: width, cabinetHeight: height } }] };
              const model = DrawingExport.makeDrawingModel(drawingProject, { generatedAt: exportedAt, title: `${frozen.name} · ${unit.no} 配置示意图` });
              if (model.missing.length) throw Object.assign(new Error(`机组 ${unit.no} 图纸资料不完整：${model.missing.join('、')}`), { status: 422 });
              const stem = `${filename.replace(/\.zip$/i, '')}-${safe(unit.no)}`;
              return { unitId: unit.unitId, unitNo: unit.no, files: { dxf: DrawingExport.createDxf(model), csv: DrawingExport.csv(model), printableHtml: DrawingExport.htmlDocument(model), disclaimer: model.disclaimer }, downloadableFiles: [
                { kind: 'dxf', filename: `${stem}.dxf`, contentType: 'application/dxf; charset=utf-8' },
                { kind: 'csv', filename: `${stem}.csv`, contentType: 'text/csv; charset=utf-8' },
                { kind: 'html', filename: `${stem}.html`, contentType: 'text/html; charset=utf-8' }
              ] };
            });
            record.snapshot = frozen; record.artifacts = artifacts;
            const priorExport = current.exports.filter(item => item.lineageId === (frozen.lineageId || frozen.projectId) && item.snapshot).sort((a, b) => String(a.exportedAt).localeCompare(String(b.exportedAt))).at(-1) || null;
            record.changeRecord = priorExport ? ProjectVersion.compareExports(priorExport, { ...record, snapshot: frozen }) : { fromExportId: null, toExportId: record.exportId, fields: [] };
            record.artifactFiles = artifacts.flatMap(artifact => artifact.downloadableFiles.map(meta => {
              const unitToken = crypto.createHash('sha256').update(String(artifact.unitId)).digest('hex').slice(0, 20);
              const artifactPath = path.join(prototypeExportsDir, `${record.exportId}-${unitToken}-${meta.kind}.${meta.kind}`);
              const fileRecord = { ...meta, unitId: artifact.unitId, unitNo: artifact.unitNo, path: artifactPath, url: `/api/prototype-exports/${record.exportId}/artifacts/${encodeURIComponent(artifact.unitId)}/${meta.kind}` };
              exportFilesToRollback.push(artifactPath); return fileRecord;
            }));
            if (suppliedDrawing) {
              const unitToken = crypto.createHash('sha256').update(String(suppliedDrawing.unitId)).digest('hex').slice(0, 20), kind = `requested-${suppliedDrawing.kind}`;
              const artifactPath = path.join(prototypeExportsDir, `${record.exportId}-${unitToken}-${kind}.${suppliedDrawing.kind}`);
              const fileRecord = { kind, sourceKind: suppliedDrawing.kind, filename: suppliedDrawing.filename, contentType: suppliedDrawing.contentType, unitId: suppliedDrawing.unitId, unitNo: suppliedDrawing.unitNo, path: artifactPath, url: `/api/prototype-exports/${record.exportId}/artifacts/${encodeURIComponent(suppliedDrawing.unitId)}/${kind}` };
              record.artifactFiles.push(fileRecord); record.requestedDrawing = { unitId: suppliedDrawing.unitId, kind: suppliedDrawing.kind, filename: suppliedDrawing.filename };
              exportFilesToRollback.push(artifactPath);
            }
            record.manifestFilename = `${filename.replace(/\.zip$/i, '')}-清单.json`;
            current.exports.push(record); data = { export: record, downloadUrl: `/api/prototype-exports/${record.exportId}/download`, artifactFiles: record.artifactFiles.map(({ path: _path, ...meta }) => meta) };
          } else if (action === 'list-exports') data = { exports: current.exports.filter(item => !projectId || item.lineageId === projectId || item.snapshot?.projectId === projectId) };
          else if (action === 'get-export') data = { export: current.exports.find(item => item.exportId === exportId) || null };
          else if (action === 'download') { const record = current.exports.find(item => item.exportId === exportId); if (!record) throw Object.assign(new Error('导出记录不存在'), { status: 404 }); data = { export: record, downloadUrl: `/api/prototype-exports/${record.exportId}/download` }; }
          else if (action === 'compare-exports') {
            const left = current.exports.find(item => item.exportId === body.fromExportId), right = current.exports.find(item => item.exportId === body.toExportId);
            if (!right) throw Object.assign(new Error('目标导出记录不存在'), { status: 404 });
            data = ProjectVersion.compareExports(left, right);
          } else throw Object.assign(new Error('未知项目生命周期操作'), { status: 400 });
          if (['list','get','list-exports','get-export','download','compare-exports'].includes(action) || (action === 'copy' && body.cancelled === true)) { sendJson(response, 200, { data, revision: current.revision }); return; }
          if (action === 'export') {
            fs.mkdirSync(prototypeExportsDir, { recursive: true });
            const manifest = { snapshot: data.export.snapshot, version: { versionId: data.export.snapshot.versionId || null, parentVersionId: data.export.snapshot.parentVersionId || null }, changeRecord: data.export.changeRecord, artifactFiles: data.export.artifactFiles.map(({ path: _path, ...meta }) => meta) };
            const zipEntries = [{ name: '项目快照.json', content: `${JSON.stringify(data.export.snapshot, null, 2)}\n` }, { name: '版本与变更记录.json', content: `${JSON.stringify({ version: manifest.version, changeRecord: data.export.changeRecord }, null, 2)}\n` }, ...data.export.artifactFiles.map(meta => ({ name: `机组/${safe(meta.unitNo)}/${meta.filename}`, content: meta.kind.startsWith('requested-') ? suppliedDrawing?.content : data.export.artifacts.find(item => item.unitId === meta.unitId).files[{ dxf: 'dxf', csv: 'csv', html: 'printableHtml' }[meta.kind]] }))];
            const writes = [{ file: data.export.file, content: createZip(zipEntries) }, { file: data.export.manifestFile, content: `${JSON.stringify(manifest, null, 2)}\n` }, ...data.export.artifactFiles.map(meta => ({ file: meta.path, content: meta.kind.startsWith('requested-') ? suppliedDrawing?.content : data.export.artifacts.find(item => item.unitId === meta.unitId).files[{ dxf: 'dxf', csv: 'csv', html: 'printableHtml' }[meta.kind]] }))];
            for (const item of writes) { const temp = `${item.file}.${process.pid}.tmp`; exportFilesToRollback.push(temp); fs.writeFileSync(temp, item.content, { encoding: 'utf8', flag: 'wx' }); fs.renameSync(temp, item.file); }
          }
          current.revision += 1; current.updatedAt = new Date().toISOString(); atomicWrite(prototypeProjectsFile, current);
          if (filesToDelete.length) {
            const pending = current.cleanupPending.filter(item => filesToDelete.some(file => item.file.startsWith(`${file}.delete-`)));
            const remaining = [];
            for (const item of pending) { try { fs.unlinkSync(item.file); } catch (error) { if (error.code !== 'ENOENT') remaining.push(item); } }
            current.cleanupPending = current.cleanupPending.filter(item => !pending.includes(item) || remaining.includes(item));
          }
          sendJson(response, 200, { data, revision: current.revision });
        } catch (error) {
          for (const item of current.cleanupPending || []) if (item.file?.includes('.delete-') && filesToDelete.some(file => item.file.startsWith(`${file}.delete-`))) { const original = item.file.slice(0, item.file.indexOf('.delete-')); try { if (fs.existsSync(item.file) && !fs.existsSync(original)) fs.renameSync(item.file, original); } catch {} }
          current.cleanupPending = (current.cleanupPending || []).filter(item => !filesToDelete.some(file => item.file.startsWith(`${file}.delete-`)));
          for (const file of exportFilesToRollback) { try { fs.unlinkSync(file); } catch {} } sendJson(response, error.status || 400, { error: error.message });
        }
      }).catch(() => sendJson(response, 500, { error: '项目生命周期操作失败' }));
      return;
    }
    const exportDownload = pathname.match(/^\/api\/prototype-exports\/([^/]+)\/download$/);
    if (exportDownload) {
      if (!isLoopback(request, servicePort)) { sendJson(response, 403, { error: '仅允许本机访问' }); return; }
      if (request.method !== 'GET') { sendJson(response, 405, { error: '仅支持 GET' }); return; }
      try {
        const current = readPrototypeProjects(prototypeProjectsFile);
        const record = current?.exports?.find(item => item.exportId === exportDownload[1]);
        if (!record?.file || !fs.existsSync(record.file)) { sendJson(response, 404, { error: '归档文件不存在' }); return; }
        response.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(record.filename)}`, 'Cache-Control': 'no-store' });
        fs.createReadStream(record.file).pipe(response);
      } catch { sendJson(response, 500, { error: '归档文件读取失败' }); }
      return;
    }
    const artifactDownload = pathname.match(/^\/api\/prototype-exports\/([^/]+)\/artifacts\/([^/]+)\/(dxf|csv|html|requested-pdf|requested-dxf)$/);
    if (artifactDownload) {
      if (!isLoopback(request, servicePort)) { sendJson(response, 403, { error: '仅允许本机访问' }); return; }
      if (request.method !== 'GET') { sendJson(response, 405, { error: '仅支持 GET' }); return; }
      try {
        const current = readPrototypeProjects(prototypeProjectsFile), record = current?.exports?.find(item => item.exportId === artifactDownload[1]);
        const unitId = decodeURIComponent(artifactDownload[2]), kind = artifactDownload[3];
        const file = record?.artifactFiles?.find(item => item.unitId === unitId && item.kind === kind);
        const relative = file?.path ? path.relative(prototypeExportsDir, path.resolve(file.path)) : '..';
        if (!file || !relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || !fs.existsSync(file.path) || !fs.statSync(file.path).isFile()) { sendJson(response, 404, { error: '归档产物不存在' }); return; }
        response.writeHead(200, { 'Content-Type': file.contentType, 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`, 'Cache-Control': 'no-store' });
        fs.createReadStream(file.path).pipe(response);
      } catch { sendJson(response, 500, { error: '归档产物读取失败' }); }
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
      cleanPath = pathname === '/工业工作台_ThreeJS原型.html'
        ? 'index.html'
        : pathname.replace(/^\/+/, '');
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
