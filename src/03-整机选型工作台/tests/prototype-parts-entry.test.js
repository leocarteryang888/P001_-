const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { readFinalWorkbenchSource } = require('./helpers/final-workbench-source');
const html = readFinalWorkbenchSource();
assert.doesNotMatch(html, /\.app\.editor-mode[^{}]*#partsLibraryBtn|\.top[^{}]*#partsLibraryBtn/, 'global/editor CSS must not hide the part-library entry');
assert.match(html, /id="partsLibraryBtn"[^>]*>3D 零件编辑库<\/button>/, 'final workbench must declare the visible part-library control');
const projectUi = fs.readFileSync(path.resolve(__dirname, '../js/prototype-project-ui.js'), 'utf8');
assert.doesNotMatch(projectUi, /\$\('partsLibraryBtn'\)\.hidden\s*=\s*true/, 'project editor must not hide the global part-library entry');
assert.match(projectUi, /actions\.prepend\(\$\('homeBtn'\)\)[\s\S]*?actions\.prepend\(partsLink\)/, 'workbench must place the part-library entry before project management');
const entry = fs.readFileSync(path.join(__dirname, '../js/prototype-parts-navigation.js'), 'utf8');
assert.ok(entry.includes('const partsLibraryLink='), 'final workbench must install the part-library link');
for (const protocol of ['http:', 'file:']) {
  let replacement;
  const button = { id: 'partsLibraryBtn', className: 'btn', textContent: '3D 零件编辑库', replaceWith: link => { replacement = link; } };
  const location = { protocol };
  Object.defineProperty(location, 'href', { set() { throw new Error('must not leave the unsaved workbench'); } });
  vm.runInNewContext(entry, { location, document: {
    getElementById: id => { assert.equal(id, button.id); return button; },
    createElement: tag => { assert.equal(tag, 'a'); return { style: {} }; }
  } });
  assert.equal(replacement.target, '_blank');
  assert.equal(replacement.rel, 'noopener');
  assert.equal(replacement.id, button.id);
  assert.equal(replacement.href, protocol === 'file:' ? '../../src/04-3D零件库/index.html' : '/parts/');
}
console.log('prototype part-library entry tests passed');
