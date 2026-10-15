(function () {
  'use strict';
  const M = window.AHUProjectModel;
  const H = window.AHUSelectionHandoff;
  const STORAGE_KEY = 'p001-ahu-project-v2', PROJECT_INDEX_KEY = 'p001-ahu-project-index-v2', SESSION_KEY = 'p001-ahu-session-v1', SESSION_TTL = 8 * 60 * 60 * 1000;
  const labels = {
    airVolume:'风量',freshAirRatio:'新风比',winterOutdoorDryBulb:'空调计算干球温度',outdoorRH:'空调计算相对湿度',summerOutdoorDryBulb:'空调计算干球温度',outdoorWetBulb:'空调计算湿球温度',
    indoorDryBulb:'室内干球温度',indoorRH:'室内相对湿度',sourceType:'冷热源类型（兼容）',coldSourceType:'冷源类型',hotSourceType:'热源类型',unitEnvironment:'机组环境类型',chilledWaterIn:'冷水供水温度',chilledWaterOut:'冷水回水温度',hotWaterIn:'热水供水温度',hotWaterOut:'热水回水温度',
    externalPressure:'机外余压',cabinetWidth:'箱体宽度',cabinetHeight:'箱体高度',maxWidth:'最大安装宽度',maxHeight:'最大安装高度'
  };
  let project = M.createProject({withUnit:false}), selectedId = null, dragged = null, sessionUser = null, wizardStep = 1, wizardDraft = {};
  const pendingSelectorWindows = new Map(), HANDOFF_PENDING_PREFIX = 'p001-ahu-selection-pending-v1:', HANDOFF_RETURN_KEY = 'p001-ahu-selection-return-v1';
  const $ = id => document.getElementById(id);
  const outdoorCodes = new Set(['winterOutdoorDryBulb','outdoorRH','summerOutdoorDryBulb','outdoorWetBulb']);
  const projectCodes = new Set(['winterOutdoorDryBulb','outdoorRH','summerOutdoorDryBulb','outdoorWetBulb','indoorDryBulb','indoorRH','sourceType','coldSourceType','hotSourceType','unitEnvironment','chilledWaterIn','chilledWaterOut','hotWaterIn','hotWaterOut']);
  const conditionGroups = [
    { id:'air', title:'风量与压力', note:'整机基础设计参数', icon:'01', codes:['airVolume','freshAirRatio','externalPressure'] },
    { id:'outdoor', title:'室外工况', note:'仅采用冬季干球/RH、夏季干球/湿球；夏季不采用相对湿度', icon:'02', codes:['outdoorSummary'], action:true },
    { id:'indoor', title:'室内工况', note:'室内设计空气状态', icon:'03', codes:['indoorDryBulb','indoorRH'] },
    { id:'source', title:'冷热源条件', note:'项目冷热源类型与进回水条件', icon:'04', codes:['sourceType','coldSourceType','hotSourceType','unitEnvironment','chilledWaterIn','chilledWaterOut','hotWaterIn','hotWaterOut'] },
    { id:'cabinet', title:'箱体尺寸', note:'候选截面与现场安装限制', icon:'05', codes:['cabinetWidth','cabinetHeight','maxWidth','maxHeight'] }
  ];

  function outdoorSummaryMarkup(setup){
    const c=setup?project.project.conditions:project.designConditions;
    const value=code=>c[code]?.value ?? '—';
    const source=c.winterOutdoorDryBulb?.source || '项目默认';
    return '<div class="outdoor-summary"><div><strong>冬季空调</strong><span>'+value('winterOutdoorDryBulb')+' ℃干球 / '+value('outdoorRH')+' %RH</span></div><div><strong>夏季空调</strong><span>'+value('summerOutdoorDryBulb')+' ℃干球 / '+value('outdoorWetBulb')+' ℃湿球</span></div><small>来源：'+source+' · 点击“修改室外工况”调整</small></div>';
  }

  let partLibrarySnapshot=null;
  let partLibraryRefreshPromise=null,lastPartLibraryRefreshAt=0;
  function readPartLibrary() {
    if(Array.isArray(partLibrarySnapshot?.parts))return partLibrarySnapshot.parts;
    try {
      const raw = localStorage.getItem('p001-ahu-part-library-v2') || localStorage.getItem('p001-ahu-part-library-v1');
      const data = raw ? JSON.parse(raw) : null;
      return Array.isArray(data?.parts) ? data.parts : [];
    } catch { return []; }
  }
  function refreshPartLibrary(){
    if(partLibraryRefreshPromise)return partLibraryRefreshPromise;
    const store=window.AHUPartLibraryStore;if(!store?.loadEffectiveSnapshot)return Promise.resolve(null);
    partLibraryRefreshPromise=(async()=>{
      const categories=(()=>{try{return JSON.parse(localStorage.getItem('p001-ahu-part-categories-v1')||'[]')}catch{return []}})();
      const snapshot=await store.loadEffectiveSnapshot(categories);partLibrarySnapshot=snapshot;
      window.P001SharedPartSnapshot=snapshot;
      updateExistingSegmentPartPicker();
      window.dispatchEvent(new CustomEvent('p001-part-library-updated',{detail:snapshot}));
      return snapshot;
    })().finally(()=>{lastPartLibraryRefreshAt=Date.now();partLibraryRefreshPromise=null;});
    return partLibraryRefreshPromise;
  }
  function refreshPartLibraryWhenVisible(){if(document.visibilityState==='hidden'||Date.now()-lastPartLibraryRefreshAt<1000)return;refreshPartLibrary().catch(error=>console.warn('读取共享零件库失败',error));}
  window.addEventListener('focus',refreshPartLibraryWhenVisible);
  document.addEventListener('visibilitychange',refreshPartLibraryWhenVisible);
  function renderSegmentPartPicker() {
    const segment = project.segments.find(item=>item.id===selectedId), detail=$('segmentDetail');
    if(!segment || !detail) return;
    const current=segment.interface.selection.partRef?.partId||'';
    const parts=readPartLibrary(), wrapper=document.createElement('div');
    wrapper.className='detail-box segment-part-picker';
    const source=partLibrarySnapshot?.source==='shared'?`当前零件来源：共享库修订 ${escapeHtml(partLibrarySnapshot.revision)}`:partLibrarySnapshot?.unavailable?'共享库不可用，当前回退到本浏览器数据':'当前零件来源：本浏览器数据';
    wrapper.innerHTML=`<h3>关联 3D 零件</h3><label>零件库图块 <select id="segmentPartId"><option value="">暂不关联</option>${parts.map(part=>`<option value="${escapeHtml(part.id)}" ${part.id===current?'selected':''}>${escapeHtml(part.name||part.id)}${part.model?' · '+escapeHtml(part.model):''}</option>`).join('')}</select></label><p class="muted" data-part-library-source>按稳定零件 ID 引用；${source}。项目中已保存的零件引用保持原样。</p>`;
    detail.querySelector('.detail-grid')?.appendChild(wrapper);
    const picker=wrapper.querySelector('#segmentPartId');
    picker?.addEventListener('change',event=>{const part=parts.find(item=>item.id===event.target.value);if(part)M.linkPartToSegment(project,segment.id,part);else M.unlinkPartFromSegment(project,segment.id);project.project.updatedAt=new Date().toISOString();renderAll();});
  }
  function updateExistingSegmentPartPicker(){
    const wrapper=$('segmentDetail')?.querySelector('.segment-part-picker');if(!wrapper)return;
    const picker=wrapper.querySelector('#segmentPartId');if(!picker)return;
    const pendingValue=picker.value,parts=readPartLibrary();
    const exists=parts.some(part=>part.id===pendingValue);
    picker.innerHTML='<option value="">暂不关联</option>'+parts.map(part=>`<option value="${escapeHtml(part.id)}">${escapeHtml(part.name||part.id)}${part.model?' · '+escapeHtml(part.model):''}</option>`).join('')+(!exists&&pendingValue?`<option value="${escapeHtml(pendingValue)}">当前引用 ${escapeHtml(pendingValue)}（共享库中未找到）</option>`:'');
    picker.value=pendingValue;
    const source=partLibrarySnapshot?.source==='shared'?`当前零件来源：共享库修订 ${escapeHtml(partLibrarySnapshot.revision)}`:partLibrarySnapshot?.unavailable?'共享库不可用，当前回退到本浏览器数据':'当前零件来源：本浏览器数据';
    const note=wrapper.querySelector('[data-part-library-source]');if(note)note.textContent=`按稳定零件 ID 引用；${source}。项目中已保存的零件引用保持原样。`;
  }
  function renderField(code,prefix='p') {
    if(code==='outdoorSummary') return outdoorSummaryMarkup(prefix.startsWith('setup-'));
    const setup=prefix.startsWith('setup-'), item=setup ? (project.project.conditions[code] || project.project.templates[code]) : project.designConditions[code], control=item.options?`<select id="${prefix}-${code}" data-code="${code}">${item.options.map(option=>`<option ${option===item.value?'selected':''}>${option}</option>`).join('')}</select>`:`<input id="${prefix}-${code}" data-code="${code}" type="number" value="${item.value}" min="${item.range.min}" max="${item.range.max}">`;
    const meta=!setup?M.activeUnit(project).conditionMeta?.[code]:null, shared=!setup && (M.publicCodes.has(code) || M.unitTemplateCodes.has(code)), projectItem=project.project.conditions[code] || project.project.templates[code], status=meta?(shared?` · ${meta.inheritMode==='overridden'?'机组级覆盖':'继承项目值'}`:' · 机组级'):'', comparison=shared&&meta?` · 项目值：${escapeHtml(projectItem?.value ?? meta.projectValue ?? '')} · 本机有效值：${escapeHtml(meta.effectiveValue ?? item.value)}`:'', restore=meta&&shared&&meta.inheritMode==='overridden'?`<button type="button" class="restore-field" data-code="${code}">恢复项目值</button>`:'';
    return `<div class="field"><label for="${prefix}-${code}">${labels[code] || code}${item.required?' *':''}</label><div class="value-row">${control}<span class="unit">${item.unit||''}</span></div><span class="source">来源：${item.source}${status}${comparison}</span>${restore}</div>`;
  }

  function visibleConditionCodes(group,setup){return (group.codes||[]).filter(code=>!setup||!['sourceType','coldSourceType','hotSourceType'].includes(code));}
  function conditionMarkup(prefix,setup=false){
    return conditionGroups.filter(group=>!setup||!['cabinet','air'].includes(group.id)).map(group=>{
      const actions=group.action?('<div class="group-actions">'+(setup?'':'<button type="button" id="openOutdoorDatabase" class="link-button">数据库维护</button>')+'<button type="button" id="'+(setup?'setupOpenOutdoorManual':'openOutdoorManual')+'" class="link-button">修改室外工况</button><button type="button" id="'+(setup?'setupOpenOutdoorDialog':'openOutdoorDialog')+'" class="link-button">选择地区工况</button></div>'):'';
      const fields=group.sections?'<div class="season-fields">'+group.sections.map(section=>'<section><h4>'+section.title+'</h4><div class="group-fields">'+section.codes.map(code=>renderField(code,prefix)).join('')+'</div></section>').join('')+'</div>':'<div class="group-fields">'+visibleConditionCodes(group,setup).map(code=>renderField(code,prefix)).join('')+'</div>';
      return '<section class="condition-group group-'+group.id+'"><header><span class="group-index">'+group.icon+'</span><div><h3>'+group.title+'</h3><p>'+group.note+'</p></div>'+actions+'</header>'+fields+'</section>';
    }).join('');
  }
  function bindConditionInputs(container){const isSetup=container.id==='setupConditionGrid';container.querySelectorAll('input[data-code],select[data-code]').forEach(input=>input.addEventListener('change',event=>{const code=event.target.dataset.code, previous=isSetup?(project.project.conditions[code]||project.project.templates[code])?.value:project.designConditions[code]?.value, isProjectCondition=isSetup&&projectCodes.has(code), isTemplate=isSetup&&['airVolume','freshAirRatio','externalPressure'].includes(code);if((isProjectCondition||isTemplate)&&String(previous)!==String(event.target.value)){const affected=project.project.units.filter(unit=>unit.conditionMeta?.[code]?.inheritMode==='inherited').length;if(!window.confirm('变更将影响 '+affected+' 台继承该字段的机组，并标记待重算。是否确认？')){event.target.value=previous;return;}}if(isProjectCondition)M.updateProjectCondition(project,code,event.target.value,outdoorCodes.has(code)?'项目级人工调整':'项目输入');else if(isTemplate)M.updateProjectTemplate(project,code,event.target.value,'项目模板');else M.updateParameter(project,code,event.target.value,outdoorCodes.has(code)?'机组级人工覆盖':'用户输入');renderAll();renderProjectSetup();}));}

  function renderConditions() {
    $('projectName').value = project.project.name; $('unitNo').value = M.activeUnit(project).unitNo; $('unitSelect').innerHTML=project.project.units.map(unit=>`<option value="${unit.unitId}" ${unit.unitId===project.activeUnitId?'selected':''}>${escapeHtml(unit.unitNo)}</option>`).join('');
    $('conditionGrid').innerHTML=conditionMarkup('p');bindConditionInputs($('conditionGrid'));
    $('conditionGrid').querySelectorAll('.restore-field').forEach(button=>button.onclick=()=>{M.restoreProjectParameter(project,button.dataset.code);renderAll();});
    $('openOutdoorDialog').addEventListener('click',openOutdoorDialog);
    $('openOutdoorDatabase').addEventListener('click',()=>window.OutdoorDatabaseManager.open());
  }

  function renderUnitOverview(){
    const unit=M.activeUnit(project),p=unit.profile||{},a=p.airflow||{},pressure=p.pressure||{},capacity=p.capacityRequirements||{},returns=p.returnConditions||{},connection=p.connection||{},installation=p.installation||{},recommendation=p.recommendation||{},c=project.designConditions,show=(value,unitText='')=>value===''||value==null?'—':escapeHtml(value)+(unitText?' '+unitText:'');
    const fact=(label,value)=>'<div class="overview-fact"><small>'+label+'</small><strong>'+show(value)+'</strong></div>',metric=(label,value,unitText)=>'<div class="overview-metric"><span>'+label+'</span><b>'+show(value,unitText)+'</b></div>';
    $('unitOverviewContent').innerHTML='<div class="overview-facts">'+fact('设备编号',unit.unitNo)+fact('产品名称',p.productName)+fact('安装型式',p.unitType)+fact('冷源形式',p.coldSource)+fact('面板',p.panelType+(p.panelThickness?' · '+p.panelThickness+' mm':''))+fact('客户编号',p.customerUnitNo)+'</div><div class="overview-grid"><section><h3>风量</h3>'+metric('送风量',a.supply||c.airVolume?.value,'m³/h')+metric('新风量',a.fresh,'m³/h')+metric('回风量',a.return,'m³/h')+metric('排风量',a.exhaust,'m³/h')+metric('二次回风量',a.secondaryReturn,'m³/h')+'</section><section><h3>风机与风压</h3>'+metric('送风机',pressure.supplySelection)+metric('送风外余压',pressure.supply||c.externalPressure?.value,'Pa')+metric('回/排风机',pressure.returnSelection)+metric('回/排风外余压',pressure.return,'Pa')+metric('海拔高度',p.altitude,'m')+'</section><section><h3>能力需求</h3>'+metric('制冷量',capacity.cooling,'kW')+metric('制热量',capacity.heating,'kW')+metric('电加热量',capacity.electricHeat,'kW')+metric('再冷量',capacity.recooling,'kW')+metric('再热量',capacity.reheat,'kW')+metric('加湿量',capacity.humidification,'kg/h')+'</section><section class="overview-conditions"><h3>设计工况</h3><div class="overview-condition-head"><span></span><b>夏季</b><b>冬季</b></div><div class="overview-condition-row"><span>新风干球</span><b>'+show(c.summerOutdoorDryBulb?.value,'℃')+'</b><b>'+show(c.winterOutdoorDryBulb?.value,'℃')+'</b></div><div class="overview-condition-row"><span>新风湿球 / RH</span><b>'+show(c.outdoorWetBulb?.value,'℃')+'</b><b>'+show(c.outdoorRH?.value,'%')+'</b></div><div class="overview-condition-row"><span>回风干球</span><b>'+show(returns.summerDryBulb,'℃')+'</b><b>'+show(returns.winterDryBulb,'℃')+'</b></div><div class="overview-condition-row"><span>回风相对湿度</span><b>'+show(returns.summerRH,'%')+'</b><b>'+show(returns.winterRH,'%')+'</b></div></section></div><div class="overview-lower"><section class="overview-sequence"><h3>功能段预选</h3><span class="sequence-mode">'+(p.sequence?.mode==='custom'?'自定义':'预定义')+'</span><strong>'+show(p.sequence?.preset)+'</strong></section><section class="overview-interface"><h3>接口与安装</h3><div>'+fact('接管方向',connection.direction)+fact('双列集管',connection.headerSide)+fact('检修方向',connection.accessDirection)+fact('运输方式',installation.transportMode)+fact('安装位置',installation.location)+fact('长度限制',show(installation.maxLength,'mm'))+'</div></section></div><div class="recommendation-bar">'+fact('风机形式',p.fanType)+fact('盘管迎面风速',show(recommendation.coilFaceVelocity,'m/s'))+fact('换热管径',show(recommendation.tubeDiameter,'mm'))+fact('指定排数',recommendation.coilRows||'系统推荐')+fact('宽度限制',show(c.maxWidth?.value,'mm'))+fact('高度限制',show(c.maxHeight?.value,'mm'))+'</div><div class="candidate-table"><div class="candidate-heading"><div><h3>机组型号与性能结果</h3><small>完成各专业段选型和整机校核后生成</small></div><span>0 个候选结果</span></div><div class="candidate-scroll"><table><thead><tr><th>机组型号</th><th>推荐</th><th>宽度模数</th><th>高度模数</th><th>盘管风速</th><th>换热管径</th><th>盘管排数</th><th>有效长度</th><th>功能段状态</th><th>安装型式</th></tr></thead><tbody><tr><td colspan="10" class="candidate-empty">尚未执行专业选型，当前仅保存设计输入。</td></tr></tbody></table></div></div>';
  }

  let centerProjectId=null, showDeletedProjects=false, creatingProjectDraft=false, centerDirty=false;
  function blockForUnsavedCenter(action){if(!centerDirty)return false;$('setupMessage').textContent=`请先保存当前项目信息，再${action}。`;return true;}
  function renderProjectSetup(){
    $('projectCenterTitle').textContent=project.project.name||'未命名项目';$('projectCenterSubtitle').textContent=(project.project.projectCode||'未填写项目编号')+' · '+(project.project.customerName||'未填写客户');
    $('setupProjectName').value=project.project.name;$('setupProjectCode').value=project.project.projectCode||'';$('setupCreatedDate').value=project.project.createdDate||new Date().toISOString().slice(0,10);$('setupCustomerName').value=project.project.customerName||'';$('setupBusinessOwner').value=project.project.businessOwner||'';$('setupTechnicalSupport').value=project.project.technicalSupport||'';$('setupContactInfo').value=project.project.contactInfo||'';$('setupProjectAddress').value=project.project.projectAddress||'';$('setupLocationName').value=project.project.locationName||'';$('setupWeatherRegion').value=project.project.weatherRegion||'';$('setupAltitude').value=project.project.altitude??'';
    $('setupConditionGrid').innerHTML=conditionMarkup('setup-p',true);bindConditionInputs($('setupConditionGrid'));
    $('setupConditionGrid').querySelector('#setupOpenOutdoorDialog')?.addEventListener('click',openOutdoorDialog);$('setupConditionGrid').querySelector('#setupOpenOutdoorManual')?.addEventListener('click',()=>openOutdoorManual(true));$('projectRestore').hidden=!project.project.deletedAt;$('projectDelete').hidden=!!project.project.deletedAt;$('projectNewUnit').disabled=!!project.project.deletedAt;
  }

  function showProjectSetup(reset=false){if(reset){project=M.createProject({withUnit:false});selectedId=null;creatingProjectDraft=true;centerDirty=false;}centerProjectId=project.project.projectId;showDeletedProjects=false;renderProjectSetup();$('setupMessage').textContent='';$('projectSetupScreen').hidden=true;$('projectManagerScreen').hidden=false;}

  const getOutdoorDatabase=()=>window.OutdoorDatabaseManager?.getDatabase()||window.AHUOutdoorConditions;

  function openOutdoorManual(setup){
    const c=setup?project.project.conditions:project.designConditions;
    $('manualWinterOutdoorDryBulb').value=c.winterOutdoorDryBulb?.value??'';
    $('manualOutdoorRH').value=c.outdoorRH?.value??'';
    $('manualSummerOutdoorDryBulb').value=c.summerOutdoorDryBulb?.value??'';
    $('manualOutdoorWetBulb').value=c.outdoorWetBulb?.value??'';
    $('saveManualOutdoor').onclick=()=>{
      const affected=project.project.units.filter(unit=>unit.conditionMeta?.winterOutdoorDryBulb?.inheritMode==='inherited'||unit.conditionMeta?.summerOutdoorDryBulb?.inheritMode==='inherited').length;
      if(affected&&!window.confirm('修改将影响 '+affected+' 台继承机组，是否确认？'))return;
      [['winterOutdoorDryBulb','manualWinterOutdoorDryBulb'],['outdoorRH','manualOutdoorRH'],['summerOutdoorDryBulb','manualSummerOutdoorDryBulb'],['outdoorWetBulb','manualOutdoorWetBulb']].forEach(([code,id])=>{
        const value=$(id).value;
        if(value!=='')M.updateProjectCondition(project,code,value,'项目级人工调整','室外工况弹窗修改');
      });
      $('outdoorEditDialog').close(); renderAll(); renderProjectSetup();
    };
    $('outdoorEditDialog').showModal();
  }
  function openOutdoorDialog(){
    const data=getOutdoorDatabase();
    $('outdoorNotice').textContent=data.source.note;
    const provinces=[...new Set(data.locations.map(item=>item.province))];
    $('provinceSelect').innerHTML=provinces.map(value=>`<option>${value}</option>`).join('');
    $('provinceSelect').onchange=refreshCities;
    $('citySelect').onchange=renderOutdoorPreview;
    refreshCities();$('outdoorDialog').showModal();
  }
  function refreshCities(){
    const province=$('provinceSelect').value,locations=getOutdoorDatabase().locations.filter(item=>item.province===province);
    $('citySelect').innerHTML=locations.map(item=>`<option value="${item.city}">${item.city}</option>`).join('');renderOutdoorPreview();
  }
  function selectedOutdoor(){
    const location=getOutdoorDatabase().locations.find(item=>item.province===$('provinceSelect').value&&item.city===$('citySelect').value);
    return location;
  }
  function renderOutdoorPreview(){
    const location=selectedOutdoor(),values=[location.winterAirConditioningTemperature,location.winterAirConditioningRH,location.summerAirConditioningDryBulb,location.summerAirConditioningWetBulb];
    const show=(value,unit)=>value==null?'资料未提供':`${value} ${unit}`;
    $('outdoorPreview').innerHTML=`<span>${location.province} · ${location.city}<small>${location.station||'无台站名称'} · ${location.statisticsPeriod||'统计期未提供'}</small></span><div><b>${show(values[0],'℃')}</b><small>冬季空调干球</small></div><div><b>${show(values[1],'%')}</b><small>冬季空调相对湿度</small></div><div><b>${show(values[2],'℃')}</b><small>夏季空调干球</small></div><div><b>${show(values[3],'℃')}</b><small>夏季空调湿球</small></div>`;
    $('applyOutdoor').disabled=values.some(value=>value==null);
  }

  function renderLibrary() {
    $('segmentPalette').innerHTML=M.SEGMENT_LIBRARY.map(item=>`<button type="button" class="palette-card" draggable="true" data-type="${item.type}" title="拖入中间段序画布"><strong>＋ ${item.name}</strong><small>${item.category}</small></button>`).join('');
    $('segmentPalette').querySelectorAll('[data-type]').forEach(card=>card.addEventListener('dragstart',()=>{dragged={kind:'new',type:card.dataset.type};}));
  }
  function renderChain() {
    $('segmentChain').innerHTML = project.segments.map((segment,index) => `<button class="segment-card ${segment.id===selectedId?'selected':''} ${segment.enabled?'':'disabled'}" data-id="${segment.id}" data-status="${segment.interface.selection.model?'normal':'warning'}" draggable="true"><span class="order">${String(index+1).padStart(2,'0')}</span><strong>${segment.name}</strong><span>${segment.selectionLevel} · ${segment.enabled?'启用':'停用'}</span></button>`).join('');
    $('segmentChain').querySelectorAll('.segment-card').forEach(card => {
      card.addEventListener('click',()=>{selectedId=card.dataset.id;renderChain();renderDetail();});
      card.addEventListener('dragstart',()=>{dragged={kind:'existing',id:card.dataset.id};});
      card.addEventListener('dragover',event=>event.preventDefault());
      card.addEventListener('drop',event=>{event.preventDefault();const target=project.segments.findIndex(s=>s.id===card.dataset.id);if(dragged?.kind==='new'){const added=M.addSegment(project,dragged.type,target);selectedId=added.id;}else if(dragged?.kind==='existing')M.moveSegment(project,dragged.id,target);dragged=null;renderAll();});
    });
    const count=$('canvasSegmentCount');if(count)count.textContent=`${project.segments.length} 个功能段 · ${project.segments.filter(s=>s.enabled).length} 个启用`;
    renderDrawing();
  }

  function renderDrawing(){
    const target=$('engineeringDrawing'),segments=project.segments.filter(segment=>segment.enabled),unit=M.activeUnit(project);
    if(!target)return;
    const lengthOf=segment=>{const value=segment.interface?.drawing?.length;return value===''||value==null||!Number.isFinite(Number(value))?null:Number(value);};
    const lengths=segments.map(lengthOf),total=lengths.every(value=>value!==null)?lengths.reduce((sum,value)=>sum+value,0):null;
    const widthValue=project.designConditions.cabinetWidth?.value,heightValue=project.designConditions.cabinetHeight?.value;
    const dimension=value=>value===null||value===undefined||value===''?'未提供':`${escapeHtml(value)} mm`;
    if(!segments.length){target.innerHTML='<div class="review-interface-empty">当前机组没有启用的功能段。</div>';renderInterfaceReview();return;}
    const x0=62,drawW=1056,y=88,bodyH=108,weightSum=total&&total>0?total:segments.length;
    let x=x0,shapes='';
    segments.forEach((segment,index)=>{
      const len=lengths[index],ratio=weightSum>0?(total&&total>0?(len||0)/weightSum:1/segments.length):1/segments.length;
      const segmentWidth=Math.max(24,drawW*ratio),selected=segment.id===selectedId,shownLength=len===null?'段长未提供':`保存段长 ${len} mm`;
      shapes+=`<rect class="drawing-segment ${selected?'selected':''}" x="${x}" y="${y}" width="${segmentWidth}" height="${bodyH}" rx="1"/><text x="${x+segmentWidth/2}" y="${y+47}" text-anchor="middle" font-size="${Math.max(8,Math.min(12,segmentWidth/8))}">${escapeHtml(segment.name)}</text><text class="drawing-dim" x="${x+segmentWidth/2}" y="${y+68}" text-anchor="middle">${escapeHtml(shownLength)}</text>`;
      x+=segmentWidth;
    });
    target.innerHTML=`<svg viewBox="0 0 1180 270" role="img" aria-label="依据当前项目功能段长度绘制的机组示意"><defs><marker id="engineeringFlowArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="#168c9b"/></marker></defs><text x="${x0}" y="25" font-size="13" font-weight="700">${escapeHtml(unit.unitNo)} · ${escapeHtml(project.project.name)}</text><text x="${x0+drawW}" y="25" text-anchor="end" font-size="9" class="drawing-dim">工程示意 · 非制造图</text><line class="drawing-air" x1="${x0+12}" y1="59" x2="${x0+drawW-14}" y2="59" marker-end="url(#engineeringFlowArrow)"/><text x="${x0+drawW/2}" y="51" text-anchor="middle" font-size="9" fill="#147f91">Y轴 · 段长 / 气流方向</text><rect class="drawing-outline" x="${x0}" y="${y}" width="${drawW}" height="${bodyH}"/>${shapes}<text class="drawing-dim" x="${x0}" y="${y+bodyH+22}">X宽 ${dimension(widthValue)}　 Z高 ${dimension(heightValue)}　 Y总段长 ${total===null?'未完整提供':`${total} mm`}</text></svg>`;
    renderInterfaceReview();
  }

  function renderInterfaceReview(){
    const list=$('reviewInterfaceList'),status=$('reviewConnectionStatus'),segment=project.segments.find(item=>item.id===selectedId);
    if(!list||!status)return;
    if(!segment){status.textContent='未选择功能段';list.innerHTML='<div class="review-interface-empty">选择功能段后查看其接口记录。</div>';return;}
    const drawing=segment.interface?.drawing||{},connections=Array.isArray(drawing.connections)?drawing.connections:[],connectionStatus=drawing.connectionsStatus;
    status.textContent=connections.length?`${connections.length} 条保存记录`:connectionStatus==='none'?'已标记无接口':connectionStatus==='defined'?'待补充接口记录':'待确认 · 暂无记录';
    if(!connections.length){list.innerHTML=`<div class="review-interface-empty">${connectionStatus==='none'?'此段已明确标记无接口。':'此段暂无接口记录；请按实际图纸补充并确认。'}</div>`;return;}
    const shown=(value,unit='')=>value===undefined||value===null||value===''?'未提供':`${escapeHtml(value)}${unit}`;
    list.innerHTML=`<table class="review-connection-table"><thead><tr><th>名称</th><th>面</th><th>尺寸</th><th>位置 X / Y / Z</th></tr></thead><tbody>${connections.map(connection=>`<tr><td>${shown(connection?.name)}</td><td>${shown(connection?.face)}</td><td>${shown(connection?.width,' mm')} × ${shown(connection?.height,' mm')}</td><td>${shown(connection?.x)} / ${shown(connection?.y)} / ${shown(connection?.z)} mm</td></tr>`).join('')}</tbody></table>`;
  }

  function professionalRuleMarkup(segment) {
    const filter = /filter/.test(segment.type), coil = segment.type === 'cooling-coil';
    if (segment.type === 'heating-coil') return '<section class="selection-principle"><strong>加热盘管：L1 人工 / 待资料</strong><p>当前 25W 标准盘管规则仅适用于表冷器。加热盘管的选型规则和适用数据库尚未确认，因此不开放专业选型入口，也不会生成自动型号。</p><small>后续需补充加热盘管专用规则与标准资料，并经复核后再接入 L2 回写。</small></section>';
    if (!filter && !coil) return '';
    const rule = filter
      ? '<strong>过滤器原则（L2）</strong><p>按过滤形式、过滤器类型和箱体宽高模数查询标准排布表；仅支持数据库覆盖的 6–33M 且箱体尺寸可整除 100 mm。工作台尺寸自动带入，过滤形式和类型由专业人员确认。</p><small>来源：过滤器模块当前生效数据库。该逻辑输出排布规格与数量，不代表过滤效率或压降性能校核。</small>'
      : '<strong>表冷器原则（L2）</strong><p>仅按 25W 标准表、安装形式、箱体规格、排数、换热管径和汇管径查表；不适用于 50W 或非标箱体。尺寸冲突、数据库无记录或管径不符时不生成正式型号。</p><small>来源：QHB-J02.577-2026A §2.5.11 标准表及子模块当前生效数据库。这里只选几何参考型号，不计算制冷量、风阻、水流量或水阻。</small>';
    return `<section class="selection-principle">${rule}</section>`;
  }
  function professionalResultMarkup(segment) {
    const record = segment.interface.selection.professionalResult;
    if (!record) return `<p class="muted">当前为 L1 人工选型；手工录入型号不会被标记成自动规则结果。</p>`;
    const currentUnit=M.activeUnit(project),currentFingerprint=currentUnit?H.makeContext(project,currentUnit,segment,'display').workbenchFingerprint:'',stale=currentFingerprint!==record.workbenchFingerprint;
    const warnings = [...(record.warnings || []), ...(stale?['工作台关键输入已变化；当前规则结果已过期，请重新执行专业选型。']:[])].map(item => `<li>${escapeHtml(item)}</li>`).join('');
    return `<section class="professional-result"><strong>${stale?'L2 结果已过期 · 需重选':record.status === 'selected' ? 'L2 规则选型已应用' : 'L2 规则结果'}</strong><p>型号：${escapeHtml(record.model)}<br>来源：${escapeHtml(record.source)}<br>规则：${escapeHtml(record.rule?.id)} · ${escapeHtml(record.rule?.version)}<br>选型时间：${escapeHtml(record.selectedAt)}</p>${warnings ? `<ul>${warnings}</ul>` : '<small>规则结果无待复核警告。</small>'}</section>`;
  }
  function renderDetail() {
    const segment = project.segments.find(item=>item.id===selectedId);
    if(!segment){$('detailTitle').textContent='功能段参数';$('segmentDetail').className='empty-state';$('segmentDetail').textContent='点击一个功能段查看统一接口。';$('segmentActions').innerHTML='';return;}
    $('detailTitle').textContent=segment.name;
    $('segmentActions').innerHTML=`<button id="toggleSegment">${segment.enabled?'停用':'启用'}</button> <button id="copySegment">复制</button> <button id="deleteSegment">删除</button>`;
    $('segmentDetail').className='';
    const moduleNotice = segment.modulePath ? '<button id="openSelector" class="primary">打开专业选型模块</button>' : segment.type === 'heating-coil' ? '<p class="muted">L1 人工选型；待加热盘管专用规则和标准资料确认。表冷器模块不适用。</p>' : '<p class="muted">该功能段当前为 L1 手工选型。</p>';
    $('segmentDetail').innerHTML=`<div class="interface-tabs">${['Input','Calculation','Selection','Output','Validation','Drawing','BOM'].map(x=>`<span>${x}</span>`).join('')}</div>${professionalRuleMarkup(segment)}<div class="detail-grid"><div class="detail-box"><h3>输入参数</h3><p>风量：${project.designConditions.airVolume.value} ${project.designConditions.airVolume.unit}</p><p>箱体：${project.designConditions.cabinetWidth.value} × ${project.designConditions.cabinetHeight.value} mm</p></div><div class="detail-box"><h3>选型结果</h3><input id="segmentModel" value="${escapeHtml(segment.interface.selection.model)}" placeholder="L1 人工型号或 L2 专业规则结果"><p class="muted">当前等级：${segment.interface.selection.professionalResult?'L2 规则选型':'L1 人工选型'}</p>${professionalResultMarkup(segment)}</div><div class="detail-box"><h3>结构与下游接口</h3><label>段长 mm <input id="segmentLength" type="number" min="0" value="${segment.interface.drawing.length}"></label>${moduleNotice}</div></div>`;
    $('segmentModel').addEventListener('change',e=>{segment.interface.selection.model=e.target.value.trim();segment.interface.selection.source='人工输入';segment.interface.selection.level='L1';delete segment.interface.selection.professionalResult;delete segment.interface.output.automatedSelection;segment.interface.validation=(segment.interface.validation||[]).filter(item=>item?.code!=='professional-selection');segment.selectionLevel='L1';renderAll();});
    $('segmentLength').addEventListener('change',e=>{segment.interface.drawing.length=Math.max(0,Number(e.target.value)||0);renderAll();});
    $('toggleSegment').onclick=()=>{segment.enabled=!segment.enabled;renderAll();};
    $('deleteSegment').onclick=()=>{M.removeSegment(project,segment.id);selectedId=project.segments[0]?.id||null;renderAll();};
    $('copySegment').onclick=()=>{const copy=M.clone(segment);copy.id=`${segment.type}-${Date.now()}`;copy.name=`${segment.name}副本`;project.segments.splice(project.segments.indexOf(segment)+1,0,copy);selectedId=copy.id;renderAll();};
    if(segment.modulePath)$('openSelector').onclick=()=>launchProfessionalSelector(segment);
  }

  function launchProfessionalSelector(segment){
    const unit=M.activeUnit(project);if(!unit)return;
    if(location.origin==='null'){window.alert('专业选型回传需要通过本机工作台服务打开页面；file:// 模式无法建立同源回传。');return;}
    if(!canPersist('启动专业选型'))return;
    project.project.updatedAt=new Date().toISOString();
    if(!persistProjectSnapshot(project)){window.alert('启动专业选型前保存失败；原项目保持不变。');return;}
    const nonce=(crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random().toString(16).slice(2)}`),context=H.makeContext(project,unit,segment,nonce);context.persistenceRevision=Number(project.persistenceRevision)||0;
    const url=H.makeModuleUrl(segment.modulePath,context,location);
    try{sessionStorage.setItem(HANDOFF_PENDING_PREFIX+nonce,JSON.stringify(context));sessionStorage.setItem(HANDOFF_RETURN_KEY,JSON.stringify({projectId:unit.projectId,unitId:unit.unitId,segmentId:segment.id,nonce}));const child=window.open(url,'_blank');if(!child){sessionStorage.removeItem(HANDOFF_PENDING_PREFIX+nonce);sessionStorage.removeItem(HANDOFF_RETURN_KEY);window.alert('浏览器阻止了专业选型新窗口，请允许本机工作台打开页面后重试。');return;}pendingSelectorWindows.set(nonce,child);$('saveState').textContent='专业选型已启动；工作台输入快照已保存。';}
    catch(error){sessionStorage.removeItem(HANDOFF_PENDING_PREFIX+nonce);sessionStorage.removeItem(HANDOFF_RETURN_KEY);window.alert('启动专业选型失败：'+error.message);}
  }

  function findPending(nonce){try{return JSON.parse(sessionStorage.getItem(HANDOFF_PENDING_PREFIX+nonce)||'null');}catch{return null;}}
  function finishPending(nonce){sessionStorage.removeItem(HANDOFF_PENDING_PREFIX+nonce);const returning=JSON.parse(sessionStorage.getItem(HANDOFF_RETURN_KEY)||'null');if(returning?.nonce===nonce)sessionStorage.removeItem(HANDOFF_RETURN_KEY);pendingSelectorWindows.delete(nonce);}
  function restoreSelectionReturn(){
    let returning;try{returning=JSON.parse(sessionStorage.getItem(HANDOFF_RETURN_KEY)||'null');}catch{return false;}
    if(!returning?.projectId)return false;
    const item=readProjectIndex().find(entry=>entry.projectId===returning.projectId);if(!item?.project)return false;
    try{project=M.normalizeProject(item.project);if(!M.activateUnit(project,returning.unitId))return false;selectedId=returning.segmentId;renderAll();$('projectManagerScreen').hidden=true;$('projectSetupScreen').hidden=true;$('saveState').textContent='已恢复专业选型目标机组';return true;}catch{return false;}
  }
  function processSelectionResult(message){
    const nonce=message?.nonce,pending=findPending(nonce);if(!pending)return false;
    if(localStorage.getItem(H.ackKey(nonce))){finishPending(nonce);return true;}
    const wasCurrentTarget=project.project?.projectId===pending.target.projectId;const indexedBefore=readProjectIndex().find(item=>item.projectId===pending.target.projectId);const persistedRevision=Number(indexedBefore?.project?.persistenceRevision)||0;const expectedRevision=Number(pending.persistenceRevision)||0;
    if(!indexedBefore?.project||!H.revisionMatches(expectedRevision,persistedRevision)){const reason='项目已在其他工作台标签中保存了新版本；为保护已保存修改，专业选型结果未写入。请刷新工作台后重新执行专业选型。';$('saveState').textContent=reason;window.alert(reason);try{localStorage.removeItem(H.resultKey(nonce));localStorage.setItem(H.ackKey(nonce),JSON.stringify({status:'rejected',reason,processedAt:new Date().toISOString()}));}catch{}finishPending(nonce);return false;}
    let baseProject=wasCurrentTarget?project:M.normalizeProject(indexedBefore.project);
    const targetProject=M.clone(baseProject);if(targetProject.project?.projectId!==pending.target.projectId||!M.activateUnit(targetProject,pending.target.unitId)){return false;}
    let filterDatabase=null;try{if(message.result?.selector==='filter')filterDatabase=window.FilterDataIO?.load();}catch{}
    const verified=H.verify(targetProject,pending,message,{filterDatabase});if(!verified.ok){$('saveState').textContent=verified.reason;window.alert(verified.reason);try{localStorage.removeItem(H.resultKey(nonce));localStorage.setItem(H.ackKey(nonce),JSON.stringify({status:'rejected',reason:verified.reason,processedAt:new Date().toISOString()}));}catch{}finishPending(nonce);return false;}
    H.apply(targetProject,verified);const stamp=new Date().toISOString(),record={projectId:pending.target.projectId,unitId:pending.target.unitId,segmentId:pending.target.segmentId,action:'professional-selection.apply',selector:message.result.selector,rule:message.result.rule,source:message.result.source,workbenchFingerprint:pending.workbenchFingerprint,updatedAt:stamp};
    targetProject.audit ||= [];targetProject.audit.push(record);verified.unit.audit ||= [];verified.unit.audit.push(M.clone(record));targetProject.project.updatedAt=stamp;verified.unit.updatedAt=stamp;
    const oldRevision=Number(targetProject.persistenceRevision)||0;targetProject.persistenceRevision=oldRevision+1;
    const list=readProjectIndex().filter(item=>item.projectId!==targetProject.project.projectId);list.push({projectId:targetProject.project.projectId,project:M.clone(targetProject),status:targetProject.project.status||'编辑中'});
    const outboxKey=H.resultKey(nonce),previous={main:localStorage.getItem(STORAGE_KEY),index:localStorage.getItem(PROJECT_INDEX_KEY),ack:localStorage.getItem(H.ackKey(nonce)),outbox:localStorage.getItem(outboxKey)};
    try{if(wasCurrentTarget)localStorage.setItem(STORAGE_KEY,JSON.stringify(targetProject));localStorage.setItem(PROJECT_INDEX_KEY,JSON.stringify(list));localStorage.setItem(H.ackKey(nonce),JSON.stringify({status:'applied',projectId:record.projectId,unitId:record.unitId,segmentId:record.segmentId,appliedAt:stamp}));localStorage.removeItem(outboxKey);}
    catch(error){try{previous.main===null?localStorage.removeItem(STORAGE_KEY):localStorage.setItem(STORAGE_KEY,previous.main);previous.index===null?localStorage.removeItem(PROJECT_INDEX_KEY):localStorage.setItem(PROJECT_INDEX_KEY,previous.index);previous.ack===null?localStorage.removeItem(H.ackKey(nonce)):localStorage.setItem(H.ackKey(nonce),previous.ack);previous.outbox===null?localStorage.removeItem(outboxKey):localStorage.setItem(outboxKey,previous.outbox);}catch{}window.alert('保存专业选型结果失败，原项目及零件库未被覆盖：'+error.message);return false;}
    if(wasCurrentTarget){project=targetProject;selectedId=record.segmentId;renderAll();$('saveState').textContent='专业选型结果已应用并保存 · '+new Date(stamp).toLocaleTimeString();}else{$('saveState').textContent='专业选型已写入目标项目记录；当前打开的其他项目保持不变。';}finishPending(nonce);return true;
  }
  function receiveSelectionMessage(event){if(event.origin!==location.origin)return;const message=event.data;if(message?.protocol==='p001-selection-result-v1')processSelectionResult(message);}
  function receiveSelectionStorage(event){if(!event.key?.startsWith(H.OUTBOX)||!event.newValue)return;try{const message=JSON.parse(event.newValue);if(message.protocol==='p001-selection-result-v1')processSelectionResult(message);}catch{}}
  function replaySelectionResult(){const returning=JSON.parse(sessionStorage.getItem(HANDOFF_RETURN_KEY)||'null');if(!returning?.nonce)return;const message=H.readResult(localStorage,returning.nonce);if(message)processSelectionResult(message);}

  function persistedProject(projectId){return readProjectIndex().find(item=>item.projectId===projectId)?.project||null;}
  function hasPersistenceConflict(candidate){const saved=persistedProject(candidate.project.projectId);return saved?!H.revisionMatches(candidate.persistenceRevision,saved.persistenceRevision):!H.revisionMatches(candidate.persistenceRevision,0);}
  function persistProjectSnapshot(candidate,{allowDraft=false}={}){
    if(!canPersist('保存项目',{allowDraft}))return false;
    if(hasPersistenceConflict(candidate)){const reason='此项目已在其他工作台标签中保存了新版本；当前修改未覆盖已保存数据。请刷新或重新打开项目后再保存。';$('saveState').textContent=reason;window.alert(reason);return false;}
    const oldMain=localStorage.getItem(STORAGE_KEY),oldIndex=localStorage.getItem(PROJECT_INDEX_KEY),oldRevision=Number(candidate.persistenceRevision)||0,list=readProjectIndex().filter(item=>item.projectId!==candidate.project.projectId);
    candidate.persistenceRevision=oldRevision+1;
    list.push({projectId:candidate.project.projectId,project:M.clone(candidate),status:candidate.project.status||'编辑中'});
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(candidate));localStorage.setItem(PROJECT_INDEX_KEY,JSON.stringify(list));if(candidate.project.projectId===project.project.projectId){creatingProjectDraft=false;centerDirty=false;}return true;}
    catch(error){candidate.persistenceRevision=oldRevision;try{oldMain===null?localStorage.removeItem(STORAGE_KEY):localStorage.setItem(STORAGE_KEY,oldMain);oldIndex===null?localStorage.removeItem(PROJECT_INDEX_KEY):localStorage.setItem(PROJECT_INDEX_KEY,oldIndex);}catch{}$('saveState').textContent='保存失败：'+error.message;return false;}
  }

  function blockingIssues(){return M.validateAllUnits(project).filter(issue=>issue.level==='error');}
  function canPersist(action,{allowDraft=false}={}){const errors=allowDraft?[]:blockingIssues();if(errors.length){const message=action+'已阻断：'+errors.map(issue=>issue.message).join('；');if(!$('projectManagerScreen').hidden)$('setupMessage').textContent=message;else window.alert(message);return false;}return true;}
  function renderValidation() {
    const issues=M.validateProject(project), unit=M.activeUnit(project); if(unit.pendingRecalculation)issues.unshift({level:'warning',code:'pendingRecalculation',message:'项目条件已变更，当前机组待重算'}); const errors=issues.filter(i=>i.level==='error').length;
    $('validationCount').textContent=issues.length;
    $('validationList').innerHTML=(issues.length?issues:[{level:'normal',message:'当前基础校核通过'}]).map(issue=>`<div class="issue ${issue.level}"><strong>${issue.level==='error'?'✕ 禁止':issue.level==='warning'?'⚠ 警告':'✓ 正常'}</strong><br>${issue.message}</div>`).join('');
    const totalLength=project.segments.filter(s=>s.enabled).reduce((sum,s)=>sum+(Number(s.interface.drawing.length)||0),0);
    $('unitSummary').innerHTML=`<strong>整机摘要</strong><br>截面：${project.designConditions.cabinetWidth.value} × ${project.designConditions.cabinetHeight.value} mm<br>当前总长：${totalLength} mm<br>启用功能段：${project.segments.filter(s=>s.enabled).length}<br>状态：${errors?'存在禁止项':issues.length?'需要处理警告':'基础校核通过'}`;
  }
  function renderAll(){renderConditions();renderUnitOverview();renderChain();renderDetail();renderSegmentPartPicker();renderValidation();const unit=M.activeUnit(project);if(unit){$('sidebarUnitNo').textContent=unit.unitNo;$('sidebarProjectName').textContent=project.project.name;}window.dispatchEvent(new CustomEvent('p001:workbench-render'));}
  function escapeHtml(value){return String(value||'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
  function downloadProject(){if(!canPersist('导出项目'))return;const blob=new Blob([JSON.stringify(project,null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=''+(M.activeUnit(project).unitNo||'AHU')+'-选型项目.json';a.click();URL.revokeObjectURL(a.href);}
  function canonicalJson(value){if(Array.isArray(value))return `[${value.map(canonicalJson).join(',')}]`;if(value&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;return JSON.stringify(value);}
  function comparableProject(raw,unitId){const normalized=M.normalizeProject(JSON.parse(JSON.stringify(raw)));if(!M.activateUnit(normalized,unitId))throw new Error('当前活动机组尚未保存，请先保存项目后再输出。');return normalized;}
  function savedDrawingSnapshot(){
    const projectId=project.project?.projectId,unit=M.activeUnit(project),unitId=unit?.unitId;
    if(!projectId||!unitId)throw new Error('当前没有可导出的活动机组。');
    const entry=readProjectIndex().find(item=>item.projectId===projectId),saved=entry?.project;
    if(!saved)throw new Error('项目尚未保存到浏览器。请先点击“保存”，再生成图纸。');
    const currentRevision=Number(project.persistenceRevision)||0,savedRevision=Number(saved.persistenceRevision)||0;
    if(currentRevision!==savedRevision)throw new Error('检测到其他工作台标签已保存新版本。请重新读取最新项目后再输出。');
    const currentComparable=comparableProject(project,unitId),savedComparable=comparableProject(saved,unitId);
    if(canonicalJson(currentComparable)!==canonicalJson(savedComparable))throw new Error('当前项目有尚未保存的修改。请先点击“保存”，再生成图纸。');
    const mainRaw=localStorage.getItem(STORAGE_KEY);
    if(mainRaw){let main;try{main=JSON.parse(mainRaw);}catch{throw new Error('已保存项目记录无法安全读取，已停止输出。请重新读取项目后再试。');}if(main.project?.projectId===projectId){if((Number(main.persistenceRevision)||0)!==savedRevision)throw new Error('主保存记录与项目索引修订号不一致，已停止输出以保护其他标签的更新。请重新读取项目后再试。');let mainComparable;try{mainComparable=comparableProject(main,unitId);}catch{throw new Error('主保存记录与项目索引不一致，已停止输出以保护其他标签的更新。请重新读取项目后再试。');}if(canonicalJson(mainComparable)!==canonicalJson(savedComparable))throw new Error('主保存记录与项目索引内容不一致，已停止输出以保护其他标签的更新。请重新读取项目后再试。');}}
    return savedComparable;
  }
  function renderDrawingExport(){
    const output=$('drawingExportSnapshot'),missing=$('drawingExportMissing'),status=$('drawingExportStatus'),actions=[$('exportDrawingDxf'),$('exportDrawingPdf'),$('exportDrawingCsv')];
    status.textContent='';status.dataset.state='';missing.innerHTML='';
    try{
      const snapshot=savedDrawingSnapshot(),model=window.AHUDrawingExport.makeDrawingModel(snapshot);
      const chain=model.segments.length&&model.segments.every(segment=>Number.isFinite(segment.length)&&segment.length>0)
        ?`<div class="drawing-export-chain">${model.segments.map(segment=>`<div class="drawing-export-segment" style="flex:${segment.length}" title="${escapeHtml(segment.name)} · ${segment.length} mm">${escapeHtml(segment.name)}</div>`).join('')}</div>`
        :'<div class="drawing-export-chain-note">段长数据不完整，图纸保留标准图框与数据表，不生成按比例的段链图。</div>';
      output.innerHTML=`<section class="drawing-export-card"><h3>当前已保存项目</h3><dl><dt>项目</dt><dd>${escapeHtml(model.project.name)}</dd><dt>项目编号</dt><dd>${escapeHtml(model.project.code)}</dd><dt>客户</dt><dd>${escapeHtml(model.project.customer)}</dd><dt>当前机组</dt><dd>${escapeHtml(model.unit.no)}</dd><dt>项目 / 机组 ID</dt><dd>${escapeHtml(model.project.id)} / ${escapeHtml(model.unit.id)}</dd><dt>数据修订</dt><dd>${escapeHtml(snapshot.persistenceRevision)} · 计算修订 ${escapeHtml(model.unit.revision)}</dd></dl></section><section class="drawing-export-card"><h3>尺寸与坐标约定</h3><dl><dt>图框</dt><dd>A3 横向 · ${escapeHtml(model.frame.version)}</dd><dt>截面</dt><dd>X ${model.unit.width??'未提供'} × Z ${model.unit.height??'未提供'} mm</dd><dt>总段长</dt><dd>Y ${model.unit.totalLength??'未提供'} mm</dd><dt>轴向</dt><dd>X 宽度 · Y 气流/段长 · Z 高度</dd></dl></section><div class="drawing-export-frame"><div class="drawing-export-frame-main"><strong>${escapeHtml(model.project.name)} / ${escapeHtml(model.unit.no)}</strong><span>${escapeHtml(model.title)} · ${escapeHtml(model.generatedAt)}</span>${chain}</div><div class="drawing-export-frame-side"><span>项目编号：${escapeHtml(model.project.code)}</span><span>客户：${escapeHtml(model.project.customer)}</span><span>制图：未提供</span><span>复核：未提供</span></div></div>`;
      if(model.missing.length){missing.innerHTML=`<div class="missing-list"><strong>缺失项（输出中将标记“未提供”）</strong><ul>${model.missing.map(item=>`<li>${escapeHtml(item)}</li>`).join('')}</ul></div>`;}else{missing.innerHTML='<div class="missing-ok">段长与截面尺寸齐全。图纸仍为配置示意图，不替代生产加工图。</div>';}
      actions.forEach(button=>button.disabled=false);return true;
    }catch(error){output.innerHTML='<section class="drawing-export-card"><h3>暂不能输出</h3><p>请先保存当前项目，并在数据修订一致后重新打开本窗口。</p></section>';missing.innerHTML='';status.textContent=error.message;status.dataset.state='error';actions.forEach(button=>button.disabled=true);return false;}
  }
  function runDrawingExport(action,success){let snapshot;try{snapshot=savedDrawingSnapshot();}catch(error){$('drawingExportStatus').textContent=error.message;$('drawingExportStatus').dataset.state='error';[$('exportDrawingDxf'),$('exportDrawingPdf'),$('exportDrawingCsv')].forEach(button=>button.disabled=true);return;}try{action(snapshot);if(renderDrawingExport()){$('drawingExportStatus').textContent=success;$('drawingExportStatus').dataset.state='success';}}catch(error){$('drawingExportStatus').textContent=error.message;$('drawingExportStatus').dataset.state='error';}}
  function loadSavedProject(){const raw=localStorage.getItem(STORAGE_KEY)||localStorage.getItem('p001-ahu-project-v1');if(!raw)return alert('当前浏览器没有已保存项目。');try{project=M.normalizeProject(JSON.parse(raw));centerProjectId=project.project.projectId;creatingProjectDraft=!readProjectIndex().some(item=>item.projectId===centerProjectId);selectedId=project.segments[0]?.id||null;if(M.activeUnit(project)){$('projectManagerScreen').hidden=true;$('projectSetupScreen').hidden=true;renderAll();$('saveState').textContent='已读取浏览器项目';}else showProjectManager();}catch(error){alert(error.message);}}
  function showProjectManager(){if(!showDeletedProjects){const saved=readProjectIndex(),current=saved.find(item=>item.projectId===project.project.projectId);if(current){centerProjectId=current.projectId;creatingProjectDraft=false;}else if(creatingProjectDraft)centerProjectId=project.project.projectId;else if(saved.length){centerProjectId=saved[0].projectId;project=M.normalizeProject(saved[0].project);selectedId=project.segments[0]?.id||null;}else centerProjectId=project.project.projectId;}renderProjectSetup();renderProjectManager();$('projectSetupScreen').hidden=true;$('projectManagerScreen').hidden=false;}
  function readSession(){try{const value=JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null');if(!M.isSessionValid(value)){sessionStorage.removeItem(SESSION_KEY);return null;}return value;}catch(error){sessionStorage.removeItem(SESSION_KEY);return null;}}
  function makeLocalSession(){const value={userId:'local-engineer',displayName:'本地工程师',expiresAt:Date.now()+SESSION_TTL};sessionStorage.setItem(SESSION_KEY,JSON.stringify(value));return value;}
  function enforceSession(){if(sessionUser && !readSession()){sessionUser=makeLocalSession();M.setCurrentUser(sessionUser);}}
  function saveSetupAndReturn(){if(!collectProjectMeta())return;project.project.updatedAt=new Date().toISOString();if(!persistProjectSnapshot(project,{allowDraft:true}))return;showProjectManager();}
  function collectProjectMeta(){const fields={name:'setupProjectName',projectCode:'setupProjectCode',createdDate:'setupCreatedDate',customerName:'setupCustomerName',businessOwner:'setupBusinessOwner',technicalSupport:'setupTechnicalSupport',contactInfo:'setupContactInfo',projectAddress:'setupProjectAddress',locationName:'setupLocationName'},before=Object.fromEntries(Object.keys(fields).map(code=>[code,project.project[code]??'']));Object.entries(fields).forEach(([code,id])=>{project.project[code]=$(id).value.trim();});project.project.name ||= '新建项目';project.project.altitude=$('setupAltitude').value===''?'':Number($('setupAltitude').value);const incomplete=['businessOwner','technicalSupport','locationName','weatherRegion'].some(code=>!project.project[code]);project.project.status=incomplete?'资料待完善':'编辑中';$('setupMessage').textContent=incomplete?'草稿可保存；资料补充完整后状态会更新。':'';const changed=Object.keys(before).filter(code=>before[code]!==project.project[code]);if(changed.length){project.audit ||= [];project.audit.push({action:'project.meta.update',objectId:project.project.projectId,projectId:project.project.projectId,unitId:null,oldValue:M.clone(before),newValue:M.clone(project.project),fields:changed,userId:sessionUser?.userId||'local-user',displayName:sessionUser?.displayName||'本地用户',updatedAt:new Date().toISOString()});}return true;}
  function readProjectIndex(){try{return JSON.parse(localStorage.getItem(PROJECT_INDEX_KEY)||'[]');}catch(error){return [];}}
  function loadProjectFromIndex(projectId){const item=readProjectIndex().find(value=>value.projectId===projectId);if(item)project=M.normalizeProject(item.project);centerProjectId=project.project.projectId;creatingProjectDraft=false;selectedId=project.segments[0]?.id||null;if(M.activeUnit(project)){renderAll();$('projectManagerScreen').hidden=true;$('projectSetupScreen').hidden=true;$('saveState').textContent='已打开项目工作台';}else showProjectManager();}
  function selectManagedProject(projectId){const item=readProjectIndex().find(value=>value.projectId===projectId);if(item)project=M.normalizeProject(item.project);else if(project.project.projectId!==projectId)return false;selectedId=project.segments[0]?.id||null;return true;}
  function setCreateValue(id,value){$(id).value=value??'';}
  const WIZARD_CANDIDATES = Object.freeze([{ width: 1800, height: 1800 }, { width: 2000, height: 1800 }, { width: 2200, height: 1800 }, { width: 2400, height: 2000 }]);
  const WIZARD_PRESETS = Object.freeze({
    '回风段 + 中效过滤段 + 普通风机段': ['mixing', 'medium-filter', 'fan'],
    '混合段 + 初中效过滤段 + 冷水盘管段 + 普通风机段': ['mixing', 'primary-filter', 'medium-filter', 'cooling-coil', 'fan'],
    '新风段 + 初效过滤段 + 冷水盘管段 + 加湿段 + 风机段': ['fresh-air', 'primary-filter', 'cooling-coil', 'humidifier', 'fan']
  });
  function wizardNumber(id){const value=$(id)?.value;return value===''||value==null?'':Number(value);}
  function wizardMessage(message, focusId){$('unitCreateMessage').textContent=message;if(focusId)$(focusId)?.focus();}
  function renderWizardCandidates(){
    const supply=wizardNumber('newSupplyAirVolume'), maxWidth=wizardNumber('newMaxWidth'), maxHeight=wizardNumber('newMaxHeight'), selected=wizardDraft.candidate;
    let validCount=0;
    document.querySelectorAll('input[name="newCabinetCandidate"]').forEach(input=>{
      const candidate=WIZARD_CANDIDATES.find(item=>`${item.width}x${item.height}`===input.value), width=candidate?.width||0, height=candidate?.height||0, area=width*height*0.89/1000000, velocity=Number.isFinite(supply)&&supply>0? supply/(area*3600):null, invalid=(maxWidth!==''&&width>maxWidth)||(maxHeight!==''&&height>maxHeight);
      const label=input.closest('label'), small=label?.querySelector('small'), em=label?.querySelector('em');
      input.disabled=invalid;if(invalid&&input.checked)input.checked=false;label?.classList.toggle('candidate-invalid',invalid);label?.classList.toggle('candidate-selected',input.checked);
      if(small)small.textContent=`有效面积 ${area.toFixed(2)} m²`;
      if(em)em.textContent=invalid?'超出安装限制':(velocity===null?'待输入风量':`${input.checked?'推荐 · ':''}约 ${velocity.toFixed(2)} m/s`);
      if(!invalid)validCount+=1;
    });
    const status=document.querySelector('.candidate-status');if(status)status.textContent=`${validCount} 个可用候选`;
    if(selected){const input=document.querySelector(`input[name="newCabinetCandidate"][value="${selected}"]`);if(input&&!input.disabled)input.checked=true;}
    const current=document.querySelector('input[name="newCabinetCandidate"]:checked:not(:disabled)')||document.querySelector('input[name="newCabinetCandidate"]:not(:disabled)');
    if(current){wizardDraft.candidate=current.value;current.checked=true;current.closest('label')?.classList.add('candidate-selected');}
  }
  function renderSequencePreview(){
    const preset=$('newSequencePreset').value, custom=document.querySelector('input[name="newSequenceMode"]:checked')?.value==='custom', names=custom?['自定义功能段链']:preset.split(' + ');
    $('sequencePreview').innerHTML=names.map((name,index)=>`${index?'<i>→</i>':''}<span>${escapeHtml(name)}</span>`).join('');
    $('sequencePreview').dataset.templateScope=$('newTemplateScope').value;
  }
  function renderWizard(){
    const dialog=$('unitCreateDialog');if(!dialog)return;
    dialog.querySelectorAll('[data-wizard-step]').forEach(node=>{if(node.classList.contains('unit-type-rail'))return;const step=Number(node.dataset.wizardStep),visible=wizardStep===1?step===1:[2,3,4,5].includes(step);node.hidden=!visible;node.style.display=visible?'':'none';});
    dialog.querySelectorAll('[data-wizard-goto]').forEach(node=>{const target=Number(node.dataset.wizardGoto),done=target<wizardStep;node.classList.toggle('active',target===wizardStep);node.classList.toggle('done',done);node.classList.toggle('available',target<=wizardStep);node.setAttribute('aria-current',target===wizardStep?'step':'false');});
    $('unitWizardProgress').textContent=wizardStep===1?'基础条件 1 / 2':'进入配置 2 / 2';$('unitWizardBack').hidden=wizardStep===1;$('unitWizardNext').hidden=wizardStep===2;$('confirmCreateUnit').hidden=wizardStep!==2;
    renderWizardCandidates();renderSequencePreview();
  }
  function validateWizardStep(step){
    const unitNo=$('newUnitNo').value.trim(), quantity=wizardNumber('newUnitQuantity'), supply=wizardNumber('newSupplyAirVolume');
    if(step===1){if(!unitNo)return ['请填写设备编号','newUnitNo'];if(!Number.isInteger(quantity)||quantity<1||quantity>20)return ['数量应为 1～20 的整数','newUnitQuantity'];const collisions=Array.from({length:quantity},(_,index)=>index?unitNo+'-'+String(index+1).padStart(2,'0'):unitNo).filter(no=>project.project.units.some(unit=>unit.unitNo===no));if(collisions.length)return [`设备编号已存在：${collisions.join('、')}`,'newUnitNo'];}
    if(step===2){if(supply===''||!Number.isFinite(supply)||supply<100)return ['送风量必须不小于 100 m³/h','newSupplyAirVolume'];const fresh=wizardNumber('newFreshAirVolume');if(fresh!==''&&(!Number.isFinite(fresh)||fresh<0||fresh>supply))return ['新风量应为 0～送风量之间的数值','newFreshAirVolume'];for(const id of ['newSupplyPressure','newReturnPressure']){const value=wizardNumber(id);if(value!==''&&(!Number.isFinite(value)||value<0))return ['风压不能为负数',id];}}
    if(step===3){for(const id of ['newMaxWidth','newMaxHeight']){const value=wizardNumber(id);if(value!==''&&(!Number.isFinite(value)||value<500))return ['宽度/高度限制应为空或不小于 500 mm',id];}const length=wizardNumber('newMaxLength');if(length!==''&&(!Number.isFinite(length)||length<0))return ['长度限制不能为负数','newMaxLength'];}
    if(step===4){renderWizardCandidates();const selected=document.querySelector('input[name="newCabinetCandidate"]:checked');if(!selected||selected.disabled)return ['请选择一个未超出安装限制的箱体截面','newMaxWidth'];}
    return null;
  }
  function collectWizardProfile(){
    const number=id=>wizardNumber(id), mode=document.querySelector('input[name="newSequenceMode"]:checked')?.value||'preset', templateScope=$('newTemplateScope').value;
    return {customerUnitNo:$('newCustomerUnitNo').value.trim(),quantity:Math.max(1,Math.min(20,Number(number('newUnitQuantity'))||1)),productName:$('newProductName').value,unitType:document.querySelector('input[name="newUnitType"]:checked')?.value,coldSource:$('newColdSource').value,installationType:$('newInstallationType').value,panelType:$('newPanelType').value,panelThickness:number('newPanelThickness'),comfortClass:$('newComfortClass').value,fanType:$('newFanType').value,templateScope,templateSource:templateScope,airflow:{supply:number('newSupplyAirVolume'),fresh:number('newFreshAirVolume'),return:number('newReturnAirVolume'),exhaust:number('newExhaustAirVolume'),secondaryReturn:number('newSecondaryReturnAirVolume')},pressure:{supplySelection:$('newSupplyFanType').value,supply:number('newSupplyPressure'),returnSelection:$('newReturnFanType').value,return:number('newReturnPressure')},capacityRequirements:{cooling:number('newCoolingCapacity'),heating:number('newHeatingCapacity'),electricHeat:number('newElectricHeatCapacity'),recooling:number('newRecoolingCapacity'),reheat:number('newReheatCapacity'),humidification:number('newHumidification')},returnConditions:{summerDryBulb:number('newSummerReturnDryBulb'),summerRH:number('newSummerReturnRH'),winterDryBulb:number('newWinterReturnDryBulb'),winterRH:number('newWinterReturnRH')},sequence:{mode,preset:$('newSequencePreset').value},connection:{direction:$('newConnectionDirection').value,headerSide:$('newHeaderSide').value,accessDirection:$('newAccessDirection').value},installation:{transportMode:$('newTransportMode').value,location:$('newInstallLocation').value,maxLength:number('newMaxLength')},recommendation:{coilFaceVelocity:number('newCoilFaceVelocity'),tubeDiameter:number('newTubeDiameter'),coilRows:number('newCoilRows'),remark:$('newUnitRemark').value.trim()},cabinetCandidate:wizardDraft.candidate?{value:wizardDraft.candidate,width:Number(wizardDraft.candidate.split('x')[0]),height:Number(wizardDraft.candidate.split('x')[1])}:null,altitude:number('newUnitAltitude')};
  }
  function applyTemplateSequence(unit, sequence){
    if(sequence.mode==='custom')return;
    const types=WIZARD_PRESETS[sequence.preset];if(!types?.length)return;
    unit.segments=types.map(type=>M.segmentTemplate(type));
  }
  function applyWizardDesignInputs(unit, profile){
    const apply=(code,value)=>{if(value!==''&&value!=null)M.updateParameter(project,code,value,'机组创建输入');};
    apply('airVolume',profile.airflow.supply);if(profile.airflow.fresh!==''&&profile.airflow.supply>0)apply('freshAirRatio',Number((profile.airflow.fresh/profile.airflow.supply*100).toFixed(2)));apply('externalPressure',profile.pressure.supply);
    apply('summerOutdoorDryBulb',numberValue('newSummerOutdoorDryBulb'));apply('winterOutdoorDryBulb',numberValue('newWinterOutdoorDryBulb'));apply('outdoorWetBulb',numberValue('newOutdoorWetBulb'));apply('outdoorRH',numberValue('newOutdoorRH'));apply('maxWidth',numberValue('newMaxWidth'));apply('maxHeight',numberValue('newMaxHeight'));apply('unitEnvironment',profile.installation.location==='室外'?'室外型':'室内型');
    if(profile.cabinetCandidate){apply('cabinetWidth',profile.cabinetCandidate.width);apply('cabinetHeight',profile.cabinetCandidate.height);unit.cabinetSelection={width:M.clone(unit.designConditions.cabinetWidth),height:M.clone(unit.designConditions.cabinetHeight)};}
    unit.profile.cabinetCandidate=M.clone(profile.cabinetCandidate);unit.profile.templateSource=profile.templateSource;applyTemplateSequence(unit,profile.sequence);project.segments=unit.segments;
  }
  function numberValue(id){return wizardNumber(id);}
  function openUnitCreator(projectId){
    if(projectId&&!selectManagedProject(projectId))return;
    const c=project.project.conditions,active=M.activeUnit(project)?.designConditions||{...project.project.conditions,...project.project.templates};
    $('unitCreateProject').textContent='所属项目：'+project.project.name+' · 当前已有 '+project.project.units.length+' 台机组';
    setCreateValue('newUnitNo','AHU-'+String(project.project.units.length+1).padStart(2,'0'));setCreateValue('newUnitQuantity',1);setCreateValue('newCustomerUnitNo','');setCreateValue('newSupplyAirVolume',active.airVolume?.value);setCreateValue('newFreshAirVolume','');setCreateValue('newReturnAirVolume','');setCreateValue('newExhaustAirVolume','');setCreateValue('newSecondaryReturnAirVolume','');setCreateValue('newSupplyPressure',active.externalPressure?.value);setCreateValue('newReturnPressure','');setCreateValue('newUnitAltitude',project.project.altitude);setCreateValue('newCoolingCapacity','');setCreateValue('newHeatingCapacity','');setCreateValue('newElectricHeatCapacity','');setCreateValue('newRecoolingCapacity','');setCreateValue('newReheatCapacity','');setCreateValue('newHumidification','');setCreateValue('newSummerOutdoorDryBulb',c.summerOutdoorDryBulb?.value);setCreateValue('newWinterOutdoorDryBulb',c.winterOutdoorDryBulb?.value);setCreateValue('newOutdoorWetBulb',c.outdoorWetBulb?.value);setCreateValue('newOutdoorRH',c.outdoorRH?.value);setCreateValue('newSummerReturnDryBulb',c.indoorDryBulb?.value);setCreateValue('newWinterReturnDryBulb',c.indoorDryBulb?.value);setCreateValue('newSummerReturnRH',c.indoorRH?.value);setCreateValue('newWinterReturnRH',c.indoorRH?.value);setCreateValue('newMaxWidth',active.maxWidth?.value);setCreateValue('newMaxHeight',active.maxHeight?.value);setCreateValue('newMaxLength','');setCreateValue('newCoilFaceVelocity',2.5);setCreateValue('newCoilRows','');setCreateValue('newUnitRemark','');
    ['newProductName','newColdSource','newInstallationType','newPanelType','newComfortClass','newSupplyFanType','newReturnFanType','newConnectionDirection','newHeaderSide','newAccessDirection','newTransportMode','newInstallLocation','newTemplateScope','newFanType','newSequencePreset'].forEach(id=>{$(id).selectedIndex=0;});setCreateValue('newPanelThickness','40');setCreateValue('newTubeDiameter','9.52');
    document.querySelector('input[name="newUnitType"][value="卧式组合式空调机组"]').checked=true;document.querySelector('input[name="newSequenceMode"][value="preset"]').checked=true;document.querySelector('input[name="newTemplateScopeChoice"][value="project"]').checked=true;wizardDraft={candidate:'2000x1800'};wizardStep=1;$('unitCreateMessage').textContent='';renderWizard();$('unitCreateDialog').showModal();
  }
  function createUnitFromDialog(){
    const invalid=[1,2,3,4].map(validateWizardStep).find(Boolean);if(invalid){wizardMessage(invalid[0],invalid[1]);wizardStep=[1,2,3,4].find(step=>{const issue=validateWizardStep(step);return issue&&issue[0]===invalid[0];})||wizardStep;renderWizard();return;}
    const profile=collectWizardProfile(),baseUnitNo=$('newUnitNo').value.trim(),quantity=profile.quantity,candidateNos=Array.from({length:quantity},(_,index)=>index?baseUnitNo+'-'+String(index+1).padStart(2,'0'):baseUnitNo);
    if(candidateNos.some(no=>project.project.units.some(unit=>unit.unitNo===no))){wizardMessage('设备编号或批量生成编号已存在，请修改后重试','newUnitNo');wizardStep=1;renderWizard();return;}
    let lastUnit=null;candidateNos.forEach((unitNo,index)=>{const unitProfile=M.clone(profile);unitProfile.quantity=1;if(index&&unitProfile.customerUnitNo)unitProfile.customerUnitNo=unitProfile.customerUnitNo+'-'+String(index+1).padStart(2,'0');lastUnit=M.createUnit(project,unitNo,unitProfile);applyWizardDesignInputs(lastUnit,profile);});
    selectedId=lastUnit?.segments[0]?.id||null;project.project.updatedAt=new Date().toISOString();if(!persistProjectSnapshot(project))return;$('unitCreateDialog').close();$('projectManagerScreen').hidden=true;$('projectSetupScreen').hidden=true;$('saveState').textContent='已创建 '+quantity+' 台机组';renderAll();
  }
  function renderProjectManager(){
    const query=($('projectManagerSearch').value||'').trim().toLowerCase();
    const all=readProjectIndex(),trash=(()=>{try{return JSON.parse(localStorage.getItem('p001-ahu-project-trash-v1')||'[]')}catch{return []}})(),source=showDeletedProjects?trash:all;
    const items=source.filter(item=>{const x=item.project.project,units=x.units||[];return !query||[x.name,x.projectCode,x.customerName,x.businessOwner,x.technicalSupport,x.locationName,x.weatherRegion,...units.map(unit=>unit.unitNo)].join('|').toLowerCase().includes(query);});
    if(!centerProjectId&&source.length)centerProjectId=source[0].projectId;
    $('managerProjectCount').textContent=`${items.length} 个${showDeletedProjects?'已删除项目':'项目'}`;
    $('projectManagerTree').innerHTML=items.map(item=>{const x=item.project.project;return `<button type="button" class="history-project ${item.projectId===centerProjectId?'is-current':''}" data-project-id="${escapeHtml(item.projectId)}"><strong>${escapeHtml(x.name||'未命名项目')}</strong><small>${escapeHtml(x.projectCode||'无编号')} · ${(x.units||[]).length} 台机组</small></button>`;}).join('');$('projectManagerEmpty').hidden=items.length>0;$('projectManagerTree').hidden=items.length===0;
    const selected=source.find(item=>item.projectId===centerProjectId)?.project;if(selected&&project.project.projectId!==centerProjectId){project=M.normalizeProject(selected);renderProjectSetup();}else if(!selected&&!showDeletedProjects&&project){centerProjectId=project.project.projectId;renderProjectSetup();}
    $('projectManagerList').innerHTML=(project.project.deletedAt?'<p class="data-notice">此项目在回收站中，可恢复后继续编辑。</p>':(project.project.units||[]).map(unit=>`<article class="project-row"><div class="project-row-main"><div class="project-row-title"><strong>${escapeHtml(unit.unitNo)}</strong><span class="project-status">${unit.pendingRecalculation?'待校核':'编辑中'}</span></div><small>${escapeHtml(unit.profile?.productName||'组合式空调机组')} · ${escapeHtml(unit.profile?.unitType||'未指定安装型式')}</small></div><div class="project-row-actions"><button type="button" data-action="open-unit" data-unit-id="${escapeHtml(unit.unitId)}">打开选型</button></div></article>`).join('')||'<div class="project-empty-state">此项目还没有产品方案。</div>');
    $('projectManagerTree').querySelectorAll('[data-project-id]').forEach(button=>button.onclick=()=>{if(blockForUnsavedCenter('切换项目'))return;centerProjectId=button.dataset.projectId;creatingProjectDraft=false;const item=source.find(value=>value.projectId===centerProjectId);if(item)project=M.normalizeProject(item.project);renderProjectManager();});$('projectManagerList').querySelectorAll('[data-action="open-unit"]').forEach(button=>button.onclick=()=>{if(blockForUnsavedCenter('打开机组选型'))return;M.activateUnit(project,button.dataset.unitId);selectedId=project.segments[0]?.id||null;renderAll();$('projectManagerScreen').hidden=true;});
  }
  $('projectName').addEventListener('change',e=>{e.target.value=project.project.name;});
  $('unitNo').addEventListener('change',e=>{const unit=M.activeUnit(project),oldValue=unit.unitNo;if(!M.updateUnitNo(project,e.target.value,'用户修改机组编号')){e.target.value=oldValue;$('saveState').textContent='机组编号重复，已恢复原编号';}else renderAll();});
  $('unitSelect').addEventListener('change',e=>{M.activateUnit(project,e.target.value);selectedId=project.segments[0]?.id||null;renderAll();});
  $('switchToProjects').onclick=()=>{if(blockForUnsavedCenter('切换界面'))return;showProjectManager();};$('switchToPlatform').onclick=()=>{if(blockForUnsavedCenter('进入 AHU 选型平台'))return;if(!collectProjectMeta()||!persistProjectSnapshot(project,{allowDraft:true}))return;if(!M.activeUnit(project)){openUnitCreator();return;}$('projectManagerScreen').hidden=true;renderAll();};
  $('partsLibrary').onclick=()=>location.href='/parts/';
  $('newUnit').onclick=()=>openUnitCreator();
  $('recalculate').onclick=()=>{const result=M.recalculateUnit(project);if(!result.ok){$('saveState').textContent='重新校核未完成，请先处理禁止项';}else $('saveState').textContent='已完成第 '+result.revision+' 次重新校核';renderAll();};
  $('saveProject').onclick=()=>{project.project.updatedAt=new Date().toISOString();if(persistProjectSnapshot(project))$('saveState').textContent='已保存 '+new Date().toLocaleTimeString();};
  $('loadProject').onclick=()=>loadSavedProject(false);
  $('setupSaveReturn').onclick=saveSetupAndReturn;
  $('projectNewUnit').onclick=()=>{if(blockForUnsavedCenter('打开新建机组'))return;if(collectProjectMeta()&&persistProjectSnapshot(project,{allowDraft:true}))openUnitCreator();};
  $('projectCopy').onclick=()=>{if(blockForUnsavedCenter('复制项目'))return;if(!collectProjectMeta())return;project=M.copyProject(project);centerProjectId=project.project.projectId;showDeletedProjects=false;renderProjectSetup();if(persistProjectSnapshot(project,{allowDraft:true})){showProjectManager();$('setupMessage').textContent='已复制项目及全部方案。';}};
  $('projectDelete').onclick=()=>{if(blockForUnsavedCenter('移入回收站'))return;if(hasPersistenceConflict(project)){$('setupMessage').textContent='项目在其他工作台标签中已有更新；请重新打开最新版后删除。';return;}if(!window.confirm('删除该项目？项目会移入回收站，可随时恢复。'))return;const key='p001-ahu-project-trash-v1',previous=localStorage.getItem(key),index=readProjectIndex(),item=index.find(entry=>entry.projectId===project.project.projectId);if(!item)item={projectId:project.project.projectId,project:M.clone(project)};const trash=(()=>{try{return JSON.parse(previous||'[]')}catch{return []}})();item.project.project.deletedAt=new Date().toISOString();trash.unshift(item);const next=index.filter(entry=>entry.projectId!==item.projectId),oldMain=localStorage.getItem(STORAGE_KEY),oldIndex=localStorage.getItem(PROJECT_INDEX_KEY);try{localStorage.setItem(key,JSON.stringify(trash));localStorage.setItem(PROJECT_INDEX_KEY,JSON.stringify(next));if(project.project.projectId===JSON.parse(oldMain||'null')?.project?.projectId)localStorage.removeItem(STORAGE_KEY);centerDirty=false;showDeletedProjects=true;centerProjectId=item.projectId;showProjectManager();}catch(error){previous===null?localStorage.removeItem(key):localStorage.setItem(key,previous);oldIndex===null?localStorage.removeItem(PROJECT_INDEX_KEY):localStorage.setItem(PROJECT_INDEX_KEY,oldIndex);oldMain===null?localStorage.removeItem(STORAGE_KEY):localStorage.setItem(STORAGE_KEY,oldMain);$('setupMessage').textContent='删除失败，项目数据已恢复：'+error.message;}};
  $('projectRestore').onclick=()=>{const key='p001-ahu-project-trash-v1',oldTrash=localStorage.getItem(key),oldIndex=localStorage.getItem(PROJECT_INDEX_KEY),oldMain=localStorage.getItem(STORAGE_KEY),trash=JSON.parse(oldTrash||'[]'),item=trash.find(entry=>entry.projectId===project.project.projectId);if(!item)return;const index=readProjectIndex();if(index.some(entry=>entry.projectId===item.projectId)){$('setupMessage').textContent='项目编号已存在于历史列表，未执行恢复。';return;}const restored=M.normalizeProject(item.project);delete restored.project.deletedAt;restored.persistenceRevision=(Number(restored.persistenceRevision)||0)+1;const next=[...index,{projectId:item.projectId,project:M.clone(restored)}],remaining=trash.filter(entry=>entry.projectId!==item.projectId);try{localStorage.setItem(STORAGE_KEY,JSON.stringify(restored));localStorage.setItem(PROJECT_INDEX_KEY,JSON.stringify(next));localStorage.setItem(key,JSON.stringify(remaining));project=restored;showDeletedProjects=false;showProjectManager();}catch(error){oldMain===null?localStorage.removeItem(STORAGE_KEY):localStorage.setItem(STORAGE_KEY,oldMain);oldIndex===null?localStorage.removeItem(PROJECT_INDEX_KEY):localStorage.setItem(PROJECT_INDEX_KEY,oldIndex);oldTrash===null?localStorage.removeItem(key):localStorage.setItem(key,oldTrash);$('setupMessage').textContent='恢复失败，已保留回收站数据：'+error.message;}};
  $('setupProjectName').addEventListener('change',event=>{project.project.name=event.target.value.trim()||'未命名项目';});
  $('setupProjectCode').addEventListener('change',event=>{project.project.projectCode=event.target.value.trim();});
  $('setupCreatedDate').addEventListener('change',event=>{project.project.createdDate=event.target.value;});
  $('setupCustomerName').addEventListener('change',event=>{project.project.customerName=event.target.value.trim();});
  $('setupBusinessOwner').addEventListener('change',event=>{project.project.businessOwner=event.target.value.trim();});
  $('setupTechnicalSupport').addEventListener('change',event=>{project.project.technicalSupport=event.target.value.trim();});
  $('setupLocationName').addEventListener('change',event=>{project.project.locationName=event.target.value.trim();});
  $('setupContactInfo').addEventListener('change',event=>{project.project.contactInfo=event.target.value.trim();});
  $('setupProjectAddress').addEventListener('change',event=>{project.project.projectAddress=event.target.value.trim();});
  $('setupAltitude').addEventListener('change',event=>{project.project.altitude=event.target.value===''?'':Number(event.target.value);});
  $('confirmCreateUnit').onclick=createUnitFromDialog;
  $('unitWizardNext').onclick=()=>{const invalid=validateWizardStep(wizardStep);if(invalid){wizardMessage(invalid[0],invalid[1]);return;}if(wizardStep<2){wizardStep=2;$('unitCreateMessage').textContent='';renderWizard();$('unitCreateDialog').querySelector('[data-wizard-step="2"] input, [data-wizard-step="2"] select')?.focus();}};
  $('unitWizardBack').onclick=()=>{if(wizardStep>1){wizardStep-=1;$('unitCreateMessage').textContent='';renderWizard();}};
  $('unitCreateDialog').querySelectorAll('[data-wizard-goto]').forEach(item=>item.addEventListener('click',()=>{const target=Number(item.dataset.wizardGoto);if(target<=wizardStep){wizardStep=target;$('unitCreateMessage').textContent='';renderWizard();}}));
  $('unitCreateDialog').querySelectorAll('input[name="newCabinetCandidate"]').forEach(input=>input.addEventListener('change',()=>{wizardDraft.candidate=input.value;renderWizardCandidates();}));
  ['newSupplyAirVolume','newMaxWidth','newMaxHeight'].forEach(id=>$(id).addEventListener('input',renderWizardCandidates));
  $('newSequencePreset').addEventListener('change',renderSequencePreview);
  document.querySelectorAll('input[name="newSequenceMode"]').forEach(input=>input.addEventListener('change',renderSequencePreview));
  document.querySelectorAll('input[name="newTemplateScopeChoice"]').forEach(input=>input.addEventListener('change',event=>{$('newTemplateScope').value=event.target.value;renderSequencePreview();}));
  $('newUnitNo').addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();createUnitFromDialog();}});
  document.querySelectorAll('input[name="newUnitType"]').forEach(input=>input.addEventListener('change',event=>{$('newInstallationType').value=event.target.value.startsWith('卧式')?'卧式':'立式';}));
  $('segmentChain').addEventListener('dragover',event=>{event.preventDefault();$('segmentChain').classList.add('drag-over');});
  $('segmentChain').addEventListener('dragleave',()=>$('segmentChain').classList.remove('drag-over'));
  $('segmentChain').addEventListener('drop',event=>{if(event.target.closest('.segment-card'))return;event.preventDefault();$('segmentChain').classList.remove('drag-over');if(dragged?.kind==='new'){const added=M.addSegment(project,dragged.type);selectedId=added.id;}else if(dragged?.kind==='existing')M.moveSegment(project,dragged.id,project.segments.length);dragged=null;renderAll();});
  $('segmentTrash').addEventListener('dragover',event=>{event.preventDefault();$('segmentTrash').classList.add('drag-over');});
  $('segmentTrash').addEventListener('dragleave',()=>$('segmentTrash').classList.remove('drag-over'));
  $('segmentTrash').addEventListener('drop',event=>{event.preventDefault();$('segmentTrash').classList.remove('drag-over');if(dragged?.kind==='existing'){M.removeSegment(project,dragged.id);selectedId=project.segments[0]?.id||null;}dragged=null;renderAll();});
  $('exportProject').onclick=downloadProject;
  $('openDrawingExport').onclick=()=>{renderDrawingExport();$('drawingExportDialog').showModal();};
  $('exportDrawingDxf').onclick=()=>runDrawingExport(snapshot=>window.AHUDrawingExport.exportDXF(snapshot),'DXF 图纸已开始下载。');
  $('exportDrawingPdf').onclick=()=>runDrawingExport(snapshot=>window.AHUDrawingExport.openPdf(snapshot),'已打开 A3 打印页面；在打印窗口选择“另存为 PDF”。');
  $('exportDrawingCsv').onclick=()=>runDrawingExport(snapshot=>window.AHUDrawingExport.exportParameterReport(snapshot),'参数 CSV 已开始下载。');
  $('applyOutdoor').onclick=()=>{if(!window.confirm('应用地区工况将传播四项室外计算参数并标记继承机组待重算，是否确认？'))return;const location=selectedOutdoor(),source=`地区数据库·${location.city}·项目默认`,recordId=location.recordId||`weather-${location.province}-${location.city}-${location.station||''}`;M.updateProjectCondition(project,'winterOutdoorDryBulb',location.winterAirConditioningTemperature,source);M.updateProjectCondition(project,'outdoorRH',location.winterAirConditioningRH,source);M.updateProjectCondition(project,'summerOutdoorDryBulb',location.summerAirConditioningDryBulb,source);M.updateProjectCondition(project,'outdoorWetBulb',location.summerAirConditioningWetBulb,source);project.project.weatherRegion=`${location.province} · ${location.city}`;project.project.outdoorLocation={recordId,province:location.province,city:location.city,station:location.station,statisticsPeriod:location.statisticsPeriod,databaseVersion:getOutdoorDatabase().version,source,referencedAt:new Date().toISOString()};project.project.outdoorSnapshot={recordId,version:getOutdoorDatabase().version,referencedAt:project.project.outdoorLocation.referencedAt,values:{winterOutdoorDryBulb:location.winterAirConditioningTemperature,outdoorRH:location.winterAirConditioningRH,summerOutdoorDryBulb:location.summerAirConditioningDryBulb,outdoorWetBulb:location.summerAirConditioningWetBulb}};$('outdoorDialog').close();renderAll();renderProjectSetup();};
  $('importProject').addEventListener('change',async e=>{const file=e.target.files[0];if(!file)return;try{project=M.normalizeProject(JSON.parse(await file.text()));selectedId=project.segments[0]?.id||null;renderAll();$('saveState').textContent=`已导入 ${file.name}`;}catch(error){alert(`导入失败：${error.message}`);}finally{e.target.value='';}});
  document.querySelectorAll('.sidebar button[data-target]').forEach(button=>button.onclick=()=>{document.querySelectorAll('.sidebar button[data-target]').forEach(item=>item.classList.remove('nav-active'));button.classList.add('nav-active');const workspace=document.querySelector('.layout main');workspace.classList.toggle('conditions-open',button.dataset.target==='conditions');if(button.dataset.target!=='conditions')document.getElementById(button.dataset.target).scrollIntoView({block:'nearest'});});
  $('managerNewProject').onclick=()=>{if(blockForUnsavedCenter('新建项目'))return;showDeletedProjects=false;showProjectSetup(true);centerProjectId=project.project.projectId;showProjectManager();};$('managerOpenProject').onclick=()=>{if(blockForUnsavedCenter('读取浏览器项目'))return;loadSavedProject();};
  $('projectManagerSearch').addEventListener('input',renderProjectManager);$('showTrash').onclick=()=>{if(blockForUnsavedCenter('切换回收站'))return;showDeletedProjects=!showDeletedProjects;renderProjectManager();};
  $('project-info-scroll').addEventListener('input',()=>{centerDirty=true;$('setupMessage').textContent='项目信息有未保存修改。请先保存，再切换项目或打开机组。';});
  window.P001WorkbenchBridge={snapshot:()=>{const unit=M.activeUnit(project);const conditions=project.designConditions||{};const width=conditions.cabinetWidth?.value??unit?.cabinetWidth??0;const height=conditions.cabinetHeight?.value??unit?.cabinetHeight??0;return {projectName:project.project?.name||'未命名项目',unitNo:unit?.unitNo||'未编号机组',cabinetWidth:Number(width)||0,cabinetHeight:Number(height)||0,selectedId,segments:project.segments.filter(s=>s.enabled).map(s=>({id:s.id,name:s.name,type:s.type,length:Number(s.interface?.drawing?.length)||0,partId:s.interface?.selection?.partRef?.partId||''}))};},select:id=>{if(project.segments.some(s=>s.id===id)){selectedId=id;renderAll();}}};
  window.addEventListener('message',receiveSelectionMessage);window.addEventListener('storage',receiveSelectionStorage);
  sessionUser=readSession()||makeLocalSession();M.setCurrentUser(sessionUser);renderLibrary();const returningFromSelector=restoreSelectionReturn();if(!returningFromSelector){if(M.activeUnit(project))renderAll();showProjectManager();}else replaySelectionResult();refreshPartLibrary().catch(error=>{partLibrarySnapshot={source:'local-fallback',unavailable:true,error};window.P001SharedPartSnapshot=partLibrarySnapshot;updateExistingSegmentPartPicker();window.dispatchEvent(new CustomEvent('p001-part-library-updated',{detail:partLibrarySnapshot}));});window.setInterval(enforceSession,60000);
})();
