(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AHUPrototypeProjectVersion = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const clone = value => JSON.parse(JSON.stringify(value));
  const makeId = (kind = 'record') => `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const companyCode = project => String(project?.salesCompanyCode || '').trim().toUpperCase();
  function projectCode(project, yearMonth, sequence) {
    const company = companyCode(project);
    if (!company) throw new Error('请填写销售公司代码，系统不能根据公司名称猜测代码');
    if (!/^[A-Z0-9]{1,12}$/.test(company)) throw new Error('销售公司代码仅支持 1–12 位英文字母或数字');
    if (!/^\d{4}$/.test(yearMonth)) throw new Error('项目编号年月必须为 YYMM');
    if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999) throw new Error('项目编号流水号超出 001–999');
    return `${company}-${yearMonth}-${String(sequence).padStart(3, '0')}`;
  }
  function nextUnitSequence(project) {
    const used = new Set((project?.units || []).map(unit => String(unit.sequenceNo || '')).filter(value => /^\d{3}$/.test(value)));
    const unidentified = (project?.units || []).filter(unit => !/^\d{3}$/.test(String(unit.sequenceNo || '')));
    if (unidentified.length) throw new Error('现有机组尚未确认编号中的三位顺延序号，请先标记并确认');
    for (let i = 1; i <= 999; i++) if (!used.has(String(i).padStart(3, '0'))) return String(i).padStart(3, '0');
    throw new Error('当前项目机组编号 001–999 已用完');
  }
  function inferSequenceNo(unitNo) {
    const matches = String(unitNo || '').match(/(?<!\d)\d{3}(?!\d)/g) || [];
    return matches.length === 1 ? matches[0] : null;
  }
  function equipmentNumberParts(unitNo, sequenceNo) {
    const value = String(unitNo || ''), sequence = String(sequenceNo || '');
    const matches = [...value.matchAll(/(?<!\d)\d{3}(?!\d)/g)];
    if (!/^\d{3}$/.test(sequence) || matches.length !== 1 || matches[0][0] !== sequence) return null;
    let prefix = value.slice(0, matches[0].index), suffix = value.slice(matches[0].index + 3);
    suffix = suffix.replace(/-(?:T-E|TE|T|E)$/i, '');
    suffix = suffix.replace(/-[A-Z]$/i, '').replace(/^[A-Z]$/i, '');
    return { prefix, suffix };
  }
  function nextEquipmentNumber(units, reservations = []) {
    const sourceUnits = Array.isArray(units) ? units : [];
    const rows = sourceUnits.map(unit => {
      const sequenceNo = unit.sequenceNo || inferSequenceNo(unit.no);
      return { unit, sequenceNo, parts: equipmentNumberParts(unit.no, sequenceNo) };
    });
    if (!rows.length && reservations.length) for (const reservation of reservations) {
      const no = typeof reservation === 'string' ? reservation : reservation.no;
      const sequenceNo = typeof reservation === 'string' ? inferSequenceNo(no) : reservation.sequenceNo || inferSequenceNo(no);
      rows.push({ unit: { no, sequenceNo }, sequenceNo, parts: equipmentNumberParts(no, sequenceNo) });
    }
    if (!rows.length) return { no: '001', sequenceNo: '001' };
    if (rows.some(row => !row.sequenceNo || !row.parts)) throw new Error('机组编号中未能唯一识别三位顺延号，请先明确标记并确认');
    const templates = new Set(rows.map(row => `${row.parts.prefix}\u0000${row.parts.suffix}`));
    if (templates.size !== 1) throw new Error('当前机组编号前后缀不同，请先选定新机组编号沿用的格式');
    const { prefix, suffix } = rows[0].parts;
    const used = [...rows.map(row => row.sequenceNo), ...(reservations || []).map(row => String(typeof row === 'string' ? inferSequenceNo(row) : row.sequenceNo || inferSequenceNo(row.no) || ''))].filter(value => /^\d{3}$/.test(value));
    const next = Math.max(0, ...used.map(value => Number(value))) + 1;
    if (next <= 999) { const sequenceNo = String(next).padStart(3, '0'); return { no: `${prefix}${sequenceNo}${suffix}`, sequenceNo }; }
    throw new Error('当前项目机组编号 001–999 已用完');
  }
  function nextRevision(unitNumber, historicalNos = [], state = {}) {
    const currentObject = unitNumber && typeof unitNumber === 'object' ? unitNumber : null;
    const oldFlags = state.currentFlags ?? (currentObject && (currentObject.nonstandardFlag !== undefined || currentObject.parameterAdjustmentFlag !== undefined) ? currentObject : undefined);
    const explicitFlags = state.flags ?? (state.nonstandardFlag !== undefined || state.parameterAdjustmentFlag !== undefined ? { nonstandardFlag: state.nonstandardFlag, parameterAdjustmentFlag: state.parameterAdjustmentFlag } : oldFlags);
    const flagsOf = value => {
      if (value === undefined || value === null) return { flags: '', explicit: false };
      if (typeof value === 'object') return { flags: `${value.nonstandardFlag === true ? 'T' : ''}${value.parameterAdjustmentFlag === true ? 'E' : ''}`, explicit: true };
      const flags = String(value).toUpperCase().replace(/-/g, '');
      if (!/^(?:|T|E|TE|ET)$/.test(flags)) throw new Error('T/E 标记状态无效');
      return { flags: `${flags.includes('T') ? 'T' : ''}${flags.includes('E') ? 'E' : ''}`, explicit: true };
    };
    const currentFlags = flagsOf(explicitFlags);
    const parse = (value, revisionOverride, flagOverride) => {
      const row = value && typeof value === 'object' ? value : null;
      let raw = String(row?.no || row?.unitNo || value || '').trim();
      const flagInfo = flagsOf(flagOverride ?? (row && (row.nonstandardFlag !== undefined || row.parameterAdjustmentFlag !== undefined) ? row : undefined));
      if (!flagInfo.explicit) {
        const combined = raw.match(/-(TE|ET|T-E)$/i)?.[1];
        if (combined) { const f = flagsOf(combined); flagInfo.flags = f.flags; raw = raw.replace(/-(?:TE|ET|T-E)$/i, ''); }
      } else {
        const suffix = `-${flagInfo.flags}`;
        if (flagInfo.flags && raw.toUpperCase().endsWith(suffix)) raw = raw.slice(0, -suffix.length);
        else if (flagInfo.flags === 'TE' && /-T-E$/i.test(raw)) raw = raw.slice(0, -4);
      }
      let revision = String(revisionOverride ?? row?.revisionNo ?? '');
      if (revision && !/^[A-Z]$/i.test(revision)) throw new Error('机组修订状态必须是 A–Z 单字母');
      if (!revision) {
        const legacy = raw.match(/(?<=\d{3})([A-Z])$/i);
        const separated = raw.match(/-([A-Z])$/i);
        if (legacy) { revision = legacy[1]; raw = raw.slice(0, -1); }
        else if (separated) {
          const letter = separated[1].toUpperCase();
          if ((letter === 'T' || letter === 'E') && !flagInfo.explicit) throw new Error('机组编号末尾 T/E 与修订字母有歧义，请先明确机组修订及T/E状态');
          revision = letter; raw = raw.slice(0, -2);
        }
      } else {
        const legacy = raw.match(/(?<=\d{3})([A-Z])$/i);
        if (legacy && legacy[1].toUpperCase() === revision.toUpperCase()) raw = raw.slice(0, -1);
        else if (raw.endsWith(`-${revision}`)) raw = raw.slice(0, -2);
      }
      return { base: raw, revision: revision.toUpperCase(), flags: flagInfo.flags };
    };
    const current = parse(currentObject || unitNumber, state.currentRevision, oldFlags ?? explicitFlags), base = current.base;
    const revisions = (historicalNos || []).map(value => { const info = parse(value); return info.base === base ? info.revision : ''; }).filter(Boolean);
    if (current.revision) revisions.push(current.revision);
    const last = revisions.length ? Math.max(...revisions.map(letter => letter.charCodeAt(0) - 64)) : 0;
    if (last >= 26) throw new Error('机组修订已到 Z，后续规则尚未确认');
    const outputFlags = currentFlags.explicit ? currentFlags.flags : current.flags;
    return `${base}-${String.fromCharCode(65 + last)}${outputFlags ? `-${outputFlags}` : ''}`;
  }
  function freezeExport(project, { file, exportedAt = new Date().toISOString(), filename = '' } = {}) {
    const snapshot = clone(project);
    return { exportId: makeId('export'), exportedAt, filename, file: file || null, snapshot, lineageId: project.lineageId || project.projectId || project.code,
      versionId: project.versionId || makeId('version'), changes: [] };
  }
  const technicalFields = new Set(['projectId','lineageId','versionId','parentVersionId','unitId','unitLineageId','modifiedAt','createdAt','updatedAt','exportedAt','lastExportId','isFrozen','sequenceNo','savedAt','lastConfirmedFingerprint','usedUnitNumbers','confirmedAt','pendingRecalculation','manualConfirmation','revisionNo']);
  function businessValue(value) {
    if (Array.isArray(value)) return value.map(businessValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !technicalFields.has(key)).map(([key, item]) => [key, businessValue(item)]));
  }
  function diffValues(before, after, path = '', out = []) {
    if (JSON.stringify(before) === JSON.stringify(after)) return out;
    const plain = value => value && typeof value === 'object' && !Array.isArray(value);
    if (before === undefined && plain(after)) {
      for (const key of Object.keys(after)) if (!technicalFields.has(key)) diffValues(undefined, after[key], path ? `${path}.${key}` : key, out);
      return out;
    }
    if (after === undefined && plain(before)) {
      for (const key of Object.keys(before)) if (!technicalFields.has(key)) diffValues(before[key], undefined, path ? `${path}.${key}` : key, out);
      return out;
    }
    if (before === undefined && Array.isArray(after)) {
      after.forEach((value, index) => diffValues(undefined, value, `${path}[${index}]`, out)); return out;
    }
    if (after === undefined && Array.isArray(before)) {
      before.forEach((value, index) => diffValues(value, undefined, `${path}[${index}]`, out)); return out;
    }
    if (Array.isArray(before) && Array.isArray(after)) {
      const keyOf = item => item && typeof item === 'object' ? (item.unitLineageId || item.unitId || item.id) : undefined;
      if ([...before, ...after].every(item => keyOf(item) !== undefined)) {
        const left = new Map(before.map(item => [keyOf(item), item])), right = new Map(after.map(item => [keyOf(item), item]));
        for (const id of new Set([...left.keys(), ...right.keys()])) diffValues(left.get(id), right.get(id), `${path}[${id}]`, out);
      } else {
        for (let i = 0; i < Math.max(before.length, after.length); i++) diffValues(before[i], after[i], `${path}[${i}]`, out);
      }
      return out;
    }
    if (plain(before) && plain(after)) {
      for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) if (!technicalFields.has(key)) diffValues(before[key], after[key], path ? `${path}.${key}` : key, out);
      return out;
    }
    const change = before === undefined ? 'added' : after === undefined ? 'deleted' : 'modified';
    const lower = path.toLowerCase();
    const group = /drawing|cad|pdf|dxf|图纸|图样/.test(lower) ? 'drawing' : /segment|config|filter|coil|humid|fan|configuration|配置/.test(lower) ? 'configuration' : 'parameter';
    out.push({ path, change, before: before === undefined ? null : clone(businessValue(before)), after: after === undefined ? null : clone(businessValue(after)), group });
    return out;
  }
  function compareExports(previous, current) {
    const before = previous?.snapshot || {}, after = current?.snapshot || {};
    const fields = diffValues(before, after);
    const unitsBefore = before.units || [], unitsAfter = after.units || [];
    const byLineage = list => new Map(list.map(unit => [unit.unitLineageId || unit.unitId || unit.no, unit]));
    const left = byLineage(unitsBefore), right = byLineage(unitsAfter), units = [];
    for (const id of new Set([...left.keys(), ...right.keys()])) {
      const b = left.get(id), a = right.get(id), changes = diffValues(b, a);
      if (changes.length) units.push({ unitLineageId: id, unitNo: a?.no || b?.no || '', changes: { parameters: changes.filter(x => x.group === 'parameter'), configuration: changes.filter(x => x.group === 'configuration'), drawings: changes.filter(x => x.group === 'drawing') } });
    }
    return { fromExportId: previous?.exportId || null, toExportId: current?.exportId || null,
      overview: { added: fields.filter(x => x.change === 'added').length, modified: fields.filter(x => x.change === 'modified').length, deleted: fields.filter(x => x.change === 'deleted').length },
      fields, units };
  }
  return { clone, makeId, projectCode, nextUnitSequence, inferSequenceNo, equipmentNumberParts, nextEquipmentNumber, nextRevision, freezeExport, diffValues, compareExports };
});
