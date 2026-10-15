(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    const io = window.FilterDataIO;
    const selector = window.FilterSelector;
    const dialog = document.getElementById('databaseDialog');
    const status = document.getElementById('databaseStatus');
    const apply = document.getElementById('applyDatabase');
    const fileInput = document.getElementById('databaseFile');
    const viewer = document.getElementById('databaseViewer');
    const viewTable = document.getElementById('databaseViewTable');
    let pending = null;
    let generation = 0;
    let activeView = 'types';
    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
    }
    function viewRows(database, view) {
      if (view === 'types') return {
        headers: ['标识', '名称', '说明'],
        rows: database.filterTypes.map(type => [type.id, type.name, type.detail])
      };
      const axis = view === 'height' ? 'height' : 'width';
      const rows = [];
      for (let mod = database.moduleRange.min; mod <= database.moduleRange.max; mod++) {
        rows.push([mod + 'M', database.arrangements.pull[axis][mod].join(' + '), database.arrangements.frame[axis][mod].join(' + ')]);
      }
      return {headers: ['模数', '抽拉过滤', '框架过滤'], rows};
    }
    function renderViewer(view) {
      activeView = view;
      const data = viewRows(selector.getDatabase(), view);
      viewTable.innerHTML = '<thead><tr>' + data.headers.map(header => '<th scope="col">' + escapeHtml(header) + '</th>').join('') + '</tr></thead><tbody>' + data.rows.map(row => '<tr>' + row.map(cell => '<td>' + escapeHtml(cell) + '</td>').join('') + '</tr>').join('') + '</tbody>';
      document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-selected', button.dataset.view === view ? 'true' : 'false'));
    }
    function message(text, error = false) {
      status.textContent = text;
      status.classList.toggle('is-error', error);
    }
    function clearPending() {
      generation++;
      pending = null;
      apply.disabled = true;
      fileInput.value = '';
    }
    try {
      selector.replaceDatabase(io.load());
    } catch (error) {
      document.getElementById('databaseNotice').hidden = false;
      document.getElementById('databaseNotice').textContent = '浏览器缓存无法加载，正在使用默认数据库：' + error.message;
    }
    document.getElementById('openDatabase').addEventListener('click', function () {
      clearPending();
      message(`当前数据库：${selector.getDatabase().filterTypes.length} 类过滤器，2 种安装形式，宽高各 28 条排布。`);
      dialog.showModal();
    });
    document.getElementById('closeDatabase').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', clearPending);
    document.getElementById('viewDatabase').addEventListener('click', function () {
      renderViewer(activeView);
      viewer.showModal();
    });
    document.getElementById('closeDatabaseViewer').addEventListener('click', () => viewer.close());
    document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => renderViewer(button.dataset.view)));
    document.getElementById('exportDatabase').addEventListener('click', function () {
      try {
        window.XLSX.writeFile(io.toWorkbook(selector.getDatabase()), '过滤器数据库_' + new Date().toISOString().slice(0, 10) + '.xlsx');
        message('已生成 Excel 导出文件，可编辑后重新导入。');
      } catch (error) { message('导出失败：' + error.message, true); }
    });
    fileInput.addEventListener('change', async function () {
      pending = null;
      apply.disabled = true;
      const ticket = ++generation;
      const file = fileInput.files[0];
      if (!file) return;
      try {
        if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error('请选择 .xlsx 或 .xls 文件。');
        if (file.size > 2 * 1024 * 1024) throw new Error('文件不能超过 2MB。');
        message('正在读取并校验 Excel…');
        const buffer = await file.arrayBuffer();
        if (ticket !== generation) return;
        const book = window.XLSX.read(buffer, {type: 'array', cellFormula: true});
        pending = io.fromWorkbook(book);
        message(`校验通过：${file.name}；${pending.filterTypes.length} 类过滤器，宽高共 112 组排布。点击“应用导入”后替换当前浏览器数据库。`);
        apply.disabled = false;
      } catch (error) {
        if (ticket === generation) message('导入失败，当前数据未改变：' + error.message, true);
      }
    });
    apply.addEventListener('click', function () {
      if (!pending) return;
      try {
        io.save(pending);
        selector.replaceDatabase(pending);
        clearPending();
        document.getElementById('databaseNotice').hidden = true;
        message('导入成功，选型结果已更新，数据已保存在当前浏览器。');
      } catch (error) { message('应用失败：' + error.message, true); }
    });
    window.FilterDatabaseViewer = {viewRows, escapeHtml};
  });
})();
