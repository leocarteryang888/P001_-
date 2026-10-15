import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/build/three.module.js';
import { subtractMesh, splitDisconnectedGeometry } from '../js/mesh-csg.js';

const target = new THREE.Mesh(new THREE.BoxGeometry(.4,.4,.12));
const sphere = new THREE.Mesh(new THREE.SphereGeometry(.12,24,16));
const sphere2 = new THREE.Mesh(new THREE.SphereGeometry(.12,24,16));
// Both spheres overlap only the top half of the plate, producing shallow
// spherical pockets instead of through-cuts. The second subtraction is the
// regression that used to expose missing faces and radial artifacts.
sphere.position.set(-.09,0,.13);
sphere2.position.set(.09,0,.13);
const root = new THREE.Group();
root.add(target,sphere,sphere2);
root.updateMatrixWorld(true);

const first = subtractMesh(target,[sphere]);
assert.ok(first, 'first sphere/plate subtraction should produce a mesh');
const intermediate = new THREE.Mesh(first);
intermediate.updateMatrixWorld(true);
const result = subtractMesh(intermediate,[sphere2]);
assert.ok(result, 'sphere/plate subtraction should produce a mesh');
assert.equal(result.userData.record.type,'buffer', 'CSG output must use a buffer mesh record');
assert.ok(result.attributes.position.count>36, 'CSG output should contain new intersection triangles');

const positions=result.attributes.position;
let pocketCount=0,degenerateCount=0,bottomArea=0,signedVolume=0;
for(let i=0;i<positions.count;i++){
  if(i%3!==0)continue;
  const a=new THREE.Vector3().fromBufferAttribute(positions,i);
  const b=new THREE.Vector3().fromBufferAttribute(positions,i+1);
  const c=new THREE.Vector3().fromBufferAttribute(positions,i+2);
  const cross=b.clone().sub(a).cross(c.clone().sub(a));
  if(cross.lengthSq()<=1e-12)degenerateCount++;
  const z=[a.z,b.z,c.z];
  if(z.every(value=>value<-.0599)){
    bottomArea+=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2;
    assert.ok(cross.z<0,'bottom plate triangles must keep outward -Z winding');
  }
  if(z.every(value=>value>.0599))assert.ok(cross.z>0,'top plate triangles must keep outward +Z winding');
  signedVolume+=a.dot(b.clone().cross(c))/6;
  const centroid=a.clone().add(b).add(c).multiplyScalar(1/3);
  if(Math.abs(centroid.x+.09)<.05||Math.abs(centroid.x-.09)<.05){
    if(centroid.z>.005&&centroid.z<.06)pocketCount++;
  }
}
assert.ok(pocketCount>0, 'result should retain curved pocket surfaces at both sphere centres');
assert.equal(degenerateCount,0, 'CSG output must not contain degenerate triangles');
assert.ok(bottomArea>.159, 'the shallow cuts must leave the complete back face of the plate');
assert.ok(signedVolume>.015, 'consistent outward triangle winding must preserve a positive solid volume');

const serialized=JSON.parse(JSON.stringify(result.userData.record));
assert.equal(serialized.type,'buffer');
const restored=new THREE.BufferGeometry();
restored.setAttribute('position',new THREE.Float32BufferAttribute(serialized.position,3));
restored.setAttribute('normal',new THREE.Float32BufferAttribute(serialized.normal,3));
assert.equal(restored.attributes.position.count,result.attributes.position.count, 'restored mesh must retain all CSG triangles');
assert.equal(restored.attributes.normal.count,result.attributes.normal.count, 'restored mesh must retain normals');
let restoredBottomArea=0;
for(let i=0;i<restored.attributes.position.count;i++){
  if(i%3!==0)continue;
  const a=new THREE.Vector3().fromBufferAttribute(restored.attributes.position,i);
  const b=new THREE.Vector3().fromBufferAttribute(restored.attributes.position,i+1);
  const c=new THREE.Vector3().fromBufferAttribute(restored.attributes.position,i+2);
  if([a.z,b.z,c.z].every(value=>value<-.0599))restoredBottomArea+=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))/2;
}
assert.ok(restoredBottomArea>.159, 'buffer serialization/recovery must retain the complete back face');

const separatedPositions=[],separatedNormals=[];
for(const offset of [-.4,.4]){
  const box=new THREE.BoxGeometry(.2,.2,.2).toNonIndexed();
  const p=box.attributes.position,n=box.attributes.normal;
  for(let i=0;i<p.count;i++){separatedPositions.push(p.getX(i)+offset,p.getY(i),p.getZ(i));separatedNormals.push(n.getX(i),n.getY(i),n.getZ(i))}
}
const separated=new THREE.BufferGeometry();
separated.setAttribute('position',new THREE.Float32BufferAttribute(separatedPositions,3));
separated.setAttribute('normal',new THREE.Float32BufferAttribute(separatedNormals,3));
const islands=splitDisconnectedGeometry(separated);
assert.equal(islands.length,2,'disconnected cut result must become two independently editable mesh geometries');
assert.ok(islands.every(item=>item.userData.record?.type==='buffer'),'every split island must persist as a buffer record');
console.log(`通过：连续两次球体浅切保持完整；断开的切割结果已拆为 ${islands.length} 个可独立删除的实体。`);
