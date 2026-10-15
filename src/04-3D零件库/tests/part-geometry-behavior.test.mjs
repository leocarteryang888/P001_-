import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { createEditorCpu, THREE } from './editor-cpu-harness.mjs';

const require = createRequire(import.meta.url);
const DB = require('../data/part-database.js');
const semanticFrame = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  new THREE.Vector3(-1,0,0), new THREE.Vector3(0,0,1), new THREE.Vector3(0,1,0)));
const semanticModel = () => { const group=new THREE.Group();group.quaternion.copy(semanticFrame);return group; };
const bounds = object => { object.updateWorldMatrix(true,true);return new THREE.Box3().setFromObject(object,true); };
const near = (actual,expected,message,tolerance=.02) => assert.ok(Math.abs(actual-expected)<=tolerance,`${message}: actual ${actual}, expected ${expected}`);

for (const part of DB.parts) test(`default ${part.id}: actual vertices and bounds survive save/reload`, () => {
  const editor=createEditorCpu(),model=semanticModel();editor.setModel(model,structuredClone(part));
  editor.builders[part.kind](part,model);editor.normalizeEditableMeshes();
  const before=bounds(model),vertices=model.children.filter(mesh=>mesh.isMesh).map(mesh=>Array.from((mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry).attributes.position.array));
  const records=JSON.parse(JSON.stringify(editor.serializeScene()));
  const restored=semanticModel();editor.setModel(restored,structuredClone(part));
  records.forEach(record=>editor.hydrateRecord(record));
  const after=bounds(restored);
  for(const axis of ['x','y','z']) { near(after.min[axis],before.min[axis],`${axis} minimum`,1e-6);near(after.max[axis],before.max[axis],`${axis} maximum`,1e-6); }
  vertices.forEach((values,index)=>{
    const geometry=restored.children[index].geometry,actual=(geometry.index?geometry.toNonIndexed():geometry).attributes.position.array;
    assert.equal(actual.length,values.length,'serialized geometry vertex count');
    values.forEach((value,i)=>near(actual[i],value,`mesh ${index}, vertex ${i}`,1e-6));
  });
});

for(const axis of ['x','y','z']) for(const mode of ['component','whole']) test(`${mode} resize rotated anisotropic mesh along semantic ${axis}`, () => {
  const editor=createEditorCpu(),model=semanticModel(),mesh=new THREE.Mesh(new THREE.BoxGeometry(.2,.4,.6));
  mesh.rotation.set(.3,.55,.9);mesh.scale.set(1.2,.8,1.6);mesh.position.set(.15,.25,-.35);model.add(mesh);
  editor.setModel(model,{});editor.setSelection([mesh]);
  const before=bounds(model).getSize(new THREE.Vector3()).multiplyScalar(1000),target=before[axis]*1.5;
  if(mode==='component'){editor.input(`size${axis.toUpperCase()}`).value=String(target);editor.applyActualSize(axis);}
  else editor.resizeCustomSceneDimension({x:'width',y:'depth',z:'height'}[axis],target);
  const after=bounds(model).getSize(new THREE.Vector3()).multiplyScalar(1000);
  near(after[axis],target,'requested outer size must be reached');
  for(const other of ['x','y','z'].filter(value=>value!==axis)) near(after[other],before[other],`${other} outer size must stay unchanged`);
});

test('rotated sphere outer dimensions measure vertices rather than transformed local bounding box',()=>{
  const editor=createEditorCpu(),model=semanticModel(),mesh=new THREE.Mesh(new THREE.SphereGeometry(.12,32,20));
  mesh.rotation.set(.4,.6,.8);model.add(mesh);editor.setModel(model,{});
  const precise=bounds(model).getSize(new THREE.Vector3()).multiplyScalar(1000),actual=editor.overallBoundsMm();
  for(const axis of ['x','y','z'])near(actual[axis],precise[axis],`precise ${axis}`);
});

test('all six installation direction labels round-trip without changing legacy storage',()=>{
  const editor=createEditorCpu();
  for(const direction of ['+x','-x','+y','-y','+z','-z']) assert.equal(editor.semanticAxisDirectionToLegacy(editor.legacyAxisDirectionToSemantic(direction)),direction);
});

test('multi-component transform keeps exact world vertex positions under nonuniform pivot scale',()=>{
  const editor=createEditorCpu(),model=semanticModel();
  const items=[new THREE.Mesh(new THREE.BoxGeometry(.2,.4,.6)),new THREE.Mesh(new THREE.BoxGeometry(.3,.1,.2))];
  items.forEach((mesh,index)=>{mesh.rotation.set(.3,.55,.9);mesh.position.set(index*.6,.25,-.35);model.add(mesh)});
  editor.setModel(model,{});const pivot=new THREE.Object3D();pivot.position.copy(bounds(model).getCenter(new THREE.Vector3()));
  editor.setSelection(items,pivot);editor.prepareGroupTransform();
  const pivotBefore=pivot.matrixWorld.clone();
  const before=items.map(mesh=>Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld)));
  pivot.scale.set(1.5,.75,1.2);pivot.updateMatrixWorld(true);
  const delta=pivot.matrixWorld.clone().multiply(pivotBefore.invert());editor.applyGroupTransformDelta();model.updateMatrixWorld(true);
  items.forEach((mesh,index)=>before[index].forEach((point,i)=>{
    const expected=point.clone().applyMatrix4(delta),actual=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);
    assert.ok(actual.distanceTo(expected)<1e-6,`component ${index} vertex ${i}: world transform may not lose shear (${actual.distanceTo(expected)}m)`);
  }));
  editor.applyGroupTransformDelta();model.updateMatrixWorld(true);
  items.forEach((mesh,index)=>before[index].forEach((point,i)=>{
    const expected=point.clone().applyMatrix4(delta),actual=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);
    assert.ok(actual.distanceTo(expected)<1e-6,`repeated identical drag event may not accumulate deformation (${actual.distanceTo(expected)}m)`);
  }));
  pivot.scale.set(1.8,.9,1.1);pivot.updateMatrixWorld(true);const secondDelta=pivot.matrixWorld.clone().multiply(pivotBefore);editor.applyGroupTransformDelta();model.updateMatrixWorld(true);
  items.forEach((mesh,index)=>before[index].forEach((point,i)=>{
    const expected=point.clone().applyMatrix4(secondDelta),actual=new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld);
    assert.ok(actual.distanceTo(expected)<1e-6,`later drag event must apply to baseline vertices (${actual.distanceTo(expected)}m)`);
  }));
});

test('group translation changes stored component origins and leaves local shape unchanged',()=>{
  const editor=createEditorCpu(),model=semanticModel(),items=[new THREE.Mesh(new THREE.BoxGeometry(.2,.4,.6)),new THREE.Mesh(new THREE.BoxGeometry(.3,.1,.2))];
  items.forEach((mesh,index)=>{mesh.position.set(index*.6,.25,-.35);model.add(mesh)});editor.setModel(model,{});
  const pivot=new THREE.Object3D();pivot.position.copy(bounds(model).getCenter(new THREE.Vector3()));editor.setSelection(items,pivot);editor.prepareGroupTransform();
  const positions=items.map(mesh=>mesh.getWorldPosition(new THREE.Vector3())),vertices=items.map(mesh=>Array.from(mesh.geometry.attributes.position.array));
  pivot.position.add(new THREE.Vector3(.1,.2,.3));editor.applyGroupTransformDelta();model.updateMatrixWorld(true);
  items.forEach((mesh,index)=>{assert.ok(mesh.getWorldPosition(new THREE.Vector3()).distanceTo(positions[index].clone().add(new THREE.Vector3(.1,.2,.3)))<1e-6,'stored component origin must move with translated geometry');assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),vertices[index],'pure translation must not bake offsets into vertex coordinates')});
});

test('fixed component group must reach requested size while preserving component sizes or refuse accurately',()=>{
  const editor=createEditorCpu(),model=semanticModel();
  const items=[-.2,.2].map(x=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2));mesh.position.x=x;mesh.userData.dimensionModes={x:'fixed',y:'fixed',z:'fixed'};model.add(mesh);return mesh});
  editor.setModel(model,{});editor.setSelection(items);editor.input('sizeX').value='1200';editor.applyActualSize('x');
  const actual=editor.selectedEntitySize().x;
  if(Math.abs(actual-600)<.02) {
    assert.match(editor.input('status').textContent,/固定|约束|不能|无法|拒绝/,'safe refusal must explicitly explain fixed-size constraint');
    items.forEach((mesh,index)=>near(mesh.position.x,index===0?-.2:.2,'refusal must preserve component placement',1e-6));
  } else near(actual,1200,'accepted fixed-group resize must reach target');
  items.forEach(mesh=>near(bounds(mesh).getSize(new THREE.Vector3()).x*1000,200,'fixed component width'));
});

test('fully fixed single component must reject outer size change without geometry mutation',()=>{
  const editor=createEditorCpu(),model=semanticModel(),mesh=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2));
  mesh.userData.dimensionModes={x:'fixed',y:'fixed',z:'fixed'};model.add(mesh);editor.setModel(model,{});editor.setSelection([mesh]);
  editor.input('sizeX').value='400';editor.applyActualSize('x');
  near(bounds(mesh).getSize(new THREE.Vector3()).x*1000,200,'single fixed width cannot be scaled');
});

test('unmarked arbitrary BufferGeometry serializes true vertices instead of becoming a bounding box',()=>{
  const editor=createEditorCpu(),geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([.1,.2,.3,.4,.2,.3,.1,.6,.3],3));geometry.computeVertexNormals();
  const record=editor.geometryRecord(geometry);assert.equal(record.type,'buffer','plain BufferGeometry must not fall through to box approximation');const restored=editor.createGeometry(JSON.parse(JSON.stringify(record)));assert.deepEqual(Array.from(restored.attributes.position.array),Array.from(geometry.attributes.position.array),'shape and local vertex offset must survive');
});

test('explicitly saved empty custom scene is not regenerated as a default physical part',()=>{
  const editor=createEditorCpu();editor.input('dimensionFields').querySelector=selector=>editor.input('outer:'+selector.match(/"(\w+)"/)?.[1]);for(const name of ['width','height','depth'])editor.input('outer:'+name).value='200.0';editor.setModel(new THREE.Group(),{id:'empty-user-fixture',name:'Empty edited fixture',kind:'custom',dimensions:{width:200,height:200,depth:200},params:{},customScene:[]});editor.functions.build();assert.equal(editor.getModel().children.filter(item=>item.isMesh).length,0,'an intentional empty scene must stay empty rather than reverting to fallback filter geometry');
  for(const name of ['width','height','depth']){assert.equal(editor.input('outer:'+name).value,'','empty geometry cannot display historical nominal dimensions as actual extents');assert.equal(editor.input('outer:'+name).disabled,true,'empty geometry cannot accept an actual extent edit');}
  assert.deepEqual(JSON.parse(JSON.stringify(editor.getPart().dimensions)),{width:200,height:200,depth:200},'original nominal dimensions are retained without fabrication');
});

test('empty deletion draft is persisted and restored as an empty user scene',()=>{
  const editor=createEditorCpu(),values=new Map();editor.setLocalStorage({setItem:(key,value)=>values.set(key,value),getItem:key=>values.get(key)||null,removeItem:key=>values.delete(key)});editor.setModel(new THREE.Group(),{id:'empty-draft-fixture',name:'Empty draft',kind:'custom',dimensions:{width:200,height:200,depth:200},params:{},customScene:[]});editor.run('hasUnsavedChanges=true');editor.functions.saveDraft();const restored=editor.functions.loadDraft('empty-draft-fixture');assert.ok(restored,'explicit empty draft must be retained');assert.deepEqual(JSON.parse(JSON.stringify(restored.customScene)),[],'empty deletion may not turn into default geometry on reload');
});
