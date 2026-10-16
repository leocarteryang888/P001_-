const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const moduleRoot = path.join(root, 'src/03-整机选型工作台');
const html = fs.readFileSync(path.join(moduleRoot, 'index.html'), 'utf8');

assert.match(html, /<title>[^<]*工业工作台/i, 'the canonical module entry is the final workbench page');
assert.doesNotMatch(html, /兼容迁移入口（非最终软件界面）/, 'the old compatibility shell is no longer the module entry');
assert.equal([...html.matchAll(/<style\b/gi)].length, 0, 'styles are maintained in CSS files');
assert.doesNotMatch(html, /data:image\/[^;]+;base64,/i, 'image assets are external files');

const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)];
const inlineScripts = scripts.filter(([, attributes]) => !/\bsrc\s*=/i.test(attributes) && !/\btype\s*=\s*["']importmap["']/i.test(attributes));
assert.equal(inlineScripts.length, 0, 'all functional scripts are external, preserving tag order');
assert.match(html, /"three":"\/src\/03-整机选型工作台\/vendor\/three\/build\/three\.module\.js"/);

const localReferences = [...html.matchAll(/(?:src|href)\s*=\s*["'](\/src\/[^"']+)["']/gi)].map(match => decodeURIComponent(match[1]));
assert.ok(localReferences.length > 20, 'the final page declares its module sources explicitly');
for (const reference of localReferences) {
  const [, moduleName, ...segments] = reference.slice(1).split('/');
  const file = path.resolve(root, 'src', moduleName, ...segments);
  assert.ok(file.startsWith(path.resolve(root, 'src') + path.sep), `reference stays in src: ${reference}`);
  assert.ok(fs.existsSync(file), `referenced source exists: ${reference}`);
}

const service = require('../../../tools/serve-three-prototype');
const dependencyFiles = service.getWorkbenchVersion().files;
for (const expected of [
  'src/03-整机选型工作台/index.html',
  'src/03-整机选型工作台/css/prototype-workbench-base.css',
  'src/03-整机选型工作台/js/prototype-workbench-bootstrap.js',
  'src/03-整机选型工作台/vendor/three/build/three.module.js',
  'src/03-整机选型工作台/vendor/three/build/three.core.js',
  'src/03-整机选型工作台/vendor/three/examples/jsm/controls/OrbitControls.js',
  'src/03-整机选型工作台/assets/profile-nodes-25w.png',
  'src/03-整机选型工作台/assets/profile-nodes-50w.png',
]) assert.ok(dependencyFiles.includes(expected), `workbench version hash includes ${expected}`);

console.log('通过：正式页面、模块源码引用、外置资源与版本依赖哈希均指向 src/03。');
