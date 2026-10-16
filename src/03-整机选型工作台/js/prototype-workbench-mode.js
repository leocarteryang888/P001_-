(() => {
  const httpMode = location.protocol === 'http:' || location.protocol === 'https:';
  const notice = document.createElement('aside');
  notice.id = 'workbenchVersionNotice';
  notice.hidden = true;
  notice.setAttribute('role', 'status');
  notice.innerHTML = '<span class="workbench-version-text"></span><button type="button" class="workbench-version-refresh" hidden>保存后刷新</button><a class="workbench-version-http" href="http://127.0.0.1:8765/" target="_blank" rel="noopener">打开本地服务版</a>';
  const style = document.createElement('style');
  style.textContent = '#workbenchVersionNotice{position:fixed;right:14px;bottom:14px;z-index:1000;display:flex;align-items:center;gap:10px;max-width:min(560px,calc(100vw - 28px));padding:8px 11px;border:1px solid #e3b24f;background:#fff8df;color:#5a4514;box-shadow:0 4px 14px #1232; font:12px/1.4 "Microsoft YaHei",sans-serif}#workbenchVersionNotice[hidden]{display:none}#workbenchVersionNotice button,#workbenchVersionNotice a{border:1px solid #b98725;background:#fff;color:#634d1c;padding:4px 8px;cursor:pointer;text-decoration:none;white-space:nowrap}#workbenchVersionNotice button:hover,#workbenchVersionNotice a:hover{background:#fff1c2}';
  document.head.appendChild(style);
  document.body.appendChild(notice);
  const text = notice.querySelector('.workbench-version-text');
  const refresh = notice.querySelector('.workbench-version-refresh');
  const httpLink = notice.querySelector('.workbench-version-http');
  if (!httpMode) {
    notice.hidden = false;
    text.textContent = '当前为 file 文件模式；页面不会热更新。请保存编辑后用本地服务版打开以检测代码变化。';
    refresh.hidden = true;
    return;
  }
  httpLink.hidden = true;
  let knownVersion = '';
  let changed = false;
  const check = async () => {
    try {
      const response = await fetch('/api/workbench-version', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      if (!payload.version) return;
      if (!knownVersion) { knownVersion = payload.version; return; }
      if (payload.version === knownVersion || changed) return;
      changed = true;
      notice.hidden = false;
      text.textContent = '检测到工作台代码已更新；请先保存当前编辑，再手动刷新。';
      refresh.hidden = false;
    } catch { /* 服务暂时不可用时保留当前页面和编辑 */ }
  };
  refresh.addEventListener('click', () => location.reload());
  check();
  window.setInterval(check, 3000);
})();
