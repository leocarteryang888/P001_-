import fs from 'node:fs';
import vm from 'node:vm';
import * as THREE from '../vendor/three/build/three.module.js';
import { subtractMesh, splitDisconnectedGeometry } from '../js/mesh-csg.js';

// Execute the production geometry/editing functions with real Three.js objects.
// Only browser rendering and DOM presentation are replaced. No user storage is used.
export function createEditorCpu() {
  const source = fs.readFileSync(new URL('../js/part-library.js', import.meta.url), 'utf8');
  const inputs = new Map();
  const input = id => {
    if (!inputs.has(id)) inputs.set(id, { id,value: '', dataset: {}, options: [], disabled: false,
      querySelector: () => null, querySelectorAll: () => [], classList: { add() {}, remove() {} } });
    return inputs.get(id);
  };
  const context = vm.createContext({ THREE, subtractMesh, splitDisconnectedGeometry, console,
    document: { activeElement: null, getElementById: input,addEventListener() {} }, performance,
    STORE: null, renderer: { render() {} }, camera: {}, scene: new THREE.Scene(),
    transform: { mode:'translate', attach(object) {this.object=object}, detach() {this.object=null},setSpace(value) {this.space=value}, getHelper: () => ({ updateMatrixWorld() {} }) },
    axisOffsetDialog:{dataset:{axis:'x'},close(){},querySelector:id=>input(id.slice(1))},
    viewport: { classList:{add() {},remove() {}} },
    inputs, $: input, clone: value => JSON.parse(JSON.stringify(value)) });
  const declarations = [];
  for (const match of source.matchAll(/^(?:async\s+)?function\s+\w+\(/gm)) {
    const start=match.index,paramStart=source.indexOf('(',start);let paramDepth=1,paramEnd=paramStart+1;
    for(;paramDepth&&paramEnd<source.length;paramEnd++){if(source[paramEnd]==='(')paramDepth++;else if(source[paramEnd]===')')paramDepth--;}
    const opening=source.indexOf('{',paramEnd);
    let depth=1,end=opening+1;
    for(;end<source.length&&depth;end++) { if(source[end]==='{')depth++;else if(source[end]==='}')depth--; }
    declarations.push(source.slice(start,end));
  }
  const constants = source.slice(source.indexOf('const mat ='), source.indexOf('function loadLibrary'));
  const coordinateConstants=source.slice(source.indexOf('const legacyPartToSemantic ='),source.indexOf('function legacyAxisDirectionToSemantic'));
  const names=[...source.matchAll(/^(?:async\s+)?function\s+(\w+)\(/gm)].map(match=>match[1]);
  vm.runInContext(`let activePart={}, model=null, selectedMesh=null, selectedMeshes=[], selectionHelpers=[], selectionPivot=null, localGizmoProxy=null, groupTransformStart=null, workScaleBaseline=null, transformFrame='global', undoStack=[],redoStack=[],lastUndoAt=0,library=[],customCategories=[],hasUnsavedChanges=false;
    ${source.match(/^const draftStorageKey =.*$/m)?.[0]||''}
    ${coordinateConstants}
    ${constants}
    ${declarations.join('\n')}
    const rawSyncTransformFields=syncTransformFields;
    fitCamera=()=>{}; syncTransformFields=()=>{}; markDirty=()=>{}; refreshMeshList=()=>{};
    globalThis.api={builders,geometryRecord,createGeometry,serializeMesh,serializeScene,hydrateRecord,
      normalizeEditableMeshes,resizeCustomSceneDimension,applyActualSize,overallBoundsMm,
      selectedEntitySize,prepareGroupTransform,applyGroupTransformDelta,
      legacyAxisDirectionToSemantic,semanticAxisDirectionToLegacy,dimensionMode,
      setModel(value,part={}){model=value;activePart=part;scene.add(model)},
      setSelection(items,pivot=null){selectedMeshes=items;selectedMesh=items.at(-1);selectionPivot=pivot},
      getPart(){return activePart},getModel(){return model}, input:$,
      getLibrary(){return library},setLibrary(value){library=value},getCategories(){return customCategories},setCategories(value){customCategories=value},
      getTransform(){return transform},getSelectionPivot(){return selectionPivot},
      functions:Object.fromEntries(${JSON.stringify(names)}.map(name=>[name,eval(name)])),
      rawSyncTransformFields};`, context);
  context.api.run=code=>vm.runInContext(code,context);
  context.api.bindTransformInputs=()=>{const begin=source.indexOf('const transformFieldIds='),end=source.indexOf('function commitActualSizeInput',begin);vm.runInContext(source.slice(begin,end),context);for(const id of ['posX','posY','posZ','rotX','rotY','rotZ','scaleX','scaleY','scaleZ']){const field=input(id),focus=field.onfocus,blur=field.onblur;field.onfocus=()=>{context.document.activeElement=field;return focus?.()};field.onblur=()=>{context.document.activeElement=null;return blur?.()}}};
  context.api.bindImport=()=>{const begin=source.indexOf("$('importFile').onchange="),end=source.indexOf('\n',begin);vm.runInContext(source.slice(begin,end===-1?source.length:end),context)};
  context.api.setPersistenceHooks=store=>{context.STORE=store;context.localStorage={setItem(){throw Error('test imports may not write localStorage directly')},getItem(){return null}}};
  context.api.setLocalStorage=storage=>{context.localStorage=storage};
  return context.api;
}

export { THREE };
