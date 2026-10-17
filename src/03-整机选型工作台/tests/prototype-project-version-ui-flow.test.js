const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../js/prototype-project-ui.js'), 'utf8');
const createBody = source.match(/onCreateVersion: async project => \{([\s\S]*?)\n\s*\},\n\s*onSelectVersion/);
const cancelBody = source.match(/window\.cancelPrototypeProjectForm = function \(\) \{([\s\S]*?)\n\s*\};/);
const saveBody = source.match(/replacePrototypeAction\('saveBtn', async \(\) => \{([\s\S]*?)\n\s*\}\);\n\s*replacePrototypeAction\('addProject'/);
assert(createBody && cancelBody && saveBody, 'actual create, cancel, and save UI callbacks remain extractable');

function setup({ failCreate = false } = {}) {
  const sourceProject = { projectId: 'p1', lineageId: 'lineage-1', versionId: 'v1', code: 'BJ-2610-001', name: '原方案', units: [{ unitId: 'u1', unitLineageId: 'ul1', no: 'V-BJ2609-F6-001', segments: [{ id: 's1', confirmed: true, source: 'manual-confirmed', interface: { output: { manual: { model: 'F-100' } } } }] }] };
  const projects = [structuredClone(sourceProject)], history = [], events = [], formNotice = { textContent: '' }, inputNotice = { textContent: '' };
  const state = { revision: 1, source: 'shared', sharedKind: 'exists', sharedProjects: projects, projects };
  let projectSaveBusy = false, newProjectMode = false, editProjectIndex = null, projectFormDirty = true, selectedProject = 0, selectedUnit = 0, centerSelectedVersion = null, baseline = JSON.stringify(projects), createCalls = 0, successfulCreates = 0;
  const createdProject = { ...structuredClone(sourceProject), projectId: 'p2', versionId: 'v2', parentVersionId: 'v1', isFrozen: false, name: '原方案（新版本）' };
  const latestProjects = [createdProject];
  const store = { lifecycle: {
    createVersion: async args => { createCalls++; events.push(['createVersion', args]); if (failCreate && createCalls === 1) throw new Error('模拟CAS失败'); successfulCreates++; history.push(structuredClone(sourceProject)); return { data: { project: createdProject } }; },
    list: async () => ({ data: { projects: latestProjects, history }, revision: 2 })
  } };
  const window = { prompt: () => '原方案（新版本）', AHUPrototypeProjectVersion: { makeId: prefix => `${prefix}-ui` }, AHUPrototypeWeather: { resolve: () => ({}) }, collectProjectForm: () => ({ name: '原方案（新版本）', code: sourceProject.code, salesCompanyCode: 'BJ', units: [] }) };
  const A = { newId: prefix => `${prefix}-ui` };
  const document = { querySelectorAll: () => [] };
  const $ = id => id === 'projectFormNotice' ? formNotice : id === 'inputNotice' ? inputNotice : { textContent: '' };
  const notice = message => events.push(['notice', message]);
  const destroyProjectCenter = () => events.push(['destroy']);
  const renderManager = () => events.push(['renderManager']);
  const refreshStoreNotice = () => events.push(['refresh']);
  const factory = new Function('projects','store','window','A','document','$','notice','destroyProjectCenter','renderManager','refreshStoreNotice','state', `
    let projectSaveBusy=false, newProjectMode=false, editProjectIndex=null, projectFormDirty=true, selectedProject=0, selectedUnit=0, centerSelectedVersion=null, baseline=JSON.stringify(projects), formalReadonly=false;
    const createVersion=async project=>{${createBody[1]}};
    const cancel=function(){${cancelBody[1]}};
    const save=async()=>{${saveBody[1]}};
    return {createVersion,cancel,save,get state(){return {projectSaveBusy,newProjectMode,editProjectIndex,selectedProject,selectedUnit,baseline,centerSelectedVersion};}};
  `);
  return { ui: factory(projects,store,window,A,document,$,notice,destroyProjectCenter,renderManager,refreshStoreNotice,state), projects, history, events, store, window, formNotice, inputNotice, sourceProject, createdProject, get counts(){return {createCalls,successfulCreates};} };
}

function bindClick(handler) { const listeners = []; return { addEventListener: (type, fn) => { if (type === 'click') listeners.push(fn); }, click: async () => { for (const fn of listeners) await fn({ preventDefault(){}, stopImmediatePropagation(){} }); } }; }

(async () => {
  const cancelled = setup();
  cancelled.window.prompt = () => null;
  await cancelled.ui.createVersion(cancelled.sourceProject);
  assert.deepEqual(cancelled.counts, { createCalls: 0, successfulCreates: 0 }, 'canceling the name prompt performs no lifecycle write');
  assert.equal(cancelled.projects.length, 1); assert.equal(cancelled.history.length, 0);

  const abandoned = setup();
  const pending = await abandoned.ui.createVersion(abandoned.sourceProject);
  assert.equal(pending.data.pending, true); assert.equal(abandoned.projects.length, 2); assert.equal(abandoned.projects[1].pendingVersionDraft, true);
  assert.equal(abandoned.counts.createCalls, 0, 'opening the edit form does not create server history or a new version');
  const cancelButton = bindClick(abandoned.ui.cancel); cancelButton.addEventListener('click', abandoned.ui.cancel); await cancelButton.click();
  assert.equal(abandoned.projects.length, 1); assert.equal(abandoned.projects[0].projectId, 'p1'); assert.equal(abandoned.history.length, 0); assert.equal(abandoned.counts.createCalls, 0, 'canceling the real form callback leaves server history and revision untouched');

  const retry = setup({ failCreate: true });
  await retry.ui.createVersion(retry.sourceProject);
  const saveButton = bindClick(retry.ui.save); saveButton.addEventListener('click', retry.ui.save);
  await saveButton.click();
  assert.equal(retry.projects.length, 2); assert.equal(retry.projects[1].pendingVersionDraft, true); assert.equal(retry.ui.state.newProjectMode, true); assert.match(retry.formNotice.textContent, /模拟CAS失败/);
  await saveButton.click();
  assert.equal(retry.counts.createCalls, 2); assert.equal(retry.counts.successfulCreates, 1); assert.equal(retry.projects.length, 1); assert.equal(retry.projects[0].versionId, 'v2'); assert.equal(retry.history.length, 1); assert.equal(retry.projects[0].units[0].segments[0].interface.output.manual.model, 'F-100');
  assert.equal(retry.ui.state.newProjectMode, false); assert.equal(retry.ui.state.projectSaveBusy, false);
  console.log('PASS actual project-center callback creates only a local draft; cancel is side-effect free; failed confirmation retains the form for one successful retry.');
})().catch(error => { console.error(error); process.exitCode = 1; });
