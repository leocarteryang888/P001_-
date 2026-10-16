import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { test } from 'node:test';
import { createEditorCpu, THREE } from './editor-cpu-harness.mjs';

const storeContext={localStorage:{getItem(){return null}},indexedDB:null};vm.runInNewContext(fs.readFileSync(new URL('../js/part-library-store.js',import.meta.url),'utf8'),storeContext);const normalizePart=storeContext.AHUPartLibraryStore.normalizePart;
const preview=fs.readFileSync(new URL('../../03-整机选型工作台/js/three-preview.js',import.meta.url),'utf8'),formal=fs.readFileSync(new URL('../../03-整机选型工作台/js/formal-three-preview.js',import.meta.url),'utf8'),decoderContext=vm.createContext({THREE});
vm.runInContext(preview.slice(preview.indexOf('function linkedGeometry('),preview.indexOf('function linkedAxisVector('))+'\n'+formal.slice(formal.indexOf('  function createPartGeometry('),formal.indexOf('  function axisVector('))+'\nglobalThis.decodeWorkbench=linkedGeometry;globalThis.decodeFormal=createPartGeometry;',decoderContext);
const validPart=()=>({id:'import-fixture',name:'Imported fixture',category:'custom',kind:'custom',dimensions:{width:200,height:400,depth:600},mounting:{flow:'+z',up:'+y'},customScene:[{id:'fixture-component',geometry:{type:'box',size:[.2,.4,.6]},position:[.1,.2,.3],rotation:[.3,.5,.7],scale:[1.2,.8,1.1]}]});
const malformed=[
  ['infinite dimension string',p=>p.dimensions.width='Infinity'],
  ['negative dimension',p=>p.dimensions.height=-1],
  ['blank dimension',p=>p.dimensions.depth=''],
  ['null dimension',p=>p.dimensions.width=null],
  ['unknown geometry frame',p=>p.geometryFrame='unknown-frame'],
  ['nonfinite component position',p=>p.customScene[0].position=['Infinity',0,0]],
  ['singular component scale',p=>p.customScene[0].scale=[0,1,1]],
  ['unknown mesh type',p=>p.customScene[0].geometry={type:'mystery',size:[.2,.4,.6]}],
  ['nonfinite geometry size',p=>p.customScene[0].geometry.size[0]='Infinity'],
  ['malformed triangle buffer',p=>p.customScene[0].geometry={type:'buffer',position:[0,0,0,1,0],normal:[]}],
  ['mismatched mesh normals',p=>p.customScene[0].geometry={type:'buffer',position:[0,0,0,1,0,0,0,1,0],normal:[1,0,0]}],
  ['invalid work frame',p=>p.customScene[0].workFrame={origin:['invalid',0,0],quaternion:[0,0,0,0]}]
];
function fixture(){const editor=createEditorCpu(),current=validPart();current.id='current-user-fixture';const model=new THREE.Group();editor.setModel(model,structuredClone(current));editor.hydrateRecord(current.customScene[0]);editor.setLibrary([structuredClone(current)]);editor.setCategories([{id:'current-category',name:'Current user category'}]);let writes=0;editor.setPersistenceHooks({normalizePart,save(parts){writes++;return parts},sharedState(){return null}});editor.bindImport();editor.run('selectPart=()=>{}');return{editor,current,writes:()=>writes}}
for(const[label,change]of malformed)test(`invalid import ${label} preserves live library, scene, categories and performs no persistence`,async()=>{
  const{editor,writes}=fixture(),part=validPart();change(part);const before={library:JSON.stringify(editor.getLibrary()),categories:JSON.stringify(editor.getCategories()),scene:JSON.stringify(editor.serializeScene()),active:JSON.stringify(editor.getPart())};
  await editor.input('importFile').onchange({target:{files:[{text:async()=>JSON.stringify({schemaVersion:2,parts:[part],categories:[{id:'new-category',name:'New category'}]})}]}});
  assert.equal(JSON.stringify(editor.getLibrary()),before.library,'rejected import cannot replace current library');assert.equal(JSON.stringify(editor.getCategories()),before.categories,'rejected import cannot replace categories');assert.equal(JSON.stringify(editor.serializeScene()),before.scene,'rejected import cannot replace unsaved scene');assert.equal(JSON.stringify(editor.getPart()),before.active,'rejected import cannot replace active part');assert.equal(writes(),0,'reject before any persistence');assert.match(editor.input('status').textContent,/失败|无效|拒绝/,'invalid import must explain failure');
});
test('unsupported import schema preserves current library before any write',async()=>{const{editor,writes}=fixture(),before=JSON.stringify(editor.getLibrary());await editor.input('importFile').onchange({target:{files:[{text:async()=>JSON.stringify({schemaVersion:99,parts:[validPart()]})}]}});assert.equal(JSON.stringify(editor.getLibrary()),before);assert.equal(writes(),0)});
test('valid custom geometry without nominal product dimensions imports without manufacturing dimension fabrication',async()=>{
  const{editor,writes}=fixture(),part=validPart();delete part.dimensions;part.extension={owned:'preserve'};part.customScene[0].workFrame={origin:[.1,.2,.3],quaternion:[0,0,0,1]};
  await editor.input('importFile').onchange({target:{files:[{text:async()=>JSON.stringify({schemaVersion:2,parts:[part]})}]}});
  assert.equal(writes(),1,'valid geometry commits once');const stored=editor.getLibrary()[0];assert.equal(stored.id,part.id);assert.deepEqual(JSON.parse(JSON.stringify(stored.customScene)),part.customScene,'import preserves mesh geometry and transforms');assert.deepEqual(JSON.parse(JSON.stringify(stored.extension)),part.extension,'unknown extension is retained');assert.ok(Object.values(stored.dimensions||{}).every(value=>value!==1),'missing nominal dimensions are not fabricated as 1mm');
});

test('import persistence failure retains live library, current edit and categories',async()=>{
  const{editor}=fixture(),before={library:JSON.stringify(editor.getLibrary()),categories:JSON.stringify(editor.getCategories()),scene:JSON.stringify(editor.serializeScene()),active:JSON.stringify(editor.getPart())};
  editor.setPersistenceHooks({normalizePart,save(){throw Error('isolated persistence failure')},sharedState(){return null}});
  await editor.input('importFile').onchange({target:{files:[{text:async()=>JSON.stringify({schemaVersion:2,parts:[validPart()],categories:[{id:'candidate-category',name:'Candidate'}]})}]}});
  assert.equal(JSON.stringify(editor.getLibrary()),before.library);assert.equal(JSON.stringify(editor.getCategories()),before.categories);assert.equal(JSON.stringify(editor.serializeScene()),before.scene);assert.equal(JSON.stringify(editor.getPart()),before.active);assert.match(editor.input('status').textContent,/失败/);
});

test('legal indexed mesh import expands exactly to the nonindexed assembly contract',async()=>{
  const{editor,writes}=fixture(),part=validPart(),geometry=new THREE.BoxGeometry(.2,.4,.6),expected=Array.from(geometry.toNonIndexed().attributes.position.array);part.customScene[0].geometry={type:'buffer',position:Array.from(geometry.attributes.position.array),normal:Array.from(geometry.attributes.normal.array),index:Array.from(geometry.index.array),ownedAnnotation:'preserve'};
  await editor.input('importFile').onchange({target:{files:[{text:async()=>JSON.stringify({schemaVersion:2,parts:[part]})}]}});
  assert.equal(writes(),1,'approved valid indexed mesh import must preserve actual triangles by conversion');
  const actual=editor.getLibrary()[0].customScene[0].geometry;assert.ok(!actual.index?.length,'actual workbench decoders consume nonindexed triangles, so import cannot retain an unsupported index');assert.deepEqual(JSON.parse(JSON.stringify(actual.position)),expected,'accepted conversion preserves every rendered triangle');
  assert.equal(actual.ownedAnnotation,'preserve','conversion preserves geometry extensions');
  for(const decode of [decoderContext.decodeWorkbench,decoderContext.decodeFormal])assert.deepEqual(Array.from(decode(actual).attributes.position.array),expected,'both actual AHU consumers decode exactly the imported triangles');
});

test('legal indexed quad with four vertices imports without a fabricated third triangle',async()=>{
  const{editor,writes}=fixture(),part=validPart();const position=[0,0,0,.2,0,0,.2,.4,0,0,.4,0],normal=[0,0,1,0,0,1,0,0,1,0,0,1],index=[0,1,2,0,2,3],expected=index.flatMap(i=>position.slice(i*3,i*3+3));part.customScene[0].geometry={type:'buffer',position,normal,index};
  await editor.input('importFile').onchange({target:{files:[{text:async()=>JSON.stringify({schemaVersion:2,parts:[part]})}]}});assert.equal(writes(),1,'valid indexed vertices need only be grouped in vectors, while indices define triangles');const actual=editor.getLibrary()[0].customScene[0].geometry;assert.deepEqual(JSON.parse(JSON.stringify(actual.position)),expected);assert.ok(!actual.index?.length);for(const decode of [decoderContext.decodeWorkbench,decoderContext.decodeFormal])assert.deepEqual(Array.from(decode(actual).attributes.position.array),Array.from(new Float32Array(expected)));
});
