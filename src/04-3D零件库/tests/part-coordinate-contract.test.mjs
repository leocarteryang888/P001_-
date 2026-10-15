import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../vendor/three/build/three.module.js';
import { createEditorCpu } from './editor-cpu-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const editor = fs.readFileSync(path.join(root, 'js/part-library.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const preview = fs.readFileSync(path.join(root, '../../outputs/03-整机选型工作台/three-preview.js'), 'utf8');

const legacyPartToSemantic = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)
));
const oldPartAxes = {
  width: new THREE.Vector3(1, 0, 0),
  height: new THREE.Vector3(0, 1, 0),
  length: new THREE.Vector3(0, 0, 1)
};
assert.deepEqual(oldPartAxes.width.clone().applyQuaternion(legacyPartToSemantic).toArray().map(value => { const rounded = Math.round(value); return rounded === 0 ? 0 : rounded; }), [-1, 0, 0]);
assert.deepEqual(oldPartAxes.length.clone().applyQuaternion(legacyPartToSemantic).toArray().map(value => { const rounded = Math.round(value); return rounded === 0 ? 0 : rounded; }), [0, 1, 0]);
assert.deepEqual(oldPartAxes.height.clone().applyQuaternion(legacyPartToSemantic).toArray().map(value => { const rounded = Math.round(value); return rounded === 0 ? 0 : rounded; }), [0, 0, 1]);
const oldGeometry = new THREE.Mesh(new THREE.BoxGeometry(.8, .6, .4));
const semanticGeometry = new THREE.Group();
semanticGeometry.quaternion.copy(legacyPartToSemantic);
semanticGeometry.add(oldGeometry);
semanticGeometry.updateMatrixWorld(true);
const semanticSize = new THREE.Box3().setFromObject(semanticGeometry).getSize(new THREE.Vector3());
assert.ok(semanticSize.distanceTo(new THREE.Vector3(.8, .4, .6)) < 5e-8, 'legacy box width/depth/height must display as canonical X/Y/Z width/length/height');

const legacyWorkbenchToSemantic = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
  new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0)
));
const oldFlow = new THREE.Vector3(1, 0, 0).applyQuaternion(legacyWorkbenchToSemantic);
const oldUp = new THREE.Vector3(0, 1, 0).applyQuaternion(legacyWorkbenchToSemantic);
const oldWidth = new THREE.Vector3(0, 0, 1).applyQuaternion(legacyWorkbenchToSemantic);
assert.deepEqual(oldWidth.toArray().map(value => { const rounded = Math.round(value); return rounded === 0 ? 0 : rounded; }), [1, 0, 0]);
assert.deepEqual(oldFlow.toArray().map(value => { const rounded = Math.round(value); return rounded === 0 ? 0 : rounded; }), [0, 1, 0]);
assert.deepEqual(oldUp.toArray().map(value => { const rounded = Math.round(value); return rounded === 0 ? 0 : rounded; }), [0, 0, 1]);

const partFlow = new THREE.Vector3(0, 0, 1);
const partUp = new THREE.Vector3(0, 1, 0);
const partRight = new THREE.Vector3().crossVectors(partUp, partFlow).normalize();
const partBasis = new THREE.Matrix4().makeBasis(partRight, partUp, partFlow);
const workbenchFlow = new THREE.Vector3(1, 0, 0);
const workbenchUp = new THREE.Vector3(0, 1, 0);
const workbenchRight = new THREE.Vector3().crossVectors(workbenchUp, workbenchFlow).normalize();
const workbenchBasis = new THREE.Matrix4().makeBasis(workbenchRight, workbenchUp, workbenchFlow);
const legacyPartMounting = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().multiplyMatrices(workbenchBasis, partBasis.invert()));
const composedMounting = legacyWorkbenchToSemantic.clone().multiply(legacyPartMounting);
assert.deepEqual(partFlow.clone().applyQuaternion(composedMounting).toArray().map(value => { const rounded = Math.round(value); return rounded === 0 ? 0 : rounded; }), [0, 1, 0], 'legacy default airflow must enter the AHU along semantic +Y');
assert.deepEqual(partUp.clone().applyQuaternion(composedMounting).toArray().map(value => { const rounded = Math.round(value); return rounded === 0 ? 0 : rounded; }), [0, 0, 1], 'legacy default top must point along semantic +Z');

assert.match(editor, /model\.quaternion\.copy\(legacyPartToSemantic\)/, 'part library must show legacy geometry in the semantic XYZ frame');
const actualEditor=createEditorCpu();
actualEditor.setModel(new THREE.Group(),{customScene:[{id:'coordinate-fixture',geometry:{type:'box',size:[.8,.6,.4]},position:[.1,.2,.3],rotation:[0,0,0],scale:[1,1,1]}]});
actualEditor.functions.build();
const actualMesh=actualEditor.getModel().children.find(item=>item.isMesh);
actualEditor.setSelection([actualMesh]);actualEditor.rawSyncTransformFields();
for(const[id,expected]of Object.entries({posX:-100,posY:300,posZ:200,scaleX:1,scaleY:1,scaleZ:1}))assert.ok(Math.abs(Number(actualEditor.input(id).value)-expected)<1e-6,`${id} must use canonical position and this-operation scale semantics`);
const actualBounds=actualEditor.overallBoundsMm();assert.ok(actualBounds.distanceTo(new THREE.Vector3(800,400,600))<.001,'actual production editor build exposes Xwidth/Ylength/Zheight');
assert.match(html, /宽度 X[\s\S]*长度 Y[\s\S]*高度 Z/, 'part dimension inputs must identify width, length and height axes');
assert.match(preview, /model\.quaternion\.copy\(legacyWorkbenchToSemantic\)/, 'whole-unit preview must apply one root-level axis mapping');
assert.match(preview, /targetFlow=new THREE\.Vector3\(1,0,0\),targetUp=new THREE\.Vector3\(0,1,0\)/, 'linked part mounting must first resolve in the preserved legacy workbench frame');
console.log('通过：旧零件几何、零件库尺寸/坐标输入和整机预览均按 X宽、Y长、Z高呈现。');
