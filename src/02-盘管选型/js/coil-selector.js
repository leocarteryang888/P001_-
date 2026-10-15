(function (root) {
  'use strict';
  let db = root.CoilDatabase;
  const sectionDb = root.CoilSectionDatabase;
  const format = mm => String(Number((mm / 100).toFixed(3)));
  function select(input) {
    if (!input || !['ceiling', 'floor'].includes(input.installation)) throw new Error('请选择吊顶或落地安装形式。');
    if (input.series !== '25W') throw new Error('标准选型表仅适用于 25W；50W 或非标尺寸需另行设计，不能套用本表。');
    const code = String(input.spec ?? '').trim();
    if (!/^\d{4}$/.test(code)) throw new Error('箱体规格须为四位高宽模数，例如 1012 表示高10M、宽12M。');
    const rowCount = Number(input.rows), tube = Number(input.tube), header = Number(input.header);
    if (!db.rows.includes(rowCount)) throw new Error('排数仅支持 2、3、4、6、8 排。');
    if (![9.52, 12.7].includes(tube)) throw new Error('水盘管换热管径仅支持 φ9.52 或 φ12.7。');
    const headerIndex = db.headers.indexOf(header);
    if (headerIndex < 0) throw new Error('汇管径须选择 DN32、40、50、65、80 或 100。');
    const record = db.tables[input.installation].find(item => item.code === code);
    if (!record) throw new Error('标准表无箱体规格 ' + code + '，不自动推算非标型号。请查看可用规格。');
    if (record.tube !== tube) throw new Error('该箱体在此安装形式下的标准管径为 φ' + record.tube + '，与所选 φ' + tube + ' 不匹配。请核实后调整输入。');
    const width = record.widths[headerIndex], height = record.height;
    const thickness = db.thickness[String(tube)][header]?.[db.rows.indexOf(rowCount)] ?? null;
    const warnings = [];
    const review = height > 1450 || width > 4000;
    if (review) warnings.push('标准表列出的迎面尺寸超出 §2.5.6 的 A≤4000、B≤1450mm 限制，存在资料冲突；暂不生成型号，请设计人员复核。');
    if (thickness === null) warnings.push('DN100 的迎面宽度可查表，但表2.5-2未提供对应厚度，厚度须另行确认。');
    if (tube === 12.7 && record.count > 1) warnings.push('多层 φ12.7 表冷器须配置中间水盘组件。');
    const suffix = record.count > 1 ? 'H' + record.count : '';
    return {
      code, tube, header, rows: rowCount, installation: input.installation,
      boxHeight: Number(code.slice(0,2)) * 100 + 50,
      boxWidth: Number(code.slice(2)) * 100 + 50,
      width, height, count: record.count, thickness,
      model: review ? null : 'φ' + tube + '-STTL-' + rowCount + '-' + format(width) + '*' + format(height) + suffix,
      status: review ? 'review' : 'selected', warnings,
      source: input.installation === 'ceiling' ? '表2.5-5（吊顶），正文42–45页' : '表2.5-6（落地），正文45–49页'
    };
  }
  function replaceDatabase(next) {
    if (root.CoilDataIO) root.CoilDataIO.validate(next);
    db = next;
    root.dispatchEvent?.(new CustomEvent('coil-database-changed'));
  }
  function listFaceSectionCandidates(input) {
    if (!sectionDb || !Array.isArray(sectionDb.rows)) throw new Error('WK盘管迎风截面数据未加载。');
    const airVolume = Number(input?.airVolumeM3h);
    const minVelocity = Number(input?.minVelocityMps ?? 1.5);
    const maxVelocity = Number(input?.maxVelocityMps ?? 3.0);
    if (!Number.isFinite(airVolume) || airVolume <= 0) throw new Error('送风量须为大于 0 的有效数值。');
    if (!Number.isFinite(minVelocity) || !Number.isFinite(maxVelocity) || minVelocity <= 0 || maxVelocity < minVelocity) {
      throw new Error('风速筛选范围须满足 0 < 下限 ≤ 上限。');
    }
    const series = input?.series === '50W' ? '50W' : '25W';
    const offset = series === '50W' ? 100 : 50;
    const rows = sectionDb.rows.map(row => {
      const pipePitchMm = sectionDb.tubePitchMm[String(row.tube)];
      const holeCount = row.holeCounts.reduce((sum, count) => sum + Number(count || 0), 0);
      const effectiveAreaM2 = row.effectiveLengthMm * holeCount * pipePitchMm / 1e6;
      const faceVelocityMps = airVolume / 3600 / effectiveAreaM2;
      return {
        sourceRow: row.sourceRow,
        widthModule: row.widthModule,
        heightModule: row.heightModule,
        series,
        widthMm: row.widthModule * 100 + offset,
        heightMm: row.heightModule * 100 + offset,
        tube: row.tube,
        effectiveLengthMm: row.effectiveLengthMm,
        holeCounts: row.holeCounts.slice(),
        totalHoleCount: holeCount,
        pipePitchMm,
        effectiveAreaM2,
        faceVelocityMps,
        recommendedFlag: row.recommendedFlag
      };
    }).filter(row => row.effectiveAreaM2 > 0 && row.faceVelocityMps >= minVelocity && row.faceVelocityMps <= maxVelocity);
    rows.sort((a, b) => a.faceVelocityMps - b.faceVelocityMps || a.widthMm - b.widthMm || a.heightMm - b.heightMm || a.tube - b.tube || a.sourceRow - b.sourceRow);
    return {
      sourceVersion: sectionDb.version,
      series,
      sourceRecordCount: sectionDb.rows.length,
      minVelocityMps: minVelocity, maxVelocityMps: maxVelocity, airVolumeM3h: airVolume,
      candidates: rows
    };
  }
  function calculateCoilFaceVelocity(input) {
    const tube = Number(input?.tube), pipePitchMm = sectionDb?.tubePitchMm?.[String(tube)];
    const effectiveLengthMm = Number(input?.effectiveLengthMm), totalHoleCount = Number(input?.totalHoleCount ?? input?.holeCounts?.reduce((sum, count) => sum + Number(count || 0), 0));
    const airVolumeM3h = Number(input?.airVolumeM3h);
    if (!pipePitchMm || !Number.isFinite(effectiveLengthMm) || effectiveLengthMm <= 0 || !Number.isFinite(totalHoleCount) || totalHoleCount <= 0 || !Number.isFinite(airVolumeM3h) || airVolumeM3h <= 0) {
      throw new Error('盘管有效长度、孔数、管径和送风量须为有效正数。');
    }
    const effectiveAreaM2 = effectiveLengthMm * totalHoleCount * pipePitchMm / 1e6;
    return { effectiveAreaM2, faceVelocityMps: airVolumeM3h / 3600 / effectiveAreaM2, pipePitchMm, totalHoleCount };
  }
  function calculateNominalFaceVelocity(input) {
    const widthMm = Number(input?.widthMm), heightMm = Number(input?.heightMm), airVolumeM3h = Number(input?.airVolumeM3h);
    if (![widthMm, heightMm, airVolumeM3h].every(Number.isFinite) || widthMm <= 0 || heightMm <= 0 || airVolumeM3h <= 0) {
      throw new Error('宽、高和送风量都须为大于 0 的有效数值。');
    }
    const nominalAreaM2 = widthMm * heightMm / 1e6;
    return { widthMm, heightMm, airVolumeM3h, nominalAreaM2, nominalFaceVelocityMps: airVolumeM3h / 3600 / nominalAreaM2 };
  }
  root.CoilSelector = {select, listFaceSectionCandidates, calculateCoilFaceVelocity, calculateNominalFaceVelocity, getDatabase: () => db, replaceDatabase};
})(globalThis);
