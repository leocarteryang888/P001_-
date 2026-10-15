const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('outputs/03-整机选型工作台/three-preview.js', 'utf8');
const functions = [
  'function shouldRenderPrototypeDoor(segment, cutaway) {',
  'function isFormalViewSupported(state) {',
  'function segmentDisplayLength(segment) {',
  'function invalidFormalLengthSegments(state) {'
].map(start => {
  const index = source.indexOf(start);
  assert.notEqual(index, -1, `missing ${start}`);
  const end = source.indexOf('\n}', index) + 2;
  return source.slice(index, end);
}).join('\n');

const context = { mm: value => Number(value) / 1000 };
vm.runInNewContext(`${functions};globalThis.guards={shouldRenderPrototypeDoor,isFormalViewSupported,segmentDisplayLength,invalidFormalLengthSegments};`, context);
const { shouldRenderPrototypeDoor, isFormalViewSupported, segmentDisplayLength, invalidFormalLengthSegments } = context.guards;

assert.equal(shouldRenderPrototypeDoor({ isFormalSegment: true }, false), false, 'formal segment must not get an invented door');
assert.equal(shouldRenderPrototypeDoor({ isFormalSegment: false, doorSide: '检修侧' }, false), true, 'prototype door remains visible');
assert.equal(shouldRenderPrototypeDoor({ isFormalSegment: false, doorSide: '检修侧' }, true), false, 'cutaway hides prototype door');
assert.equal(isFormalViewSupported({ readOnly: true, view: 'six' }), false, 'formal six-view must be blocked');
assert.equal(isFormalViewSupported({ readOnly: true, view: 'side' }), false, 'formal unbound side view must be blocked');
assert.equal(isFormalViewSupported({ readOnly: true, view: 'iso' }), true);
assert.equal(isFormalViewSupported({ readOnly: true, view: 'end' }), true);
assert.equal(segmentDisplayLength({ isFormalSegment: true, length: 100 }), 0.1, 'formal length keeps exact saved millimeters');
assert.equal(segmentDisplayLength({ isFormalSegment: false, length: 100 }), 0.25, 'prototype minimum remains unchanged');
assert.equal(invalidFormalLengthSegments({ readOnly: true, segments: [{ name: 'zero', length: 0 }, { name: 'valid', length: 100 }] }).length, 1);
assert.equal(invalidFormalLengthSegments({ readOnly: false, segments: [{ length: 0 }] }).length, 0);

const addInterior = source.slice(source.indexOf('function addInterior('), source.indexOf('\nfunction rectangularAirPort('));
assert.match(addInterior, /if \(segment\.isFormalSegment\) return;/, 'formal segments must not receive type-based placeholder internals');
assert.match(source, /!segment\.isFormalSegment && \['primary', 'medium', 'high'\][^\n]*differentialGauge/, 'default differential gauge must stay prototype-only');
assert.match(source, /if \(!isFormalViewSupported\(state\)\)/, 'actual Three renderer must enforce formal view boundary');

console.log('通过：正式视图无虚构门/微压计/默认内部件；六面及未绑定方向受限；保存段长按实际值绘制，缺失正段长会提示。');
