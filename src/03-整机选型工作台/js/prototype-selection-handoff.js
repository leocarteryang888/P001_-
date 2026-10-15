(function (root, factory) {
  const api = factory(root.AHUSelectionHandoff);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AHUPrototypeSelectionHandoff = api;
})(typeof globalThis === 'object' ? globalThis : this, function (H) {
  'use strict';
  const formalType = { primary: 'primary-filter', medium: 'medium-filter', high: 'high-filter', coil: 'cooling-coil' };
  const clone = value => JSON.parse(JSON.stringify(value));
  function newId(prefix) { return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`}`; }
  function ensureIds(projects) {
    const seen = new Set();
    for (const project of projects) {
      if (!project.projectId || seen.has(project.projectId)) project.projectId = newId('project');
      seen.add(project.projectId);
      const units = new Set();
      for (const unit of project.units) {
        if (!unit.unitId || units.has(unit.unitId)) unit.unitId = newId('unit');
        units.add(unit.unitId);
      }
    }
    return projects;
  }
  function ids(project, unit, segment) {
    const projectId = project.projectId || project.id;
    const unitId = unit.unitId || unit.id;
    if (!projectId || !unitId || !segment?.id) throw new Error('原型项目、机组和功能段必须有稳定标识');
    return { projectId: String(projectId), unitId: String(unitId), segmentId: String(segment.id) };
  }
  function dimensions(unit) {
    const c = unit.designConditions || {};
    const width = Number(c.cabinetWidth?.value ?? c.cabinetWidthMm ?? c.width?.value);
    const height = Number(c.cabinetHeight?.value ?? c.cabinetHeightMm ?? c.height?.value);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) throw new Error('请先填写真实箱体宽度和高度，不能使用示意尺寸。');
    return { width, height };
  }
  function toFormal(project, unit, segment) {
    const id = ids(project, unit, segment), d = dimensions(unit);
    const type = formalType[segment.type];
    if (!type || (segment.sourceType && segment.sourceType !== type && segment.sourceType !== segment.type)) throw new Error('专业模块来源类型与原型功能段不匹配。');
    const formalSegment = clone(segment); formalSegment.type = type; formalSegment.id = id.segmentId;
    const rawAir = unit.designConditions?.airVolume?.value ?? String(unit.airflow || '').replace(/,/g, '').match(/[\d.]+/)?.[0];
    const airVolume = Number.isFinite(Number(rawAir)) ? Number(rawAir) : 0;
    return { project: { project: { projectId: id.projectId, units: [{ unitId: id.unitId, designConditions: { cabinetWidth: { value: d.width }, cabinetHeight: { value: d.height }, airVolume: { value: airVolume } }, segments: [formalSegment] }] } }, unitId: id.unitId, segmentId: id.segmentId };
  }
  function begin(project, unit, segment, nonce) {
    if (!H) throw new Error('专业回传协议不可用');
    const formal = toFormal(project, unit, segment);
    const unitView = formal.project.project.units[0], segmentView = unitView.segments[0];
    const d = dimensions(unit);
    if (d.width % 100 || d.height % 100 || d.width < 600 || d.width > 3300 || d.height < 600 || d.height > 3300) throw new Error('过滤器标准排布只适用于600–3300 mm、可整除100 mm的真实截面。');
    return H.makeContext(formal.project, unitView, segmentView, nonce);
  }
  function verify(project, unit, segment, pending, message, options) {
    let formal;
    try { formal = toFormal(project, unit, segment); }
    catch (error) { return { ok: false, reason: error.message }; }
    const result = H.verify(formal.project, pending, message, options || {});
    if (!result.ok) return result;
    if (message.result?.selector === 'coil' && options?.coilDatabase) {
      const db = options.coilDatabase, expected = `${db.version}+${databaseFingerprint(db)}`;
      if (message.result.rule?.version !== expected) return { ok: false, reason: '盘管结果与当前生效数据库版本或内容不一致，结果未应用。' };
    }
    return { ...result, originalProject: project, originalUnit: unit, originalSegment: segment };
  }
  function databaseFingerprint(database) { let hash = 2166136261; for (const character of JSON.stringify(database)) { hash ^= character.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, '0'); }
  function apply(verified) {
    if (!verified?.ok) return false;
    const formalSegment = verified.segment;
    if (!H.apply(null, { ok: true, segment: formalSegment, result: verified.result })) return false;
    const copy = clone(formalSegment.interface || {});
    verified.originalSegment.interface = copy;
    verified.originalSegment.selectionLevel = formalSegment.selectionLevel;
    verified.originalSegment.model = formalSegment.interface?.selection?.model || verified.originalSegment.model || '';
    verified.originalSegment.source = formalSegment.interface?.selection?.source || verified.originalSegment.source || '';
    verified.originalSegment.confirmed = false;
    return true;
  }
  function invalidate(segment, reason) {
    const record = segment.interface?.selection?.professionalResult;
    if (!record || !['filter', 'coil'].includes(record.selector)) return false;
    segment.professionalHistory ||= [];
    segment.professionalHistory.push({ ...clone(record), invalidatedAt: new Date().toISOString(), reason });
    delete segment.interface.selection.professionalResult;
    delete segment.interface.calculation?.professionalRule;
    delete segment.interface.output?.automatedSelection;
    segment.interface.selection.level = 'L1';
    segment.interface.selection.model = segment.model;
    segment.interface.validation = (segment.interface.validation || []).filter(item => item?.code !== 'professional-selection');
    segment.selectionLevel = 'L1'; segment.confirmed = false;
    return true;
  }
  return { formalType, dimensions, toFormal, begin, verify, apply, invalidate, ensureIds, newId, clone };
});
