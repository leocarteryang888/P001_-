(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AHUPrototypeProjectCenterView = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const text = value => value == null ? '' : String(value);
  const displayValue = value => value == null ? '—' : value && typeof value === 'object' ? JSON.stringify(value) : text(value);
  const escapeHtml = value => text(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const stamp = value => {
    const time = Date.parse(value || '');
    return Number.isFinite(time) ? time : 0;
  };
  const productTypeLabels = {
    '组合式空调': '组合式空调机组',
    '新风处理': '新风处理机组',
    '热回收新风': '热回收新风机组',
    '组合式空调机组': '组合式空调机组',
    '新风处理机组': '新风处理机组',
    '热回收新风机组': '热回收新风机组'
  };
  const formatDate = value => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };
  const dataOf = result => result?.data ?? result ?? {};
  const projectOf = item => item?.project || item?.snapshot || item || {};
  const lineageOf = project => text(project?.lineageId || project?.projectId || project?.code);
  const versionOf = project => text(project?.versionId || project?.lastExportId || project?.projectId || project?.code);

  function normalizeRecords(data) {
    const projects = Array.isArray(data?.projects) ? data.projects.map(projectOf) : [];
    const history = Array.isArray(data?.history) ? data.history.map(projectOf) : [];
    const trash = Array.isArray(data?.trash) ? data.trash.map(row => ({ ...row, project: projectOf(row) })) : [];
    return { projects, history, trash };
  }

  function searchableValues(project, airflowForms = []) {
    const values = [project?.name, project?.code, project?.customer, project?.location,
      project?.salesCompany, project?.businessOwner, project?.technicalSupport];
    for (const unit of Array.isArray(project?.units) ? project.units : []) {
      values.push(unit?.no, unit?.customerUnitNo, unit?.profile?.customerUnitNo, unit?.schemeNo,
        unit?.model, unit?.unitModel, unit?.name, unit?.productType, productTypeLabels[unit?.productType], unit?.profile?.productName, unit?.profile?.unitType, productTypeLabels[unit?.profile?.unitType],
        unit?.airflowForm, unit?.airflowDirection,
        airflowForms.find(([id]) => id === unit?.airflowForm)?.[1]);
      for (const segment of Array.isArray(unit?.segments) ? unit.segments : []) values.push(segment?.name, segment?.type);
    }
    return values.filter(value => value !== null && value !== undefined).map(value => text(value).toLocaleLowerCase('zh-CN'));
  }

  function matchesSearch(project, query, airflowForms = []) {
    const terms = text(query).trim().toLocaleLowerCase('zh-CN').split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const haystack = searchableValues(project, airflowForms);
    return terms.every(term => haystack.some(value => value.includes(term)));
  }

  function groupVersions(projects, history = []) {
    const groups = new Map();
    for (const project of projects) {
      const key = lineageOf(project);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, { lineageId: key, current: null, versions: [] });
      const group = groups.get(key);
      group.versions.push(project);
      if (!group.current || (!project.isFrozen && group.current.isFrozen) ||
        (Boolean(project.isFrozen) === Boolean(group.current.isFrozen) && stamp(project.modifiedAt) >= stamp(group.current.modifiedAt))) group.current = project;
    }
    for (const project of history) {
      const key = lineageOf(project);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, { lineageId: key, current: null, versions: [] });
      const group = groups.get(key);
      if (!group.versions.some(item => versionOf(item) === versionOf(project))) group.versions.push(project);
    }
    return [...groups.values()].map(group => {
      group.versions.sort((a, b) => stamp(b.modifiedAt || b.exportedAt || b.createdAt) - stamp(a.modifiedAt || a.exportedAt || a.createdAt));
      if (!group.current) group.current = group.versions[0] || null;
      return group;
    }).filter(group => group.current).sort((a, b) => stamp(b.current.modifiedAt) - stamp(a.current.modifiedAt));
  }

  function conditionRows(project, weather, unitRecord = {}) {
    if (!weather || typeof weather.resolve !== 'function') return [];
    const result = weather.resolve(project, unitRecord);
    const ref = project?.weatherReference || {};
    const station = [ref.province, ref.city, ref.station].filter(Boolean).join(' · ') || project?.location || '未关联台站';
    const fields = [
      ['冬季干球', result?.winter?.dryBulb, '℃', 'winterAirConditioningTemperature', ['winterAirConditioningTemperature','winterOutdoorDryBulb','winterDryBulb','dryBulb']],
      ['冬季相对湿度', result?.winter?.rh, '%', 'winterAirConditioningRH', ['winterAirConditioningRH','outdoorRH','winterOutdoorRH','rh']],
      ['夏季干球', result?.summer?.dryBulb, '℃', 'summerAirConditioningDryBulb', ['summerAirConditioningDryBulb','summerOutdoorDryBulb','summerDryBulb','dryBulb']],
      ['夏季湿球', result?.summer?.wetBulb, '℃', 'summerAirConditioningWetBulb', ['summerAirConditioningWetBulb','summerOutdoorWetBulb','summerWetBulb','wetBulb']]
    ];
    const overrideHasValue = (override, keys) => {
      if (!override || typeof override !== 'object') return false;
      const nested = Object.values(override).filter(value => value && typeof value === 'object' && !Array.isArray(value));
      return keys.some(key => Object.prototype.hasOwnProperty.call(override, key) && override[key] != null || nested.some(group => Object.prototype.hasOwnProperty.call(group, key) && group[key] != null));
    };
    const conditions = project?.conditions || project?.project?.conditions || {};
    const stationFound = Array.isArray(weather.getLocations?.()) && weather.getLocations().some(row =>
      (!ref.province || row.province === ref.province) && (!ref.city || row.city === ref.city) && (!ref.station || row.station === ref.station) && !!(ref.city || ref.station));
    return fields.map(([label, value, unit, field, keys]) => {
      const unitManualValue = overrideHasValue(unitRecord?.weatherOverride, keys);
      const projectManualValue = overrideHasValue(project?.weatherOverride, keys);
      const conditionValue = keys.some(key => Object.prototype.hasOwnProperty.call(conditions, key) && conditions[key] != null);
      const inherited = Boolean(unitRecord?.unitId);
      const source = unitManualValue ? '机组手动覆盖' : projectManualValue ? (inherited ? '继承项目手动调整' : '项目手动调整') : value == null ? '未填写' : conditionValue ? (inherited ? '继承项目工况' : '项目工况') : stationFound ? (inherited ? '继承气象台站' : '气象台站参考') : (inherited ? '继承项目工况' : '项目工况');
      return { label, value: value == null ? '—' : `${value} ${unit}`, source, station };
    });
  }

  function mount(options) {
    const { sidebar, detail, lifecycle, weather, airflowForms = [] } = options || {};
    if (!sidebar || !detail || !lifecycle?.list) throw new TypeError('项目中心缺少容器或生命周期接口');
    let records = { projects: [], history: [], trash: [] };
    let selected = null;
    let includeHistory = false;
    let includeTrash = false;
    let busy = false;
    let message = '';
    let comparisonResult = null;
    let destroyed = false;
    let contextMenu = null;
    const doc = sidebar.ownerDocument || detail.ownerDocument || document;
    const previousSidebarNodes = Array.from(sidebar.childNodes || []), previousDetailNodes = Array.from(detail.childNodes || []);
    const heading = doc.createElement('div'); heading.className = 'pcv-sidebar-heading';
    const headingText = doc.createElement('h2'); headingText.textContent = '项目管理'; heading.append(headingText);
    const search = doc.createElement('input');
    search.type = 'search'; search.className = 'pcv-search'; search.placeholder = '搜索项目、人员、机组或功能段'; search.setAttribute('aria-label', '搜索项目、人员、机组或功能段');
    const controls = doc.createElement('div'); controls.className = 'pcv-list-controls';
    const newProject = doc.createElement('button'); newProject.type = 'button'; newProject.className = 'pcv-button pcv-new-project'; newProject.dataset.action = 'new-project'; newProject.textContent = '＋ 新建项目';
    const historyLabel = doc.createElement('label'); historyLabel.className = 'pcv-toggle';
    const historyCheck = doc.createElement('input'); historyCheck.type = 'checkbox'; historyCheck.setAttribute('aria-label', '包含历史版本');
    historyLabel.append(historyCheck, doc.createTextNode('包含历史版本'));
    const trashLabel = doc.createElement('label'); trashLabel.className = 'pcv-toggle';
    const trashCheck = doc.createElement('input'); trashCheck.type = 'checkbox'; trashCheck.setAttribute('aria-label', '查看回收站');
    trashLabel.append(trashCheck, doc.createTextNode('回收站'));
    const list = doc.createElement('div'); list.className = 'pcv-project-list'; list.setAttribute('role', 'list');
    sidebar.replaceChildren(heading, search, controls, list);
    controls.append(newProject, historyLabel, trashLabel);
    const panel = doc.createElement('section'); panel.className = 'pcv-detail'; detail.replaceChildren(panel);

    function selectedProject() {
      if (!selected) return null;
      const trashVersions = records.trash.flatMap(row => archivedVersionsOf(row));
      const all = [...records.projects, ...records.history, ...trashVersions];
      return all.find(project => lineageOf(project) === selected.lineageId && versionOf(project) === selected.versionId) || null;
    }
    function archivedVersionsOf(row) {
      const root = projectOf(row);
      const versions = [root, ...(Array.isArray(row?.versions) ? row.versions.map(projectOf) : []),
        ...(Array.isArray(row?.history) ? row.history.map(projectOf) : []),
        ...records.history.map(projectOf).filter(version => lineageOf(version) === lineageOf(root))];
      return [...new Map(versions.filter(Boolean).map(version => [versionOf(version), version])).values()];
    }
    function exportFor(project) {
      return (records.exports || []).find(row => row.exportId === project?.lastExportId) ||
        (records.exports || []).find(row => row.snapshot?.versionId && row.snapshot.versionId === versionOf(project)) ||
        (records.exports || []).find(row => row.snapshot?.projectId === project?.projectId);
    }
    function previousExport(project) {
      const current = exportFor(project);
      if (!current) return null;
      return (records.exports || []).filter(row => row.lineageId === lineageOf(project) && row.exportId !== current.exportId && stamp(row.exportedAt) < stamp(current.exportedAt))
        .sort((a, b) => stamp(b.exportedAt) - stamp(a.exportedAt))[0] || null;
    }
    function versionLabel(project) {
      if (!project?.isFrozen) return `当前版本 · 最近修改 ${formatDate(project?.modifiedAt)}`;
      const exported = exportFor(project)?.exportedAt || project.exportedAt;
      return exported ? `已下发 · 导出 ${formatDate(exported)}` : `历史版本 · 机组修订 ${(project.units || []).map(unit => unit.no).filter(Boolean).join('、') || '—'}`;
    }
    function button(label, action, className = 'pcv-button') {
      const node = doc.createElement('button'); node.type = 'button'; node.className = className; node.textContent = label; node.dataset.action = action; return node;
    }
    function dismissContextMenu() { contextMenu?.remove?.(); contextMenu = null; }
    function drawList() {
      list.replaceChildren();
      if (includeTrash) {
        const visible = records.trash.filter(row => matchesSearch(row.project, search.value, airflowForms));
        if (!visible.length) { list.innerHTML = '<div class="pcv-empty">回收站没有匹配项目</div>'; return; }
        visible.forEach(row => {
          const project = row.project, item = doc.createElement('article'); item.className = 'pcv-project-card'; item.dataset.projectId = project.projectId || lineageOf(project); item.dataset.lineageId = lineageOf(project);
          const retentionTime = Date.parse(row.retentionUntil || '');
          const retentionLabel = Number.isFinite(retentionTime) ? retentionTime <= Date.now() ? `保留期已到期，请决定是否永久删除（${formatDate(row.retentionUntil)}）` : `保留至 ${formatDate(row.retentionUntil)}；到期后提醒用户决定是否永久删除` : '保留三年；到期后提醒用户决定是否永久删除';
          item.innerHTML = `<button type="button" class="pcv-project-select" data-action="select-trash"><strong>${escapeHtml(project.name || '未命名项目')}</strong><small>${escapeHtml(project.code || '未填写编号')} · ${escapeHtml(project.customer || '未填写客户')}</small><small>删除于 ${escapeHtml(formatDate(row.trashedAt || row.deletedAt))}</small><small class="pcv-retention-notice">${escapeHtml(retentionLabel)}</small></button>`;
          const archivedVersions = archivedVersionsOf(row);
          if (archivedVersions.length) {
            const versionList = doc.createElement('div'); versionList.className = 'pcv-version-list pcv-trash-versions';
            archivedVersions.sort((a, b) => stamp(b.modifiedAt || b.exportedAt || b.createdAt) - stamp(a.modifiedAt || a.exportedAt || a.createdAt)).forEach(version => {
              const versionButton = button(versionLabel(version), 'select-version', 'pcv-version-button');
              versionButton.dataset.versionId = versionOf(version); versionButton.dataset.projectId = version.projectId || '';
              versionList.append(versionButton);
            });
            item.append(versionList);
          }
          item.append(button('恢复', 'restore'), button('永久删除', 'permanently-delete', 'pcv-button danger'));
          list.append(item);
        }); return;
      }
      const trashedLineages = new Set(records.trash.map(row => lineageOf(row.project)));
      const activeProjects = records.projects.filter(project => !trashedLineages.has(lineageOf(project)));
      const visibleHistory = includeHistory ? records.history.filter(item => !trashedLineages.has(lineageOf(projectOf(item)))) : [];
      const groups = groupVersions(activeProjects, visibleHistory);
      const visible = groups.filter(group => {
        const candidates = includeHistory ? group.versions : [group.current];
        return candidates.some(project => matchesSearch(project, search.value, airflowForms));
      });
      if (!visible.length) { list.innerHTML = '<div class="pcv-empty">没有匹配项目</div>'; return; }
      visible.forEach(group => {
        const current = group.current, item = doc.createElement('article'); item.className = `pcv-project-card${selected?.lineageId === group.lineageId && selected?.versionId === versionOf(current) ? ' selected' : ''}`;
        item.dataset.lineageId = group.lineageId;
        const latestExport = records.exports?.filter(row => row.lineageId === group.lineageId).sort((a, b) => stamp(b.exportedAt) - stamp(a.exportedAt))[0];
        item.innerHTML = `<button type="button" class="pcv-project-select" data-action="select-current"><strong>${escapeHtml(current.name || '未命名项目')}</strong><small>${escapeHtml(current.code || '未填写编号')} · ${escapeHtml(current.customer || '未填写客户')}</small><small>${group.versions.length} 个版本 · ${current.units?.length || 0} 台机组 · 最近修改 ${escapeHtml(formatDate(current.modifiedAt))}</small><small>最新导出 ${escapeHtml(latestExport?.exportedAt ? formatDate(latestExport.exportedAt) : '尚无导出')}</small></button>`;
        if (includeHistory && group.versions.length > 1) {
          const versionList = doc.createElement('div'); versionList.className = 'pcv-version-list';
          group.versions.forEach(project => {
            const version = button(versionLabel(project), 'select-version', 'pcv-version-button');
            version.dataset.versionId = versionOf(project); version.dataset.projectId = project.projectId || '';
            if (selected?.versionId === versionOf(project) && selected?.lineageId === group.lineageId) version.classList.add('selected');
            versionList.append(version);
          }); item.append(versionList);
        }
        list.append(item);
      });
    }
    function drawDetail(project) {
      panel.replaceChildren();
      if (!project) { panel.innerHTML = '<div class="pcv-empty detail-empty">选择左侧项目查看资料和机组。</div>'; return; }
      const trashRoot = records.trash.find(row => lineageOf(row.project) === lineageOf(project));
      const isInTrash = Boolean(trashRoot);
      const isActive = !isInTrash && records.projects.some(item => item.projectId === project.projectId);
      const isEditable = isActive && !project.isFrozen;
      const title = doc.createElement('div'); title.className = 'pcv-project-heading';
      title.innerHTML = `<div><p>${isActive ? (isEditable ? '当前项目' : '当前冻结版本 · 只读') : '只读历史版本'}</p><h2>${escapeHtml(project.name || '未命名项目')}</h2><small>${escapeHtml(project.code || '未填写编号')} · ${escapeHtml(project.customer || '未填写客户')}</small></div><div class="pcv-actions"></div>`;
      const actions = title.querySelector('.pcv-actions');
      if (isInTrash) {
        actions.append(button('恢复', 'restore'));
        actions.append(button('永久删除', 'permanently-delete', 'pcv-button danger'));
        if (exportFor(project)?.exportId) actions.append(button('下载此版本', 'download'));
        if (previousExport(project)) actions.append(button('对比上一导出', 'compare'));
      } else if (isActive) {
        if (isEditable) actions.append(button('编辑项目资料', 'edit'));
        actions.append(button('创建新版本', 'create-version'));
        if (isEditable) actions.append(button('导出 / 下发', 'export'));
        else if (exportFor(project)?.exportId) actions.append(button('下载此版本', 'download'));
        actions.append(button('移入回收站', 'trash', 'pcv-button danger'));
      } else {
        actions.append(button('创建新版本', 'create-version'));
        if (exportFor(project)?.exportId) actions.append(button('下载此版本', 'download'));
        if (previousExport(project)) actions.append(button('对比上一导出', 'compare'));
      }
      panel.append(title);
      const scroll = doc.createElement('div'); scroll.className = 'pcv-detail-scroll';
      const meta = doc.createElement('section'); meta.className = 'pcv-section';
      meta.innerHTML = '<h3>项目资料</h3><dl class="pcv-meta"></dl>';
      const entries = [
        ['项目名称', project.name], ['系统项目编号', project.code], ['客户', project.customer], ['销售公司', project.salesCompany],
        ['业务承办人', project.businessOwner], ['技术支持', project.technicalSupport], ['项目所在地', project.location],
        ['版本标识', project.isFrozen ? versionLabel(project) : '当前编辑版'],
        ['最近修改', formatDate(project.modifiedAt)]
      ];
      const dl = meta.querySelector('dl');
      entries.forEach(([label, value]) => { const dt = doc.createElement('dt'), dd = doc.createElement('dd'); dt.textContent = label; dd.textContent = text(value) || '—'; dl.append(dt, dd); });
      scroll.append(meta);
      const conditions = conditionRows(project, weather);
      if (conditions.length) {
        const block = doc.createElement('section'); block.className = 'pcv-section';
        block.innerHTML = `<h3>公共室外条件</h3><p class="pcv-weather-location">地点：${escapeHtml([project.weatherReference?.province, project.weatherReference?.city, project.weatherReference?.station].filter(Boolean).join(' · ') || project.location || '未关联台站')}</p><div class="pcv-weather-grid"></div>`;
        const grid = block.querySelector('.pcv-weather-grid');
        conditions.forEach(row => { const cell = doc.createElement('div'); cell.className = 'pcv-weather-cell'; cell.innerHTML = `<span>${escapeHtml(row.label)}</span><b>${escapeHtml(row.value)}</b><small>来源：${escapeHtml(row.source)}</small>`; grid.append(cell); });
        scroll.append(block);
      }
      const units = doc.createElement('section'); units.className = 'pcv-section pcv-units';
      units.innerHTML = `<div class="pcv-units-heading"><h3>全部机组 <small>共 ${project.units?.length || 0} 台</small></h3>${isEditable ? '<button type="button" class="pcv-button" data-action="new-unit">＋ 新建机组</button>' : ''}</div>`;
      const tableWrap = doc.createElement('div'); tableWrap.className = 'pcv-unit-table-wrap';
      const table = doc.createElement('table'); table.className = 'pcv-unit-table';
      table.innerHTML = '<thead><tr><th>机组编号</th><th>客户机组编号</th><th>机组名称</th><th>机组类型</th><th>机组型号</th><th>功能段</th><th>室外工况来源</th><th>操作</th></tr></thead><tbody></tbody>';
      const tbody = table.querySelector('tbody');
      (project.units || []).forEach((unit, index) => {
        const row = doc.createElement('tr');
        const cells = [unit.no, unit.profile?.customerUnitNo || unit.customerUnitNo, unit.name || unit.no, productTypeLabels[unit.productType || unit.profile?.unitType] || unit.productType || unit.profile?.unitType, unit.model || unit.profile?.productName,
          Array.isArray(unit.segments) ? unit.segments.map(segment => segment?.name || segment?.type).filter(Boolean).join('、') : ''];
        cells.forEach(value => { const td = doc.createElement('td'); td.textContent = text(value) || '—'; row.append(td); });
        const sourceCell = doc.createElement('td');
        sourceCell.textContent = conditionRows(project, weather, unit).map(item => `${item.label}：${item.source}`).join('；') || '—'; row.append(sourceCell);
        const actionCell = doc.createElement('td');
        if (isEditable) { const open = button('打开工作台', 'open-unit', 'pcv-button small'); open.dataset.unitId = unit.unitId || ''; open.dataset.unitIndex = String(index); actionCell.append(open); }
        else actionCell.textContent = '历史只读';
        row.append(actionCell); tbody.append(row);
      });
      if (!(project.units || []).length) { const row = doc.createElement('tr'); row.innerHTML = '<td colspan="8" class="pcv-empty">当前项目尚未建立机组。</td>'; tbody.append(row); }
      tableWrap.append(table); units.append(tableWrap); scroll.append(units); panel.append(scroll);
      if (comparisonResult && comparisonResult.toExportId === exportFor(project)?.exportId) {
        const compare = doc.createElement('section'); compare.className = 'pcv-section pcv-comparison';
        const overview = comparisonResult.overview || {};
        compare.innerHTML = `<h3>相对上一导出的变化</h3><p>新增 ${escapeHtml(overview.added ?? 0)} 项 · 修改 ${escapeHtml(overview.modified ?? 0)} 项 · 删除 ${escapeHtml(overview.deleted ?? 0)} 项</p><div class="pcv-change-list"></div>`;
        const changeList = compare.querySelector('.pcv-change-list');
        (comparisonResult.fields || []).filter(change => !/^units(?:\.|\[|$)/i.test(text(change.path))).forEach(change => {
          const row = doc.createElement('p'); row.className = 'pcv-change-field';
          const before = displayValue(change.before);
          const after = displayValue(change.after);
          row.textContent = `${change.change === 'added' ? '新增' : change.change === 'deleted' ? '删除' : '修改'} ${change.path}: ${text(before)} → ${text(after)}`;
          changeList.append(row);
        });
        (comparisonResult.units || []).forEach(unit => {
          const block = doc.createElement('div'); block.className = 'pcv-change-unit';
          block.innerHTML = `<h4>${escapeHtml(unit.unitNo || unit.unitLineageId || '机组')}</h4>`;
          const categories = [['parameters', '参数变化'], ['configuration', '配置变化'], ['drawings', '图纸/图样变化']];
          categories.forEach(([key, label]) => {
            const changes = unit.changes?.[key] || [];
            if (!changes.length) return;
            const category = doc.createElement('section'); category.className = `pcv-change-category pcv-change-${key}`;
            const heading = doc.createElement('h5'); heading.textContent = label; category.append(heading);
            changes.forEach(change => { const row = doc.createElement('p'); row.textContent = `${change.change === 'added' ? '新增' : change.change === 'deleted' ? '删除' : '修改'} ${change.path}: ${displayValue(change.before)} → ${displayValue(change.after)}`; category.append(row); });
            block.append(category);
          });
          changeList.append(block);
        });
        scroll.append(compare);
      }
    }
    function render() { if (destroyed) return; drawList(); drawDetail(selectedProject()); }
    function setMessage(value, error = false) {
      message = value || '';
      let status = panel.querySelector('.pcv-status');
      if (!status) { status = doc.createElement('p'); status.className = 'pcv-status'; panel.prepend(status); }
      status.textContent = message; status.dataset.error = String(error);
    }
    async function refresh() {
      const result = dataOf(await lifecycle.list({ includeTrash, includeHistory: true }));
      records = normalizeRecords(result);
      if (lifecycle.listExports) {
      const exportProjects = [...new Map([...records.projects, ...(includeHistory || includeTrash ? records.history.map(projectOf) : []), ...(includeTrash ? records.trash.map(row => row.project) : [])].map(project => [lineageOf(project), project])).values()];
        const exports = await Promise.all(exportProjects.map(async project => {
          try { return dataOf(await lifecycle.listExports({ projectId: lineageOf(project) })).exports || []; }
          catch { return []; }
        }));
        records.exports = [...new Map(exports.flat().map(row => [row.exportId, row])).values()];
      }
      const current = selectedProject();
      if (!current) {
        const groups = groupVersions(records.projects, includeHistory ? records.history : []);
        if (groups[0]?.current) selected = { lineageId: groups[0].lineageId, versionId: versionOf(groups[0].current) };
      }
      render(); return records;
    }
    async function invoke(action, project = selectedProject(), unit = null) {
      if (busy) return;
      busy = true;
      setMessage('正在处理…');
      try {
        const id = project?.projectId || selected?.lineageId;
        if (action === 'trash') await lifecycle.trash({ projectId: id });
        else if (action === 'restore') await lifecycle.restore({ projectId: records.trash.find(row => lineageOf(row.project) === lineageOf(project))?.project.projectId || id });
        else if (action === 'permanently-delete') {
          const confirm = options.confirm || (message => doc.defaultView?.confirm?.(message) ?? false);
          if (!confirm(`永久删除“${project?.name || '未命名项目'}”及其历史和导出记录？`)) { setMessage('已取消永久删除。'); return; }
          await lifecycle.permanentlyDelete({ projectId: records.trash.find(row => lineageOf(row.project) === lineageOf(project))?.project.projectId || id, confirmed: true });
        } else if (action === 'download') {
          const exportId = exportFor(project)?.exportId || project?.lastExportId;
          if (options.onDownload) await options.onDownload({ project, exportId });
          else if (exportId) {
            const response = dataOf(await lifecycle.download({ exportId }));
            if (response.downloadUrl) {
              const anchor = doc.createElement('a'); anchor.href = response.downloadUrl; anchor.download = response.export?.filename || '';
              (doc.body || panel).append(anchor); anchor.click?.(); anchor.remove?.();
            }
          }
        } else if (action === 'export') {
          if (options.onExport) await options.onExport(project);
          else if (lifecycle.export) await lifecycle.export({ projectId: id });
        } else if (action === 'compare') {
          const current = exportFor(project), previous = previousExport(project);
          if (!current || !previous) throw new Error('缺少可比较的前后导出记录');
          comparisonResult = { ...dataOf(await lifecycle.compareExports({ fromExportId: previous.exportId, toExportId: current.exportId })), toExportId: current.exportId };
        } else if (action === 'new-unit') await options.onNewUnit?.(project);
        else if (action === 'open-unit') await options.onOpenUnit?.(project, unit);
        else if (action === 'edit') await options.onEditProject?.(project);
        else if (action === 'create-version') {
          const result = options.onCreateVersion ? await options.onCreateVersion(project) : await lifecycle.createVersion?.({ projectId: id, versionId: project?.versionId, draft: project });
          if (result?.data?.cancelled || result?.cancelled) { setMessage('已取消创建新版本。'); return; }
          const created = projectOf(dataOf(result));
          if (created?.projectId && created?.versionId) selected = { lineageId: lineageOf(created), versionId: versionOf(created) };
        }
        else if (action === 'select-version') return;
        setMessage('操作已完成。'); await refresh();
      } catch (error) { render(); setMessage(`操作失败，当前选择已保留：${error.message}`, true); }
      finally { busy = false; }
    }
    async function onClick(event) {
      const control = event.target.closest('[data-action]'); if (!control || !sidebar.contains(control) && !detail.contains(control) && !contextMenu?.contains?.(control)) return;
      const action = control.dataset.action;
      if (busy) return;
      const fromContextMenu = Boolean(contextMenu?.contains(control));
      const contextLineageId = fromContextMenu ? contextMenu.dataset.lineageId : '';
      if (fromContextMenu) dismissContextMenu();
      const card = control.closest('.pcv-project-card');
      const project = card ? (includeTrash ? records.trash.find(row => (row.project.projectId || lineageOf(row.project)) === card.dataset.projectId)?.project : records.projects.find(item => lineageOf(item) === card.dataset.lineageId) || records.history.map(projectOf).find(item => lineageOf(item) === card.dataset.lineageId)) : fromContextMenu ? records.projects.find(item => lineageOf(item) === contextLineageId) : selectedProject();
      if (action === 'new-project') { await options.onNewProject?.(); return; }
      if ((action === 'select-current' || action === 'select-trash') && project) { selected = { lineageId: lineageOf(project), versionId: versionOf(project) }; await options.onSelectVersion?.({ projectId: project.projectId, versionId: project.versionId, project }); render(); return; }
      if (action === 'select-version' && card) {
        const trashVersions = includeTrash ? records.trash.flatMap(row => archivedVersionsOf(row)) : [];
        const version = records.history.map(projectOf).concat(records.projects, trashVersions).find(item => lineageOf(item) === card.dataset.lineageId && versionOf(item) === control.dataset.versionId);
        if (!version) return;
        try {
          const result = lifecycle.get ? dataOf(await lifecycle.get({ projectId: version.projectId || card.dataset.lineageId, versionId: version.versionId })) : null;
          const fetched = result?.project ? projectOf(result) : version;
          selected = { lineageId: lineageOf(fetched), versionId: versionOf(fetched) }; await options.onSelectVersion?.({ projectId: fetched.projectId, versionId: fetched.versionId, project: fetched }); render();
        } catch (error) { setMessage(`历史版本读取失败：${error.message}`, true); }
        return;
      }
      const unit = control.dataset.unitIndex !== undefined ? project?.units?.[Number(control.dataset.unitIndex)] : null;
      await invoke(action, project, unit);
    }
    function onContextMenu(event) {
      const card = event.target.closest('.pcv-project-card'); if (!card || !sidebar.contains(card) || includeTrash) return;
      event.preventDefault(); dismissContextMenu();
      const project = records.projects.find(item => lineageOf(item) === card.dataset.lineageId);
      if (!project) return;
      contextMenu = doc.createElement('div'); contextMenu.className = 'pcv-context-menu';
      contextMenu.dataset.lineageId = lineageOf(project);
      contextMenu.style.left = `${Math.max(4, Math.min(event.clientX || 0, (doc.defaultView?.innerWidth || 1200) - 170))}px`;
      contextMenu.style.top = `${Math.max(4, Math.min(event.clientY || 0, (doc.defaultView?.innerHeight || 800) - 130))}px`;
      if (!project.isFrozen) contextMenu.append(button('编辑项目资料', 'edit'));
      contextMenu.append(button('创建新版本', 'create-version'), button('移入回收站', 'trash', 'pcv-button danger'));
      contextMenu.addEventListener('click', onClick);
      (doc.body || sidebar).append(contextMenu);
    }
    function onDocumentClick(event) {
      if (contextMenu && !contextMenu.contains(event.target)) dismissContextMenu();
    }
    const onSearch = () => render();
    const onHistory = async () => { includeHistory = historyCheck.checked; try { await refresh(); } catch (error) { setMessage(`列表读取失败：${error.message}`, true); } };
    const onTrashToggle = async () => { includeTrash = trashCheck.checked; includeHistory = false; historyCheck.checked = false; try { await refresh(); } catch (error) { setMessage(`回收站读取失败：${error.message}`, true); } };
    sidebar.addEventListener('click', onClick); detail.addEventListener('click', onClick); sidebar.addEventListener('contextmenu', onContextMenu);
    doc.addEventListener?.('click', onDocumentClick);
    search.addEventListener('input', onSearch); historyCheck.addEventListener('change', onHistory); trashCheck.addEventListener('change', onTrashToggle);
    function selectVersion(project) {
      if (!project) return false;
      selected = { lineageId: lineageOf(project), versionId: versionOf(project) };
      render();
      return true;
    }
    const controller = { refresh, render, selectVersion, getState: () => ({ records, selected, includeHistory, includeTrash, message, busy }), destroy() {
      if (destroyed) return;
      destroyed = true; sidebar.removeEventListener('click', onClick); detail.removeEventListener('click', onClick); sidebar.removeEventListener('contextmenu', onContextMenu); dismissContextMenu();
      doc.removeEventListener?.('click', onDocumentClick);
      search.removeEventListener('input', onSearch); historyCheck.removeEventListener('change', onHistory); trashCheck.removeEventListener('change', onTrashToggle);
      sidebar.replaceChildren?.(...previousSidebarNodes); detail.replaceChildren?.(...previousDetailNodes);
    } };
    return controller;
  }

  return { mount, normalizeRecords, searchableValues, matchesSearch, groupVersions, conditionRows };
});
