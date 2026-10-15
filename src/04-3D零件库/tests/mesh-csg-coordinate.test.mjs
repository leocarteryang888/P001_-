import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from '../vendor/three/build/three.module.js';
import { subtractMesh } from '../js/mesh-csg.js';

const volume=geometry=>{const p=geometry.attributes.position;let value=0;for(let i=0;i<p.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(p,i),b=new THREE.Vector3().fromBufferAttribute(p,i+1),c=new THREE.Vector3().fromBufferAttribute(p,i+2);value+=a.dot(b.cross(c))/6;}return value};
for(const update of [true,false]) test(`CSG subtraction preserves target local frame with transformed ancestors, matrices ${update?'fresh':'not preupdated'}`,()=>{
  const root=new THREE.Group();root.position.set(.4,-.3,.2);root.rotation.set(.25,.35,.45);root.scale.set(1.3,.8,1.1);
  const target=new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.4)),cutter=new THREE.Mesh(new THREE.BoxGeometry(.2,.8,.8));
  target.position.set(.1,.2,.3);target.rotation.set(.2,.1,.3);cutter.position.copy(target.position);cutter.quaternion.copy(target.quaternion);root.add(target,cutter);
  if(update)root.updateMatrixWorld(true);
  const result=subtractMesh(target,[cutter]);assert.ok(result,'intersection should produce remaining halves');
  result.computeBoundingBox();
  assert.ok(Math.abs(volume(result)-.032)<1e-5,`expected .032 cubic m in target local frame; actual ${volume(result)}`);
  for(const axis of ['x','y','z']){assert.ok(Math.abs(result.boundingBox.min[axis]+.2)<1e-5,`${axis} local minimum`);assert.ok(Math.abs(result.boundingBox.max[axis]-.2)<1e-5,`${axis} local maximum`)}
});
