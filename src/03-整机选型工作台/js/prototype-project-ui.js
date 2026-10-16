(async function () {
  // The retained final HTML installs its compact layout renderers in later scripts.
  // Bind after parsing so those renderers cannot replace this integration.
  if (document.readyState === 'loading') await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  const centerStyles = document.createElement('style');
  centerStyles.textContent = `.manager aside{min-height:0}.project-tree{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain}.project-tree button{padding:7px 9px}.manager main{overflow:hidden}.manager-head{flex:none}.manager-head .project-summary{grid-template-columns:repeat(4,minmax(120px,1fr))}.manager-head .metric{min-width:0;min-height:68px;padding:10px 12px}.manager-head .metric b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px}.unit-area{flex:1;overflow:hidden}.unit-table{flex:1;overflow:auto;overscroll-behavior:contain}.unit-grid-row{display:grid;grid-template-columns:100px 100px 125px 100px 130px minmax(180px,1.6fr) 65px 78px 122px;min-width:1060px;align-items:center;gap:9px;padding:9px 12px}.unit-table-head{position:sticky;top:0;z-index:2;background:#edf3f4;color:#56717a;font-weight:700;border-bottom:1px solid #cbd9dd}.segment-combination{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.unit-row .chip{justify-self:start}.unit-empty{padding:18px;color:#68818a}.area-actions{display:flex;gap:7px}.unit-create-row{background:#fffdf6;border-bottom:1px solid #d7e1e4}.unit-create-row label{min-width:0}.unit-create-row input{width:100%;height:30px;margin:0;padding:0 7px;border:1px solid #bdcdd2;background:#fff;color:#243e49;border-radius:2px}.unit-create-actions{display:flex;gap:5px}.unit-create-actions .btn{height:28px;padding:0 7px;white-space:nowrap}.unit-create-error{grid-column:1/-1;color:#a5423b;font-weight:400}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.fullscreen-exit svg{width:17px;height:17px;vertical-align:middle;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.top #saveBtn{display:inline-block}@media(max-width:1100px){.manager main{padding:12px}.manager-head .project-summary{grid-template-columns:repeat(2,minmax(110px,1fr))}}`;
  document.head.appendChild(centerStyles);
  const initialSeed = JSON.parse(JSON.stringify(projects));
  const initialDemoSegments = JSON.parse(JSON.stringify(segments));
  initialSeed.forEach(project => project.units.forEach(unit => {
    if (!Array.isArray(unit.segments)) unit.segments = JSON.parse(JSON.stringify(initialDemoSegments));
  }));
  const store = AHUPrototypeProjectStore.createStore({ storage: window.localStorage, fetchImpl: window.fetch.bind(window) });
  const A = window.AHUPrototypeSelectionHandoff, H = window.AHUSelectionHandoff;
  const rawSave = store.save;
  store.save = async data => { guardPrototypeSave(); return rawSave(A.ensureIds(A.clone(data))); };
  const rawSaveBeforeSwitch=store.saveBeforeSwitch, rawBeforeSelectionChange=store.beforeSelectionChange;
  if(rawSaveBeforeSwitch) store.saveBeforeSwitch=async (...args)=>{guardPrototypeSave();return rawSaveBeforeSwitch(...args);};
  if(rawBeforeSelectionChange) store.beforeSelectionChange=async (...args)=>{guardPrototypeSave();return rawBeforeSelectionChange(...args);};
  const rawPublishLocal=store.publishLocal;
  if(rawPublishLocal) store.publishLocal=async (...args)=>{guardPrototypeSave();return rawPublishLocal(...args);};
  const state = await store.initialize(initialSeed);
  projects.splice(0, projects.length, ...state.projects);
  let switching = false;
  let baseline = JSON.stringify(state.projects);
  const baseRenderManager = renderManager;
  function replacePrototypeAction(id, handler) {
    const old = $(id); const fresh = old.cloneNode(true); fresh.removeAttribute('onclick'); old.replaceWith(fresh); fresh.addEventListener('click', handler); return fresh;
  }
  function ensureStatus() { return $('statusConfirm'); }
  function notice(message, error = false) {
    if (newProjectMode && $('projectFormNotice')) { $('projectFormNotice').textContent = message; $('projectFormNotice').style.color = error ? '#a33a30' : ''; }
    if (!$('workspace').hidden) {
      $('inputNotice').textContent = message;
      $('statusLocation').textContent = error ? `保存状态：${message}` : $('statusLocation').textContent;
      $('inputNotice').style.color = error ? '#9d3028' : '';
      return;
    }
    const el = ensureStatus(); if (!el) { $('inputNotice').textContent = message; return; }
    el.textContent = message; el.style.color = error ? '#ef9c90' : '';
  }
  function refreshStoreNotice() {
    const saveButton = $('saveBtn');
    if (saveButton) {
      saveButton.textContent = newProjectMode ? '保存' : state.source === 'local' ? '发布草稿' : '保存草稿';
      saveButton.title = `${state.source === 'shared' ? `共享修订 ${state.revision}` : state.source === 'local' ? '旧浏览器草稿，点击后发布到共享存储' : '演示数据，点击后保存到共享存储'}${isDirty() ? ' · 存在未保存修改' : ''}`;
    }
    const el = ensureStatus();
    if (el && $('manager') && !$('manager').hidden) {
      el.textContent = state.sharedKind === 'unavailable' ? `共享存储不可用：${state.error}` : isDirty() ? '存在未保存修改' : '就绪';
      el.style.color = state.sharedKind === 'unavailable' ? '#ef9c90' : '';
    }
  }
  async function importFormalCopy(project, unit) {
    if (!project || !unit || typeof window.makeFormalPrototypeCopy !== 'function') throw new Error('正式项目或机组数据无效');
    const dirty = isDirty();
    const candidate = window.makeFormalPrototypeCopy(project, unit);
    const result = await AHUPrototypeProjectStore.saveImportedCopy({ store, source: state.source, projects, copy: candidate, dirty });
    projects.splice(0, projects.length, ...result.projects); state.source = 'shared';
    selectedProject = projects.length - 1; selectedUnit = 0; segments = JSON.parse(JSON.stringify(candidate.units[0].segments));
    selectedId = segments[0]?.id || null; baseline = JSON.stringify(projects);
    $('formalProjectDialog').close(); showWorkspace(0); notice(`已将 ${unit.unitNo || '所选机组'} 导入为新原型副本并保存至共享修订 ${result.revision}。七段式专业计算结果未导入，原 V2 项目保持只读。`); refreshStoreNotice();
  }
  $('formalDialogImport').addEventListener('click', async () => {
    const project = formalCandidates.find(item => item.projectId === $('formalProjectSelect').value);
    const unit = project?.units?.find(item => item.unitId === $('formalUnitSelect').value);
    try { await importFormalCopy(project, unit); }
    catch (error) { notice(`导入失败，当前项目与正式存档均保留：${error.message}`, true); }
  });
  function stripDisplayGeometryDefaults(segment) {
    if (!Array.isArray(segment?.__displayGeometryDefaults)) return segment;
    segment.__displayGeometryDefaults.forEach(key => delete segment[key]);
    delete segment.__displayGeometryDefaults;
    return segment;
  }
  function persistActiveUnit() {
    if (formalReadonly || $('workspace').hidden || !projects[selectedProject]?.units?.[selectedUnit]) return;
    const persisted = JSON.parse(JSON.stringify(segments));
    persisted.forEach(stripDisplayGeometryDefaults);
    AHUPrototypeProjectStore.captureUnitSegments(projects, selectedProject, selectedUnit, persisted);
  }
  let projectFormDirty = false;
  let projectSaveBusy = false;
  function updateWindowIcons() { const max=$('projectEditorMax'), min=$('projectEditorMin'); if (!max||!min) return; max.innerHTML=document.fullscreenElement?'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 7h10v10H7zM3 13V3h10"/></svg>':'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5"/></svg>'; const minimized=document.querySelector('.app')?.classList.contains('workspace-minimized'); min.innerHTML=minimized?'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h14M3 5h14M3 15h14"/></svg>':'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 3h14v14H3zM6 10h8"/></svg>'; max.setAttribute('aria-label',document.fullscreenElement?'恢复窗口':'最大化窗口'); max.title=max.getAttribute('aria-label'); min.setAttribute('aria-label',minimized?'恢复编辑区':'收起编辑区'); min.title=min.getAttribute('aria-label'); }
  function setWindowControls() { const max=$('projectEditorMax'), min=$('projectEditorMin'); if (!max||!min) return; max.onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen?.().catch(()=>notice('无法进入全屏',true)); min.onclick=()=>{document.querySelector('.app')?.classList.toggle('workspace-minimized');updateWindowIcons();}; if(!setWindowControls.bound){document.addEventListener('fullscreenchange',updateWindowIcons);setWindowControls.bound=true;} updateWindowIcons(); }
  setWindowControls();
  const workspaceToolbar=document.createElement('div'); workspaceToolbar.id='workspaceToolbar'; workspaceToolbar.className='workspace-toolbar'; workspaceToolbar.innerHTML='<span id="workspaceToolbarTitle"></span><div id="workspaceToolbarActions" class="workspace-toolbar-actions"></div>'; document.querySelector('#workspace')?.prepend(workspaceToolbar);
  function isDirty() { persistActiveUnit(); return projectFormDirty || JSON.stringify(projects) !== baseline; }
  function changeSource(action) {
    if (isDirty()) { notice('当前草稿有未保存修改；先保存后再切换数据来源。', true); return false; }
    action(); projects.splice(0, projects.length, ...state.projects); baseline = JSON.stringify(projects); selectedProject = 0; selectedUnit = 0; segments = []; selectedId = null;
    renderManager(); refreshStoreNotice(); return true;
  }
  let newProjectMode = false;
  let editProjectIndex = null;
  let pendingNewUnit = null;
  let newUnitConfirmationAuthorized = false;
  function guardPrototypeSave(){ if(pendingNewUnit&&!newUnitConfirmationAuthorized) throw new Error('新建机组必须先验证确认'); return true; }
  window.guardPrototypeSave=guardPrototypeSave;
  let lastDeletedUnit = null;
  const projectCode = () => `PRJ-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
  function nextEquipmentNo(units) {
    const existing = new Set((units || []).map(unit => String(unit.no || '').trim().toUpperCase()));
    const maxSequence = Math.max(0, ...(units || []).map(unit => {
      const match = String(unit.no || '').trim().match(/^AHU-(\d+)$/i);
      return match ? Number(match[1]) : 0;
    }));
    let sequence = maxSequence + 1, candidate;
    do { candidate = `AHU-${String(sequence++).padStart(2, '0')}`; } while (existing.has(candidate.toUpperCase()));
    return candidate;
  }
  const weatherLocations = window.AHUPrototypeWeather?.getLocations?.() || [];
  const weatherLocationOptions = weatherLocations.map((row, index) => `<option value="${index}">${escapeHtml([row.province, row.city, row.station].filter(Boolean).join(' · '))}</option>`).join('');
  const weatherPreviewMarkup = `<div class="weather-reference-preview" id="prototypeWeatherPreview" aria-live="polite"><span>冬季干球 <b data-weather-preview="winterAirConditioningTemperature">—</b> ℃</span><span>冬季 RH <b data-weather-preview="winterAirConditioningRH">—</b> %</span><span>夏季干球 <b data-weather-preview="summerAirConditioningDryBulb">—</b> ℃</span><span>夏季湿球 <b data-weather-preview="summerAirConditioningWetBulb">—</b> ℃</span></div>`;
  const projectFormMarkup = () => `<section class="project-form" aria-label="${editProjectIndex !== null ? '项目资料' : '新建项目'}">
    <label>项目名称 <input id="prototypeProjectName" autocomplete="off" placeholder="请输入项目名称"></label>
    <label>项目编号 <input id="prototypeProjectCode" value="${projectCode()}" autocomplete="off"></label>
    <label>客户名称 <input id="prototypeProjectCustomer" autocomplete="off" placeholder="请输入客户名称"></label>
    <label>销售公司 <input id="prototypeSalesCompany" autocomplete="organization" placeholder="请输入销售公司"></label>
    <label>业务承办人 <input id="prototypeBusinessOwner" autocomplete="name" placeholder="请输入业务承办人"></label>
    <label>技术支持 <input id="prototypeTechnicalSupport" value="本机技术支持（自动）" readonly></label>
    <label>项目所在地 <input id="prototypeLocation" autocomplete="address-level1" placeholder="例如：上海市浦东新区"></label>
    <label class="weather-field">参考室外工况地点 · 省份 <select id="prototypeWeatherProvince"><option value="">请选择省份</option>${[...new Set(weatherLocations.map(row=>row.province))].map(v=>`<option>${escapeHtml(v)}</option>`).join('')}</select></label>
    <label class="weather-field">城市 / 台站 <select id="prototypeWeatherStation" disabled><option value="">请先选择省份</option></select></label>
    <div class="weather-values">${['winterAirConditioningTemperature','winterAirConditioningRH','summerAirConditioningDryBulb','summerAirConditioningWetBulb'].map(key=>`<label><span>${key==='winterAirConditioningTemperature'?'冬季干球温度（℃）':key==='winterAirConditioningRH'?'冬季相对湿度（%）':key==='summerAirConditioningDryBulb'?'夏季干球温度（℃）':'夏季湿球温度（℃）'}</span><small>气象库参考值：<b data-weather-base="${key}">—</b></small><input type="number" step="any" ${key==='winterAirConditioningRH'?'min="0" max="100"':''} data-weather-override="${key}" placeholder="手动修正"><small>最终采用：<b data-weather-final="${key}">—</b> · <i data-weather-source="${key}">气象库</i></small></label>`).join('')}</div>
    <div class="project-form-actions"><small id="projectFormNotice" role="status" aria-live="polite"></small></div>
  </section>`;
  function renderProjectForm() {
    const editing = editProjectIndex !== null ? projects[editProjectIndex] : null;
    projectFormDirty = false;
    $('projectName').textContent = editing ? (editing.name || '项目资料') : '新建项目'; $('projectName').classList.add('new-project-title');
    document.querySelector('.app')?.classList.add('editor-mode');
    $('projectSubtitle').textContent = '';
    $('crumb').textContent = '';
    $('saveBtn').hidden = false; $('saveBtn').textContent = '保存'; $('projectEditorMax').hidden = false; $('projectEditorMin').hidden = false;
    document.querySelector('.project-title-block')?.appendChild($('saveBtn'));
    $('projectEditorMax').textContent = '最大化';
    $('projectEditorMax').innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 8V3h5M12 3h5v5M17 12v5h-5M8 17H3v-5"/></svg>';
    $('projectEditorMin').innerHTML = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h14M3 5h14M3 15h14"/></svg>';
    document.querySelector('.manager-head .project-summary').hidden = true;
    $('addProject').hidden = true;
    document.querySelector('.unit-area').innerHTML = projectFormMarkup();
    document.querySelectorAll('[data-weather-override]').forEach(input=>{input.step='any';if(input.dataset.weatherOverride==='winterAirConditioningRH'){input.min='0';input.max='100';}});
    document.querySelector('.unit-area').hidden = false;
    if (editing) {
      const values = { prototypeProjectName: editing.name, prototypeProjectCode: editing.code, prototypeProjectCustomer: editing.customer, prototypeSalesCompany: editing.salesCompany, prototypeBusinessOwner: editing.businessOwner, prototypeTechnicalSupport: editing.technicalSupport, prototypeLocation: editing.location };
      Object.entries(values).forEach(([id, value]) => { const node = $(id); if (node && value != null) node.value = value; });
    }
    const provinceSelect = $('prototypeWeatherProvince'), stationSelect = $('prototypeWeatherStation');
    const oldWeather = editing?.weatherReference || {};
    const oldOverride = editing?.weatherOverride || {};
    provinceSelect.value = oldWeather.province || '';
    const refillStations = (initial=false) => { const rows = weatherLocations.filter(row => row.province === provinceSelect.value); stationSelect.innerHTML = `<option value="">请选择城市/台站</option>${rows.map(row => `<option value="${escapeHtml(row.city+'|'+row.station)}">${escapeHtml(row.city+' · '+row.station)}</option>`).join('')}`; stationSelect.disabled = !rows.length; if (initial && oldWeather.city) stationSelect.value = oldWeather.city+'|'+oldWeather.station; };
    provinceSelect.addEventListener('change', () => { stationSelect.value=''; refillStations(false); updateWeatherPreview(); projectFormDirty = true; }); refillStations(true);
    document.querySelectorAll('[data-weather-override]').forEach(input => { const v=oldOverride[input.dataset.weatherOverride]; if (v && typeof v === 'object' && v.value != null) input.value=v.value; });
    const legacyResolved = window.AHUPrototypeWeather?.resolve?.({weatherOverride:oldOverride}, {}) || {};
    const legacyValues={winterAirConditioningTemperature:legacyResolved.winter?.dryBulb,winterAirConditioningRH:legacyResolved.winter?.rh,summerAirConditioningDryBulb:legacyResolved.summer?.dryBulb,summerAirConditioningWetBulb:legacyResolved.summer?.wetBulb};
    document.querySelectorAll('[data-weather-override]').forEach(input=>{if(input.value==='' && legacyValues[input.dataset.weatherOverride] != null) input.value=legacyValues[input.dataset.weatherOverride];});
    const weatherSelect = stationSelect;
    const updateWeatherPreview = () => {
      const [city, station] = (weatherSelect.value || '|').split('|');
      const row = weatherLocations.find(item => item.province === provinceSelect.value && item.city === city && item.station === station);
      const values = row ? {
        winterAirConditioningTemperature: row.winterAirConditioningTemperature,
        winterAirConditioningRH: row.winterAirConditioningRH,
        summerAirConditioningDryBulb: row.summerAirConditioningDryBulb,
        summerAirConditioningWetBulb: row.summerAirConditioningWetBulb
      } : {};
      document.querySelectorAll('[data-weather-preview]').forEach(node => {
        const value = values[node.dataset.weatherPreview];
        node.textContent = value === null || value === undefined || value === '' ? '—' : String(value);
      });
      const snapshot = editing ? JSON.parse(JSON.stringify(editing)) : {};
      snapshot.weatherReference = row ? {province:row.province,city:row.city,station:row.station} : undefined;
      snapshot.weatherOverride = {}; document.querySelectorAll('[data-weather-override]').forEach(input=>{if(input.value.trim()!=='') snapshot.weatherOverride[input.dataset.weatherOverride]={value:Number(input.value),source:'项目手动调整'};});
      const resolved = window.AHUPrototypeWeather?.resolve?.(snapshot, {}) || {};
      const finalValues={winterAirConditioningTemperature:resolved.winter?.dryBulb,winterAirConditioningRH:resolved.winter?.rh,summerAirConditioningDryBulb:resolved.summer?.dryBulb,summerAirConditioningWetBulb:resolved.summer?.wetBulb};
      const baseValues={winterAirConditioningTemperature:row?.winterAirConditioningTemperature,winterAirConditioningRH:row?.winterAirConditioningRH,summerAirConditioningDryBulb:row?.summerAirConditioningDryBulb,summerAirConditioningWetBulb:row?.summerAirConditioningWetBulb};
      document.querySelectorAll('[data-weather-base]').forEach(node=>{node.textContent=baseValues[node.dataset.weatherBase] ?? '—';});
      document.querySelectorAll('[data-weather-final]').forEach(node => { node.textContent=finalValues[node.dataset.weatherFinal] ?? '—'; });
      const inherited=window.AHUPrototypeWeather?.resolve?.({conditions:editing?.conditions},{})||{}; const inheritedValues={winterAirConditioningTemperature:inherited.winter?.dryBulb,winterAirConditioningRH:inherited.winter?.rh,summerAirConditioningDryBulb:inherited.summer?.dryBulb,summerAirConditioningWetBulb:inherited.summer?.wetBulb};
      document.querySelectorAll('[data-weather-source]').forEach(node=>{const key=node.dataset.weatherSource,input=document.querySelector(`[data-weather-override="${key}"]`),manual=Number.isFinite(Number(input?.value))&&input?.value.trim()!==''&&!(key==='winterAirConditioningRH'&&(Number(input.value)<0||Number(input.value)>100));node.textContent=manual?'项目手动调整':inheritedValues[key]!==null&&inheritedValues[key]!==undefined?'项目原条件':finalValues[key]!==null&&finalValues[key]!==undefined?(row?'气象库':'气象库（项目所在地）'):'未填写';});
    };
    weatherSelect.addEventListener('change', updateWeatherPreview);
    document.querySelectorAll('[data-weather-override]').forEach(input=>input.addEventListener('input', updateWeatherPreview));
    updateWeatherPreview();
    document.querySelectorAll('.project-form input, .project-form select').forEach(node => {
      node.addEventListener('input', () => { projectFormDirty = true; refreshStoreNotice(); });
      node.addEventListener('change', () => { projectFormDirty = true; refreshStoreNotice(); });
    });
    setWindowControls();
    function collectProjectForm() {
      const project = {
        name: $('prototypeProjectName').value.trim() || '未命名项目', code: $('prototypeProjectCode').value.trim() || projectCode(),
        customer: $('prototypeProjectCustomer').value.trim() || '未填写客户', salesCompany: $('prototypeSalesCompany').value.trim(),
        businessOwner: $('prototypeBusinessOwner').value.trim(), technicalSupport: $('prototypeTechnicalSupport').value,
        location: $('prototypeLocation').value.trim(),
        phase: editing?.phase || '方案设计', state: editing?.state || '草稿', units: editing?.units || []
      };
      const [city, station] = (weatherSelect.value || '|').split('|');
      const weatherRow = weatherLocations.find(item => item.province === provinceSelect.value && item.city === city && item.station === station);
      if (weatherRow) project.weatherReference = { province: weatherRow.province, city: weatherRow.city, station: weatherRow.station || '' }; else delete project.weatherReference;
      const override = JSON.parse(JSON.stringify(editing?.weatherOverride || {}));
      document.querySelectorAll('[data-weather-override]').forEach(input=>{if(input.validity?.badInput || (input.value.trim()!=='' && !Number.isFinite(Number(input.value)))) throw new Error('天气手动修正必须为有限数值');});
      const aliases=['winterOutdoorDryBulb','winterDryBulb','winterAirConditioningTemperature','outdoorRH','winterOutdoorRH','winterAirConditioningRH','summerOutdoorDryBulb','summerDryBulb','summerAirConditioningDryBulb','summerOutdoorWetBulb','summerWetBulb','summerAirConditioningWetBulb']; aliases.forEach(key=>delete override[key]);
      const nestedAliases={winter:['dryBulb','rh','winterOutdoorDryBulb','winterDryBulb','winterAirConditioningTemperature','outdoorRH','winterOutdoorRH','winterAirConditioningRH'],summer:['dryBulb','rh','wetBulb','summerOutdoorDryBulb','summerDryBulb','summerAirConditioningDryBulb','summerOutdoorWetBulb','summerWetBulb','summerAirConditioningWetBulb']};
      Object.entries(nestedAliases).forEach(([key,keys])=>{ if (override[key] && typeof override[key]==='object') { keys.forEach(alias=>delete override[key][alias]); if (!Object.keys(override[key]).length) delete override[key]; }});
      document.querySelectorAll('[data-weather-override]').forEach(input => { if (input.value.trim() !== '' && Number.isFinite(Number(input.value))) override[input.dataset.weatherOverride] = { value:Number(input.value), source:'项目手动调整' }; });
      const rhValue=override.winterAirConditioningRH?.value; if (rhValue !== undefined && (rhValue < 0 || rhValue > 100)) throw new Error('冬季相对湿度必须为 0–100%');
      const validationProject = {...editing,...project,weatherOverride:override}; if (!project.weatherReference) delete validationProject.weatherReference;
      const resolved = window.AHUPrototypeWeather?.resolve?.(validationProject,{}) || {}; if (resolved.summer?.wetBulb !== null && resolved.summer?.dryBulb !== null && resolved.summer.wetBulb > resolved.summer.dryBulb) throw new Error('夏季湿球温度不得高于干球');
      if (Object.keys(override).length) project.weatherOverride = override; else delete project.weatherOverride;
      return project;
    }
    window.collectProjectForm = collectProjectForm;
  }
  function projectMatchesSearch(project, query, airflowOptions) {
    const terms = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const airflowLabel = unit => airflowOptions.find(([id]) => id === unit?.airflowForm)?.[1] || '';
    const searchable = [
      project?.name, project?.code, project?.customer, project?.location,
      project?.salesCompany, project?.businessOwner, project?.technicalSupport,
      ...(project?.units || []).flatMap(unit => [
        unit?.no, unit?.schemeNo, unit?.model, unit?.name,
        unit?.profile?.productName, unit?.profile?.unitType,
        unit?.airflowForm, airflowLabel(unit),
        ...(Array.isArray(unit?.segments) ? unit.segments.flatMap(segment => [segment?.name, segment?.type]) : [])
      ])
    ].filter(value => value !== null && value !== undefined).join(' ').toLowerCase();
    return terms.every(term => searchable.includes(term));
  }
  renderManager = function () {
    const q = $('projectSearch').value;
    $('projectTree').innerHTML = projects.length ? projects.map((p, i) => {
      return projectMatchesSearch(p, q, airflowForms) ? `<button class="${i === selectedProject ? 'active' : ''}" data-project="${i}"><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.code)} · ${p.units.length} 台机组</small></button>` : '';
    }).join('') || '<span style="display:block;padding:12px;color:#b8cbd1;font-size:12px">没有匹配项目</span>' : '<span style="display:block;padding:12px;color:#b8cbd1;font-size:12px">当前数据集没有项目</span>';
    if (newProjectMode) { if (!$('prototypeProjectName')) renderProjectForm(); return; }
    $('projectName').classList.remove('new-project-title'); document.querySelector('.manager-head .project-summary').hidden = false; $('addProject').hidden = false; $('saveBtn').hidden = false;
    document.querySelector('.unit-area').hidden = false;
    document.querySelector('.app')?.classList.remove('editor-mode');
    $('partsLibraryBtn').hidden = false;
    $('projectEditorMax').hidden = false; $('projectEditorMin').hidden = false;
    document.querySelector('.project-title-block')?.appendChild($('saveBtn'));
    $('crumb').textContent = '项目中心';
    const p = projects[selectedProject];
    if (!p) { $('projectName').textContent = '暂无项目'; $('projectSubtitle').textContent = '创建项目后可添加机组'; $('metricCode').textContent = '—'; $('metricUnits').textContent = '0'; $('metricPhase').textContent = '—'; $('metricState').textContent = '—'; document.querySelector('.unit-area').innerHTML = '<div class="area-head"><span>机组列表</span></div><div class="unit-table"><p style="padding:18px;color:#68818a">项目列表为空。创建项目后可添加机组。</p></div>'; return; }
    $('projectName').textContent = p.name; $('projectSubtitle').textContent = '';
    $('metricCode').textContent = p.name || '未填写'; $('metricUnits').textContent = p.salesCompany || '未填写'; $('metricPhase').textContent = p.code || '未填写'; $('metricState').textContent = p.businessOwner || '未填写';
    const currentProjectKey = p.projectId || p.code || `project-${selectedProject}`;
    const airflowLabel = unit => {
      const form = airflowForms.find(([id]) => id === unit.airflowForm);
      return form?.[1] || '未填写';
    };
    const airflowValue = unit => window.AHUPrototypeAirflowCompat?.resolve(unit) ?? '';
    const unitRows = p.units.length ? p.units.map((u, i) => {
      const segments = Array.isArray(u.segments) ? u.segments.map(segment => segment?.name).filter(Boolean).join('、') : '';
      const model = u.model || u.unitModel || u.profile?.productName || '未填写';
      const quantity = u.quantity ?? '未填写';
      return `<div class="unit-row unit-grid-row" data-unit-row="${i}"><span>${escapeHtml(u.no || '未填写')}</span><span>${escapeHtml(u.schemeNo || '未填写')}</span><span>${escapeHtml(model)}</span><span>${escapeHtml(airflowValue(u))}</span><span>${escapeHtml(airflowLabel(u))}</span><span class="segment-combination" title="${escapeHtml(segments)}">${escapeHtml(segments || '未填写')}</span><span>${escapeHtml(quantity)}</span><span class="chip ${u.state === '待复核' ? 'good' : ''}">${escapeHtml(u.state || '未填写')}</span><button class="btn light" data-open-unit="${i}">打开工作台</button></div>`;
    }).join('') : '<p class="unit-empty">当前项目尚未建立机组。</p>';
    document.querySelector('.unit-area').innerHTML = `<div class="area-head"><span>机组列表</span><div class="area-actions"><button class="btn light" id="addUnit" type="button">＋ 新建机组</button>${lastDeletedUnit && lastDeletedUnit.projectId === currentProjectKey ? '<button class="btn light" id="undoUnitDelete" type="button">退回删除</button>' : ''}</div></div><div class="unit-table"><div class="unit-row unit-grid-row unit-table-head"><span>设备编号</span><span>方案编号</span><span>机组型号</span><span>风量（m³/h）</span><span>气流形式</span><span>功能段组合</span><span>数量</span><span>状态</span><span>操作</span></div>${unitRows}</div>`;
    $('addUnit').addEventListener('click', () => window.addPrototypeUnit());
    $('undoUnitDelete')?.addEventListener('click', () => { const d = lastDeletedUnit; if (!d || d.projectId !== (p.projectId || p.code || `project-${selectedProject}`)) return; p.units.splice(Math.min(d.index, p.units.length), 0, d.unit); lastDeletedUnit = null; renderManager(); notice('已退回最近删除的机组，请点击保存按钮写入共享存储。'); refreshStoreNotice(); });
  };
  window.showPrototypeEditor = function () { if (newProjectMode) { notice('当前项目资料正在编辑，请先保存。', true); return; } editProjectIndex = null; newProjectMode = true; renderManager(); };
  window.editPrototypeProject = function (index) { if (newProjectMode) { notice('当前项目资料正在编辑，请先保存。', true); return; } if (!projects[index]) return; editProjectIndex = index; selectedProject = index; newProjectMode = true; renderManager(); };
  function beginPrototypeUnitCreation() {
    const project = projects[selectedProject]; if (!project || pendingNewUnit || formalReadonly || projectSaveBusy || (typeof newProjectMode!=='undefined'&&newProjectMode)) { if(pendingNewUnit) notice('新机组资料正在录入，请先完成验证或取消。', true); return null; }
    const no=nextEquipmentNo(project.units), schemeNo=project.units.at(-1)?.schemeNo||'001';
    const unit={unitId:A.newId('unit'),no,schemeNo,name:'新建机组',quantity:1,state:'草稿',cabinetSeries:'25W',installationLocation:'室内',segments:[]};
    project.units.push(unit); selectedUnit=project.units.length-1; pendingNewUnit={projectId:project.projectId||project.code,unitId:unit.unitId}; loadPrototypeUnit(selectedUnit); showWorkspace(selectedUnit); return unit;
  }
  function validateUnitIdentityInput(unit, host) { const nodes=host?.querySelectorAll?.('[data-unit-identity]')||[]; if(!nodes.length&&!(typeof pendingNewUnit!=='undefined'&&pendingNewUnit))return {valid:true,errors:[]}; const values={}; nodes.forEach(node=>values[node.dataset.unitIdentity]=String(node.value??'')); const errors=[],no=values.no?.trim()||'',schemeNo=values.schemeNo?.trim()||'',qtyRaw=(values.quantity||'').trim(),qty=Number(qtyRaw); if(!no)errors.push({field:'no',message:'设备编号必须填写'}); if(!schemeNo)errors.push({field:'schemeNo',message:'方案编号必须填写'}); if(!/^[0-9]+$/.test(qtyRaw)||!Number.isSafeInteger(qty)||qty<1)errors.push({field:'quantity',message:'数量必须为正整数'}); if(no&&projects[selectedProject]?.units?.some(item=>item.unitId!==unit.unitId&&String(item.no||'').trim().toUpperCase()===no.toUpperCase()))errors.push({field:'no',message:'设备编号已存在，请修改后再确认。'}); return {valid:!errors.length,errors,values}; }
  window.validateUnitIdentityInput=validateUnitIdentityInput;
  function onUnitIdentityInput(event){const node=event.target,unit=projects[selectedProject]?.units?.[selectedUnit];if(!unit||formalReadonly||!node?.dataset?.unitIdentity)return false;unit[node.dataset.unitIdentity]=node.value;return true;}
  window.onUnitIdentityInput=onUnitIdentityInput;
  function cancelPrototypeUnitCreation() { if(!pendingNewUnit||formalReadonly||projectSaveBusy)return false; const project=projects[selectedProject]; if(!project||String(project.projectId||project.code)!==String(pendingNewUnit.projectId))return false; const index=project.units?.findIndex(unit=>unit.unitId===pendingNewUnit.unitId); if(index<0)return false; project.units.splice(index,1); pendingNewUnit=null; showManager(); return true; }
  window.beginPrototypeUnitCreation=beginPrototypeUnitCreation;
  window.cancelPrototypeUnitCreation=cancelPrototypeUnitCreation;
  window.cancelPendingUnitCreation=cancelPrototypeUnitCreation;
  function homePendingGuard(event){ if(!pendingNewUnit)return false; event?.preventDefault?.(); event?.stopImmediatePropagation?.(); notice('请先验证确认或取消新建机组。',true); return true; }
  window.homePendingGuard=homePendingGuard;
  function returnToPrototypeManager(event){ if(homePendingGuard(event))return false; showManager(); return true; }
  window.returnToPrototypeManager=returnToPrototypeManager;
  window.addPrototypeUnit = async function () { const unit=beginPrototypeUnitCreation(); if(unit) notice('已建立新机组草稿，请补充资料并点击“验证并确认保存”。'); };
  async function saveShared() {
    guardPrototypeSave();
    if (pendingNewUnit) throw new Error('新机组尚未完成资料验证，请先验证并确认或取消。');
    if (formalReadonly) throw new Error('正式项目只读视图不能保存');
    if (state.source === 'local') throw new Error('当前查看的是未发布的旧浏览器草稿，请先点击顶部“发布草稿”');
    if (state.sharedKind !== 'exists' && state.source === 'demo') throw new Error('当前是未保存的演示数据，请先点击“保存草稿”');
    persistActiveUnit();
    const result = await store.save(projects);
    projects.splice(0, projects.length, ...result.projects);
    baseline = JSON.stringify(projects);
    notice(`已保存到本机共享原型项目修订 ${result.revision}`);
    refreshStoreNotice();
    return result;
  }
  function saveCurrentPrototypeUnit() { persistActiveUnit(); }
  function loadPrototypeUnit(index) {
    const restored = AHUPrototypeProjectStore.restoreUnitSegments(projects, selectedProject, index); if (!restored) return false;
    segments = restored;
    selectedId = segments[0]?.id || null; return true;
  }
  window.saveCurrentPrototypeUnit = saveCurrentPrototypeUnit;
  window.loadPrototypeUnit = loadPrototypeUnit;
  const previousRenderAll = renderAll;
  renderAll = function () { previousRenderAll(); };
  replacePrototypeAction('saveBtn', async () => {
    if (projectSaveBusy) return;
    projectSaveBusy = true;
    const previousDisabled = new Map([...document.querySelectorAll('.project-form input,.project-form select,.project-form button')].map(node => [node, node.disabled])); previousDisabled.forEach((_,node)=>{node.disabled=true;});
    try {
      if (formalReadonly) throw new Error('正式项目只读视图不能保存');
      if (newProjectMode && typeof window.collectProjectForm === 'function') {
        const candidateProjects = JSON.parse(JSON.stringify(projects));
        const candidate = window.collectProjectForm();
        if (editProjectIndex !== null) candidateProjects[editProjectIndex] = { ...candidateProjects[editProjectIndex], ...candidate, units: candidateProjects[editProjectIndex].units };
        else candidateProjects.push(candidate);
        if (editProjectIndex !== null && !candidate.weatherReference) delete candidateProjects[editProjectIndex].weatherReference;
        if (editProjectIndex !== null && !candidate.weatherOverride) delete candidateProjects[editProjectIndex].weatherOverride;
        if (editProjectIndex !== null) {
          const before = projects[editProjectIndex], after = candidateProjects[editProjectIndex];
          (after.units || []).forEach((unit, index) => { const oldUnit = before.units?.[index] || {}; const a = window.AHUPrototypeWeather?.resolve?.(before, oldUnit) || {}, b = window.AHUPrototypeWeather?.resolve?.(after, unit) || {}; const keys=[['winter','dryBulb'],['winter','rh'],['summer','dryBulb'],['summer','wetBulb']]; if (keys.some(([season,key]) => (a[season]?.[key] ?? null) !== (b[season]?.[key] ?? null))) { unit.pendingRecalculation=true; unit.state='待复核'; const seen=new Set(), groups=[unit.segments,...(unit.airflowBranches||[]).map(branch=>branch?.segments||[])]; groups.flat().forEach(seg=>{if(!seg||seen.has(seg))return;seen.add(seg);seg.confirmed=false;if(A.invalidate)A.invalidate(seg,'项目天气条件变化，待复核');}); } });
        }
        const result = await store.save(candidateProjects);
        projects.splice(0, projects.length, ...result.projects); selectedProject = editProjectIndex !== null ? editProjectIndex : projects.length - 1;
        baseline = JSON.stringify(projects); projectFormDirty = false; newProjectMode = false; editProjectIndex = null; selectedUnit = 0; renderManager();
      } else {
        persistActiveUnit(); const result = await store.save(projects); projects.splice(0, projects.length, ...result.projects); baseline = JSON.stringify(projects);
      }
      $('inputNotice').textContent = '当前机组已保存到共享原型项目'; refreshStoreNotice();
    }
    catch (error) { notice(`保存失败，编辑仍保留：${error.message}`, true); const n = $('projectFormNotice'); if (n) n.textContent = `保存失败：${error.message}`; }
    finally { projectSaveBusy = false; previousDisabled.forEach((disabled,node)=>{if(node.isConnected) node.disabled=disabled;}); }
  });
  replacePrototypeAction('addProject', () => window.showPrototypeEditor());
  replacePrototypeAction('addUnit', () => window.addPrototypeUnit());
  function dismissProjectMenu() { document.getElementById('projectContextMenu')?.remove(); }
  function copyProject(index) {
    if (newProjectMode) { notice('当前项目资料正在编辑，请先保存。', true); return; }
    const source = projects[index]; if (!source) return;
    const copy = JSON.parse(JSON.stringify(source));
    copy.projectId = A.newId('project');
    copy.units.forEach(unit => { unit.unitId = A.newId('unit'); unit.segments.forEach(segment => { segment.id = A.newId('segment'); A.invalidate(segment, '项目复制，结果需要重新选型'); segment.confirmed = false; }); });
    copy.name = `${source.name}（副本）`; copy.code = `${source.code}-COPY-${String(Date.now()).slice(-4)}`;
    copy.state = '草稿'; copy.phase = '方案设计';
    projects.splice(index + 1, 0, copy); selectedProject = index + 1; selectedUnit = 0; renderManager();
    notice('项目已复制为未保存草稿，请点击保存按钮写入共享存储。'); refreshStoreNotice();
  }
  function deleteProject(index) {
    if (newProjectMode) { notice('当前项目资料正在编辑，请先保存。', true); return; }
    const project = projects[index]; if (!project || !window.confirm(`删除项目“${project.name}”？当前原型会在下一次保存时从共享列表移除。`)) return;
    projects.splice(index, 1); selectedProject = Math.max(0, Math.min(selectedProject, projects.length - 1)); selectedUnit = 0; renderManager();
    notice('项目已从当前草稿列表删除，请点击保存按钮写入共享存储。'); refreshStoreNotice();
  }
  function renameProject(index) {
    const project = projects[index]; if (!project) return;
    const name = window.prompt('请输入新的项目名称', project.name); if (name === null || !name.trim()) return;
    project.name = name.trim(); selectedProject = index; renderManager();
    notice('项目名称已修改，请点击保存按钮写入共享存储。'); refreshStoreNotice();
  }
  document.addEventListener('contextmenu', event => {
    event.preventDefault(); dismissProjectMenu();
    const unitRow = event.target.closest('[data-unit-row]');
    if (unitRow && !$('manager').hidden) {
      const unitIndex = Number(unitRow.dataset.unitRow), project = projects[selectedProject], unit = project?.units?.[unitIndex];
      if (!unit) return;
      const menu = document.createElement('div'); menu.id = 'projectContextMenu'; menu.className = 'project-context-menu'; menu.style.left = `${Math.min(event.clientX, window.innerWidth - 180)}px`; menu.style.top = `${Math.min(event.clientY, window.innerHeight - 120)}px`;
      menu.innerHTML = '<button type="button" data-action="copy-unit">复制机组</button><button type="button" class="danger" data-action="delete-unit">删除机组</button>';
      menu.addEventListener('click', e => {
        e.stopPropagation();
        const action = e.target.dataset.action;
        if (action === 'delete-unit') {
          menu.innerHTML = `<span class="context-confirm">确定删除 ${escapeHtml(unit.no)}？</span><button type="button" class="danger" data-action="confirm-delete-unit">确认删除</button><button type="button" data-action="cancel-delete-unit">取消</button>`;
          return;
        }
        dismissProjectMenu();
        if (action === 'copy-unit') {
          const copy = A.clone(unit); copy.unitId = A.newId('unit'); let copyNo = `${unit.no}-COPY`, copySeq = 2;
          while (project.units.some(item => item.no === copyNo)) copyNo = `${unit.no}-COPY-${copySeq++}`;
          copy.no = copyNo; copy.name = `${unit.name}（副本）`;
          (copy.segments || []).forEach(segment => { segment.id = A.newId('segment'); segment.confirmed = false; A.invalidate(segment, '机组复制，结果需要重新选型'); });
          project.units.splice(unitIndex + 1, 0, copy); renderManager();
          notice('机组已复制为未保存草稿，请点击保存按钮写入共享存储。'); refreshStoreNotice();
        }
        if (action === 'confirm-delete-unit') {
          const stableProjectId = project.projectId || project.code || `project-${selectedProject}`;
          lastDeletedUnit = { projectId: stableProjectId, index: unitIndex, unit: A.clone(unit) };
          project.units.splice(unitIndex, 1); selectedUnit = 0; renderManager();
          notice('机组已删除但尚未保存，可点击“退回删除”恢复。'); refreshStoreNotice();
        }
      });
      document.body.appendChild(menu); return;
    }
    const row = event.target.closest('[data-project]'); if (!row || $('manager').hidden) return;
    const index = Number(row.dataset.project); if (!Number.isInteger(index) || !projects[index]) return;
    const menu = document.createElement('div'); menu.id = 'projectContextMenu'; menu.className = 'project-context-menu';
    menu.style.left = `${Math.min(event.clientX, window.innerWidth - 155)}px`; menu.style.top = `${Math.min(event.clientY, window.innerHeight - 180)}px`;
    menu.innerHTML = '<button type="button" data-action="copy">项目复制</button><button type="button" data-action="edit-info">编辑项目信息</button><button type="button" class="danger" data-action="delete">项目删除</button>';
    menu.addEventListener('click', e => { const action = e.target.dataset.action; dismissProjectMenu(); if (action === 'new') window.showPrototypeEditor(); if (action === 'copy') copyProject(index); if (action === 'edit-info') window.editPrototypeProject(index); if (action === 'delete') deleteProject(index); });
    document.body.appendChild(menu);
  }, true);
  document.addEventListener('click', dismissProjectMenu);
  document.addEventListener('click', event => {
    const row = event.target.closest('[data-project]');
    if (row && event.detail >= 2 && !$('manager').hidden) {
      const index = Number(row.dataset.project);
      if (Number.isInteger(index)) { event.preventDefault(); event.stopImmediatePropagation(); window.editPrototypeProject(index); }
    }
  }, true);
  document.addEventListener('dblclick', event => { const row = event.target.closest('[data-project]'); if (row && !$('manager').hidden) { const index = Number(row.dataset.project); if (Number.isInteger(index)) window.editPrototypeProject(index); } });
  document.addEventListener('click', event => {
    const stage = event.target.closest('.stage'); if (!stage || stage.dataset.stage !== '功能段配置' || $('workspace').hidden || formalReadonly) return;
    const unit = projects[selectedProject]?.units?.[selectedUnit], section = unit?.cabinetSelection;
    const width = Number(section?.width?.value ?? section?.width), height = Number(section?.height?.value ?? section?.height);
    const confirmed = section?.confirmed === true && section?.status !== 'invalidated' && !!section?.source && Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0;
    if (!confirmed) { event.stopImmediatePropagation(); event.preventDefault(); document.querySelectorAll('.stage').forEach(x => x.classList.toggle('active', x.dataset.stage === '机组资料')); setTimeout(() => { const box = $('overviewNotice'); if (box) { box.textContent = '请先确认有效的箱体截面（需有确认来源且宽、高为正数）后再进入功能段配置。'; box.focus?.(); } }, 0); }
  }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') dismissProjectMenu(); });
  const pendingKey = 'p001-prototype-professional-task-v1';
  let pending = null, pendingChild = null, selectionBusy = false;
  try { pending = JSON.parse(sessionStorage.getItem(pendingKey) || 'null'); } catch {}
  function effectiveFilterDatabase() { return window.FilterDataIO.load(); }
  function effectiveCoilDatabase() { try { const db = window.CoilDataIO?.load?.() || window.CoilSelector?.getDatabase?.(); if (db && window.CoilSelector?.replaceDatabase) window.CoilSelector.replaceDatabase(db); return db; } catch { return window.CoilSelector?.getDatabase?.(); } }
  function writeAck(task, status, reason) {
    try { localStorage.setItem(H.ackKey(task.nonce), JSON.stringify({ status, reason, processedAt: new Date().toISOString() })); localStorage.removeItem(H.resultKey(task.nonce)); } catch {}
    sessionStorage.removeItem(pendingKey); pending = null;
    document.querySelectorAll('[data-filter-retry]').forEach(button => button.remove());
  }
  function rejectTask(task, reason) { writeAck(task, 'rejected', reason); notice(reason, true); }
  async function receiveFilter(message) {
    const task = pending;
    if (!task || selectionBusy || message?.nonce !== task.nonce || message.protocol !== 'p001-selection-result-v1') return;
    if (localStorage.getItem(H.ackKey(task.nonce))) { sessionStorage.removeItem(pendingKey); pending = null; return; }
    if (state.source !== 'shared' || formalReadonly || task.revision !== state.revision) { rejectTask(task, '项目来源或共享修订已变化，请重新启动过滤器选型。'); return; }
    persistActiveUnit();
    const project = projects[selectedProject], unit = project?.units?.[selectedUnit];
    if (project?.projectId !== task.context.target.projectId || unit?.unitId !== task.context.target.unitId) { rejectTask(task, '当前项目或机组已切换，结果未写入；请回到目标机组重新选型。'); return; }
    const candidate = A.clone(projects), targetProject = candidate[selectedProject], targetUnit = targetProject.units[selectedUnit], segment = targetUnit.segments.find(item => item.id === task.context.target.segmentId);
    let verified;
    try { verified = A.verify(targetProject, targetUnit, segment, task.context, message, { filterDatabase: task.kind === 'coil' ? undefined : effectiveFilterDatabase(), coilDatabase: task.kind === 'coil' ? effectiveCoilDatabase() : undefined }); }
    catch (error) { rejectTask(task, `${task.kind === 'coil' ? '盘管' : '过滤器'}数据库不可用：` + error.message); return; }
    if (!verified.ok) { rejectTask(task, verified.reason); return; }
    if (!A.apply(verified)) { rejectTask(task, '过滤器结果应用失败，原输入保留。'); return; }
    const before = JSON.stringify(projects);
    selectionBusy = true; document.body.inert = true;
    try {
      const result = await store.save(candidate);
      baseline = JSON.stringify(result.projects);
      if (JSON.stringify(projects) === before) {
        projects.splice(0, projects.length, ...result.projects);
        segments = A.clone(projects[selectedProject].units[selectedUnit].segments);
        selectedId = segment.id;
      } else {
        // Preserve any edits delivered during the asynchronous save, rather than replace them with an older snapshot.
        notice(`${task.kind === 'coil' ? '盘管' : '过滤器'}结果已保存；保存期间出现其他编辑，当前编辑保留为未保存草稿，请复核。`, true);
      }
      writeAck(task, 'applied', '过滤器结果已通过校验并保存');
      renderAll(); refreshStoreNotice();
      if (JSON.stringify(projects) === baseline) notice(`${task.kind === 'coil' ? '盘管规格与数量' : '过滤器规格与数量'}已应用到目标段，并保存至共享修订 ${result.revision}。${task.kind === 'coil' ? '性能计算仍需按规范使用专用软件。' : '效率与阻力仍需产品资料确认。'}`);
    } catch (error) {
      notice(`${task.kind === 'coil' ? '盘管' : '过滤器'}结果未写入：${error.message}。原编辑和回传结果保留，请解决后点击“重试接收结果”。`, true);
    } finally { selectionBusy = false; document.body.inert = false; }
  }
  window.prototypeSelectionBridge = {
    openProfessional(kind = 'filter') {
      if (location.protocol === 'file:') throw new Error('请通过工作台启动器打开本机服务，file方式不支持专业回写。');
      if (formalReadonly || state.source !== 'shared') throw new Error('请先显式保存/发布当前草稿，再启动专业选型；不会自动发布旧浏览器数据。');
      if (selectionBusy || isDirty()) throw new Error('请先保存当前机组输入，再启动过滤器专业选型。');
      const project = projects[selectedProject], unit = project?.units?.[selectedUnit], segment = segments.find(item => item.id === selectedId);
      if ((kind === 'coil' && segment?.type !== 'coil') || (kind !== 'coil' && !['primary','medium','high'].includes(segment?.type))) throw new Error('当前功能段不适用此专业选型模块。');
      const task = kind === 'coil' ? window.AHUPrototypeSelectionUI.openCoil({ project, unit, segment }) : window.AHUPrototypeSelectionUI.openFilter({ project, unit, segment });
      const child = window.open(task.url, '_blank');
      if (!child) throw new Error('浏览器阻止了新标签页，请允许弹出窗口后重试。');
      if (pending) writeAck(pending, 'rejected', '启动了新的选型任务');
      pending = { nonce: task.nonce, context: task.context, revision: state.revision, kind };
      pendingChild = child;
      sessionStorage.setItem(pendingKey, JSON.stringify(pending));
      renderInputs(); renderOutputs();
      notice(`已带入当前机组真实截面。请在${kind === 'coil' ? '盘管' : '过滤器'}页面核对参数，再点击“应用到工作台”。`);
      return task;
    },
    openFilter() { return this.openProfessional('filter'); },
    openCoil() { return this.openProfessional('coil'); }
  };
  window.addEventListener('message', event => { if (event.origin === location.origin && pendingChild && event.source === pendingChild) receiveFilter(event.data); });
  window.addEventListener('storage', event => { if (pending && event.key === H.resultKey(pending.nonce)) receiveFilter(H.readResult(localStorage, pending.nonce)); });
  window.addEventListener('focus', () => { if (pending) receiveFilter(H.readResult(localStorage, pending.nonce)); });
  document.addEventListener('click', event => { if (event.target.closest('[data-filter-retry]') && pending) receiveFilter(H.readResult(localStorage, pending.nonce)); });

  if (!window.ahuCompactReady) await new Promise(resolve => window.addEventListener('ahu-compact-ready', resolve, { once: true }));
  const overviewFields = [
    ['freshAirVolume', '新风量', 'm³/h'], ['airVolume', '送风量', 'm³/h'],
    ['returnAirVolume', '回风量', 'm³/h'], ['exhaustAirVolume', '排风量', 'm³/h'],
    ['externalPressure', '送风机外余压', 'Pa'], ['exhaustExternalPressure', '排风机外余压', 'Pa']
  ];
  // These four airflow forms are the existing, documented P001 prototype choices.
  // The current workbench stores the selected scheme but does not model dual-path geometry.
  const airflowForms = [
    ['F1', '单层单路', '左进右出'],
    ['F2', '单层单路折返', '左下进、左上出'],
    ['F3', '双层双路', '下层→右，上层←左'],
    ['F4', '前后双路', '外侧→右，内侧←左']
  ];
  function conditionValue(unit, key) {
    if (key === 'airVolume') return window.AHUPrototypeAirflowCompat?.resolve(unit) ?? '';
    return unit?.designConditions?.[key]?.value ?? '';
  }
  function weatherSnapshot(unit) {
    const p = projects[selectedProject]?.project || projects[selectedProject] || {};
    const resolved = window.AHUPrototypeWeather?.resolve ? window.AHUPrototypeWeather.resolve(p, unit) : {};
    return { place: resolved.manualModified ? '已手动修改' : (resolved.usageLocation || '未关联'), status: resolved.status || 'blank', note: resolved.note || '', winterDry: resolved.winter?.dryBulb ?? '', winterRh: resolved.winter?.rh ?? '', summerDry: resolved.summer?.dryBulb ?? '', summerWet: resolved.summer?.wetBulb ?? '' };
  }
  const isConfirmedCabinetSelection = selection => Boolean(selection && selection.confirmed !== false && (selection.confirmed === true || selection.status === 'user-confirmed'));
  function sectionVelocityText(unit) {
    const selection = unit?.cabinetSelection || {}, source = selection.source;
    if (!isConfirmedCabinetSelection(selection)) return selection.status === 'invalidated' ? '截面确认已失效，请重新确认后再查看风速。' : '截面未确认，暂不计算风速。';
    if (source !== 'manual' && source !== 'WK-无框架式盘管有效迎风尺寸候选') return '截面未确认，暂不计算风速。';
    const width = Number(unit?.designConditions?.cabinetWidth?.value ?? selection.width?.value), height = Number(unit?.designConditions?.cabinetHeight?.value ?? selection.height?.value), airVolume = Number(conditionValue(unit, 'airVolume'));
    if (!(width > 0) || !(height > 0)) return '已确认截面宽高缺失，暂不计算风速。';
    if (!(airVolume > 0)) return selection.source === 'manual' ? `手工非标名义截面 ${width} × ${height} mm · 送风量待填，名义截面风速示值未计算；不代表盘管迎风速度或性能结果。` : '当前截面已保留；送风量待填，风速未计算。';
    try {
      if (source === 'WK-无框架式盘管有效迎风尺寸候选') {
        const result = window.CoilSelector.calculateCoilFaceVelocity({ tube: selection.tube, effectiveLengthMm: selection.effectiveLengthMm, totalHoleCount: selection.totalHoleCount, airVolumeM3h: airVolume });
        const min = Number(selection.faceVelocityFilter?.minVelocityMps ?? 1.5), max = Number(selection.faceVelocityFilter?.maxVelocityMps ?? 3.0), inRange = result.faceVelocityMps >= min && result.faceVelocityMps <= max;
        return `盘管有效迎风尺寸风速 ${result.faceVelocityMps.toFixed(2)} m/s · ${inRange ? `在当前 ${min}–${max} m/s 筛选范围内` : `超出当前 ${min}–${max} m/s 筛选范围，请复核；截面未自动更换`} · 几何示值，不代表盘管性能已选定。`;
      }
      const result = window.CoilSelector.calculateNominalFaceVelocity({ widthMm: width, heightMm: height, airVolumeM3h: airVolume });
      return `名义截面风速示值 ${result.nominalFaceVelocityMps.toFixed(2)} m/s · 手工非标几何换算，不代表盘管迎风速度或性能结果。`;
    } catch { return '当前截面速度暂不可计算，请复核截面与送风量。'; }
  }
  const overviewMarkup = () => {
    const unit = projects[selectedProject]?.units?.[selectedUnit];
    if (!unit) return '<div class="unit-overview"><p>当前没有可编辑机组。</p></div>';
    const dims = unit.designConditions || {}, width = dims.cabinetWidth?.value ?? unit.cabinetSelection?.width?.value ?? '', height = dims.cabinetHeight?.value ?? unit.cabinetSelection?.height?.value ?? '';
    const fields = overviewFields.map(([key,label,unitLabel]) => `<label>${label}（${unitLabel}）<input class="field-editable" type="number" min="0" step="any" data-overview-field="${key}" value="${escapeHtml(conditionValue(unit,key))}" placeholder="未填写" ${formalReadonly?'disabled':''}></label>`).join('');
    const airflowForm = airflowForms.find(([id]) => id === unit.airflowForm) || null;
    const airflowFormMarkup = `<section class="unit-visual-panel airflow-form-panel" aria-label="气流形式选择"><div class="unit-visual-head"><div><b>气流形式</b><small>方案选项 · 保存到当前机组</small></div><span class="visual-badge">${airflowForm ? airflowForm[0] + ' · 待复核' : '待选择'}</span></div><div class="airflow-form-options" role="radiogroup" aria-label="选择气流形式">${airflowForms.map(([id,title,hint]) => `<label class="airflow-form-option ${unit.airflowForm === id ? 'selected' : ''}"><input type="radio" name="unitAirflowForm" value="${id}" data-airflow-form ${unit.airflowForm === id ? 'checked' : ''} ${formalReadonly?'disabled':''}><span class="airflow-form-code">${id}</span><span class="airflow-form-copy"><b>${title}</b><small>${hint}</small></span></label>`).join('')}</div><p class="airflow-form-note">${airflowForm ? `${airflowForm[0]} 已录入当前机组；` : ''}双气路拓扑、各路风量与实际结构尚未接入专业校核，选择后需工程复核。</p></section>`;
    const selection=unit.cabinetSelection,sectionLabel=selection?.status==='invalidated'||selection?.confirmed===false?'截面待重新确认':selection?.source==='manual'?'手工非标':selection?.source==='WK-无框架式盘管有效迎风尺寸候选'?'WK 盘管迎风候选':'未选择 / 手工输入待确认', weather=weatherSnapshot(unit), series=unit.cabinetSeries||'25W', install=unit.installationLocation||'室内';
    const identityCard=`<section class="overview-card unit-identity-card"><h3>机组基本信息</h3><div class="overview-fields"><label>设备编号<input class="field-editable" data-unit-identity="no" value="${escapeHtml(unit.no||'')}" ${formalReadonly?'disabled':''}></label><label>方案编号<input class="field-editable" data-unit-identity="schemeNo" value="${escapeHtml(unit.schemeNo||'')}" ${formalReadonly?'disabled':''}></label><label>机组型号（可选）<input class="field-editable" data-unit-identity="model" value="${escapeHtml(unit.model||'')}" ${formalReadonly?'disabled':''}></label><label>数量<input class="field-editable" type="number" min="1" step="1" data-unit-identity="quantity" value="${escapeHtml(unit.quantity??1)}" ${formalReadonly?'disabled':''}></label></div><small id="unitIdentityNotice" class="inline-error" role="status"></small></section>`;
  const cabinetCard = `<section class="overview-card" data-unit-meta-panel><h3>箱体与安装</h3><div class="overview-fields"><label>箱体结构<select data-unit-meta="cabinetSeries" ${formalReadonly?'disabled':''}><option value="25W" ${series==='25W'?'selected':''}>25W</option><option value="50W" ${series==='50W'?'selected':''}>50W</option></select></label><label>安装位置<select data-unit-meta="installationLocation" ${formalReadonly?'disabled':''}><option ${install==='室内'?'selected':''}>室内</option><option ${install==='室外'?'selected':''}>室外</option></select></label></div></section>`;
    const weatherCard = `<section class="overview-card weather-card"><h3>室外工况</h3><div class="overview-fields"><label class="field-wide">项目使用地<span class="field-readonly">${escapeHtml(weather.place)}</span></label><label>冬季干球 ℃<input class="field-editable" data-weather-override="winterAirConditioningTemperature" type="number" step="0.1" value="${escapeHtml(weather.winterDry)}" placeholder="待填" ${formalReadonly?'disabled':''}></label><label>冬季 RH %<input class="field-editable" data-weather-override="winterAirConditioningRH" type="number" step="1" value="${escapeHtml(weather.winterRh)}" placeholder="待填" ${formalReadonly?'disabled':''}></label><label>夏季干球 ℃<input class="field-editable" data-weather-override="summerAirConditioningDryBulb" type="number" step="0.1" value="${escapeHtml(weather.summerDry)}" placeholder="待填" ${formalReadonly?'disabled':''}></label><label>夏季湿球 ℃<input class="field-editable" data-weather-override="summerAirConditioningWetBulb" type="number" step="0.1" value="${escapeHtml(weather.summerWet)}" placeholder="待填" ${formalReadonly?'disabled':''}></label></div><p class="muted">冬季：干球 / RH；夏季：干球 / 湿球。机组手动调整仅覆盖当前机组。</p></section>`;
    const dimensionText = width !== '' && height !== '' ? `${escapeHtml(width)} × ${escapeHtml(height)} mm` : '未确认';
    const decisionState = selection?.confirmed === true && selection?.status !== 'invalidated' ? '已确认' : '待确认';
    const sectionDecision = `<section class="overview-card section-decision"><h3>箱体截面确认</h3><div class="section-value"><b>${dimensionText}</b><span>${sectionLabel}</span></div><div class="section-source-row"><span>确认状态</span><strong>${decisionState}</strong></div><div class="section-source-row"><span>候选来源</span><strong>${escapeHtml(selection?.source || '未选择')}</strong></div><div class="overview-actions">${formalReadonly?'':'<button type="button" class="btn primary" data-open-section>选择 / 录入截面…</button>'}</div><p id="sectionVelocityStatus" class="section-velocity-status">${escapeHtml(sectionVelocityText(unit))}</p></section>`;
    return `<div class="unit-overview">
<div class="unit-info-layout">
<div class="unit-info-form">
${identityCard}
<section class="overview-card airflow-card">
<h3>风量与机外余压</h3>
<div class="overview-fields">${fields}</div>
<div class="overview-actions">
<small id="overviewNotice" class="inline-error" role="status">
</small>
</div>
</section>${cabinetCard}${weatherCard}</div>
<div class="unit-info-decision">${sectionDecision}${airflowFormMarkup}<div class="overview-actions">
<button type="button" class="btn primary" data-verify-unit ${formalReadonly?'disabled':''}>验证并确认</button>
${pendingNewUnit?'<button type="button" class="btn light" data-cancel-new-unit>取消新建</button>':''}
<small id="unitVerifyNotice" class="inline-error" role="status">
</small>
</div>
</div>
</div>
</div>`;
  };
  function renderUnitOverview() {
    if ($('workspace').hidden || document.querySelector('.stage.active')?.dataset.stage !== '机组资料') return;
    $('stagePlaceholder').innerHTML = overviewMarkup();
    $('stagePlaceholder').querySelector('[data-cancel-new-unit]')?.addEventListener('click',()=>cancelPrototypeUnitCreation());
    const weather=weatherSnapshot(projects[selectedProject]?.units?.[selectedUnit]);
    if (weather.status === 'unknown' || weather.status === 'ambiguous') {
      const card=$('stagePlaceholder').querySelector('.weather-card') || $('stagePlaceholder').querySelector('[data-unit-meta-panel]');
      if (card) card.insertAdjacentHTML('afterbegin','<p class="inline-error" data-weather-match-warning>项目地点未精确匹配气象库，请核对或手动录入；现有项目工况值仍显示。</p>');
    }
  }
  function invalidateUnitSections(unit, reason) {
    const all = Array.isArray(unit?.segments) ? unit.segments : [];
    all.forEach(segment => { A.invalidate(segment, reason); segment.confirmed = false; });
    segments.forEach(segment => { A.invalidate(segment, reason); segment.confirmed = false; });
  }
  document.querySelectorAll('.stage').forEach(button => button.addEventListener('click', () => window.setTimeout(renderUnitOverview, 0)));
  const overviewHost = $('stagePlaceholder');
  function unitInfoErrorTarget(host, field) { const map={winterDry:'winterAirConditioningTemperature',winterRh:'winterAirConditioningRH',summerDry:'summerAirConditioningDryBulb',summerWet:'summerAirConditioningWetBulb'}; const key=map[field]||field; if(field==='cabinetSelection') return host.querySelector('[data-open-section]'); if(field==='airflowForm') return host.querySelector('[data-airflow-form]'); return host.querySelector(`[data-overview-field="${key}"],[data-weather-override="${key}"],[data-unit-meta="${key}"],[data-unit-identity="${key}"]`); }
  function showUnitInfoValidation(result, host, noticeBox) { host.querySelectorAll('[aria-invalid="true"]').forEach(node=>node.removeAttribute('aria-invalid')); noticeBox.textContent=result.errors.map(error=>error.message).join('；'); result.errors.forEach(error=>{const node=unitInfoErrorTarget(host,error.field);if(node)node.setAttribute('aria-invalid','true');}); const first=unitInfoErrorTarget(host,result.errors[0]?.field); first?.focus?.(); first?.scrollIntoView?.({block:'center'}); }
  function collectUnitInfoValidationInput(unit, host = overviewHost) {
    const q = sel => host?.querySelector?.(sel), value = (sel, fallback) => { const node=q(sel); return node ? node.value : fallback; };
    const weatherSnapshotValue = weatherSnapshot(unit) || {};
    const domPresent = Boolean(host?.querySelector?.('[data-overview-field], [data-weather-override], [data-unit-meta], [data-airflow-form]'));
    const section = unit?.cabinetSelection || {}, width = section.width?.value ?? section.width, height = section.height?.value ?? section.height;
    const weather = domPresent ? {
      winterDry:value('[data-weather-override="winterAirConditioningTemperature"]',''), winterRh:value('[data-weather-override="winterAirConditioningRH"]',''),
      summerDry:value('[data-weather-override="summerAirConditioningDryBulb"]',''), summerWet:value('[data-weather-override="summerAirConditioningWetBulb"]','')
    } : { winterDry:weatherSnapshotValue.winterDry ?? '', winterRh:weatherSnapshotValue.winterRh ?? '', summerDry:weatherSnapshotValue.summerDry ?? '', summerWet:weatherSnapshotValue.summerWet ?? '' };
    const invalidMap={winterAirConditioningTemperature:'winterDry',winterAirConditioningRH:'winterRh',summerAirConditioningDryBulb:'summerDry',summerAirConditioningWetBulb:'summerWet'};
    return { freshAirVolume:value('[data-overview-field="freshAirVolume"]',domPresent?'':conditionValue(unit,'freshAirVolume')), airVolume:value('[data-overview-field="airVolume"]',domPresent?'':conditionValue(unit,'airVolume')), externalPressure:value('[data-overview-field="externalPressure"]',domPresent?'':conditionValue(unit,'externalPressure')), returnAirVolume:value('[data-overview-field="returnAirVolume"]',domPresent?'':conditionValue(unit,'returnAirVolume')), exhaustAirVolume:value('[data-overview-field="exhaustAirVolume"]',domPresent?'':conditionValue(unit,'exhaustAirVolume')), exhaustExternalPressure:value('[data-overview-field="exhaustExternalPressure"]',domPresent?'':conditionValue(unit,'exhaustExternalPressure')), cabinetSeries:value('[data-unit-meta="cabinetSeries"]',domPresent?'':(unit?.cabinetSeries ?? '25W')), weather, cabinetSelection:{...section,width,height}, airflowForm:q('[data-airflow-form]:checked')?.value ?? (domPresent ? '' : unit?.airflowForm), invalidFields:[...(host?.querySelectorAll?.('input')||[])].filter(node=>node.validity?.badInput).map(node=>invalidMap[node.dataset.weatherOverride]||node.dataset.overviewField) };
  }
  async function validateAndConfirmUnitInfo(event) { const button=event.target.closest('[data-verify-unit]');
     if(!button||formalReadonly||button.disabled||projectSaveBusy)return;
     const unit=projects[selectedProject]?.units?.[selectedUnit], noticeBox=$('unitVerifyNotice')||$('overviewNotice');
     if(!unit)return;
     if(typeof window.AHUPrototypeUnitInfoValidator?.validate!=='function'){noticeBox.textContent='验证器未加载，无法确认。';
    return;
    } persistActiveUnit();
     overviewHost.querySelectorAll('[aria-invalid="true"]').forEach(node=>node.removeAttribute('aria-invalid'));
     const before=JSON.stringify(projects), input=collectUnitInfoValidationInput(unit);
     const identityResult=typeof validateUnitIdentityInput==='function'?validateUnitIdentityInput(unit,overviewHost):{valid:true,errors:[]}; if(!identityResult.valid){const identityNotice=$('unitIdentityNotice')||noticeBox; showUnitInfoValidation(identityResult,overviewHost,identityNotice); return;}
     const result=window.AHUPrototypeUnitInfoValidator.validate(input);
     if(!result.valid){showUnitInfoValidation(result,overviewHost,noticeBox);
    return;
    } const previousInert=document.body.inert;
     projectSaveBusy=true; newUnitConfirmationAuthorized=true;
     button.disabled=true;
     document.body.inert=true;
     try { const candidate=JSON.parse(before), target=candidate.projects?.[selectedProject]?.units?.[selectedUnit] || candidate[selectedProject]?.units?.[selectedUnit];
     if(target){ target.designConditions ||= {};
     const identityNodes=overviewHost.querySelectorAll('[data-unit-identity]'), identity={}; identityNodes.forEach(node=>identity[node.dataset.unitIdentity]=node.value); if(identityNodes.length||pendingNewUnit){const no=String(identity.no||'').trim(),schemeNo=String(identity.schemeNo||'').trim(); if(!no||!schemeNo||!/^\d+$/.test(identity.quantity||'')||Number(identity.quantity)<1){throw new Error('设备编号、方案编号和数量必须有效');} if(projects[selectedProject].units.some(existing=>existing.unitId!==unit.unitId&&String(existing.no||'').trim().toUpperCase()===no.toUpperCase()))throw new Error('设备编号已存在，请修改后再确认。'); target.no=no; target.schemeNo=schemeNo; target.model=identity.model?.trim()||''; target.quantity=Number(identity.quantity);}
     ['freshAirVolume','airVolume','externalPressure','returnAirVolume','exhaustAirVolume','exhaustExternalPressure'].forEach(key=>{if(input[key]!==undefined&&input[key]!=='')target.designConditions[key]={...(target.designConditions[key]||{}),value:Number(input[key])};});
     target.cabinetSeries=input.cabinetSeries;
     target.installationLocation=unit.installationLocation||'室内';
     target.weatherOverride={...(target.weatherOverride||{})};
     const wm={winterDry:'winterAirConditioningTemperature',winterRh:'winterAirConditioningRH',summerDry:'summerAirConditioningDryBulb',summerWet:'summerAirConditioningWetBulb'};
     const snap=weatherSnapshot(unit); Object.entries(wm).forEach(([k,name])=>{if(input.weather?.[k]!==''&&input.weather?.[k]!==undefined&&Number(input.weather[k])!==Number(snap[k]))target.weatherOverride[name]={value:Number(input.weather[k]),source:'机组手动调整'};});
     if(input.airflowForm)target.airflowForm=input.airflowForm; if(input.airVolume!=='')target.airflow=`${Number(input.airVolume)} m³/h`;
     const numericKeys=['freshAirVolume','airVolume','externalPressure','returnAirVolume','exhaustAirVolume','exhaustExternalPressure'];
     const changed=numericKeys.some(key=>Number(input[key])!==Number(conditionValue(unit,key)))||Object.entries(input.weather||{}).some(([key,value])=>Number(value)!==Number(weatherSnapshot(unit)[key]))||(input.cabinetSeries||'25W')!==(unit.cabinetSeries||'25W')||input.airflowForm!==unit.airflowForm;
     if(changed && !(pendingNewUnit && target.unitId===pendingNewUnit.unitId)){ target.pendingRecalculation=true; target.state='待复核'; const groups=[target.segments,...(target.airflowBranches||[]).map(branch=>branch?.segments||[])]; groups.flat().forEach(segment=>{if(segment){segment.confirmed=false;if(A?.invalidate)A.invalidate(segment,'机组资料变化，专业结果待复核');}}); }
     if(!Object.keys(target.weatherOverride).length)delete target.weatherOverride;
     } const resultSave=await store.save(candidate);
     if(JSON.stringify(projects)!==before){noticeBox.textContent='保存期间编辑已变化，仍有未保存内容，请再次保存。';
    return;
    } projects.splice(0,projects.length,...resultSave.projects); segments=JSON.parse(JSON.stringify(projects[selectedProject]?.units?.[selectedUnit]?.segments||[]));
     baseline=JSON.stringify(projects); if(typeof pendingNewUnit!=='undefined'&&pendingNewUnit){pendingNewUnit=null; showManager();}
     refreshStoreNotice();
     noticeBox.textContent='录入验证通过并保存，不代表专业校核完成。';
     } catch(error){ noticeBox.textContent=`保存失败：${error.message}`;
     } finally { newUnitConfirmationAuthorized=false; document.body.inert=previousInert;
     button.disabled=false;
     projectSaveBusy=false;
     } }
  function onUnitInfoStageGate(event) { const stage=event.target?.closest?.('.stage');
     if(!stage||stage.dataset.stage!=='功能段配置'||formalReadonly||$('workspace')?.hidden)return;
     if(pendingNewUnit){event.preventDefault();event.stopImmediatePropagation();notice('请先验证确认或取消新建机组。',true);return;}
     if(projectSaveBusy){event.preventDefault();event.stopImmediatePropagation();return;}
     const validator=window.AHUPrototypeUnitInfoValidator?.validate;
     const unit=projects[selectedProject]?.units?.[selectedUnit];
     const result=typeof validator==='function'?validator(collectUnitInfoValidationInput(unit,overviewHost)): {valid:false,errors:[{field:'validator',message:'验证器未加载，无法进入功能段配置。'}]};
     if(!result.valid){event.preventDefault();
    event.stopImmediatePropagation();
     const info=document.querySelector('.stage[data-stage="机组资料"]');
     info?.click();
     renderUnitOverview();
     const validationNotice=$('unitVerifyNotice')||$('overviewNotice'); showUnitInfoValidation(result,overviewHost,validationNotice); const schedule=(typeof window!=='undefined'&&typeof window.setTimeout==='function')?window.setTimeout:typeof setTimeout==='function'?setTimeout:null; if(schedule)schedule(()=>showUnitInfoValidation(result,overviewHost,validationNotice),0);
    } }
  overviewHost.addEventListener('click', validateAndConfirmUnitInfo, true);
  overviewHost.addEventListener('input', onUnitIdentityInput, true);
  document.addEventListener('click', onUnitInfoStageGate, true);
  overviewHost.addEventListener('change', event => {
    if (event.target.matches('[data-airflow-form]')) {
      const unit=projects[selectedProject]?.units?.[selectedUnit], value=event.target.value;
      if (!unit || formalReadonly || !airflowForms.some(([id]) => id === value)) return;
      if (unit.airflowForm === value) return;
      unit.airflowForm=value;
      invalidateUnitSections(unit, '气流形式修改，相关功能段待工程复核');
      persistActiveUnit(); renderUnitOverview(); renderSegments(); renderOutputs(); refreshStoreNotice();
      notice(`气流形式 ${value} 已录入当前机组草稿；双气路专业校核尚未接入，请工程复核。`);
      return;
    }
    if (event.target.dataset.weatherOverride === 'summerAirConditioningDryBulb') {
      const unit=projects[selectedProject]?.units?.[selectedUnit], raw=event.target.value.trim(), value=Number(raw), snapshot=weatherSnapshot(unit);
      if (raw !== '' && Number.isFinite(value) && snapshot.summerWet !== '' && value < Number(snapshot.summerWet)) { event.preventDefault(); const error=$('overviewNotice'); if(error) error.textContent='夏季干球温度必须不低于夏季湿球。'; return; }
    }
    const unit=projects[selectedProject]?.units?.[selectedUnit]; if(!unit||formalReadonly)return;
    const meta=event.target.dataset.unitMeta, weather=event.target.dataset.weatherOverride;
    if(meta){ unit[meta]=event.target.value; if(meta==='cabinetSeries'){ unit.cabinetSelection={...(unit.cabinetSelection||{}),series:event.target.value,confirmed:false,status:'invalidated'}; invalidateUnitSections(unit,'箱体结构修改，原截面需复核'); } persistActiveUnit(); renderUnitOverview(); refreshStoreNotice(); }
    if(weather){ const raw=event.target.value.trim(), value=raw===''?null:Number(raw), snapshot=weatherSnapshot(unit), valid=raw==='' || (weather==='winterAirConditioningRH'?Number.isFinite(value)&&value>=0&&value<=100:weather==='summerAirConditioningWetBulb'?Number.isFinite(value)&&value<=Number(snapshot.summerDry):Number.isFinite(value)); const error=$('overviewNotice'); if(!valid){error.textContent=weather==='winterAirConditioningRH'?'冬季相对湿度必须为 0–100%。':weather==='summerAirConditioningWetBulb'?'夏季湿球温度必须不高于夏季干球。':'工况必须是有限数值。'; return;} unit.weatherOverride ||= {}; if(raw==='') delete unit.weatherOverride[weather]; else unit.weatherOverride[weather]={value,source:'机组手动调整'}; if(!Object.keys(unit.weatherOverride).length) delete unit.weatherOverride; invalidateUnitSections(unit,'机组工况修改，相关专业结果待复核'); persistActiveUnit(); renderUnitOverview(); refreshStoreNotice(); notice('机组工况已更新；相关专业结果待复核，请保存。'); }
  });
  overviewHost.addEventListener('input', event => {
    const key = event.target.dataset.overviewField;
    if (!key || formalReadonly) return;
    const raw = event.target.value, value = raw === '' ? '' : Number(raw), noticeEl = $('overviewNotice');
    if (raw !== '' && (!Number.isFinite(value) || value < 0)) { noticeEl.textContent = '请输入大于或等于 0 的有效数值。'; return; }
    noticeEl.textContent = '';
    const unit = projects[selectedProject]?.units?.[selectedUnit]; if (!unit) return;
    unit.designConditions ||= {};
    const old = unit.designConditions[key]?.value ?? '';
    if (old === value) return;
    const labels = Object.fromEntries(overviewFields.map(([field,label]) => [field,label]));
    unit.designConditions[key] = { ...(unit.designConditions[key] || {}), value, unit: key.toLowerCase().includes('pressure') ? 'Pa' : 'm³/h', source: '用户输入' };
    if (key === 'airVolume') unit.airflow = value === '' ? '未填写' : `${value} m³/h`;
    invalidateUnitSections(unit, `${labels[key]}修改，原专业结果需复核`);
    persistActiveUnit(); renderSegments(); renderOutputs(); refreshStoreNotice();
    if (key === 'airVolume') { const status = document.getElementById('sectionVelocityStatus'); if (status) status.textContent = sectionVelocityText(unit); const dialog = document.getElementById('unitSectionDialog'); if (dialog?.open) { dialog.querySelector('[data-section-air-volume]').value = value === '' ? '未填写' : String(value); renderSectionCandidates(dialog, unit); } }
  });
  function renderSectionCandidates(dialog, unit) {
    const body = dialog.querySelector('[data-section-candidate-rows]'), status = dialog.querySelector('[data-section-candidate-status]');
    dialog.__candidateRows = [];
    try {
      const result = window.CoilSelector.listFaceSectionCandidates({ series: unit.cabinetSeries || '25W', airVolumeM3h: conditionValue(unit, 'airVolume'), minVelocityMps: dialog.querySelector('[data-section-min-velocity]').value, maxVelocityMps: dialog.querySelector('[data-section-max-velocity]').value });
      dialog.__candidateRows = result.candidates;
      body.innerHTML = result.candidates.map(row => `<tr><td>${row.widthModule} × ${row.heightModule}M</td><td>${row.widthMm} × ${row.heightMm} mm</td><td><input type="radio" name="sectionCandidate" value="${row.sourceRow}" aria-label="选择 ${row.widthMm}×${row.heightMm} 毫米截面"></td><td>φ${row.tube}</td><td>${row.effectiveLengthMm}</td><td>${row.holeCounts.join(' + ')} = ${row.totalHoleCount}</td><td>${row.effectiveAreaM2.toFixed(4)}</td><td>${row.faceVelocityMps.toFixed(3)}</td><td>${row.recommendedFlag === true ? '源表推荐' : row.recommendedFlag === false ? '源表未推荐' : '源表未标记'}</td></tr>`).join('') || '<tr><td colspan="9">当前风量与筛选范围内没有匹配候选。</td></tr>';
      status.textContent = `${result.candidates.length} 条 WK-无框架式候选 · ${result.sourceRecordCount} 条源记录 · 按风速升序。推荐标记仅展示，不自动选定。`;
      const priorRow = String(dialog.__pendingCandidateRow || ''), stillPresent = result.candidates.some(row => String(row.sourceRow) === priorRow);
      if (stillPresent) { const radio = body.querySelector(`input[value="${priorRow}"]`); if (radio) radio.checked = true; }
      else if (priorRow) { dialog.__pendingCandidateRow = ''; status.textContent += ' 暂选行超出当前范围，原已确认截面仍保留且不会自动替换。'; }
    } catch (error) {
      body.innerHTML = '<tr><td colspan="9">请先录入有效送风量和风速筛选范围。</td></tr>';
      status.textContent = error.message;
    }
    const currentStatus = dialog.querySelector('[data-section-current-status]'), selected = unit.cabinetSelection;
    currentStatus.textContent = isConfirmedCabinetSelection(selected) && selected?.width?.value && selected?.height?.value ? `当前已确认截面 ${selected.width.value} × ${selected.height.value} mm · ${sectionVelocityText(unit)}` : selected?.status === 'invalidated' ? '机组宽高已改变；原截面与候选确认已失效，请重新选中并确认。' : '当前尚无已确认截面。';
    const manualPreview = dialog.querySelector('[data-section-manual-preview]'), airVolume = Number(conditionValue(unit, 'airVolume'));
    try { const manual = window.CoilSelector.calculateNominalFaceVelocity({ widthMm: Number(dialog.querySelector('[data-section-manual-width]').value), heightMm: Number(dialog.querySelector('[data-section-manual-height]').value), airVolumeM3h: airVolume }); manualPreview.textContent = `名义截面面积 ${manual.nominalAreaM2.toFixed(3)} m² · 名义截面风速 ${manual.nominalFaceVelocityMps.toFixed(2)} m/s（仅几何示值，不是盘管速度或性能结果）`; }
    catch { manualPreview.textContent = '填写有效宽、高及送风量后显示名义截面风速（仅几何示值）。'; }
  }
  overviewHost.addEventListener('click', event => {
    if (!event.target.closest('[data-open-section]') || formalReadonly) return;
    const unit = projects[selectedProject]?.units?.[selectedUnit]; if (!unit) return;
    let dialog = document.getElementById('unitSectionDialog');
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id='unitSectionDialog'; dialog.className='section-dialog';
      dialog.innerHTML='<header><h2>箱体截面候选与手选</h2><p>当前箱体结构：<b data-section-series></b>；宽高公式：25W = 模数×100 + 50 mm，50W = 模数×100 + 100 mm。候选仅表示几何尺寸，不代表盘管型号或性能已选定。</p></header><div class="section-body"><div class="section-pending">有效面积 = 盘管有效长度 G × (孔数 H+I+J) × 管距 ÷ 1,000,000；迎面风速 = 送风量 ÷ 3600 ÷ 有效面积。风速上下限仅作筛选、不是规范判定；源推荐标记不自动决定截面。</div><div class="section-filter"><label>当前送风量（m³/h）<input type="text" data-section-air-volume readonly></label><label>风速下限（m/s）<input type="number" min="0.01" step="0.1" value="1.5" data-section-min-velocity></label><label>风速上限（m/s）<input type="number" min="0.01" step="0.1" value="3.0" data-section-max-velocity></label></div><p data-section-current-status></p><div class="section-candidate-wrap"><table><thead><tr><th>宽模数×高模数</th><th>宽×高(mm)</th><th>选择</th><th>管径</th><th>有效长度(mm)</th><th>孔数</th><th>有效面积(m²)</th><th>迎面风速(m/s)</th><th>源推荐标记</th></tr></thead><tbody data-section-candidate-rows></tbody></table></div><p data-section-candidate-status role="status"></p><fieldset class="section-manual"><legend>截面确认方式</legend><label><input type="radio" name="sectionMode" value="candidate" data-section-mode checked> 从当前候选中手选</label><label><input type="radio" name="sectionMode" value="manual" data-section-mode> 手工非标尺寸</label><div class="overview-fields"><label>箱体宽（mm）<input type="number" min="1" step="1" data-section-manual-width></label><label>箱体高（mm）<input type="number" min="1" step="1" data-section-manual-height></label></div><p data-section-manual-preview>手工非标仅显示名义截面风速示值，不计算盘管有效迎风速度。</p></fieldset><small class="inline-error" data-section-error role="status"></small></div><footer><button type="button" class="btn light" data-section-cancel>取消</button><button type="button" class="btn primary" data-section-confirm>确认截面</button></footer>';
      document.body.appendChild(dialog);
      dialog.addEventListener('input', e => { if (e.target.matches('input[type="radio"]')) return; const current=projects[selectedProject]?.units?.[selectedUnit]; if(current)renderSectionCandidates(dialog,current); });
      dialog.addEventListener('change', e => {
        const current=projects[selectedProject]?.units?.[selectedUnit]; if(!current)return;
        if(e.target.matches('[name="sectionCandidate"]')){dialog.__pendingCandidateRow=e.target.value;dialog.querySelector('[data-section-mode][value="manual"]').checked=false;dialog.querySelector('[data-section-mode][value="candidate"]').checked=true;}
        if(e.target.matches('[data-section-min-velocity],[data-section-max-velocity]'))dialog.__pendingCandidateRow='';
        renderSectionCandidates(dialog,current);
      });
      dialog.addEventListener('click', e=>{if(e.target.closest('[data-section-cancel]'))dialog.close(); if(e.target===dialog)dialog.close(); if(!e.target.closest('[data-section-confirm]'))return;
        const err=dialog.querySelector('[data-section-error]'),current=projects[selectedProject]?.units?.[selectedUnit]; if(!current)return;
        const mode=dialog.querySelector('[data-section-mode]:checked')?.value||'candidate'; let w,h,meta;
        if(mode==='manual'){
          w=Number(dialog.querySelector('[data-section-manual-width]').value);h=Number(dialog.querySelector('[data-section-manual-height]').value);
          if(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||!Number.isInteger(w)||!Number.isInteger(h)){err.textContent='宽、高必须是大于 0 的整数毫米。';return;}
          const airVolume=Number(conditionValue(current,'airVolume'));
          const nominalFaceVelocityMps=airVolume>0?window.CoilSelector.calculateNominalFaceVelocity({widthMm:w,heightMm:h,airVolumeM3h:airVolume}).nominalFaceVelocityMps:null;
          meta={source:'manual',status:'user-confirmed',method:'manual-nonstandard',nominalFaceVelocityMps};
        }else{
          const row=dialog.__candidateRows?.find(item=>String(item.sourceRow)===String(dialog.__pendingCandidateRow));
          if(!row){err.textContent='请先在候选表中人工选中一行，或选择手工非标尺寸，再点击确认截面。';return;}
          w=row.widthMm;h=row.heightMm;
          meta={source:'WK-无框架式盘管有效迎风尺寸候选',status:'user-confirmed',method:'manual-candidate-confirmation',sourceWorkbook:'22.xlsx',sourceSheet:'机组型号参数表',sourceRow:row.sourceRow,tube:row.tube,effectiveLengthMm:row.effectiveLengthMm,holeCounts:row.holeCounts,totalHoleCount:row.totalHoleCount,pipePitchMm:row.pipePitchMm,effectiveAreaM2:row.effectiveAreaM2,sourceRecommendedFlag:row.recommendedFlag,faceVelocityFilter:{minVelocityMps:Number(dialog.querySelector('[data-section-min-velocity]').value),maxVelocityMps:Number(dialog.querySelector('[data-section-max-velocity]').value)}};
        }
        current.designConditions ||= {}; current.designConditions.cabinetWidth={...(current.designConditions.cabinetWidth||{}),value:w,unit:'mm',source:'用户输入'}; current.designConditions.cabinetHeight={...(current.designConditions.cabinetHeight||{}),value:h,unit:'mm',source:'用户输入'};
        current.cabinetSelection={...(current.cabinetSelection||{}),width:{value:w,unit:'mm'},height:{value:h,unit:'mm'},...meta,confirmed:true,updatedAt:new Date().toISOString()};
        invalidateUnitSections(current,'箱体截面修改，旧专业结果失效'); persistActiveUnit(); dialog.close(); renderUnitOverview(); renderSegments(); renderInputs(); renderOutputs(); renderView(); refreshStoreNotice(); notice('箱体实际截面已确认；盘管性能仍须专业复核。旧专业结果已失效留档，请保存后重新选型。');
      });
    }
    const selection=unit.cabinetSelection||{},isConfirmed=isConfirmedCabinetSelection(selection),isCandidate=isConfirmed&&selection.source==='WK-无框架式盘管有效迎风尺寸候选';
    dialog.__pendingCandidateRow=isCandidate?String(selection.sourceRow):'';
    dialog.querySelector('[data-section-series]').textContent=unit.cabinetSeries||'25W';
    dialog.querySelector('[data-section-min-velocity]').value=selection.faceVelocityFilter?.minVelocityMps??1.5;
    dialog.querySelector('[data-section-max-velocity]').value=selection.faceVelocityFilter?.maxVelocityMps??3.0;
    dialog.querySelector('[data-section-air-volume]').value=conditionValue(unit,'airVolume')||'未填写';
    dialog.querySelector('[data-section-manual-width]').value=unit.designConditions?.cabinetWidth?.value??selection.width?.value??'';
    dialog.querySelector('[data-section-manual-height]').value=unit.designConditions?.cabinetHeight?.value??selection.height?.value??'';
    dialog.querySelector('[data-section-mode][value="manual"]').checked=isConfirmed&&selection.source==='manual';
    dialog.querySelector('[data-section-mode][value="candidate"]').checked=!(isConfirmed&&selection.source==='manual');
    dialog.querySelector('[data-section-error]').textContent=''; renderSectionCandidates(dialog,unit); dialog.showModal();
  });
  const priorRenderAll = renderAll;
  renderAll = function () { priorRenderAll(); renderUnitOverview(); };
  const renderBaseInputs = renderInputs;
  renderInputs = function () {
    renderBaseInputs();
    const unit = projects[selectedProject]?.units?.[selectedUnit], segment = segments.find(item => item.id === selectedId);
    if (segment && window.AHUPrototypeSegmentFields) { $('inputGrid').querySelectorAll('[data-field="capacity"],[data-field="resistance"],[data-field="model"],[data-field="source"],[data-unit-condition]').forEach(node => node.closest('label')?.remove()); $('inputGrid').insertAdjacentHTML('beforeend', window.AHUPrototypeSegmentFields.render(segment, escapeHtml, unit, formalReadonly)); }
    if (!formalReadonly && segment && A.formalType[segment.type]) {
      const c = unit?.designConditions || {};
      $('inputGrid').insertAdjacentHTML('afterbegin', `<label class="field"><span>机组箱体宽 mm（真实输入）</span><input type="number" min="1" data-unit-condition="cabinetWidth" value="${escapeHtml(c.cabinetWidth?.value ?? '')}" placeholder="未填写，禁止使用示意尺寸"></label><label class="field"><span>机组箱体高 mm（真实输入）</span><input type="number" min="1" data-unit-condition="cabinetHeight" value="${escapeHtml(c.cabinetHeight?.value ?? '')}" placeholder="未填写，禁止使用示意尺寸"></label>`);
      const record = segment.interface?.selection?.professionalResult, isCoil = segment.type === 'coil';
      const summary = record?.selector === 'filter' ? `<p>已应用 L2 · ${escapeHtml(record.result.filterType.name)} · 共 ${record.result.arrangement.total} 个</p><p>${record.result.arrangement.specifications.map(item => `${escapeHtml(item.code)} × ${item.count}`).join('；')}</p><small>${escapeHtml(record.rule.version)} · 效率与阻力仍需复核</small>` : record?.selector === 'coil' ? `<p>已应用 L2 · ${escapeHtml(record.model)} · ${record.result.count} 件</p><p>迎面尺寸 ${record.result.faceWidth} × ${record.result.faceHeight} mm；${record.input.rows} 排 / φ${record.input.tube} / DN${record.input.header}</p><small>${escapeHtml(record.rule.version)} · 性能参数仍需专用软件复核</small>` : '<small>尚未应用专业排布结果；选型通过不代替整段工程确认。</small>';
      $('inputGrid').insertAdjacentHTML('afterbegin', `<section class="output-card" style="grid-column:1/-1;margin:0;padding:10px"><h3>${isCoil ? '盘管专业选型' : '过滤器专业选型'}</h3><div data-filter-summary>${summary}</div><div class="professional-actions"><button type="button" class="btn primary" data-professional-action="${isCoil ? 'coil' : 'filter'}">启动${isCoil ? '盘管' : '过滤器'}专业选型</button><button type="button" class="btn light" data-filter-save>保存当前输入</button>${pending?'<button type="button" class="btn light" data-filter-retry>重试接收结果</button>':''}</div></section>`);
      $('inputGrid').querySelectorAll('[data-unit-condition]').forEach(node => node.closest('label')?.remove());
    }
  };
  const renderBaseOutputs = renderOutputs;
  renderOutputs = function () {
    renderBaseOutputs();
    if (formalReadonly) return;
    const segment = segments.find(item => item.id === selectedId), record = segment?.interface?.selection?.professionalResult;
    if (record?.selector === 'filter') {
      const rows = record.result.arrangement.specifications.map(item => `<tr><td>${escapeHtml(item.code)}</td><td>${item.count}</td></tr>`).join('');
      $('outputScroll').insertAdjacentHTML('afterbegin', `<section class="output-card"><h3>过滤器专业结果 · L2</h3><p>${escapeHtml(record.result.filterType.name)} · ${record.input.mode === 'pull' ? '抽拉' : '框架'} · 共 ${record.result.arrangement.total} 个</p><table style="width:100%"><thead><tr><th>规格编码</th><th>数量</th></tr></thead><tbody>${rows}</tbody></table><p>规则：${escapeHtml(record.rule.id)} / ${escapeHtml(record.rule.version)}</p><p>来源：${escapeHtml(record.source)}</p><small>${escapeHtml(record.warnings.join('；'))}</small></section>`);
    }
    if (record?.selector === 'coil') $('outputScroll').insertAdjacentHTML('afterbegin', `<section class="output-card"><h3>盘管专业结果 · L2</h3><p>${escapeHtml(record.model)} · ${record.result.count} 件 · 迎面 ${record.result.faceWidth} × ${record.result.faceHeight} mm</p><p>${record.input.series} / ${record.input.installation === 'floor' ? '落地' : '吊顶'} / ${record.input.rows} 排 / φ${record.input.tube} / DN${record.input.header}</p><p>规则：${escapeHtml(record.rule.id)} / ${escapeHtml(record.rule.version)}</p><small>${escapeHtml(record.warnings.join('；'))}</small></section>`);
    if (pending && A.formalType[segment?.type]) $('outputScroll').insertAdjacentHTML('beforeend', '<button class="btn light" type="button" data-filter-retry>重试接收过滤器结果</button>');
  };
  // Capture before the existing delegated input listeners mirror values into the segment.
  function updateProfessionalInput(event) {
    if (formalReadonly) return;
    const unit = projects[selectedProject]?.units?.[selectedUnit], segment = segments.find(item => item.id === selectedId);
    if (!unit || !segment) return;
    const code = event.target.dataset.unitCondition;
    if (code) {
      const value = event.target.value === '' ? '' : Number(event.target.value);
      if (unit.designConditions?.[code]?.value === value) return;
      unit.designConditions ||= {}; unit.designConditions[code] = { ...(unit.designConditions[code] || {}), value, unit: 'mm' };
      if ((code === 'cabinetWidth' || code === 'cabinetHeight') && isConfirmedCabinetSelection(unit.cabinetSelection)) {
        unit.cabinetSelection = { ...unit.cabinetSelection, confirmed: false, status: 'invalidated', invalidatedReason: '机组箱体宽高已修改，原截面与候选确认失效', invalidatedAt: new Date().toISOString() };
      }
      segments.forEach(item => A.invalidate(item, '机组截面修改，旧排布失效'));
      persistActiveUnit(); renderSegments(); renderOutputs(); renderView(); renderUnitOverview();
      const sectionDialog = document.getElementById('unitSectionDialog'); if (sectionDialog?.open) renderSectionCandidates(sectionDialog, unit);
      notice(unit.cabinetSelection?.status === 'invalidated' ? '机组真实截面已修改；原截面及候选确认已失效，请重新选择确认。' : '机组真实截面已修改，请先保存，再执行过滤器专业选型。');
    } else if (event.target.dataset.segmentManual) {
      if (formalReadonly || event.target.readOnly || ['airVolume','cabinetWidth','cabinetHeight','freshAirVolume','returnAirVolume','exhaustAirVolume'].includes(event.target.dataset.segmentManual)) return;
      segment.interface ||= {}; segment.interface.output ||= {}; segment.interface.output.manual ||= {};
      const key=event.target.dataset.segmentManual, raw=event.target.value;
      const checker=window.AHUPrototypeSegmentFields?.validateManualField, checked=checker?checker(segment,key,raw):{valid:true,value:raw}; if(!checked.valid){ event.target.setAttribute('aria-invalid','true'); event.target.setCustomValidity?.(checked.message||'输入无效'); notice(checked.message||'输入无效',true); return; } event.target.removeAttribute('aria-invalid'); event.target.setCustomValidity?.(''); segment.interface.output.manual[key]=checked.value; if (key==='model'||key==='source') segment[key]=raw;
      segment.confirmed=false; segment.manualConfirmation=null;
      if (window.AHUPrototypeSelectionHandoff?.invalidate) window.AHUPrototypeSelectionHandoff.invalidate(segment,'本段人工参数修改，专业结果待复核');
      else if (A?.invalidate) A.invalidate(segment,'本段人工参数修改，专业结果待复核');
      persistActiveUnit(); renderSegments(); renderOutputs(); renderView();
    } else if (event.target.dataset.field === 'model' || event.target.dataset.partRef) {
      A.invalidate(segment, '人工型号或关联零件修改，专业结果失效');
    }
    if (!segment.interface?.selection?.professionalResult && segment.professionalHistory?.length) {
      const summary = document.querySelector('[data-filter-summary]');
      if (summary) summary.textContent = '旧专业结果已失效，保留历史记录；请重新选型。';
    }
  }
  function onConfirmSegmentFields(event) { if (formalReadonly || projectSaveBusy) { event.preventDefault(); event.stopImmediatePropagation(); return false; } const active=segments.find(item=>item.id===selectedId), fieldsApi=window.AHUPrototypeSegmentFields, checker=fieldsApi?.validateManualField; if (!active||!checker||fieldsApi.typeOf(active)==='unknown') { event.preventDefault(); event.stopImmediatePropagation(); notice('当前功能段类型未接入，无法确认。',true); return false; } for (const node of $('inputGrid').querySelectorAll('[data-segment-manual]')) { const result=checker(active,node.dataset.segmentManual,node.value); if (!result.valid) { node.setAttribute('aria-invalid','true'); node.focus(); notice(result.message||'输入无效',true); event.preventDefault(); event.stopImmediatePropagation(); return false; } } return true; }
  window.onConfirmSegmentFields=onConfirmSegmentFields;
  $('confirmSegment').addEventListener('click', onConfirmSegmentFields, true);
  $('inputGrid').addEventListener('input', updateProfessionalInput, true);
  $('inputGrid').addEventListener('change', updateProfessionalInput, true);
  $('confirmSegment').addEventListener('click', event => { if (formalReadonly || projectSaveBusy) { event.preventDefault(); event.stopImmediatePropagation(); return; } const active=segments.find(item=>item.id===selectedId), checker=window.AHUPrototypeSegmentFields?.validateManualField; if (!active||!checker) return; for (const node of $('inputGrid').querySelectorAll('[data-segment-manual]')) { const result=checker(active,node.dataset.segmentManual,node.value); if (!result.valid) { node.setAttribute('aria-invalid','true'); node.setCustomValidity?.(result.message||'输入无效'); node.focus(); notice(result.message||'输入无效',true); event.preventDefault(); event.stopImmediatePropagation(); return; } } }, true);
  document.addEventListener('click', async event => {
    if (!event.target.closest('[data-filter-save]')) return;
    try { persistActiveUnit(); const result = await store.save(projects); projects.splice(0, projects.length, ...result.projects); baseline = JSON.stringify(projects); refreshStoreNotice(); notice('当前机组输入已明确保存，请启动过滤器专业选型。'); }
    catch (error) { notice('保存失败，原输入保留：' + error.message, true); }
  });
  replacePrototypeAction('newUnitBtn', async () => {
    try {
      if (state.source === 'shared') await saveShared();
      else persistActiveUnit();
      showManager(); await window.addPrototypeUnit();
    }
    catch (error) { notice(`未切换到项目中心，当前编辑已保留：${error.message}`, true); }
  });
  function stopSaveAndSwitch(e) {
    const projectButton = e.target.closest('[data-project]');
    const unitButton = e.target.closest('[data-open-unit]');
    if ((!projectButton && !unitButton) || switching) return;
    if (newProjectMode) { e.preventDefault(); e.stopImmediatePropagation(); notice('当前项目资料正在编辑，请先点击顶部保存。', true); return; }
    e.preventDefault(); e.stopImmediatePropagation(); switching = true;
    const nextProject = projectButton ? Number(projectButton.dataset.project) : selectedProject;
    const nextUnit = unitButton ? Number(unitButton.dataset.openUnit) : selectedUnit;
    (async () => {
      try {
        const dirty = isDirty();
        const switchTo = async () => {
          if (state.source === 'shared') {
            projects.splice(0, projects.length, ...store.state.projects);
            baseline = JSON.stringify(projects);
          }
          if (projectButton) { selectedProject = nextProject; selectedUnit = 0; renderManager(); }
          else { selectedProject = nextProject; selectedUnit = nextUnit; loadPrototypeUnit(nextUnit); showWorkspace(nextUnit); }
        };
        if (state.source === 'shared' && !dirty) await switchTo();
        else await store.beforeSelectionChange({ projects, capture: () => { persistActiveUnit(); return { project: selectedProject, unit: selectedUnit }; }, switchTo });
        if (state.source === 'shared' && dirty) notice(`已保存到本机共享原型项目修订 ${state.revision}`);
        else if (state.source === 'shared') notice('已切换；当前内容没有未保存修改。');
        else notice(state.source === 'local' ? '已切换；编辑仍是未发布的本机草稿。' : '已切换；编辑仍是未保存的演示草稿。');
        refreshStoreNotice();
      } catch (error) { notice(`未切换，当前编辑已保留：${error.message}`, true); }
      finally { switching = false; }
    })();
  }
  document.addEventListener('click', stopSaveAndSwitch, true);
  $('homeBtn').addEventListener('click', async e => {
    e.stopImmediatePropagation();
    if (homePendingGuard(e)) return;
    try {
      if (state.source === 'shared') {
        if (isDirty()) {
          await store.saveBeforeSwitch({ projects, capture: () => { persistActiveUnit(); return null; }, switchTo: () => { projects.splice(0, projects.length, ...store.state.projects); baseline = JSON.stringify(projects); showManager(); refreshStoreNotice(); } });
          notice(`已保存到本机共享原型项目修订 ${state.revision}`);
        } else {
          showManager(); refreshStoreNotice();
          notice('已返回项目中心；当前内容没有未保存修改。');
        }
      } else {
        persistActiveUnit(); showManager();
        notice(state.source === 'local' ? '已返回项目中心；编辑仍是未发布的本机草稿。' : '已返回项目中心；编辑仍是未保存的演示草稿。');
        refreshStoreNotice();
      }
    }
    catch (error) { notice(`未返回项目中心，当前编辑已保留：${error.message}`, true); }
  }, true);
  window.addEventListener('beforeunload', e => {
    // Never claim an unload-time save: asynchronous browser shutdown writes are not reliable.
    if (!formalReadonly && isDirty()) { e.preventDefault(); e.returnValue = ''; }
  });
  refreshStoreNotice();
  if (/[?&#](?:p001Handoff|handoff|nonce|selectionResult)(?:=|&|#|$)/i.test(`${location.search}${location.hash}`)) notice('检测到旧正式流程返回参数；本原型不会自动应用结果。结果仍保留在原 V2 存储或暂存，请回到原 V2 页面处理。', true);
  const originalShowWorkspace = showWorkspace;
  showWorkspace = function (index = 0) { originalShowWorkspace(index); $('homeBtn').hidden=false; const actions = document.querySelector('.top .actions'); const partsLink = $('partsLibraryBtn'); if (actions && partsLink) { actions.prepend($('homeBtn')); actions.prepend(partsLink); } ['newUnitBtn','saveBtn','drawBtn'].forEach(id=>{ $(id).hidden=true; }); $('workspaceToolbarTitle').textContent=$('crumb').textContent.replace(/^独立演示\s*\/\s*/,'')||'当前项目 / 当前机组'; const infoStage = document.querySelector('.stage[data-stage="机组资料"]'); if (infoStage) infoStage.click(); };
  showManager();
})();






