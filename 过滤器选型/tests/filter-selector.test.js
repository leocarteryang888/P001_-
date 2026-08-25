const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const moduleRoot = path.resolve(__dirname, '..');
const context = { window: {}, document: { addEventListener() {} }, console };
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(moduleRoot, 'data/filter-database.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(moduleRoot, 'js/filter-selector.js'), 'utf8'), context);
const db = context.window.FilterDatabase;
const calculate = context.window.FilterSelector.calculate;
assert.equal(db.filterTypes.length, 8, '过滤器类型应完整保留 8 项');
assert.deepEqual(Object.keys(db.arrangements).sort(), ['frame', 'pull']);
let caseCount = 0;
for (const mode of ['pull', 'frame']) {
  for (let width = 6; width <= 33; width += 1) {
    for (let height = 6; height <= 33; height += 1) {
      const result = calculate(mode, width, height);
      assert.equal(result.total, result.columns * result.rows);
      assert.equal(result.cells.length, result.total);
      assert.equal(result.specifications.reduce((sum, item) => sum + item.count, 0), result.total);
      assert.ok(result.specifications.every(item => /^[3-6][3-6]$/.test(item.code)));
      caseCount += 1;
    }
  }
}
assert.equal(caseCount, 1568, '应覆盖两种形式下全部 6–33M 宽高组合');
const databaseSource = fs.readFileSync(path.join(moduleRoot, 'data/filter-database.js'), 'utf8');
const pageSource = fs.readFileSync(path.join(moduleRoot, 'index.html'), 'utf8');
for (const forbidden of ['sectionLength', 'doorOffset', 'serviceM']) assert.ok(!databaseSource.includes(forbidden), `数据库不应包含 ${forbidden}`);
for (const forbiddenText of ['检修门', '过滤段长', '检修段长']) assert.ok(!pageSource.includes(forbiddenText), `页面不应展示 ${forbiddenText}`);
console.log(`通过：${caseCount} 个选型组合，数据库/页面职责边界检查正常。`);
