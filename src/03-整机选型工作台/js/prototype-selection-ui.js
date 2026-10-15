(function (root) {
  'use strict';
  const A = root.AHUPrototypeSelectionHandoff;
  if (!A) return;
  function openProfessional({ project, unit, segment, location = root.location, module = 'filter' }) {
    if (!project || !unit || !segment) throw new Error('缺少当前项目、机组或功能段');
    const token = A.newId('selection');
    const context = A.begin(project, unit, segment, token);
    const url = new URL(module === 'coil' ? '/src/02-盘管选型/index.html' : '/src/01-过滤器选型/index.html', location.href);
    url.searchParams.set('p001Handoff', encodeURIComponent(JSON.stringify(context)));
    return { url: url.href, nonce: token, context };
  }
  root.AHUPrototypeSelectionUI = { openFilter: options => openProfessional({ ...options, module: 'filter' }), openCoil: options => openProfessional({ ...options, module: 'coil' }) };
})(typeof globalThis === 'object' ? globalThis : this);
