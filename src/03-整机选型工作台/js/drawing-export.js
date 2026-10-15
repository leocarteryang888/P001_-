(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AHUDrawingExport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FRAME = Object.freeze({ width: 420, height: 297, margin: 10, titleWidth: 180, titleHeight: 48, version: 'A3-01' });
  const text = value => value == null || value === '' ? '未提供' : String(value);
  const fieldValue = item => item && typeof item === 'object' && 'value' in item ? item.value : item;
  const numberValue = item => { const value = Number(fieldValue(item)); return Number.isFinite(value) && fieldValue(item) !== '' && fieldValue(item) != null ? value : null; };
  const escHtml = value => text(value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  const dxfText = value => [...text(value)].map(char => char.codePointAt(0) < 128 ? char : `\\U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join('');

  function resolveSnapshot(raw) {
    if (!raw || typeof raw !== 'object') throw new TypeError('需要传入已保存的项目数据快照');
    const project = raw.project || raw;
    const units = Array.isArray(project.units) ? project.units : [];
    const unit = units.find(item => item.unitId === raw.activeUnitId) || units[0] || (raw.unit ? raw.unit : raw.unitNo ? raw : null);
    if (!unit) throw new Error('项目中没有可导出的机组');
    const conditions = unit.designConditions || raw.designConditions || {};
    const profile = unit.profile || {};
    const segments = (unit.segments || (raw.segments && unit === raw ? raw.segments : [])).filter(segment => segment.enabled !== false);
    return { project, unit, conditions, profile, segments };
  }

  function makeDrawingModel(snapshot, options = {}) {
    const { project, unit, conditions, profile, segments } = resolveSnapshot(snapshot);
    const width = numberValue(conditions.cabinetWidth), height = numberValue(conditions.cabinetHeight);
    const rows = segments.map((segment, index) => ({
      index: index + 1, id: text(segment.id || segment.segmentId), name: text(segment.name || segment.type),
      length: numberValue(segment.interface?.drawing?.length ?? segment.drawing?.length),
      model: text(segment.interface?.selection?.model || segment.interface?.selection?.partRef?.model),
      status: text(segment.selectionLevel || 'L1')
    }));
    const knownLengths = rows.length > 0 && rows.every(row => Number.isFinite(row.length) && row.length > 0);
    const totalLength = knownLengths ? rows.reduce((sum, row) => sum + row.length, 0) : null;
    const missing = [];
    if (!(width > 0)) missing.push('机组宽度 X');
    if (!(height > 0)) missing.push('机组高度 Z');
    if (!rows.length) missing.push('启用功能段 Y');
    rows.forEach(row => { if (!(row.length > 0)) missing.push(`${row.name}段长 Y`); });
    return {
      frame: FRAME, generatedAt: options.generatedAt || new Date().toISOString(),
      project: { id: text(project.projectId), code: text(project.projectCode), name: text(project.name), customer: text(project.customerName), owner: text(project.businessOwner), designer: text(project.technicalSupport) },
      unit: { id: text(unit.unitId), no: text(unit.unitNo), customerNo: text(profile.customerUnitNo), product: text(profile.productName), width, height, totalLength, revision: text(unit.resultRevision || unit.calculationRevision || '未计算'), status: unit.pendingRecalculation ? '待重算' : text(project.status || '编辑中') },
      axes: { width: 'X', length: 'Y', height: 'Z' }, segments: rows,
      missing, title: text(options.title || '组合式空调机组配置示意图'), disclaimer: '配置示意图；非生产加工图。未确认的计算、接口位置和结构细节未绘制。'
    };
  }

  function line(entities, x1, y1, x2, y2, layer = 'FRAME') { entities.push(`0\nLINE\n8\n${layer}\n10\n${x1}\n20\n${y1}\n30\n0\n11\n${x2}\n21\n${y2}\n31\n0\n`); }
  function rect(entities, x, y, width, height, layer = 'FRAME') { line(entities,x,y,x+width,y,layer); line(entities,x+width,y,x+width,y+height,layer); line(entities,x+width,y+height,x,y+height,layer); line(entities,x,y+height,x,y,layer); }
  function label(entities, value, x, y, size = 3, layer = 'TEXT') { entities.push(`0\nTEXT\n8\n${layer}\n10\n${x}\n20\n${y}\n30\n0\n40\n${size}\n1\n${dxfText(value)}\n`); }

  function createDxf(model) {
    const e = [], { margin, width: pageW, height: pageH, titleWidth, titleHeight } = FRAME;
    const x0 = margin, y0 = margin;
    rect(e, x0, y0, pageW - margin*2, pageH - margin*2);
    rect(e, x0+5, y0+5, pageW - margin*2-10, pageH - margin*2-10);
    label(e, model.title, x0+8, pageH-margin-12, 5);
    label(e, '配置示意图 | X=机组宽度/零件宽度  Y=段长/零件长度  Z=高度', x0+8, pageH-margin-20, 3);

    const contentX = x0+10, contentY = y0+titleHeight+18, contentW = pageW-2*margin-20, contentH = pageH-2*margin-titleHeight-45;
    const validGeometry = model.unit.width > 0 && model.unit.height > 0 && model.unit.totalLength > 0 && model.segments.every(s => s.length > 0);
    if (validGeometry) {
      const scale = Math.min(contentW/model.unit.totalLength, contentH/model.unit.height);
      let cursor = contentX;
      const drawnW = model.unit.totalLength * scale, drawnH = model.unit.height * scale;
      model.segments.forEach(segment => {
        const sectionW = segment.length * scale;
        rect(e, cursor, contentY, sectionW, drawnH, 'SEGMENT');
        label(e, segment.name, cursor+2, contentY+drawnH/2, Math.min(4, Math.max(2, sectionW/8)), 'TEXT');
        label(e, `${segment.length} mm`, cursor+2, contentY-5, 2.5, 'DIM');
        cursor += sectionW;
      });
      line(e, contentX, contentY-10, contentX+drawnW, contentY-10, 'DIM');
      label(e, `Y 总长 ${model.unit.totalLength} mm`, contentX, contentY-15, 3, 'DIM');
      label(e, `Z 高 ${model.unit.height} mm`, contentX+drawnW+3, contentY+drawnH/2, 3, 'DIM');
      label(e, `X 宽 ${model.unit.width} mm（侧视配置图未按宽度投影）`, contentX, contentY+drawnH+5, 3, 'DIM');
    } else {
      rect(e, contentX, contentY, contentW, contentH, 'SEGMENT');
      label(e, '几何信息不完整：未提供宽度/高度/全部段长，不能按比例生成段链图。', contentX+8, contentY+contentH/2, 4, 'WARN');
      label(e, `缺失：${model.missing.join('、')}`, contentX+8, contentY+contentH/2-10, 3, 'WARN');
    }

    const tx = pageW-margin-titleWidth, ty = y0, tw = titleWidth, th = titleHeight;
    rect(e, tx, ty, tw, th, 'TITLE');
    line(e, tx, ty+th*0.56, tx+tw, ty+th*0.56, 'TITLE');
    line(e, tx+tw*0.53, ty, tx+tw*0.53, ty+th*0.56, 'TITLE');
    label(e, `项目：${model.project.name}`, tx+3, ty+th-7, 3);
    label(e, `客户：${model.project.customer}`, tx+3, ty+th-14, 3);
    label(e, `机组：${model.unit.no}   产品：${model.unit.product}`, tx+3, ty+th-21, 3);
    label(e, `图名：${model.title}`, tx+3, ty+th-28, 3);
    label(e, `项目编号：${model.project.code}   机组ID：${model.unit.id}`, tx+3, ty+th-35, 2.2);
    label(e, `图框 ${FRAME.version} | 生成 ${model.generatedAt}`, tx+3, ty+4, 2.2);
    label(e, '制图：未提供', tx+tw*0.53+3, ty+th*0.56-8, 2.5);
    label(e, '复核：未提供', tx+tw*0.53+3, ty+th*0.56-16, 2.5);
    label(e, `W×H×L：${model.unit.width ?? '未提供'}×${model.unit.height ?? '未提供'}×${model.unit.totalLength ?? '未提供'} mm`, tx+tw*0.53+3, ty+th*0.56-25, 2.3);
    label(e, model.disclaimer, x0+8, y0+titleHeight+5, 2.5, 'WARN');

    return `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1021\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${e.join('')}0\nENDSEC\n0\nEOF\n`;
  }

  function reportRows(model) {
    return [
      ['类别','参数','数值','单位','状态'],
      ['项目','项目名称',model.project.name,'','已保存数据'], ['项目','项目编号',model.project.code,'','已保存数据'], ['项目','客户',model.project.customer,'','已保存数据'],
      ['机组','机组编号',model.unit.no,'','已保存数据'], ['机组','机组ID',model.unit.id,'','稳定标识'], ['机组','产品名称',model.unit.product,'','已保存数据'],
      ['机组','宽度 X',model.unit.width ?? '未提供','mm',model.unit.width > 0 ? '已保存数据' : '缺失或无效'], ['机组','高度 Z',model.unit.height ?? '未提供','mm',model.unit.height > 0 ? '已保存数据' : '缺失或无效'], ['机组','总长 Y',model.unit.totalLength ?? '未提供','mm',model.unit.totalLength == null ? '部分段长缺失' : '段长合计'],
      ...model.segments.map(segment => ['功能段',`${String(segment.index).padStart(2,'0')} ${segment.name}`,segment.length ?? '未提供','mm',`选型：${segment.model}；状态：${segment.length > 0 ? segment.status : '段长缺失或无效'}`]),
      ['说明','坐标约定','X=宽度；Y=气流/段长方向；Z=高度','','零件库与整机工作台统一'], ['说明','输出性质',model.disclaimer,'','不可用于生产加工'],
      ['未提供项','字段清单',model.missing.join('；') || '无','','未自动补值']
    ];
  }
  function csv(model) { return '\uFEFF' + reportRows(model).map(row => row.map(value => `"${String(value).replace(/"/g,'""')}"`).join(',')).join('\r\n'); }
  function htmlDocument(model) {
    const rows = reportRows(model).map(row => `<tr>${row.map(cell => `<td>${escHtml(cell)}</td>`).join('')}</tr>`).join('');
    const completeLengths = model.segments.length > 0 && model.segments.every(segment => Number.isFinite(segment.length) && segment.length > 0);
    const chain = completeLengths
      ? `<div class="chain">${model.segments.map(segment => `<div class="segment" style="flex:${segment.length}"><b>${escHtml(segment.name)}</b><span>${segment.length} mm</span></div>`).join('')}</div>`
      : `<div class="geometry-missing">段长数据不完整，未绘制按比例段链。请补齐各启用功能段的段长后重新输出。</div>`;
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>${escHtml(model.title)}</title><style>
      @page{size:A3 landscape;margin:10mm}*{box-sizing:border-box}body{font:12px "Microsoft YaHei",Arial,sans-serif;color:#142f3b;margin:0}h1{font-size:22px;margin:0 0 6px}h2{font-size:15px;margin:12px 0 6px}.sheet{min-height:277mm;border:1px solid #334d58;padding:8mm;position:relative}.sub{color:#476572}.drawing{height:112mm;border:1px solid #8ba4ac;margin-top:6mm;display:flex;align-items:center;padding:5mm;position:relative}.chain{display:flex;width:100%;height:68%;border:1px solid #335a65}.segment{min-width:0;border-right:1px solid #335a65;background:#eaf6f6;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;overflow:hidden}.segment span{margin-top:6px;font-size:10px}.geometry-missing{width:100%;padding:10mm;border:1px dashed #a86b22;background:#fff7e9;color:#754b1a}.axis{position:absolute;bottom:4mm;left:5mm;font-size:11px}.title{position:relative;margin:8mm 0 0 auto;width:180mm;border:1px solid #334d58;padding:4mm;min-height:26mm}.title strong{font-size:13px}.disclaimer{margin:4mm 0;color:#8b4a16}table{width:100%;border-collapse:collapse;font-size:10px}td{border:1px solid #9aafb4;padding:3px 5px}tr:first-child{font-weight:bold;background:#e7f0f2}@media print{.sheet{break-after:page}}</style><div class="sheet"><h1>${escHtml(model.title)}</h1><div class="sub">A3 横向标准图框 ${FRAME.version} · ${escHtml(model.generatedAt)} · 配置示意图</div><div class="drawing">${model.segments.length ? chain : '<div>未配置功能段</div>'}<div class="axis">X=机组宽度/零件宽度；Y=气流与段长/零件长度；Z=机组与零件高度</div></div><p>机组截面：X ${model.unit.width ?? '未提供'} × Z ${model.unit.height ?? '未提供'} mm；Y 总段长：${model.unit.totalLength ?? '未提供'} mm</p><p class="disclaimer">${escHtml(model.disclaimer)} 未提供参数已标出，未按默认值补齐。</p><h2>机组配置与参数报表</h2><table>${rows}</table><div class="title"><strong>${escHtml(model.project.name)} / ${escHtml(model.unit.no)}</strong><br>客户：${escHtml(model.project.customer)}　项目编号：${escHtml(model.project.code)}<br>图名：${escHtml(model.title)}　修订：${escHtml(model.unit.revision)}<br>制图/复核：未提供</div></div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250));</script></html>`;
  }

  function download(filename, content, mime, environment = globalThis) {
    if (!environment.document || !environment.URL || !environment.Blob) throw new Error('当前环境不支持浏览器文件下载');
    const url = environment.URL.createObjectURL(new environment.Blob([content], { type: mime }));
    const anchor = environment.document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.style.display = 'none';
    environment.document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => environment.URL.revokeObjectURL(url), 1000);
  }
  function safeName(model) { return `${model.unit.no}-${model.unit.id}`.replace(/[^\w\u4e00-\u9fff.-]+/g,'_'); }
  function exportDXF(snapshot, options = {}) { const model = makeDrawingModel(snapshot, options); download(`${safeName(model)}-配置示意图.dxf`, createDxf(model), 'application/dxf;charset=utf-8', options.environment); return model; }
  function exportParameterReport(snapshot, options = {}) { const model = makeDrawingModel(snapshot, options); download(`${safeName(model)}-参数报表.csv`, csv(model), 'text/csv;charset=utf-8', options.environment); return model; }
  function openPdf(snapshot, options = {}) {
    const model = makeDrawingModel(snapshot, options), environment = options.environment || globalThis;
    if (!environment.document || !environment.URL || !environment.Blob) throw new Error('当前环境不支持打印为 PDF');
    const blob = new environment.Blob([htmlDocument(model)], { type: 'text/html;charset=utf-8' }), url = environment.URL.createObjectURL(blob), win = environment.open(url, '_blank');
    if (!win) throw new Error('打印页面被浏览器拦截，请允许此工作台打开打印页面');
    return model;
  }
  return { FRAME, resolveSnapshot, makeDrawingModel, createDxf, reportRows, csv, htmlDocument, exportDXF, exportParameterReport, openPdf };
});
