import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { createEditorCpu, THREE } from './editor-cpu-harness.mjs';

const preview=fs.readFileSync(new URL('../../03-整机选型工作台/js/three-preview.js',import.meta.url),'utf8');
const formal=fs.readFileSync(new URL('../../03-整机选型工作台/js/formal-three-preview.js',import.meta.url),'utf8');
function functionSource(source,name){const match=new RegExp(`^\\s*function ${name}\\(`,'m').exec(source);assert.ok(match,`production ${name} exists`);const start=match.index+match[0].indexOf('function'),opening=source.indexOf('{',start);let depth=1,end=opening+1;for(;depth&&end<source.length;end++){if(source[end]==='{')depth++;else if(source[end]==='}')depth--;}return source.slice(start,end)}
const partToWorld=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0)));
const workbenchToWorld=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0)));
const vector=axis=>{const result=new THREE.Vector3();result[axis.slice(1)]=axis[0]==='-'?-1:1;return result};
function actualAdapter(part){
  const material=new THREE.MeshBasicMaterial(),materials=Object.fromEntries(['galvanized','profile1','dark','handle','coilFins','copper','filterMedia','actuator','actuatorMark'].map(key=>[key,material]));
  const context=vm.createContext({THREE,materials,H:2,localStorage:{getItem:()=>JSON.stringify({parts:[part]})}});
  vm.runInContext(['readPartLibraryRaw','readPartLibrary','linkedPartMaterial','linkedTrapezoid','linkedHollowCylinder','linkedGeometry','linkedAxisVector','linkedMountingQuaternion','addLinkedPart'].map(name=>functionSource(preview,name)).join('\n')+`
    const legacyToSemantic=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0)));
    ${functionSource(formal,'axisVector')}\n${functionSource(formal,'partPlacementRotation')}
    globalThis.api={addLinkedPart,linkedMountingQuaternion,partPlacementRotation,linkedGeometry};`,context);
  return context.api;
}

for(const flow of ['+x','-x','+y','-y','+z','-z']) for(const up of ['+x','-x','+y','-y','+z','-z'].filter(axis=>axis.slice(1)!==flow.slice(1))) test(`actual workbench and formal mounting ${flow}/${up} share canonical world axes`,()=>{
  const part={id:'cpu-fixture',name:'CPU fixture',mounting:{flow,up},customScene:[{geometry:{type:'box',size:[.8,.6,.4]},position:[.13,.21,-.17],rotation:[.2,.3,.1],scale:[1.2,.8,1.1]}]};
  const adapter=actualAdapter(part),mounted=workbenchToWorld.clone().multiply(adapter.linkedMountingQuaternion(part)),direct=adapter.partPlacementRotation(part);
  assert.ok(mounted.angleTo(direct)<1e-6,'both actual production mounting paths must apply exactly one legacy boundary conversion');
  assert.ok(vector(flow).applyQuaternion(mounted).distanceTo(new THREE.Vector3(0,1,0))<1e-6,'flow goes along canonical +Y');
  assert.ok(vector(up).applyQuaternion(mounted).distanceTo(new THREE.Vector3(0,0,1))<1e-6,'top goes along canonical +Z');
  if(flow==='+z'&&up==='+y') assert.ok(mounted.angleTo(partToWorld)<1e-6,'default install must match single-part positive and negative axes exactly');
  const root=new THREE.Group();root.quaternion.copy(workbenchToWorld);const segment=new THREE.Group();root.add(segment);
  assert.equal(adapter.addLinkedPart(segment,{id:'segment-fixture',partRef:{partId:part.id}},1.8),true);
  root.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(root,true),size=bounds.getSize(new THREE.Vector3());
  const object=new THREE.Mesh(adapter.linkedGeometry(part.customScene[0].geometry));object.rotation.set(...part.customScene[0].rotation);object.scale.fromArray(part.customScene[0].scale);const expected=new THREE.Group();expected.quaternion.copy(mounted);expected.add(object);expected.updateMatrixWorld(true);
  const expectedSize=new THREE.Box3().setFromObject(expected,true).getSize(new THREE.Vector3());
  assert.ok(size.distanceTo(expectedSize)<1e-6,'installation before display fit must preserve true semantic extents');
});

test('actual mesh decoder preserves all editor primitive and baked-buffer vertices',()=>{
  const editor=createEditorCpu(),adapter=actualAdapter({id:'decoder'});
  const records=[{type:'box',size:[.2,.4,.6]},{type:'sphere',size:[.12,32,20]},{type:'cylinder',size:[.1,.05,.3,28]},{type:'torus',size:[.2,.03,10,32,4.5]},{type:'trapezoid',size:[.24,.2,.2,.62]},{type:'hollowCylinder',size:[.12,.075,.24]}];
  const geometry=new THREE.BoxGeometry(.2,.4,.6).toNonIndexed();geometry.translate(.1,.2,.3);records.push(editor.geometryRecord(geometry));
  for(const record of records){const library=editor.createGeometry(record),workbench=adapter.linkedGeometry(record);assert.deepEqual(Array.from(workbench.attributes.position.array),Array.from(library.attributes.position.array),record.type+' decoding must retain exactly the same mesh');}
  const dirtyIndexed=new THREE.BoxGeometry(.2,.4,.6);dirtyIndexed.translate(.1,.2,.3);dirtyIndexed.userData.geometryDirty=true;
  const dirtyRecord=editor.geometryRecord(dirtyIndexed),workbench=adapter.linkedGeometry(dirtyRecord);
  const triangleVertices=geometry=>Array.from((geometry.index?geometry.toNonIndexed():geometry).attributes.position.array);
  assert.deepEqual(triangleVertices(workbench),triangleVertices(dirtyIndexed),'modified indexed primitive must retain all rendered triangles in actual workbench');
});
