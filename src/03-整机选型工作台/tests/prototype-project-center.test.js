const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const html = fs.readFileSync(path.join(root, 'outputs/03-整机选型工作台/工业工作台_ThreeJS原型.html'), 'utf8');
const ui = fs.readFileSync(path.join(__dirname, '../js/prototype-project-ui.js'), 'utf8');

const searchHelper = ui.match(/function projectMatchesSearch\(project, query, airflowOptions\) \{[\s\S]*?\n  \}/)?.[0];
assert.ok(searchHelper, 'project center has a focused project search matcher');
const projectMatchesSearch = new Function(`${searchHelper}; return projectMatchesSearch;`)();
const airflowOptions = [
  ['AF-1', '单侧进风 · 上出风'], ['AF-2', '双侧进风 · 上出风']
];
const searchableProject = {
  name: '华东项目', code: 'P-001', technicalSupport: '张工',
  units: [{ no: 'AHU-01', schemeNo: 'A方案', model: '机型X', name: '新风机组', profile: { productName: '产品Y', unitType: '组合式空调机组' }, airflowForm: 'AF-1', segments: [{ name: '初效过滤段', type: 'filter' }] }]
};
assert.equal(projectMatchesSearch(searchableProject, '', airflowOptions), true, 'empty search shows every project');
assert.equal(projectMatchesSearch(searchableProject, '华东 张工 AHU-01 初效', airflowOptions), true, 'space-separated terms use AND across the same project aggregate');
assert.equal(projectMatchesSearch(searchableProject, '华东 absent', airflowOptions), false, 'every search term must match');
assert.equal(projectMatchesSearch(searchableProject, '单侧进风', airflowOptions), true, 'airflow display label is searchable from the current unit value');
assert.equal(projectMatchesSearch(searchableProject, '组合式空调机组', airflowOptions), true, 'unit type matches the profile unitType field');
assert.equal(projectMatchesSearch(searchableProject, 'AF-1', airflowOptions), true, 'airflow form identifier remains searchable');

for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (/type\s*=\s*["']importmap["']/i.test(match[1]) || !match[2].trim()) continue;
  assert.doesNotThrow(() => new Function(match[2]), 'inline workbench script parses');
}

assert.doesNotMatch(html, /项目 \/ 多机组工作区/, 'obsolete sidebar context is removed');
assert.match(html, /side-title-row[\s\S]*id="addProject"/, 'new-project action is aligned with project-management heading');
assert.match(html, /项目名称<\/small>[\s\S]*销售公司<\/small>[\s\S]*项目编号<\/small>[\s\S]*业务负责人<\/small>/, 'overview shows the four requested project fields');
assert.doesNotMatch(html, /id="loadFormalBtn"|读取正式方案/, 'unused formal-scheme header entry is removed');
assert.match(ui, /project-title-block[^\n]*appendChild\(\$\('saveBtn'\)\)/, 'save control moves beside the project title');
assert.match(ui, /workspaceToolbarActions/, 'workspace actions use the local toolbar');
assert.match(ui, /setWindowControls/, 'global window controls are bound once');
assert.match(html, /\.top #fullscreenBtn\{display:none!important\}/, 'legacy fullscreen control is hidden');
assert.match(html, /workspace-minimized \.screen|workspace-minimized/, 'minimize uses application workspace state');
assert.match(ui, /step='any'|step="any"/, 'weather correction inputs accept decimal values');
assert.match(ui, /设备编号<\/span>[\s\S]*方案编号<\/span>[\s\S]*机组型号<\/span>[\s\S]*气流形式<\/span>[\s\S]*功能段组合<\/span>[\s\S]*数量<\/span>[\s\S]*状态<\/span>/, 'unit table uses the requested columns');
assert(!/data-new-unit-field=|id="confirmNewUnit"/.test(ui), 'old inline creation row is removed');
assert(ui.includes('data-unit-identity="no"') && ui.includes('data-unit-identity="schemeNo"'), 'identity fields are editable in unit information');
assert.match(ui, /function beginPrototypeUnitCreation\([\s\S]*loadPrototypeUnit\(selectedUnit\); showWorkspace\(selectedUnit\)/, 'new unit opens its unit-information workspace immediately');
const numberHelper = ui.match(/function nextEquipmentNo\(units\) \{[\s\S]*?\n  \}/)?.[0];
assert.ok(numberHelper, 'next equipment number helper exists');
const getNextEquipmentNo = new Function(`${numberHelper}; return nextEquipmentNo;`)();
assert.equal(getNextEquipmentNo([{ no: 'AHU-03' }, { no: 'AHU-04' }, { no: 'AHU-06' }]), 'AHU-07', 'default number advances from the highest existing AHU number');
assert.equal(getNextEquipmentNo([]), 'AHU-01', 'empty projects begin at AHU-01');
assert.match(ui, /quantity:\s*1,\s*state:\s*'草稿'/, 'new units default to quantity one');
assert.match(ui, /AHUPrototypeAirflowCompat\?\.resolve\(unit\)/, 'airflow display reads the canonical field and strict legacy compatibility helper');
assert.doesNotMatch(ui, /卧式 · 单气路/, 'unit list does not invent an airflow form');
assert.doesNotMatch(ui, /prototypeStoreNotice|导入正式 V2 机组副本|从 V2 JSON 导入副本|查看本机旧草稿/, 'removed utility strip is not recreated by the controller');
const homeHandler = ui.match(/\$\('homeBtn'\)\.addEventListener\('click',[\s\S]*?\n  \}, true\);/)?.[0];
assert.ok(homeHandler, 'project-manager return handler exists');
assert.match(homeHandler, /if \(isDirty\(\)\) \{[\s\S]*?store\.saveBeforeSwitch/, 'return navigation only writes through CAS when project data is dirty');
assert.match(homeHandler, /else \{\s*showManager\(\); refreshStoreNotice\(\);\s*notice\('已返回项目中心；当前内容没有未保存修改。'\);/, 'clean navigation returns without a save');
const selectionHandler = ui.match(/function stopSaveAndSwitch\(e\) \{[\s\S]*?\n  \}\n  document\.addEventListener\('click', stopSaveAndSwitch/)?.[0];
assert.ok(selectionHandler, 'project and unit selection handler exists');
assert.match(selectionHandler, /const dirty = isDirty\(\)[\s\S]*if \(state\.source === 'shared' && !dirty\) await switchTo\(\);[\s\S]*else await store\.beforeSelectionChange/, 'clean selection switches without CAS while dirty selection retains the guarded save path');
assert.match(selectionHandler, /state\.source === 'shared' && dirty\) notice\(`已保存到本机共享原型项目修订/, 'only dirty shared selection reports a revision save');
assert.match(html, /s\.__displayGeometryDefaults\|\|=\[\]/, 'render-only interface defaults are marked as non-user data');
assert.match(ui, /persisted\.forEach\(stripDisplayGeometryDefaults\);[\s\S]*captureUnitSegments/, 'only user-entered segment data is captured into the project');
const stripHelper = ui.match(/function stripDisplayGeometryDefaults\(segment\) \{[\s\S]*?\n  \}/)?.[0];
assert.ok(stripHelper, 'display-default persistence filter exists');
const stripDefaults = new Function(`${stripHelper}; return stripDisplayGeometryDefaults;`)();
const untouched = { id: 'seg-1', model: 'M1', interfaceName: '送风出口', portSide: '右端', portWidth: 900, portHeight: 700, doorSide: '无', __displayGeometryDefaults: ['interfaceName', 'portSide', 'portWidth', 'portHeight', 'doorSide'] };
stripDefaults(untouched);
assert.deepEqual(untouched, { id: 'seg-1', model: 'M1' }, 'render-only geometry defaults are excluded from persisted segments');
const edited = { id: 'seg-2', interfaceName: '用户接口', portSide: '右端', portWidth: 900, __displayGeometryDefaults: ['portSide', 'portWidth'] };
stripDefaults(edited);
assert.deepEqual(edited, { id: 'seg-2', interfaceName: '用户接口' }, 'explicit interface edits survive while untouched display defaults are omitted');

console.log('通过：项目中心字段、机组编号录入、真实信息展示、顶部保存和全屏退出入口静态契约。');
