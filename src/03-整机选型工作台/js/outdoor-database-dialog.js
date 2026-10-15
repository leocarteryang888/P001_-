(function(global){
  'use strict';
  const io=global.OutdoorDataIO;
  let database,selectedIndex=0,pendingImport=null;
  const $=id=>document.getElementById(id),escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  try{database=io.load();}catch(error){database=io.clone(global.AHUOutdoorConditions);queueMicrotask(()=>setStatus(`浏览器数据库无法加载，已回退默认库：${error.message}`,true));}
  function setStatus(message,error=false){if(!$('outdoorDatabaseStatus'))return;$('outdoorDatabaseStatus').textContent=message;$('outdoorDatabaseStatus').classList.toggle('is-error',error);}
  function current(){return database.locations[selectedIndex];}
  function renderList(){
    const query=$('outdoorDatabaseSearch').value.trim().toLowerCase();
    const rows=database.locations.map((record,index)=>({record,index})).filter(({record})=>`${record.province} ${record.city} ${record.station}`.toLowerCase().includes(query));
    $('outdoorRecordList').innerHTML=rows.map(({record,index})=>`<button type="button" data-index="${index}" class="${index===selectedIndex?'selected':''}"><strong>${escape(record.city)}</strong><span>${escape(record.province)} · ${escape(record.station||'无台站')}</span></button>`).join('')||'<p>没有匹配记录</p>';
    $('outdoorRecordList').querySelectorAll('button').forEach(button=>button.onclick=()=>{selectedIndex=Number(button.dataset.index);renderList();renderForm();});
  }
  function renderForm(){
    const record=current();if(!record){$('outdoorRecordForm').innerHTML='<p>请选择或新增记录。</p>';return;}
    $('outdoorRecordForm').innerHTML=`<div class="record-title"><strong>${escape(record.province)} · ${escape(record.city)}</strong><span>第 ${selectedIndex+1}/${database.locations.length} 条</span></div><div class="record-fields">${database.fields.map(field=>`<label>${escape(field.label)}${field.unit?` <small>${escape(field.unit)}</small>`:''}${field.required?' *':''}<input data-key="${field.key}" type="${field.type==='number'?'number':'text'}" step="any" value="${escape(record[field.key]??'')}"></label>`).join('')}</div>`;
  }
  function renderAll(){renderList();renderForm();setStatus(`当前数据库：${database.locations.length} 个地区，${database.fields.length} 个字段。来源：${database.source.standard}；${database.source.workbook}`);}
  function dispatchChange(){global.dispatchEvent(new CustomEvent('outdoor-database-changed',{detail:{count:database.locations.length}}));}
  function open(){selectedIndex=Math.min(selectedIndex,database.locations.length-1);renderAll();$('outdoorDatabaseDialog').showModal();}
  $('outdoorDatabaseSearch').addEventListener('input',renderList);
  $('saveOutdoorRecord').onclick=()=>{try{const draft=io.clone(current());$('outdoorRecordForm').querySelectorAll('input').forEach(input=>{const field=database.fields.find(item=>item.key===input.dataset.key);draft[field.key]=field.type==='number'?(input.value===''?null:Number(input.value)):input.value.trim();});const next=io.clone(database);next.locations[selectedIndex]=draft;io.validate(next);io.save(next);database=next;renderAll();dispatchChange();setStatus(`已保存：${draft.province} · ${draft.city}。`);}catch(error){setStatus(`保存失败：${error.message}`,true);}};
  $('addOutdoorRecord').onclick=()=>{const blank=Object.fromEntries(database.fields.map(field=>[field.key,field.type==='number'?null:'']));blank.province='新省份';blank.city=`新城市${database.locations.length+1}`;database.locations.push(blank);selectedIndex=database.locations.length-1;$('outdoorDatabaseSearch').value='';renderAll();setStatus('已创建临时记录，请填写必填字段后保存。');};
  $('deleteOutdoorRecord').onclick=()=>{if(!current()||database.locations.length<=1)return;if(!confirm(`确认删除 ${current().province} · ${current().city}？`))return;const next=io.clone(database);next.locations.splice(selectedIndex,1);selectedIndex=Math.min(selectedIndex,next.locations.length-1);try{io.save(next);database=next;renderAll();dispatchChange();setStatus('记录已删除。');}catch(error){setStatus(`删除失败：${error.message}`,true);}};
  $('exportOutdoorDatabase').onclick=()=>{try{global.XLSX.writeFile(io.toWorkbook(database),`室外气象参数数据库_${new Date().toISOString().slice(0,10)}.xlsx`);setStatus('已导出完整 Excel 数据库。');}catch(error){setStatus(`导出失败：${error.message}`,true);}};
  $('outdoorDatabaseFile').addEventListener('change',async event=>{pendingImport=null;$('applyOutdoorDatabase').disabled=true;const file=event.target.files[0];if(!file)return;try{if(!/\.(xlsx|xls|xlsm)$/i.test(file.name))throw new Error('请选择 XLSX、XLS 或 XLSM 文件。');if(file.size>10*1024*1024)throw new Error('文件不能超过 10MB。');const book=global.XLSX.read(await file.arrayBuffer(),{type:'array',cellFormula:true});pendingImport=io.fromWorkbook(book);$('applyOutdoorDatabase').disabled=false;$('outdoorImportMessage').textContent=`校验通过：${pendingImport.locations.length} 条，点击“应用导入”。`;}catch(error){$('outdoorImportMessage').textContent=`导入失败：${error.message}`;}});
  $('applyOutdoorDatabase').onclick=()=>{if(!pendingImport)return;try{io.save(pendingImport);database=pendingImport;pendingImport=null;selectedIndex=0;$('applyOutdoorDatabase').disabled=true;$('outdoorDatabaseFile').value='';$('outdoorImportMessage').textContent='导入已应用。';renderAll();dispatchChange();}catch(error){setStatus(`应用失败：${error.message}`,true);}};
  $('restoreOutdoorDatabase').onclick=()=>{if(!confirm('确认清除浏览器修改并恢复项目默认数据库？'))return;io.clear();database=io.clone(global.AHUOutdoorConditions);selectedIndex=0;renderAll();dispatchChange();setStatus('已恢复项目默认数据库。');};
  global.OutdoorDatabaseManager={open,getDatabase:()=>database};
})(window);
