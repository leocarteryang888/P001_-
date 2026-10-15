(function () {
  'use strict';
  function showStatus(text, connected) {
    let status = document.getElementById('hotReloadStatus');
    if (!status) {
      status = document.createElement('div');
      status.id = 'hotReloadStatus';
      document.body.appendChild(status);
    }
    status.textContent = text;
    status.className = connected ? 'hot-reload-status connected' : 'hot-reload-status file-mode';
  }
  document.addEventListener('DOMContentLoaded', function () {
    if (!/^https?:$/.test(location.protocol)) {
      showStatus('文件模式 · 无热更新（请运行“启动盘管选型-热更新.bat”）', false);
      return;
    }
    let currentVersion = null;
    async function check() {
      try {
        const response = await fetch('/__coil_reload?t=' + Date.now(), {cache: 'no-store'});
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        if (currentVersion === null) {
          currentVersion = data.version;
          showStatus('热更新已连接', true);
        } else if (data.version !== currentVersion) {
          location.reload();
        }
      } catch (_error) {
        showStatus('热更新连接中断', false);
      }
    }
    check();
    window.setInterval(check, 1000);
  });
})();
