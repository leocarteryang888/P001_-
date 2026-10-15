(function () {
  'use strict';
  document.addEventListener('DOMContentLoaded', function () {
    const io=CoilDataIO, selector=CoilSelector;
    const dialog=document.getElementById('coilDatabaseDialog'), viewer=document.getElementById('coilDatabaseViewer');
    const status=document.getElementById('coilDatabaseStatus'), apply=document.getElementById('applyCoilDatabase'), fileInput=document.getElementById('coilDatabaseFile'), table=document.getElementById('coilViewerTable');
    let pending=null, generation=0, activeView='ceiling';
    const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    function message(text,error=false){status.textContent=text;status.classList.toggle('is-error',error);}
    function clear(){generation++;pending=null;apply.disabled=true;fileInput.value='';}
    function viewModel(database,view){
      if(view==='thickness'){const rows=[];for(const tube of ['9.52','12.7'])for(const header of [32,40,50,65,80])rows.push([tube,'DN'+header].concat(database.thickness[tube][header]));return{headers:['管径','汇管径','2排','3排','4排','6排','8排'],rows};}
      return{headers:['箱体规格','管径','数量','高度','DN32','DN40','DN50','DN65','DN80','DN100'],rows:database.tables[view].map(row=>[row.code,row.tube,row.count,row.height].concat(row.widths))};
    }
    function renderViewer(view){activeView=view;const model=viewModel(selector.getDatabase(),view);table.innerHTML='<thead><tr>'+model.headers.map(value=>'<th>'+escape(value)+'</th>').join('')+'</tr></thead><tbody>'+model.rows.map(row=>'<tr>'+row.map(value=>'<td>'+escape(value)+'</td>').join('')+'</tr>').join('')+'</tbody>';document.querySelectorAll('[data-coil-view]').forEach(button=>button.setAttribute('aria-selected',button.dataset.coilView===view?'true':'false'));}
    try{selector.replaceDatabase(io.load());}catch(error){const notice=document.getElementById('coilDatabaseNotice');notice.hidden=false;notice.textContent='浏览器缓存数据库无效，已使用默认数据：'+error.message;}
    document.getElementById('openCoilDatabase').addEventListener('click',()=>{clear();message('当前数据库：吊顶 '+selector.getDatabase().tables.ceiling.length+' 条、落地 '+selector.getDatabase().tables.floor.length+' 条、厚度 10 组。');dialog.showModal();});
    document.getElementById('closeCoilDatabase').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',clear);
    document.getElementById('viewCoilDatabase').addEventListener('click',()=>{renderViewer(activeView);viewer.showModal();});document.getElementById('closeCoilViewer').addEventListener('click',()=>viewer.close());document.querySelectorAll('[data-coil-view]').forEach(button=>button.addEventListener('click',()=>renderViewer(button.dataset.coilView)));
    document.getElementById('exportCoilDatabase').addEventListener('click',()=>{try{XLSX.writeFile(io.toWorkbook(selector.getDatabase()),'盘管数据库_'+new Date().toISOString().slice(0,10)+'.xlsx');message('已导出当前生效数据库。');}catch(error){message('导出失败：'+error.message,true);}});
    fileInput.addEventListener('change',async()=>{pending=null;apply.disabled=true;const ticket=++generation,file=fileInput.files[0];if(!file)return;try{if(!/\.(xlsx|xls)$/i.test(file.name))throw new Error('请选择 .xlsx 或 .xls 文件。');if(file.size>2*1024*1024)throw new Error('文件不能超过2MB。');message('正在读取并校验 Excel…');const buffer=await file.arrayBuffer();if(ticket!==generation)return;pending=io.fromWorkbook(XLSX.read(buffer,{type:'array',cellFormula:true}));message('校验通过：吊顶 '+pending.tables.ceiling.length+' 条、落地 '+pending.tables.floor.length+' 条。点击“应用导入”后生效。');apply.disabled=false;}catch(error){if(ticket===generation)message('导入失败，当前数据未改变：'+error.message,true);}});
    apply.addEventListener('click',()=>{if(!pending)return;try{io.save(pending);selector.replaceDatabase(pending);clear();document.getElementById('coilDatabaseNotice').hidden=true;message('导入成功，盘管选型和在线查看已更新。');}catch(error){message('应用失败：'+error.message,true);}});
    window.CoilDatabaseViewer={viewModel,escape};
  });
})();
