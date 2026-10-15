(function (root, factory) {
  const data = (typeof module === 'object' && module.exports) ? require('../data/outdoor-conditions.js') : (root && root.AHUOutdoorConditions);
  const api = factory(data);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AHUPrototypeWeather = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (database) {
  'use strict';
  const numeric = value => { if (value === null || value === undefined) return null; if (value && typeof value === 'object' && 'value' in value) value=value.value; if (value === null || value === undefined || (typeof value === 'string' && value.trim()==='')) return null; const n=typeof value==='number'?value:Number(value); return Number.isFinite(n)?n:null; };
  const finite = value => numeric(value) !== null;
  const rh = value => { const n=numeric(value); return n!==null && n>=0 && n<=100 ? n : null; };
  const temp = value => Number.isFinite(numeric(value)) ? numeric(value) : null;
  const text = value => { if (value && typeof value === 'object' && 'value' in value) value=value.value; return typeof value === 'string' ? value.trim() : ''; };
  function first(obj, keys) { for (const key of keys) if (obj && obj[key] !== undefined && obj[key] !== null) { const value=obj[key]; return value && typeof value==='object' && 'value' in value ? value.value : value; } return null; }
  function refParts(ref, location) {
    const r = ref && typeof ref === 'object' ? ref : {};
    const l = location && typeof location === 'object' ? location : {};
    const raw = typeof location === 'string' ? location : (typeof ref === 'string' ? '' : '');
    return { province: text(first(r,['province','省份']) || first(l,['province','省份'])), city: text(first(r,['city','城市']) || first(l,['city','城市']) || raw), station: text(first(r,['station','台站','stationName']) || first(l,['station','台站','stationName'])) };
  }
  function findExact(parts) {
    const rows = database && Array.isArray(database.locations) ? database.locations : [];
    if (!parts.city && !parts.station) return { row:null, ambiguous:false };
    let hits = rows;
    if (parts.province) hits = hits.filter(row => text(row.province) === parts.province);
    if (parts.city) hits = hits.filter(row => text(row.city) === parts.city);
    if (parts.station) hits = hits.filter(row => text(row.station) === parts.station);
    if (hits.length === 1) return {row:hits[0], ambiguous:false};
    return {row:null, ambiguous:hits.length > 1};
  }
  function getLocations() { return database && Array.isArray(database.locations) ? database.locations.map(row => ({ ...row })) : []; }
  function referenceForLocation(index) {
    if (index === '' || index === null || index === undefined) return null;
    const row = database && Array.isArray(database.locations) ? database.locations[Number(index)] : null;
    return row ? { province: text(row.province), city: text(row.city), station: text(row.station) } : null;
  }
  const WEATHER_FIELDS = {
    winterAirConditioningTemperature: { season:'winter', key:'dryBulb', aliases:['winterAirConditioningTemperature','winterOutdoorDryBulb','winterDryBulb'], validate:temp },
    winterAirConditioningRH: { season:'winter', key:'rh', aliases:['winterAirConditioningRH','outdoorRH','winterOutdoorRH'], validate:rh },
    summerAirConditioningDryBulb: { season:'summer', key:'dryBulb', aliases:['summerAirConditioningDryBulb','summerOutdoorDryBulb','summerDryBulb'], validate:temp },
    summerAirConditioningWetBulb: { season:'summer', key:'wetBulb', aliases:['summerAirConditioningWetBulb','summerOutdoorWetBulb','summerWetBulb'], validate:temp }
  };
  function overrideValue(override, field) {
    if (!override || typeof override !== 'object') return null;
    const spec = WEATHER_FIELDS[field];
    const nested = override[spec.season] && typeof override[spec.season] === 'object' ? override[spec.season] : {};
    for (const key of spec.aliases.concat(spec.key)) {
      if (Object.prototype.hasOwnProperty.call(override,key)) {
        const value = spec.validate(override[key]); if (value !== null) return value;
      }
      if (Object.prototype.hasOwnProperty.call(nested,key)) {
        const value = spec.validate(nested[key]); if (value !== null) return value;
      }
    }
    return null;
  }
  function resolve(project, unit) {
    project = project || {}; unit = unit || {};
    const conditions = project.conditions || (project.project && project.project.conditions) || {};
    const parts = refParts(project.weatherReference, project.location);
    const match = findExact(parts);
    const row = match.row;
    const base = {
      usageLocation: row ? [row.province, row.city].filter(Boolean).join(' ') : (text(project.location) || '未关联'),
      winter: { dryBulb: temp(first(conditions,['winterOutdoorDryBulb','winterDryBulb','winterAirConditioningTemperature'])), rh: rh(first(conditions,['outdoorRH','winterOutdoorRH','winterAirConditioningRH'])) },
      summer: { dryBulb: temp(first(conditions,['summerOutdoorDryBulb','summerDryBulb','summerAirConditioningDryBulb'])), wetBulb: temp(first(conditions,['summerOutdoorWetBulb','summerWetBulb','summerAirConditioningWetBulb'])) },
      source: 'project-conditions', note: '', manualModified: false, status: 'resolved'
    };
    if (row) {
      if (base.winter.dryBulb === null) base.winter.dryBulb = temp(row.winterAirConditioningTemperature);
      if (base.winter.rh === null) base.winter.rh = rh(row.winterAirConditioningRH);
      if (base.summer.dryBulb === null) base.summer.dryBulb = temp(row.summerAirConditioningDryBulb);
      if (base.summer.wetBulb === null) base.summer.wetBulb = temp(row.summerAirConditioningWetBulb);
      base.usageLocation = [row.province,row.city].filter(Boolean).join(' ');
      base.source = database.status || 'user-supplied-derived-workbook';
      base.note = '天气数据来自用户提供的修改版工作簿，正式工程使用前需工程核对。';
    } else if (match.ambiguous) { base.status='ambiguous'; base.note='项目使用地匹配到多个气象台站，保留项目工况，需人工选择唯一台站。'; }
    else if (!parts.city && !parts.station) { base.status='blank'; base.usageLocation='未关联'; }
    else { base.status='unknown'; base.note='项目使用地未在气象库中精确匹配，保留项目工况，需人工核对。'; }
    const projectOverride = project.weatherOverride;
    const unitOverride = unit.weatherOverride;
    let anyManual = false, projectManualModified = false;
    for (const field of Object.keys(WEATHER_FIELDS)) {
      const spec = WEATHER_FIELDS[field];
      const projectValue = overrideValue(projectOverride, field);
      const unitValue = overrideValue(unitOverride, field);
      const value = unitValue !== null ? unitValue : (projectValue !== null ? projectValue : null);
      if (projectValue !== null) projectManualModified = true;
      if (unitValue !== null || projectValue !== null) anyManual = true;
      if (value !== null) base[spec.season][spec.key] = value;
    }
    base.projectManualModified = projectManualModified;
    base.manualModified = anyManual;
    if (anyManual) { base.status='manual'; base.usageLocation='已手动修改'; }
    return base;
  }
  return { resolve, getLocations, referenceForLocation };
});
