const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const XLSX=require('../vendor/xlsx.full.min.js');
const root=path.resolve(__dirname,'..');
const storage=new Map();
const context=vm.createContext({XLSX,localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},console});
context.window=context;context.globalThis=context;
for(const file of ['data/coil-database.js','js/coil-data-io.js','js/coil-selector.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
const plain=value=>JSON.parse(JSON.stringify(value));
const defaults=plain(context.CoilDatabase),io=context.CoilDataIO,selector=context.CoilSelector;
assert.equal(defaults.tables.ceiling.length,151);assert.equal(defaults.tables.floor.length,151);
for(const bookType of ['xlsx','biff8']){
  const bytes=XLSX.write(io.toWorkbook(defaults),{type:'buffer',bookType});
  const decoded=io.fromWorkbook(XLSX.read(bytes,{type:'buffer'}));
  assert.deepEqual(plain(decoded),defaults,bookType+' roundtrip');
}
function invalid(edit,pattern){const book=io.toWorkbook(defaults);edit(book);assert.throws(()=>io.fromWorkbook(book),pattern);assert.deepEqual(plain(selector.getDatabase()),defaults);}
invalid(book=>delete book.Sheets['落地标准表'],/缺少/);
invalid(book=>book.Sheets['吊顶标准表'].A1.v='错误表头',/表头/);
invalid(book=>book.Sheets['吊顶标准表'].A3.v=book.Sheets['吊顶标准表'].A2.v,/不重复/);
invalid(book=>book.Sheets['吊顶标准表'].B2.v=7.94,/仅限/);
invalid(book=>book.Sheets['吊顶标准表'].C2.v=0,/1–9/);
invalid(book=>book.Sheets['吊顶标准表'].D2.v=9000,/不超过4000/);
invalid(book=>book.Sheets['吊顶标准表'].E2.v='',/完整填写/);
invalid(book=>book.Sheets['吊顶标准表'].E2.f='1+1',/不允许公式/);
invalid(book=>book.Sheets['厚度表'].B3.v=book.Sheets['厚度表'].B2.v,/重复/);
invalid(book=>book.Sheets['厚度表'].C2.v=0,/完整填写/);
invalid(book=>book.Sheets['厚度表']['!ref']='A1:XFD1048576',/行列数/);
const updated=plain(defaults);
updated.tables.floor.find(row=>row.code==='1012').widths[2]=999;
updated.thickness['9.52']['50'][2]=221;
const imported=io.fromWorkbook(io.toWorkbook(updated));
io.save(imported);selector.replaceDatabase(imported);
assert.equal(selector.select({series:'25W',installation:'floor',spec:'1012',rows:4,tube:9.52,header:50}).model,'φ9.52-STTL-4-9.99*9.5');
assert.equal(selector.select({series:'25W',installation:'floor',spec:'1012',rows:4,tube:9.52,header:50}).thickness,221);
assert.deepEqual(plain(io.load()),updated);
let successful=0,review=0;
for(const mode of ['ceiling','floor'])for(const record of imported.tables[mode])for(const rows of imported.rows)for(const header of imported.headers){const result=selector.select({series:'25W',installation:mode,spec:record.code,rows,tube:record.tube,header});if(result.status==='review')review++;else successful++;}
assert.equal(successful+review,9060);
const before=plain(selector.getDatabase());context.localStorage.setItem=()=>{throw new Error('quota');};assert.throws(()=>io.save(defaults),/quota/);assert.deepEqual(plain(selector.getDatabase()),before);
console.log('通过：XLSX/XLS真实往返、11类非法工作簿、保存失败不替换、导入更新选型及9060个有效管径组合。');
