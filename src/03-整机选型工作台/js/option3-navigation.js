(() => {
  const toolbar = document.querySelector('body > .toolbar');
  const layout = document.querySelector('.layout');
  const sidebar = layout?.querySelector('.sidebar');
  if (!toolbar || !layout || !sidebar || document.querySelector('.option3-stagebar')) return;

  const stagebar = document.createElement('nav');
  stagebar.className = 'option3-stagebar';
  stagebar.setAttribute('aria-label', '工作阶段');
  stagebar.innerHTML = `
    <div class="option3-stage-tabs">
      <button type="button" class="option3-stage" data-stage="unitOverview">机组资料</button>
      <button type="button" class="option3-stage active" data-stage="chain" aria-current="step">段序工作流</button>
      <button type="button" class="option3-stage" data-stage="engineeringReview">检查与复核</button>
      <button type="button" class="option3-stage" data-stage="drawing">图纸预览</button>
    </div>
    <button type="button" class="option3-library-toggle" aria-controls="option3SegmentLibrary" aria-expanded="false">＋ 功能段库</button>`;
  toolbar.insertAdjacentElement('afterend', stagebar);

  sidebar.id = 'option3SegmentLibrary';
  sidebar.setAttribute('aria-label', '功能段库与工作区导航');
  sidebar.inert = true;
  sidebar.setAttribute('aria-hidden', 'true');

  const libraryToggle = stagebar.querySelector('.option3-library-toggle');
  const setLibraryOpen = (open) => {
    layout.classList.toggle('option3-library-open', open);
    sidebar.inert = !open;
    sidebar.setAttribute('aria-hidden', String(!open));
    libraryToggle.setAttribute('aria-expanded', String(open));
    libraryToggle.textContent = open ? '× 收起功能段库' : '＋ 功能段库';
    if (!open) libraryToggle.focus();
  };

  libraryToggle.addEventListener('click', () => setLibraryOpen(!layout.classList.contains('option3-library-open')));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && layout.classList.contains('option3-library-open')) setLibraryOpen(false);
  });

  const sidebarTarget = target => sidebar.querySelector(`button[data-target="${target}"]`);
  const clickSidebarTarget = target => {
    const control = sidebarTarget(target);
    if (!control) return;
    const wasInert = sidebar.inert;
    sidebar.inert = false;
    control.click();
    sidebar.inert = wasInert;
  };

  const activateStage = stage => {
    stagebar.querySelectorAll('.option3-stage').forEach(button => {
      const active = button.dataset.stage === stage;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'step');
      else button.removeAttribute('aria-current');
    });

    if (stage === 'drawing') {
      setLibraryOpen(false);
      document.getElementById('openDrawingExport')?.click();
      return;
    }

    clickSidebarTarget(stage);
    if (stage === 'unitOverview' || stage === 'chain' || stage === 'engineeringReview') setLibraryOpen(false);
  };

  stagebar.querySelectorAll('.option3-stage').forEach(button => {
    button.addEventListener('click', () => activateStage(button.dataset.stage));
  });

  // Enter the selected formal workbench in the section-chain workspace.
  clickSidebarTarget('chain');
  sidebar.inert = true;
})();
