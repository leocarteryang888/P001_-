import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEditorCpu, THREE } from './editor-cpu-harness.mjs';

const semanticFrame = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0)));
function fixture(){const editor=createEditorCpu(),model=new THREE.Group();model.quaternion.copy(semanticFrame);const mesh=new THREE.Mesh(new THREE.BoxGeometry(.2,.4,.6));mesh.position.set(.1,.2,.3);mesh.rotation.set(.3,.5,.7);mesh.scale.set(1.2,.8,1.1);mesh.userData.editId='work-frame-fixture';model.add(mesh);editor.setModel(model,{});editor.setSelection([mesh]);model.updateMatrixWorld(true);return{editor,model,mesh}}
const points=mesh=>{mesh.updateWorldMatrix(true,false);return Array.from({length:mesh.geometry.attributes.position.count},(_,index)=>new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,index).applyMatrix4(mesh.matrixWorld))};
const assertPoints=(actual,expected,message)=>{assert.equal(actual.length,expected.length);actual.forEach((point,index)=>assert.ok(point.distanceTo(expected[index])<1e-6,`${message}, vertex ${index}, delta ${point.distanceTo(expected[index])}m`))};

test('redefining workpiece axes preserves world geometry and stores a local right-handed reference',()=>{
  const {editor,mesh}=fixture(),before=points(mesh),position=mesh.position.clone(),rotation=mesh.quaternion.clone();
  assert.equal(editor.functions.redefineWorkFrame(),true);assertPoints(points(mesh),before,'reframe cannot rotate or move geometry');
  const frame=mesh.userData.workFrame;assert.ok(frame);assert.ok(new THREE.Vector3().fromArray(frame.origin).distanceTo(position)<1e-6,'frame origin stored in legacy model meters');
  assert.ok(new THREE.Quaternion().fromArray(frame.quaternion).angleTo(rotation)<1e-6,'frame axes stored in legacy model frame');
  const basis=new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().fromArray(frame.quaternion));assert.ok(Math.abs(basis.determinant()-1)<1e-6,'frame is normalized and right-handed');
  assert.ok(editor.run('undoStack.length')>0,'reframe must be undoable');
  editor.rawSyncTransformFields();for(const id of ['posX','posY','posZ','rotX','rotY','rotZ']) assert.ok(Math.abs(Number(editor.input(id).value))<1e-6,id+' resets relative to adopted frame');
});

test('workpiece numeric and keyboard movement follow adopted axes while global axes stay fixed',()=>{
  const {editor,mesh}=fixture();editor.functions.redefineWorkFrame();const baseline=points(mesh),frameWorld=mesh.getWorldQuaternion(new THREE.Quaternion()),axis=new THREE.Vector3(1,0,0).applyQuaternion(frameWorld);
  editor.functions.keyboardTransform({key:'ArrowRight',ctrlKey:false,altKey:false,preventDefault(){}});
  assertPoints(points(mesh),baseline.map(point=>point.clone().addScaledVector(axis,.01)),'local keyboard X follows workpiece frame');
  editor.rawSyncTransformFields();editor.input('posX').value='100';editor.input('posY').value='0';editor.input('posZ').value='0';editor.input('rotX').value='0';editor.input('rotY').value='0';editor.input('rotZ').value='0';
  editor.functions.applyTransform();assertPoints(points(mesh),baseline.map(point=>point.clone().addScaledVector(axis,.1)),'local numeric X follows workpiece frame');
  editor.functions.resetWorkFrame();const beforeGlobal=points(mesh);editor.functions.keyboardTransform({key:'ArrowRight',ctrlKey:false,altKey:false,preventDefault(){}});
  assertPoints(points(mesh),beforeGlobal.map(point=>point.clone().add(new THREE.Vector3(.01,0,0))),'global keyboard X remains width positive');
});

test('workpiece frame survives serialization and undo restores pre-frame geometry and metadata',()=>{
  const {editor,mesh}=fixture(),before=points(mesh);editor.functions.redefineWorkFrame();const record=JSON.parse(JSON.stringify(editor.serializeMesh(mesh))),frame=record.workFrame;
  const restored=new THREE.Group();restored.quaternion.copy(semanticFrame);editor.setModel(restored,{});const restoredMesh=editor.hydrateRecord(record);assertPoints(points(restoredMesh),before,'reload preserves geometry');assert.deepEqual(JSON.parse(JSON.stringify(restoredMesh.userData.workFrame.origin)),frame.origin,'reload preserves machining origin');assert.ok(new THREE.Quaternion().fromArray(restoredMesh.userData.workFrame.quaternion).angleTo(new THREE.Quaternion().fromArray(frame.quaternion))<1e-6,'reload preserves machining axes');assert.equal(restoredMesh.userData.editId,'work-frame-fixture');
  editor.run('lastUndoAt=-1000');editor.functions.undoOneStep();const undoMesh=editor.getModel().children.find(item=>item.isMesh);assert.ok(undoMesh);assertPoints(points(undoMesh),before,'undo preserves baseline geometry');assert.ok(!undoMesh.userData.workFrame,'undo removes newly adopted frame');
});

test('multi-selection rejects workpiece reference assignment without mutating any component',()=>{
  const {editor,model,mesh}=fixture(),other=new THREE.Mesh(new THREE.BoxGeometry(.1,.2,.3));model.add(other);editor.setSelection([mesh,other]);
  assert.equal(editor.functions.redefineWorkFrame(),false);assert.ok(!mesh.userData.workFrame&&!other.userData.workFrame);assert.match(editor.input('status').textContent,/单选|单个/);
});

test('axis offset and gizmo proxy obey the fixed reference after adopting rotated workpiece axes',()=>{
  const {editor,mesh}=fixture();editor.functions.redefineWorkFrame();const baseline=points(mesh),worldAxis=new THREE.Vector3(1,0,0).applyQuaternion(mesh.getWorldQuaternion(new THREE.Quaternion()));
  editor.input('axisOffsetValue').value='25';editor.functions.applyAxisOffset();assertPoints(points(mesh),baseline.map(point=>point.clone().addScaledVector(worldAxis,.025)),'axis dialog must use workpiece X');
  editor.functions.selectMeshes([mesh]);const control=editor.getTransform(),proxy=control.object;
  assert.ok(proxy&&proxy!==mesh,'workpiece gizmo must use a reference proxy rather than mesh current pose');
  assert.ok(new THREE.Vector3(1,0,0).applyQuaternion(proxy.getWorldQuaternion(new THREE.Quaternion())).distanceTo(worldAxis)<1e-6,'proxy axes match fixed reference');
  const before=points(mesh),proxyPosition=proxy.position.clone();editor.functions.prepareGroupTransform();proxy.position.copy(proxyPosition.clone().addScaledVector(worldAxis,.02));editor.functions.applyGroupTransformDelta();assertPoints(points(mesh),before.map(point=>point.clone().addScaledVector(worldAxis,.02)),'proxy drag follows reference');
  editor.functions.applyGroupTransformDelta();assertPoints(points(mesh),before.map(point=>point.clone().addScaledVector(worldAxis,.02)),'repeated proxy event must not apply twice');
  proxy.position.copy(proxyPosition.clone().addScaledVector(worldAxis,.05));editor.functions.applyGroupTransformDelta();assertPoints(points(mesh),before.map(point=>point.clone().addScaledVector(worldAxis,.05)),'second proxy delta applies to baseline');
});

test('malformed imported workpiece frame is ignored without changing valid geometry',()=>{
  const {editor,mesh}=fixture(),baseline=points(mesh),record=JSON.parse(JSON.stringify(editor.serializeMesh(mesh)));
  record.workFrame={origin:['invalid',0,0],quaternion:[0,0,0,0]};const restored=new THREE.Group();restored.quaternion.copy(semanticFrame);editor.setModel(restored,{});
  const item=editor.hydrateRecord(record);assertPoints(points(item),baseline,'invalid editing reference cannot alter actual geometry');assert.ok(!item.userData.workFrame,'nonfinite origin or zero-length rotation cannot become an active frame');
});

test('global reset and repeated selection never leave a stale workpiece proxy attached',()=>{
  const {editor,mesh}=fixture();editor.functions.redefineWorkFrame();const firstProxy=editor.getTransform().object;assert.ok(firstProxy!==mesh&&firstProxy.parent,'local proxy is visible in scene');
  editor.functions.resetWorkFrame();assert.equal(editor.getTransform().object,mesh,'reset immediately reattaches actual mesh in global mode');assert.equal(editor.getTransform().space,'world','reset restores canonical gizmo basis');
  editor.functions.redefineWorkFrame();editor.functions.clearSelection();assert.equal(editor.getTransform().object,null,'clearing selection detaches control');
  editor.functions.selectMeshes([mesh]);const nextProxy=editor.getTransform().object;assert.ok(nextProxy&&nextProxy!==mesh&&nextProxy.parent,'reselect must attach a proxy that is actually present in scene');
  editor.functions.clearSelection();editor.functions.selectMeshes([mesh]);assert.ok(editor.getTransform().object?.parent,'multiple selection cycles must not orphan editing controls');
});

test('successive position edits do not reuse or restore a stale scaling baseline',()=>{
  const{editor,mesh}=fixture();editor.functions.redefineWorkFrame();editor.rawSyncTransformFields();editor.bindTransformInputs();const before=points(mesh),frame=editor.functions.activeFrameWorld();
  const edit=(id,value)=>{const field=editor.input(id);field.onfocus();field.value=String(value);field.oninput();field.onchange();field.onblur()};
  edit('posX',100);editor.rawSyncTransformFields();edit('posY',50);
  const delta=new THREE.Vector3(.1,.05,0).applyQuaternion(frame.quaternion);assertPoints(points(mesh),before.map(point=>point.clone().add(delta)),'each position edit applies without cached scale rollback');
});

test('single workpiece local frame switches back to explicit global mode for multi-selection',()=>{
  const{editor,model,mesh}=fixture();editor.functions.redefineWorkFrame();const other=new THREE.Mesh(new THREE.BoxGeometry(.1,.2,.3));other.userData.editId='other-fixture';model.add(other);
  editor.functions.selectMeshes([other,mesh]);editor.rawSyncTransformFields();assert.equal(editor.run('transformFrame'),'global','multi-selection only supports the global contract');assert.equal(editor.input('transformFrame').value,'global','coordinate selector must agree with actual multi-selection controls');assert.match(editor.input('workFrameState').textContent,/全局/);assert.doesNotMatch(editor.input('workFrameState').textContent,/工件局部/);assert.equal(editor.input('redefineWorkFrame').disabled,true,'workpiece reference reassignment is disabled for groups');assert.equal(editor.input('resetWorkFrame').disabled,true,'reference reset cannot act on just one member of a multi-selection');
});
