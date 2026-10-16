// Open a separate workspace: same-tab navigation triggers the unsaved-project guard.
const partsLibraryButton=document.getElementById('partsLibraryBtn');
const partsLibraryLink=document.createElement('a');
partsLibraryLink.id=partsLibraryButton.id;
partsLibraryLink.className=partsLibraryButton.className;
partsLibraryLink.textContent=partsLibraryButton.textContent;
partsLibraryLink.href=location.protocol==='file:'?'../../src/04-3D零件库/index.html':'/parts/';
partsLibraryLink.target='_blank';
partsLibraryLink.rel='noopener';
partsLibraryLink.title='在新标签页打开，保留当前机组编辑';
partsLibraryLink.style.cssText='display:inline-flex;align-items:center;text-decoration:none';
partsLibraryButton.replaceWith(partsLibraryLink);
