const assert = require('node:assert/strict');
const db = require('../data/part-database.js');
assert.equal(db.schemaVersion, 1);
assert.equal(db.categories.length, 6);
assert.ok(db.parts.length >= 16);
for (const part of db.parts) {
  assert.ok(part.id && part.category && part.kind && part.name);
  assert.ok(db.categories.some(category => category.id === part.category));
  for (const value of Object.values(part.dimensions || {})) assert.ok(Number.isFinite(value) && value > 0);
}
const copy = db.getPart('air-rect');
copy.name = 'changed';
assert.notEqual(db.getPart('air-rect').name, 'changed');
const normalized = db.normalizePart({ id:' x ', dimensions:{width:-2,height:'300'} });
assert.equal(normalized.id, 'x');
assert.equal(normalized.dimensions.width, 1);
assert.equal(normalized.dimensions.height, 300);
console.log('通过：3D零件库默认数据、分类、尺寸归一化与副本隔离正常。');
