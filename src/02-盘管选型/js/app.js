(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let handoff = null, lastResult = null;
  function parseHandoff() { try { const raw = new URLSearchParams(location.search).get('p001Handoff'); if (!raw) return null; const value = JSON.parse(decodeURIComponent(raw)); return value?.protocol === 'p001-selection-v1' && value.nonce && value.target && value.workbenchSnapshot ? value : null; } catch { return null; } }
  function fitTable() { const records = CoilDatabase.tables[$('installation').value]; $('specOptions').replaceChildren(); $('standardRows').replaceChildren(); for (const record of records) { const option = document.createElement('option'); option.value = record.code; option.label = 'φ' + record.tube + ' · ' + record.count + '件'; $('specOptions').appendChild(option); const row = document.createElement('tr'); for (const value of [record.code, record.tube, record.count, record.height, ...record.widths]) { const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell); } $('standardRows').appendChild(row); } }
  function fingerprint(value) { let hash = 2166136261; for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return (hash >>> 0).toString(16).padStart(8, '0'); }
  function ruleVersion() { return String(CoilSelector.getDatabase().version || '1.0.0') + '+' + fingerprint(JSON.stringify(CoilSelector.getDatabase())); }
  function reportContext() {
    if (!handoff) return;
    const snapshot = handoff.workbenchSnapshot, width = Number(snapshot.cabinetWidth), height = Number(snapshot.cabinetHeight);
    $('workbenchHandoff').hidden = false;
    $('series').value = ''; $('installation').value = ''; $('headerDiameter').value = '';
    if (Number.isInteger(width / 100) && Number.isInteger(height / 100)) $('spec').value = String(Math.round(height / 100)).padStart(2, '0') + String(Math.round(width / 100)).padStart(2, '0');
    $('rows').value = [2, 3, 4, 6, 8].includes(Number(snapshot.coilRows)) ? String(snapshot.coilRows) : '';
    $('tube').value = [9.52, 12.7].includes(Number(snapshot.tubeDiameter)) ? String(snapshot.tubeDiameter) : '';
    $('handoffSummary').textContent = '目标：' + handoff.target.segmentType + ' · ' + snapshot.projectId + ' / ' + snapshot.unitId + '；工作台箱体 ' + width + ' × ' + height + ' mm。请确认25W适用性、安装形式与接管条件。';
  }
  function refreshTable() { const records = CoilDatabase.tables[$('installation').value]; if (!records) return; $('specOptions').replaceChildren(); $('standardRows').replaceChildren(); for (const record of records) { const option = document.createElement('option'); option.value = record.code; option.label = 'φ' + record.tube + ' · ' + record.count + '件'; $('specOptions').appendChild(option); const row = document.createElement('tr'); for (const value of [record.code, record.tube, record.count, record.height, ...record.widths]) { const cell = document.createElement('td'); cell.textContent = value; row.appendChild(cell); } $('standardRows').appendChild(row); } }
  function refreshApply() { if (!handoff) return; const input = lastResult; $('applyToWorkbench').disabled = !input || input.status !== 'selected' || !input.model || !$('confirmCoilCriteria').checked; }
  function render() {
    $('model').textContent = ''; $('warnings').replaceChildren(); lastResult = null;
    try {
      const result = CoilSelector.select({series: $('series').value, installation: $('installation').value, spec: $('spec').value, rows: $('rows').value, tube: $('tube').value, header: $('headerDiameter').value});
      lastResult = result; $('selectionError').hidden = true; $('selectionResult').hidden = false;
      $('statusBadge').textContent = result.status === 'review' ? '资料冲突 · 待复核' : '已查到标准规格';
      $('model').textContent = result.model || '暂不生成型号'; $('faceWidth').textContent = result.width + ' mm'; $('faceHeight').textContent = result.height + ' mm'; $('coilCount').textContent = result.count + ' 件'; $('thickness').textContent = result.thickness === null ? '资料未提供' : result.thickness + ' mm'; $('boxSize').textContent = result.boxHeight + ' × ' + result.boxWidth + ' mm'; $('selectionSummary').textContent = $('series').value + ' / ' + (result.installation === 'floor' ? '落地' : '吊顶') + ' / ' + result.rows + '排 / φ' + result.tube + ' / DN' + result.header; $('source').textContent = result.source;
      $('warnings').hidden = result.warnings.length === 0; result.warnings.forEach(text => { const li = document.createElement('li'); li.textContent = text; $('warnings').appendChild(li); });
    } catch (error) { $('selectionResult').hidden = true; $('selectionError').hidden = false; $('selectionError').textContent = error.message; $('statusBadge').textContent = '未选出型号'; }
    refreshApply();
  }
  function deliver() {
    if (!handoff || !lastResult || lastResult.status !== 'selected' || !lastResult.model || !$('confirmCoilCriteria').checked) return;
    const snapshot = handoff.workbenchSnapshot, width = Number(snapshot.cabinetWidth), height = Number(snapshot.cabinetHeight), code = String($('spec').value).trim();
    if (!Number.isInteger(width / 100) || !Number.isInteger(height / 100) || code !== String(Math.round(height / 100)).padStart(2, '0') + String(Math.round(width / 100)).padStart(2, '0')) { $('handoffStatus').textContent = '箱体规格与工作台尺寸不匹配，未发送。'; return; }
    const db = CoilSelector.getDatabase(), revision = ruleVersion();
    const result = {selector: 'coil', status: 'selected', model: lastResult.model, source: lastResult.source + ' · 数据库 v' + db.version + ' / ' + revision,
      rule: {id: 'coil-standard-table-25w', version: revision}, target: handoff.target, workbenchSnapshot: snapshot, workbenchFingerprint: handoff.workbenchFingerprint,
      input: {series: $('series').value, installation: $('installation').value, spec: code, cabinetWidthMm: width, cabinetHeightMm: height, rows: Number($('rows').value), tube: Number($('tube').value), header: Number($('headerDiameter').value)},
      data: {status: lastResult.status, faceWidth: lastResult.width, faceHeight: lastResult.height, count: lastResult.count, thickness: lastResult.thickness, boxWidth: lastResult.boxWidth, boxHeight: lastResult.boxHeight}, warnings: [...(lastResult.warnings || []), '本规则只提供几何规格参考，不计算或确认冷量、水流量、风阻与水阻。']};
    const message = {protocol: 'p001-selection-result-v1', nonce: handoff.nonce, result}, key = 'p001-ahu-selection-result-v1:' + handoff.nonce;
    try { if (localStorage.getItem('p001-ahu-selection-ack-v1:' + handoff.nonce)) { $('handoffStatus').textContent = '此选型任务已处理。'; return; } localStorage.setItem(key, JSON.stringify(message)); if (window.opener && !window.opener.closed) window.opener.postMessage(message, location.origin); $('handoffStatus').textContent = '已发送本次选型结果；工作台确认输入仍一致后才会写入。'; }
    catch (error) { $('handoffStatus').textContent = '发送失败：' + error.message; }
  }
  document.addEventListener('DOMContentLoaded', () => {
    handoff = parseHandoff(); if (handoff) reportContext(); else refreshTable();
    if (handoff && $('installation').value) refreshTable();
    $('coilForm').addEventListener('submit', event => { event.preventDefault(); render(); });
    ['series','spec','rows','tube','headerDiameter'].forEach(id => $(id).addEventListener('input', render));
    ['series','spec','rows','tube','headerDiameter'].forEach(id => $(id).addEventListener('change', () => { if (handoff) $('confirmCoilCriteria').checked = false; render(); }));
    $('installation').addEventListener('change', () => { if (handoff) $('confirmCoilCriteria').checked = false; refreshTable(); render(); });
    $('confirmCoilCriteria').addEventListener('change', refreshApply);
    $('applyToWorkbench').addEventListener('click', deliver);
    render();
  });
  window.addEventListener('coil-database-changed', () => { refreshTable(); render(); });
})();
