const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({});
for (const file of ['data/coil-database.js','data/coil-section-database.js','js/coil-selector.js']) vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const {CoilDatabase:db,CoilSectionDatabase:sectionDb,CoilSelector:api} = context;
const plain = value => JSON.parse(JSON.stringify(value));
const source = fs.readFileSync(path.resolve(root,'../../references/箱体设计规范/QHB-J02.577-2026A-规范文本提取.txt'),'utf8').split('2.5.11 标准段高段宽设计')[1].split('2.5.12 非标段宽')[0];
const sections = source.split('标准水/乙二醇盘管高选型见表 2.5-6');
for (const [index, mode] of ['ceiling','floor'].entries()) {
  const matches = [...sections[index].matchAll(/^(\d{4})\s+(9\.52|12\.7)\s+(\d)\s+([\d.]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/gm)];
  assert.equal(matches.length,151);
  assert.equal(db.tables[mode].length,151);
  assert.equal(new Set(db.tables[mode].map(row=>row.code)).size,151);
  for (const match of matches) {
    const row = db.tables[mode].find(row=>row.code===match[1]);
    assert.deepEqual(plain(row),{code:match[1],tube:+match[2],count:+match[3],height:+match[4],widths:match.slice(5).map(Number)});
  }
}
const base = {series:'25W',installation:'floor',spec:'1012',rows:4,tube:9.52,header:50};
assert.equal(api.select(base).model,'φ9.52-STTL-4-10*9.5');
assert.equal(api.select({...base,installation:'ceiling'}).model,'φ9.52-STTL-4-10*8.5');
assert.equal(api.select({...base,spec:'0607'}).model,'φ9.52-STTL-4-5*5.5');
assert.equal(api.select({...base,spec:'2026',tube:12.7,rows:6}).model,'φ12.7-STTL-6-24*8.89H2');
assert.equal(api.select({...base,spec:'1722',installation:'ceiling',tube:12.7}).model,'φ12.7-STTL-4-20*6.985H2');
assert.equal(api.select({...base,spec:'3333',tube:12.7}).count,3);
assert.equal(api.select({...base,spec:'1616',tube:12.7}).model,null);
assert.equal(api.select({...base,spec:'3131',tube:12.7}).status,'review');
assert.equal(api.select({...base,header:100}).thickness,null);
for (const patch of [{series:'50W'},{spec:'1224'},{spec:'607'},{spec:'<svg'},{spec:''},{rows:5},{rows:0},{tube:7.94},{tube:12.7},{header:25},{header:'x'},{installation:'invalid'}]) assert.throws(()=>api.select({...base,...patch}));
assert.equal(sectionDb.rows.length,434);
assert.equal(sectionDb.rows.filter(row=>row.recommendedFlag===true).length,72);
assert.deepEqual(plain(sectionDb.tubePitchMm),{'9.52':25,'12.7':31.75});
assert.ok(sectionDb.rows.every(row=>row.widthModule>=6&&row.widthModule<=33&&row.heightModule>=6&&row.heightModule<=33&&row.effectiveLengthMm>0&&row.holeCounts.some(count=>count>0)));
assert.equal(new Set(sectionDb.rows.map(row=>`${row.widthModule}:${row.heightModule}:${row.tube}`)).size,434,'WK records must have unique width/height/tube keys');
const faceCandidates=api.listFaceSectionCandidates({series:'25W',airVolumeM3h:10000,minVelocityMps:1.5,maxVelocityMps:3});
assert.equal(faceCandidates.sourceRecordCount,434);
assert.equal(faceCandidates.candidates.length,112);
assert.equal(faceCandidates.candidates.filter(row=>row.tube===9.52).length,52);
assert.equal(faceCandidates.candidates.filter(row=>row.tube===12.7).length,60);
assert.ok(faceCandidates.candidates.every((row,index,all)=>row.faceVelocityMps>=1.5&&row.faceVelocityMps<=3&&(!index||all[index-1].faceVelocityMps<=row.faceVelocityMps)),'candidates are bounded and stably sorted by velocity');
const referenceCandidate=faceCandidates.candidates.find(row=>row.sourceRow===106);
assert.deepEqual(plain(referenceCandidate),{sourceRow:106,widthModule:11,heightModule:15,series:'25W',widthMm:1150,heightMm:1550,tube:9.52,effectiveLengthMm:875,holeCounts:[54,0,0],totalHoleCount:54,pipePitchMm:25,effectiveAreaM2:1.18125,faceVelocityMps:10000/3600/1.18125,recommendedFlag:true});
const candidate50=api.listFaceSectionCandidates({series:'50W',airVolumeM3h:10000,minVelocityMps:1.5,maxVelocityMps:3}).candidates.find(row=>row.sourceRow===106);
assert.equal(candidate50.widthMm,1200); assert.equal(candidate50.heightMm,1600); assert.equal(candidate50.series,'50W');
const reference127=sectionDb.rows.find(row=>row.sourceRow===241);
assert.equal(reference127.tube,12.7);assert.equal(sectionDb.tubePitchMm[String(reference127.tube)],31.75);assert.equal(reference127.holeCounts.reduce((a,b)=>a+b,0),42);
assert.equal(api.calculateCoilFaceVelocity({tube:9.52,effectiveLengthMm:875,totalHoleCount:54,airVolumeM3h:10000}).faceVelocityMps,10000/3600/1.18125);
assert.ok(Math.abs(api.calculateNominalFaceVelocity({widthMm:1100,heightMm:1500,airVolumeM3h:10000}).nominalFaceVelocityMps-1.6835)<0.001);
for(const input of [{airVolumeM3h:''},{airVolumeM3h:10000,minVelocityMps:''},{airVolumeM3h:10000,maxVelocityMps:''},{airVolumeM3h:10000,minVelocityMps:3,maxVelocityMps:1}])assert.throws(()=>api.listFaceSectionCandidates(input));
assert.throws(()=>api.calculateNominalFaceVelocity({widthMm:1100,heightMm:1500,airVolumeM3h:''}));
let combinations = 0, selected = 0, reviews = 0;
for (const mode of ['floor','ceiling']) for (const record of db.tables[mode]) {
  for (const rows of db.rows) for (const header of db.headers) for (const tube of [9.52,12.7]) {
    const input = {...base,installation:mode,spec:record.code,rows,header,tube};
    combinations++;
    if (tube!==record.tube) {assert.throws(()=>api.select(input),/不匹配/);continue;}
    const result = api.select(input);
    assert.equal(result.width,record.widths[db.headers.indexOf(header)]);
    assert.equal(result.height,record.height);
    assert.equal(result.count,record.count);
    assert.equal(result.thickness,header===100?null:db.thickness[String(tube)][header][db.rows.indexOf(rows)]);
    if (record.height>1450) {assert.equal(result.model,null);reviews++;}
    else {assert.match(result.model,/^φ(9\.52|12\.7)-STTL-(2|3|4|6|8)-\d+(\.\d+)?\*\d+(\.\d+)?(H[23])?$/);selected++;}
  }
}
// 用轻量 DOM 测试实际页面控制器，覆盖状态切换和旧结果清空。
class Element {
  constructor(){this.value='';this.textContent='';this.hidden=false;this.children=[];this.events={};}
  appendChild(child){this.children.push(child);}
  replaceChildren(){this.children=[];}
  addEventListener(event,callback){this.events[event]=callback;}
}
const elements = new Map();
const get = id => {if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
for(const [id,value] of Object.entries({series:'25W',installation:'floor',spec:'1012',rows:'4',tube:'9.52',headerDiameter:'50'}))get(id).value=value;
context.window = {addEventListener(){}};
context.document = {getElementById:get,createElement:()=>new Element(),addEventListener:(_event,fn)=>fn()};
vm.runInContext(fs.readFileSync(path.join(root,'js/app.js'),'utf8'),context);
assert.equal(get('model').textContent,'φ9.52-STTL-4-10*9.5');
assert.equal(get('standardRows').children.length,151);
get('spec').value='1224';get('spec').events.input();
assert.equal(get('selectionResult').hidden,true);
assert.equal(get('model').textContent,'');
get('spec').value='1012';get('spec').events.input();
assert.equal(get('selectionError').hidden,true);
get('installation').value='ceiling';get('installation').events.change();
assert.equal(get('model').textContent,'φ9.52-STTL-4-10*8.5');
get('spec').value='1717';get('tube').value='12.7';get('tube').events.input();
assert.equal(get('model').textContent,'暂不生成型号');
assert.equal(get('warnings').hidden,false);
assert.equal(combinations,18120);
console.log('通过：302 条标准记录逐项比对、'+combinations+' 个参数组合（'+selected+' 正常 / '+reviews+' 待复核 / 9060 管径不匹配）、12 类非法输入及页面状态交互。');
