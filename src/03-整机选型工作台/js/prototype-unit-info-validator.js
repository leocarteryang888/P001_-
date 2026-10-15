(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AHUPrototypeUnitInfoValidator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const missing = value => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
  const number = value => { if (missing(value) || (typeof value !== 'number' && typeof value !== 'string')) return null; const raw = typeof value === 'string' ? value.trim() : value; if (typeof raw === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) return null; const n = typeof raw === 'number' ? raw : Number(raw); return Number.isFinite(n) ? n : null; };
  function validate(input) {
    const x = input || {}, errors = [], bad = new Set(Array.isArray(x.invalidFields) ? x.invalidFields : []), seen = new Set();
    const labels={freshAirVolume:'新风量',airVolume:'送风量',externalPressure:'机外余压',returnAirVolume:'回风量',exhaustAirVolume:'排风量',exhaustExternalPressure:'排机外余压',cabinetSeries:'箱体结构',winterDry:'冬季干球',winterRh:'冬季RH',summerDry:'夏季干球',summerWet:'夏季湿球',cabinetSelection:'箱体截面',airflowForm:'气流形式'};
    const add = (field, message) => { if (seen.has(field)) return; seen.add(field); errors.push({ field, message }); };
    bad.forEach(field => add(field, `${labels[field] || '字段'}输入无效`));
    const required = [['freshAirVolume','新风量必须填写且不小于0'],['airVolume','送风量必须填写且大于0'],['externalPressure','机外余压必须填写且不小于0']];
    required.forEach(([field,msg]) => { const n=number(x[field]); if (n===null || (field==='airVolume' ? n<=0 : n<0)) add(field,msg); });
    [['returnAirVolume','回风量'],['exhaustAirVolume','排风量'],['exhaustExternalPressure','排风机外余压']].forEach(([f,label])=>{if(!missing(x[f])){const n=number(x[f]);if(n===null||n<0)add(f,`${label}必须为不小于0的有限数值`);}});
    if (!['25W','50W'].includes(x.cabinetSeries)) add('cabinetSeries','箱体系列必须为25W或50W');
    const weather=x.weather||{}; [['winterDry','冬季干球'],['winterRh','冬季相对湿度'],['summerDry','夏季干球'],['summerWet','夏季湿球']].forEach(([f,label])=>{if(number(weather[f])===null)add(f,`${label}必须填写有限数值`);});
    const wr=number(weather.winterRh), sd=number(weather.summerDry), sw=number(weather.summerWet); if(wr!==null&&(wr<0||wr>100))add('winterRh','冬季相对湿度必须为0–100'); if(sd!==null&&sw!==null&&sw>sd)add('summerWet','夏季湿球不得高于干球');
    const section=x.cabinetSelection; if(!section||section.confirmed!==true||section.status==='invalidated'||typeof section.source!=='string'||!section.source.trim()||number(section.width)===null||number(section.height)===null||number(section.width)<=0||number(section.height)<=0)add('cabinetSelection','箱体截面必须为已确认且有效的截面');
    if(!['F1','F2','F3','F4'].includes(x.airflowForm))add('airflowForm','气流形式必须明确为F1、F2、F3或F4');
    return { valid: errors.length===0, errors };
  }
  return { validate };
});
