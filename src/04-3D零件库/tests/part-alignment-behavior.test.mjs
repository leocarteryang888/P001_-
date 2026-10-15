import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEditorCpu, THREE } from './editor-cpu-harness.mjs';

const semanticFrame=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0)));
const center=mesh=>{mesh.updateWorldMatrix(true,false);return new THREE.Box3().setFromObject(mesh,true).getCenter(new THREE.Vector3())};
for(const rotated of [false,true]) for(const axis of ['x','y','z','xyz']) test(`global ${axis} axis-line alignment uses canonical axes with ${rotated?'rotated':'unrotated'} anchor`,()=>{
  const editor=createEditorCpu(),model=new THREE.Group();model.quaternion.copy(semanticFrame);
  const moving=new THREE.Mesh(new THREE.BoxGeometry(.2,.4,.6)),anchor=new THREE.Mesh(new THREE.BoxGeometry(.3,.5,.7));
  moving.userData.editId='moving';anchor.userData.editId='anchor';moving.position.copy(new THREE.Vector3(1,2,3).applyQuaternion(semanticFrame.clone().invert()));anchor.position.copy(new THREE.Vector3(4,5,6).applyQuaternion(semanticFrame.clone().invert()));if(rotated)anchor.rotation.set(.3,.5,.7);model.add(moving,anchor);editor.setModel(model,{});editor.setSelection([moving,anchor]);
  const movingBefore=center(moving),anchorBefore=center(anchor);editor.functions.alignSelected(axis);
  const actual=center(moving),anchorAfter=center(anchor),expected=anchorBefore.clone();if(axis!=='xyz')expected[axis]=movingBefore[axis];
  assert.ok(actual.distanceTo(expected)<1e-6,`global axis line expected ${expected.toArray()}, got ${actual.toArray()}`);assert.ok(anchorAfter.distanceTo(anchorBefore)<1e-6,'last selected anchor remains fixed');
});
