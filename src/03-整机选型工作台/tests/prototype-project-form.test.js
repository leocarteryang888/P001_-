const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const weatherApi = require('../js/prototype-weather.js');
const handoffApi = require('../js/prototype-selection-handoff.js');

const file = path.join(__dirname, '../js/prototype-project-ui.js');
const source = fs.readFileSync(file, 'utf8');
assert.match(source, /candidateProjects = JSON\.parse\(JSON\.stringify\(projects\)\)/, 'save uses an isolated candidate');
assert.match(source, /if \(projectSaveBusy\) return/, 'duplicate saves are blocked while pending');
assert.match(source, /delete candidateProjects\[editProjectIndex\]\.weatherReference/, 'clearing weather removes stale reference before CAS');
assert.match(source, /finally \{ projectSaveBusy = false/, 'save lock is released after success or failure');

// Execute the real collectProjectForm function with injected DOM/closure values.
const body = source.match(/function collectProjectForm\(\) \{([\s\S]*?)\n\s*\}\n\s*window\.collectProjectForm/);
assert(body, 'collectProjectForm must remain extractable');
function actualForm({ values, weather='|', overrides=[] , editing=null }) {
  const fields = Object.fromEntries(Object.entries(values).map(([id,value]) => [id,{value:String(value ?? '')}]));
  const nodes = overrides.map(([dataset,value]) => ({ dataset:{weatherOverride:dataset}, value:String(value ?? '') }));
  const fn = new Function('$','document','weatherSelect','provinceSelect','weatherLocations','editing','projectCode','window', `${body[1]}\n return project;`);
  const [province,city,station] = weather.split('|');
  const locations=weatherApi.getLocations();
  return fn(id => fields[id], { querySelectorAll:()=>nodes }, { value:`${city}|${station}` }, { value:province }, locations, editing, ()=>'PRJ-TEST', {AHUPrototypeWeather:weatherApi});
}

const base = { prototypeProjectName:'项目', prototypeProjectCode:'P1', prototypeProjectCustomer:'客户', prototypeSalesCompanyCode:'BJ', prototypeSalesCompany:'', prototypeBusinessOwner:'', prototypeTechnicalSupport:'支持', prototypeLocation:'上海' };
const bj=weatherApi.getLocations().find(r=>r.province==='北京'&&r.city==='北京');
let p = actualForm({values:base, weather:`${bj.province}|${bj.city}|${bj.station}`, overrides:[], editing:{units:[{unitId:'u1'}], weatherOverride:{winterAirConditioningTemperature:{value:1}}}});
assert.equal(p.weatherReference.city,'北京'); assert.equal(p.weatherOverride,undefined); assert.deepEqual(p.units,[{unitId:'u1'}]);
assert.equal(p.salesCompanyCode,'BJ','new project form must retain the explicitly entered sales company code');
assert.throws(()=>actualForm({values:base, weather:`${bj.province}|${bj.city}|${bj.station}`, overrides:[['summerAirConditioningWetBulb',40],['summerAirConditioningDryBulb','']], editing:null}), /湿球/);
assert.throws(()=>actualForm({values:base, weather:`${bj.province}|${bj.city}|${bj.station}`, overrides:[['winterAirConditioningRH',101]], editing:null}), /相对湿度/);
assert.throws(()=>actualForm({values:base, weather:`${bj.province}|${bj.city}|${bj.station}`, overrides:[['winterAirConditioningRH',-1]], editing:null}), /相对湿度/);
assert.throws(()=>actualForm({values:base, weather:`${bj.province}|${bj.city}|${bj.station}`, overrides:[['winterAirConditioningTemperature','not-a-number']], editing:null}), /有限数值/);
const aliasCleared=actualForm({values:base, weather:`${bj.province}|${bj.city}|${bj.station}`, overrides:[], editing:{weatherOverride:{winter:{winterOutdoorDryBulb:{value:-4},note:'keep'},summer:{summerWetBulb:{value:23},extra:'keep'},custom:'keep'},units:[]}});
assert.deepEqual(aliasCleared.weatherOverride,{winter:{note:'keep'},summer:{extra:'keep'},custom:'keep'});
const fallback=weatherApi.resolve({location:'北京',weatherReference:{province:bj.province,city:bj.city,station:bj.station},weatherOverride:aliasCleared.weatherOverride},{});
assert.equal(fallback.manualModified,false); assert.equal(fallback.winter.dryBulb,-9.9);
const tw=weatherApi.getLocations().find(r=>/台湾/.test(r.province||''));
p = actualForm({values:base, weather:`${tw.province}|${tw.city}|${tw.station}`, overrides:[['winterAirConditioningTemperature',0]], editing:null});
assert.deepEqual(p.weatherReference,{province:tw.province,city:tw.city,station:tw.station}); assert.equal(p.weatherOverride.winterAirConditioningTemperature.value,0);
console.log('通过：实际 collectProjectForm 天气清空/扩展保留、校验、唯一地点与零值。');

const saveMatch = source.match(/replacePrototypeAction\('saveBtn', async \(\) => \{([\s\S]*?)\n\s*\}\);\n\s*replacePrototypeAction\('addProject'/);
assert(saveMatch, 'save callback must remain extractable');
async function runSave({fail=false, retrySameHandler=false, busy=false, duplicate=false, editIndex=null, candidate={name:'新'}}={}) {
  const prof=()=>({interface:{selection:{professionalResult:{selector:'filter',model:'F-1'}},calculation:{professionalRule:{version:'v1'}},output:{automatedSelection:{model:'F-1'}},validation:[{code:'professional-selection'}]},confirmed:true});
  const projects=[{name:'旧',extra:{keep:true},units:[{unitId:'u1',segments:[prof()],airflowBranches:[{segments:[prof()]}]},{unitId:'u2',weatherOverride:{winterAirConditioningTemperature:{value:-3}},segments:[prof()]}],weatherReference:{province:'北京',city:'北京',station:'北京'},weatherOverride:{winterAirConditioningTemperature:{value:1}}}];
  const originalJson=JSON.stringify(projects);
  let saveCalls=0, capturedCandidate, release; const pending=new Promise(resolve=>{release=resolve;});
  const store={save:async data=>{saveCalls++; capturedCandidate=JSON.parse(JSON.stringify(data)); if(fail && (!retrySameHandler || saveCalls===1)) throw Error('409'); await pending; return {projects:data};}};
  let projectSaveBusy=busy, newProjectMode=true, formalReadonly=false, baseline='old', projectFormDirty=true, selectedProject=0, selectedUnit=0;
  const input={textContent:''}; const nodes=[{disabled:false,isConnected:true},{disabled:true,isConnected:true}];
  const $=id=>id==='inputNotice'?input:id==='projectFormNotice'?{textContent:''}:null;
  const document={querySelectorAll:()=>nodes}; let notices=0, rendered=0;
  const window={collectProjectForm:()=>candidate,AHUPrototypeWeather:weatherApi};
  const handlerFactory=new Function('projects','store','$','document','window','A','formalReadonly','editProjectIndex','baseline','projectFormDirty','selectedProject','selectedUnit','notice','refreshStoreNotice','renderManager','persistActiveUnit',`let projectSaveBusy=false, newProjectMode=true; const getState=()=>({projectSaveBusy,newProjectMode,editProjectIndex,baseline,projectFormDirty}); return {getState,handler:async function(){${saveMatch[1]}}}`);
  const bundle=handlerFactory(projects,store,$,document,window,handoffApi,formalReadonly,editIndex,baseline,projectFormDirty,selectedProject,selectedUnit,()=>notices++,()=>{},()=>rendered++,()=>{});
  const handler=bundle.handler;
  const task=handler();
  if (busy) return {saveCalls,projects,notices};
  const duplicateTask = duplicate ? handler() : null;
  if (!fail) release(); else await task;
  if (retrySameHandler) { release(); await handler(); }
  if (!fail) await task;
  if (duplicateTask) await duplicateTask;
  return {saveCalls,projects,notices,rendered,state:bundle.getState(),capturedCandidate,originalJson,nodes};
}
(async()=>{
  const failed=await runSave({fail:true,editIndex:0,candidate:{name:'失败',weatherReference:undefined,weatherOverride:undefined}}); assert.equal(failed.saveCalls,1); assert.equal(JSON.stringify(failed.projects),failed.originalJson); assert.equal(failed.capturedCandidate[0].units[0].segments[0].interface.selection.professionalResult,undefined); assert.equal(failed.capturedCandidate[0].units[0].segments[0].professionalHistory.length,1); assert.equal(failed.capturedCandidate[0].units[0].airflowBranches[0].segments[0].interface.selection.professionalResult,undefined); assert.equal(failed.nodes[0].disabled,false); assert.equal(failed.nodes[1].disabled,true); assert.equal(failed.state.projectSaveBusy,false); assert.equal(failed.state.newProjectMode,true); assert.equal(failed.state.editProjectIndex,0); assert.equal(failed.state.projectFormDirty,true); assert.equal(failed.state.baseline,'old');
  const invalidated=await runSave({editIndex:0,candidate:{name:'改',weatherReference:{province:'北京',city:'北京',station:'北京'},weatherOverride:{winterAirConditioningTemperature:{value:2}}}}); assert.equal(invalidated.projects[0].units[0].pendingRecalculation,true); assert.equal(invalidated.projects[0].units[0].segments[0].confirmed,false); assert.equal(invalidated.projects[0].units[1].pendingRecalculation,undefined); assert.equal(invalidated.projects[0].units[1].segments[0].confirmed,true);
  const created=await runSave({candidate:{name:'新'}}); assert.equal(created.projects.length,2); assert.equal(created.projects[1].name,'新');
  const pending=await runSave({duplicate:true}); assert.equal(pending.saveCalls,1, 'pending duplicate must not call store.save twice');
  const retry=await runSave({fail:true,retrySameHandler:true,candidate:{name:'重试'}}); assert.equal(retry.saveCalls,2); assert.equal(retry.projects.length,2); assert.equal(retry.projects[1].name,'重试'); assert.equal(retry.state.newProjectMode,false); assert.equal(retry.state.projectSaveBusy,false);
  console.log('通过：真实 saveBtn callback CAS失败保留、候选合并扩展/机组保留及锁行为。');
})().catch(error=>{console.error(error);process.exitCode=1;});
