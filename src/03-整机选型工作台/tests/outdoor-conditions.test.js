const assert = require('node:assert/strict');
const database = require('../data/outdoor-conditions.js');
assert.equal(database.status, 'user-supplied-derived-workbook');
assert.equal(database.source.standard, 'GB 50736-2012 附录A');
assert.equal(database.locations.length, 295);
assert.equal(database.fields.length, 39);
for (const location of database.locations) {
  assert.ok(location.province && location.city);
  assert.equal(Number.isFinite(location.summerAirConditioningDryBulb), true);
  assert.equal(location.summerAirConditioningWetBulb===null||Number.isFinite(location.summerAirConditioningWetBulb), true);
  assert.equal(Number.isFinite(location.winterAirConditioningTemperature), true);
  assert.ok(location.winterAirConditioningRH >= 0 && location.winterAirConditioningRH <= 100);
}
assert.equal(database.locations.filter(location=>location.summerAirConditioningWetBulb===null).length,6);
const beijing=database.locations.find(location=>location.province==='北京'&&location.city==='北京');
assert.deepEqual([
  beijing.winterAirConditioningTemperature,
  beijing.winterAirConditioningRH,
  beijing.summerAirConditioningDryBulb,
  beijing.summerAirConditioningWetBulb
],[-9.9,44,33.5,26.4]);
console.log(`通过：${database.locations.length} 个地区、${database.fields.length} 个字段的 GB50736 表数据结构和核心空调参数校验。`);
