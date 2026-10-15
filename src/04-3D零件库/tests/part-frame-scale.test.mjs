import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEditorCpu, THREE } from './editor-cpu-harness.mjs';
const rootRotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0)));
function fixture(local){const editor=createEditorCpu(),model=new THREE.Group();model.quaternion.copy(rootRotation);const mesh=new THREE.Mesh(new THREE.BoxGeometry(.2,.4,.6));mesh.position.set(.1,.2,.3);mesh.rotation.set(.3,.5,.7);mesh.scale.set(1.2,.8,1.1);mesh.userData.editId='scale-fixture';model.add(mesh);editor.setModel(model,{});editor.setSelection([mesh]);model.updateMatrixWorld(true);if(local){editor.functions.redefineWorkFrame();mesh.rotateZ(.4);model.updateMatrixWorld(true)}editor.rawSyncTransformFields();return{editor,model,mesh}}
const points=mesh=>{mesh.updateWorldMatrix(true,false);return Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position,i).applyMatrix4(mesh.matrixWorld))};
const expectPoints=(mesh,expected,label)=>points(mesh).forEach((point,i)=>assert.ok(point.distanceTo(expected[i])<2e-6,`${label} vertex ${i}: delta ${point.distanceTo(expected[i])}m`));
function expectedScale(before,origin,quaternion,axis,factor){const inverse=quaternion.clone().invert();return before.map(point=>{const local=point.clone().sub(origin).applyQuaternion(inverse);local[axis]*=factor;return local.applyQuaternion(quaternion).add(origin)})}
for(const local of [false,true])for(const axis of ['x','y','z'])test(`${local?'workpiece':'global'} numeric ${axis} scaling uses active axes and repeated commits are idempotent`,()=>{
  const{editor,mesh}=fixture(local),before=points(mesh),frame=local?editor.functions.activeFrameWorld():{origin:mesh.getWorldPosition(new THREE.Vector3()),quaternion:new THREE.Quaternion()};
  for(const key of ['X','Y','Z'])assert.equal(Number(editor.input('scale'+key).value),1,'scale field represents this operation, not original mesh scale');
  editor.bindTransformInputs();const field=editor.input('scale'+axis.toUpperCase());field.onfocus();field.value='1.5';field.oninput();
  const expected=expectedScale(before,frame.origin,frame.quaternion,axis,1.5);expectPoints(mesh,expected,'numeric scale follows frame');assert.equal(Number(field.value),1.5,'pending scale input must retain typed value until commit');field.onchange();expectPoints(mesh,expected,'change commit must not multiply again');field.onblur();expectPoints(mesh,expected,'blur must not multiply again');
  editor.rawSyncTransformFields();for(const key of ['X','Y','Z'])assert.equal(Number(editor.input('scale'+key).value),1,'finished operation resets multipliers to one');
});
for(const local of [false,true])for(const axis of ['x','y','z'])test(`${local?'workpiece':'global'} keyboard ${axis} scaling agrees with active axis affine geometry`,()=>{
  const{editor,mesh}=fixture(local),before=points(mesh),frame=local?editor.functions.activeFrameWorld():{origin:mesh.getWorldPosition(new THREE.Vector3()),quaternion:new THREE.Quaternion()};editor.getTransform().mode='scale';
  editor.functions.keyboardTransform({key:axis==='y'?'ArrowUp':'ArrowRight',altKey:axis==='z',ctrlKey:false,preventDefault(){}});
  expectPoints(mesh,expectedScale(before,frame.origin,frame.quaternion,axis,1.05),'keyboard scale follows frame');
});

for(const local of [false,true])test(`${local?'workpiece':'global'} scale gizmo uses reference proxy axes and repeated drag does not accumulate`,()=>{
  const{editor,mesh}=fixture(local),before=points(mesh),frame=local?editor.functions.activeFrameWorld():{origin:mesh.getWorldPosition(new THREE.Vector3()),quaternion:new THREE.Quaternion()};
  editor.getTransform().mode='scale';editor.functions.configureTransformTarget();const proxy=editor.getTransform().object;assert.ok(proxy&&proxy!==mesh,'global scale needs a proxy because Three.js scales mesh-local axes even in world space');assert.ok(proxy.getWorldQuaternion(new THREE.Quaternion()).angleTo(frame.quaternion)<1e-6,'actual scale handles use operation frame');
  editor.functions.prepareGroupTransform();proxy.scale.set(1.3,.7,1.2);const expected=['x','y','z'].reduce((values,axis,i)=>expectedScale(values,frame.origin,frame.quaternion,axis,[1.3,.7,1.2][i]),before);editor.functions.applyGroupTransformDelta();expectPoints(mesh,expected,'gizmo affine scale follows active axes');editor.functions.applyGroupTransformDelta();expectPoints(mesh,expected,'repeated scale event is idempotent');
});

function groupFixture(){const{editor,model,mesh}=fixture(false),other=new THREE.Mesh(new THREE.BoxGeometry(.3,.1,.2));other.position.set(.6,-.2,.4);other.rotation.set(.2,.7,.4);other.scale.set(.7,1.2,.9);other.userData.editId='other-group-fixture';model.add(other);editor.functions.selectMeshes([mesh,other]);editor.rawSyncTransformFields();editor.bindTransformInputs();return{editor,model,items:[mesh,other]}}
for(const mode of ['position','rotation'])test(`actual multi-selection numeric ${mode} moves every component, not just its pivot`,()=>{
  const{editor,items}=groupFixture(),before=items.map(points),pivot=editor.getSelectionPivot(),origin=pivot.getWorldPosition(new THREE.Vector3()),field=editor.input(mode==='position'?'posX':'rotZ');field.onfocus();field.value=mode==='position'?String(origin.x*1000+100):'90';field.oninput();field.onchange();field.onblur();
  const delta=mode==='position'?new THREE.Matrix4().makeTranslation(.1,0,0):new THREE.Matrix4().makeTranslation(origin.x,origin.y,origin.z).multiply(new THREE.Matrix4().makeRotationZ(Math.PI/2)).multiply(new THREE.Matrix4().makeTranslation(-origin.x,-origin.y,-origin.z));
  items.forEach((mesh,index)=>expectPoints(mesh,before[index].map(point=>point.clone().applyMatrix4(delta)),`group ${mode} actual input lifecycle`));
});
for(const axis of ['x','y','z'])test(`multi-selection keyboard ${axis} scaling follows canonical global axes for rotated components`,()=>{
  const{editor,items}=groupFixture(),before=items.map(points),origin=editor.getSelectionPivot().getWorldPosition(new THREE.Vector3());editor.getTransform().mode='scale';editor.functions.keyboardTransform({key:axis==='y'?'ArrowUp':'ArrowRight',altKey:axis==='z',ctrlKey:false,preventDefault(){}});items.forEach((mesh,index)=>expectPoints(mesh,expectedScale(before[index],origin,new THREE.Quaternion(),axis,1.05),'group keyboard uses global scale affine'));
});

test('multi-selection keyboard scaling refuses a fixed-size constraint without partially changing the group',()=>{
  const{editor,items}=groupFixture(),before=items.map(points);items[0].userData.dimensionModes={x:'fixed',y:'variable',z:'variable'};editor.getTransform().mode='scale';editor.functions.keyboardTransform({key:'ArrowRight',altKey:false,ctrlKey:false,preventDefault(){}});items.forEach((mesh,index)=>expectPoints(mesh,before[index],'fixed constraint refusal preserves complete group'));assert.match(editor.input('status').textContent,/固定|约束|未执行/,'fixed refusal explains why scale was not applied');
});

test('multi-selection numeric scale input and change commit apply one operation exactly once',()=>{
  const{editor,items}=groupFixture(),before=items.map(points),origin=editor.getSelectionPivot().getWorldPosition(new THREE.Vector3()),field=editor.input('scaleY');field.onfocus();field.value='1.5';field.oninput();const expected=before.map(values=>expectedScale(values,origin,new THREE.Quaternion(),'y',1.5));items.forEach((mesh,index)=>expectPoints(mesh,expected[index],'group numeric scale input'));field.onchange();items.forEach((mesh,index)=>expectPoints(mesh,expected[index],'group numeric scale repeated change cannot multiply again'));field.onblur();items.forEach((mesh,index)=>expectPoints(mesh,expected[index],'group numeric scale blur cannot multiply again'));
});

test('multi-selection numeric scaling honors the same fixed-size refusal as keyboard scaling',()=>{
  const{editor,items}=groupFixture(),before=items.map(points);items[0].userData.dimensionModes={x:'variable',y:'variable',z:'fixed'};const field=editor.input('scaleY');field.onfocus();field.value='1.5';field.oninput();field.onchange();field.onblur();items.forEach((mesh,index)=>expectPoints(mesh,before[index],'fixed constraint numeric refusal preserves complete group'));assert.match(editor.input('status').textContent,/固定|约束|未执行/);
});
