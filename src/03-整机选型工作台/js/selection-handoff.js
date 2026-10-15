(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AHUSelectionHandoff = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const OUTBOX = 'p001-ahu-selection-result-v1:', ACK = 'p001-ahu-selection-ack-v1:';
  const stable = value => Array.isArray(value) ? `[${value.map(stable).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}` : JSON.stringify(value);
  function fingerprint(value) { let hash = 2166136261; for (const char of stable(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, '0'); }
  function makeContext(project, unit, segment, nonce) {
    const c = unit.designConditions, r = unit.profile?.recommendation || {};
    const snapshot = { projectId: project.project.projectId, unitId: unit.unitId, segmentId: segment.id, segmentType: segment.type,
      cabinetWidth: Number(c.cabinetWidth?.value), cabinetHeight: Number(c.cabinetHeight?.value), airVolume: Number(c.airVolume?.value),
      installationType: unit.profile?.installationType || '', coilRows: r.coilRows ?? '', tubeDiameter: r.tubeDiameter ?? '' };
    return { protocol: 'p001-selection-v1', nonce, target: { projectId: snapshot.projectId, unitId: snapshot.unitId, segmentId: snapshot.segmentId, segmentType: snapshot.segmentType }, workbenchSnapshot: snapshot, workbenchFingerprint: fingerprint(snapshot) };
  }
  function resultKey(nonce) { return OUTBOX + nonce; }
  function ackKey(nonce) { return ACK + nonce; }
  function revisionMatches(expected, persisted) { return (Number(expected) || 0) === (Number(persisted) || 0); }
  function makeModuleUrl(path, context, location) { const url = new URL(path, location.href); url.searchParams.set('p001Handoff', encodeURIComponent(JSON.stringify(context))); return url.href; }
  function readResult(storage, nonce) { try { const value = storage.getItem(resultKey(nonce)); return value ? JSON.parse(value) : null; } catch { return null; } }
  function verify(project, pending, message, options = {}) {
    try { return verifyUnsafe(project, pending, message, options); }
    catch { return { ok: false, reason: '专业选型回传格式无效或字段不完整，结果已拒收。' }; }
  }
  function verifyUnsafe(project, pending, message, options) {
    if (!pending || !message || message.protocol !== 'p001-selection-result-v1' || message.nonce !== pending.nonce) return { ok: false, reason: '找不到有效的本次选型任务。' };
    const unit = project.project?.units?.find(item => item.unitId === pending.target.unitId);
    const segment = unit?.segments?.find(item => item.id === pending.target.segmentId);
    if (project.project?.projectId !== pending.target.projectId || !unit || !segment || segment.type !== pending.target.segmentType) return { ok: false, reason: '项目、机组或功能段已变化，结果未应用。' };
    const actual = makeContext(project, unit, segment, pending.nonce);
    if (actual.workbenchFingerprint !== pending.workbenchFingerprint || actual.workbenchFingerprint !== pendingContextFingerprint(pending)) return { ok: false, reason: '机组输入条件已变化，请从当前功能段重新打开专业选型。' };
    const result = message.result;
    if (!result || result.status !== 'selected' || !String(result.model || '').trim() || result.reviewRequired) return { ok: false, reason: result?.reason || '规则未给出可正式应用的型号；请处理不适用或资料复核问题。' };
    const validTargets = { filter: new Set(['primary-filter', 'medium-filter', 'high-filter']), coil: new Set(['cooling-coil']) };
    if (!validTargets[result.selector]?.has(segment.type)) return { ok: false, reason: '专业选型模块与目标功能段类型不匹配，结果未应用。' };
    if (!result.workbenchSnapshot || typeof result.workbenchSnapshot !== 'object' || Array.isArray(result.workbenchSnapshot) || !result.input || typeof result.input !== 'object' || Array.isArray(result.input) || !result.data || typeof result.data !== 'object' || Array.isArray(result.data) || !Array.isArray(result.warnings) || typeof result.source !== 'string' || !result.source.trim()) return { ok: false, reason: '专业选型回传格式无效或字段不完整，结果已拒收。' };
    if (result.workbenchFingerprint !== pending.workbenchFingerprint || fingerprint(result.workbenchSnapshot) !== pending.workbenchFingerprint || result.target?.projectId !== pending.target.projectId || result.target?.unitId !== pending.target.unitId || result.target?.segmentId !== pending.target.segmentId || result.target?.segmentType !== pending.target.segmentType) return { ok: false, reason: '专业页返回的目标或输入快照不匹配，结果未应用。' };
    const width = Number(unit.designConditions.cabinetWidth?.value), height = Number(unit.designConditions.cabinetHeight?.value);
    if (result.selector === 'filter' && (result.input?.widthMm !== width || result.input?.heightMm !== height || !['pull', 'frame'].includes(result.input?.mode) || !result.input?.typeId || result.input?.widthModule * 100 !== width || result.input?.heightModule * 100 !== height)) return { ok: false, reason: '过滤器选型类型、排布或尺寸与当前机组不一致，结果未应用。' };
    if (result.selector === 'filter' && !validFilterResult(result, options.filterDatabase)) return { ok: false, reason: '过滤器排布结果与当前生效数据库规则或选型输入不一致，结果未应用。' };
    if (result.selector === 'filter' && !filterTypeApplicable(segment.type, result.input.typeId)) return { ok: false, reason: '过滤器类型与目标功能段不匹配；复合型 G+F、活性炭类型暂未定义单段回写范围。' };
    if (result.selector === 'coil' && (result.data?.status !== 'selected' || result.input?.cabinetWidthMm !== width || result.input?.cabinetHeightMm !== height || result.input?.spec !== String(Math.round(height / 100)).padStart(2, '0') + String(Math.round(width / 100)).padStart(2, '0') || result.input?.series !== '25W' || !['ceiling', 'floor'].includes(result.input?.installation) || ![2, 3, 4, 6, 8].includes(result.input?.rows) || ![9.52, 12.7].includes(result.input?.tube) || ![32, 40, 50, 65, 80, 100].includes(result.input?.header))) return { ok: false, reason: '盘管选型规格、系列或输入条件与当前机组不一致，结果未应用。' };
    if (result.selector === 'coil' && !validCoilResult(result)) return { ok: false, reason: '盘管几何选型结果数据不完整或存在待复核状态，结果未应用。' };
    const expectedRule = result.selector === 'filter' ? 'filter-standard-arrangement' : 'coil-standard-table-25w';
    if (result.rule?.id !== expectedRule || typeof result.rule?.version !== 'string' || !result.rule.version.trim()) return { ok: false, reason: '结果缺少匹配的规则 ID 或版本，不能写入正式选型。' };
    return { ok: true, projectId: pending.target.projectId, unitId: unit.unitId, segment, unit, result };
  }
  function pendingContextFingerprint(pending) { return pending.workbenchFingerprint; }
  function validFilterResult(result, database) {
    const input = result.input, arrangement = result.data?.arrangement, type = result.data?.filterType;
    if (!database || database.version !== '1.0.0' || database.moduleRange?.unitMm !== 100 || !Number.isInteger(input.widthModule) || input.widthModule < database.moduleRange.min || input.widthModule > database.moduleRange.max || !Number.isInteger(input.heightModule) || input.heightModule < database.moduleRange.min || input.heightModule > database.moduleRange.max) return false;
    if (!type || type.id !== input.typeId || !Array.isArray(arrangement?.width) || !Array.isArray(arrangement?.height) || !Array.isArray(arrangement?.specifications) || !arrangement.width.length || !arrangement.height.length) return false;
    const databaseType = database.filterTypes?.find(item => item.id === input.typeId), ruleWidth = database.arrangements?.[input.mode]?.width?.[input.widthModule], ruleHeight = database.arrangements?.[input.mode]?.height?.[input.heightModule];
    if (!databaseType || type.name !== databaseType.name || type.detail !== databaseType.detail || JSON.stringify(arrangement.width) !== JSON.stringify(ruleWidth) || JSON.stringify(arrangement.height) !== JSON.stringify(ruleHeight)) return false;
    if (arrangement.mode !== input.mode || arrangement.width.some(value => !Number.isInteger(value) || value < 3 || value > 6) || arrangement.height.some(value => !Number.isInteger(value) || value < 3 || value > 6)) return false;
    // 排布数组表示数据库定义的过滤器单元拼排，不要求其模数之和等于箱体模数；
    // 数据库中的留边/安装结构规则可能使拼排合计小于箱体尺寸。
    const expected = new Map();
    arrangement.height.forEach(height => arrangement.width.forEach(width => { const code = `${width}${height}`; expected.set(code, (expected.get(code) || 0) + 1); }));
    const received = new Map();
    for (const item of arrangement.specifications) {
      if (!/^([3-6])([3-6])$/.test(String(item?.code)) || !Number.isInteger(item.count) || item.count < 1 || received.has(String(item.code))) return false;
      received.set(String(item.code), item.count);
    }
    return arrangement.total === arrangement.width.length * arrangement.height.length && expected.size === received.size && [...expected].every(([code, count]) => received.get(code) === count) && result.rule?.version === `${database.version}+${databaseFingerprint(database)}`;
  }
  function databaseFingerprint(database) { let hash = 2166136261; for (const character of JSON.stringify(database)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, '0'); }
  function filterTypeApplicable(segmentType, typeId) {
    const scope = { 'primary-filter': new Set(['g2_20', 'g3_46']), 'medium-filter': new Set(['f_300', 'f_500']), 'high-filter': new Set(['h']) };
    return Boolean(scope[segmentType]?.has(typeId));
  }
  function validCoilResult(result) {
    const data = result.data;
    return data?.status === 'selected' && Number.isFinite(data.faceWidth) && data.faceWidth > 0 && Number.isFinite(data.faceHeight) && data.faceHeight > 0 && Number.isInteger(data.count) && data.count > 0 && (data.thickness === null || (Number.isFinite(data.thickness) && data.thickness > 0));
  }
  function apply(project, verified) {
    if (!verified?.ok) return false;
    const segment = verified.segment, result = verified.result, stamped = new Date().toISOString();
    const record = { schemaVersion: 1, level: 'L2', status: 'selected', selector: result.selector, model: result.model,
      rule: result.rule, source: result.source, selectedAt: stamped, workbenchSnapshot: result.workbenchSnapshot,
      workbenchFingerprint: result.workbenchFingerprint, input: result.input, result: result.data, warnings: result.warnings || [] };
    segment.interface ||= {}; segment.interface.calculation ||= {}; segment.interface.selection ||= {}; segment.interface.output ||= {};
    segment.interface.calculation.professionalRule = { id: result.rule.id, version: result.rule.version, source: result.source };
    segment.interface.selection.model = result.model;
    segment.interface.selection.source = result.source;
    segment.interface.selection.level = 'L2';
    segment.interface.selection.professionalResult = record;
    segment.interface.output.automatedSelection = JSON.parse(JSON.stringify(record));
    segment.interface.validation = (segment.interface.validation || []).filter(item => item?.code !== 'professional-selection');
    if (record.warnings.length) segment.interface.validation.push({ code: 'professional-selection', level: 'warning', message: record.warnings.join('；'), source: result.source, ruleVersion: result.rule.version });
    segment.selectionLevel = 'L2';
    return true;
  }
  return { OUTBOX, ACK, fingerprint, makeContext, makeModuleUrl, resultKey, ackKey, readResult, verify, apply, revisionMatches, filterTypeApplicable };
});
