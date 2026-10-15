const assert=require('node:assert/strict'); const fs=require('node:fs');
const {validate}=require('../js/prototype-unit-info-validator.js');
const good={freshAirVolume:0,airVolume:'1',externalPressure:0,returnAirVolume:0,exhaustAirVolume:'0',exhaustExternalPressure:0,cabinetSeries:'25W',weather:{winterDry:-0,winterRh:0,summerDry:30,summerWet:30},cabinetSelection:{confirmed:true,status:'confirmed',source:'WK',width:'1000',height:1200},airflowForm:'F1'};
assert.deepEqual(validate(good),{valid:true,errors:[]});
for(const field of ['freshAirVolume','airVolume','externalPressure','winterDry','winterRh','summerDry','summerWet']){const x=JSON.parse(JSON.stringify(good)); if(field.startsWith('winter')||field.startsWith('summer'))x.weather[field]='';else x[field]=' '; assert.equal(validate(x).valid,false,field);}
for(const value of [NaN,Infinity,'Infinity','0x10','abc',{},[],true,false,Symbol('x'),1n,()=>1]){const x={...good,airVolume:value};assert.equal(validate(x).valid,false);}
assert.equal(validate({...good,airVolume:0}).valid,false); assert.equal(validate({...good,weather:{...good.weather,winterRh:101}}).errors[0].field,'winterRh'); assert.equal(validate({...good,weather:{...good.weather,summerWet:31}}).errors[0].field,'summerWet');
for(const series of ['25W','50W'])assert.equal(validate({...good,cabinetSeries:series}).valid,true); assert.equal(validate({...good,cabinetSeries:'WK'}).valid,false);
for(const section of [{...good.cabinetSelection,confirmed:false},{...good.cabinetSelection,status:'invalidated'},{...good.cabinetSelection,source:' '},{...good.cabinetSelection,width:0},{confirmed:true,source:'',width:1000,height:1000}])assert.equal(validate({...good,cabinetSelection:section}).valid,false);
assert.equal(validate({...good,airflowForm:'F5'}).errors[0].field,'airflowForm');
const bad=validate({...good,invalidFields:['airVolume','airVolume','summerWet']}); assert.equal(bad.errors.filter(e=>e.field==='airVolume').length,1); assert.match(bad.errors.find(e=>e.field==='airVolume').message,/送风量/); assert.equal(bad.valid,false);
const before=JSON.stringify(good); validate(good); assert.equal(JSON.stringify(good),before);
console.log('通过：机组资料严格字段、零值、缺失、badInput、截面确认与无副作用测试。');
