(() => {
  const mount = () => {
    const header = document.querySelector('.top');
    if (!header || header.querySelector('[data-current-version-badge]')) return;
    const badge = document.createElement('span');
    badge.dataset.currentVersionBadge = 'true';
    badge.textContent = '当前唯一最终版';
    badge.title = '当前唯一最终版：http://127.0.0.1:8765/工业工作台_ThreeJS原型.html';
    badge.style.cssText = 'padding:4px 8px;border:1px solid #56bf9a;border-radius:2px;background:#173c35;color:#b8f0d8;font-size:11px;font-weight:700;white-space:nowrap';
    header.prepend(badge);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
