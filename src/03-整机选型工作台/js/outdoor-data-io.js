(function(global){
  'use strict';
  const KEY='p001.ahu.outdoor-conditions.v1';
  const SHEET='室外气象参数';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const stableRecordId=record=>`weather-${String(record.province||'').trim()}-${String(record.city||'').trim()}-${String(record.station||'').trim()}`.replace(/[^\w\u4e00-\u9fff-]+/g,'-');
  function withRecordIds(database){database.locations.forEach(record=>{record.recordId=record.recordId||stableRecordId(record);});return database;}
  function validate(database){
    if(!database||database.version!=='1.0.0'||!Array.isArray(database.fields)||database.fields.length!==39)throw new Error('数据库版本或字段结构不正确。');
    if(!Array.isArray(database.locations)||!database.locations.length||database.locations.length>2000)throw new Error('地区记录必须为 1–2000 条。');
    const keys=new Set(database.fields.map(field=>field.key));
    if(keys.size!==database.fields.length)throw new Error('数据库字段代码不能重复。');
    const identities=new Set();
    database.locations.forEach((record,index)=>{
      database.fields.forEach(field=>{
        const value=record[field.key];
        if(field.required&&(value===null||value===undefined||String(value).trim()===''))throw new Error(`第 ${index+1} 条记录缺少必填字段：${field.label}`);
        if(field.type==='number'&&value!==null&&value!==''&&!Number.isFinite(Number(value)))throw new Error(`第 ${index+1} 条记录 ${field.label} 必须是数值。`);
      });
      const identity=`${String(record.province).trim()}|${String(record.city).trim()}`;
      if(identities.has(identity))throw new Error(`省份和城市重复：${identity.replace('|',' / ')}`);
      identities.add(identity);
      for(const key of ['winterAirConditioningRH','summerVentilationRH'])if(record[key]!=null&&(Number(record[key])<0||Number(record[key])>100))throw new Error(`${identity} 的相对湿度必须为 0–100%。`);
    });
    return database;
  }
  function toWorkbook(database){
    validate(database);
    const book=global.XLSX.utils.book_new();
    const headers=database.fields.map(field=>field.label+(field.unit?` (${field.unit})`:''));
    const rows=[headers,...database.locations.map(record=>database.fields.map(field=>record[field.key]??''))];
    const sheet=global.XLSX.utils.aoa_to_sheet(rows);
    sheet['!cols']=database.fields.map(field=>({wch:Math.min(30,Math.max(12,field.label.length*2+4))}));
    global.XLSX.utils.book_append_sheet(book,sheet,SHEET);
    const info=global.XLSX.utils.aoa_to_sheet([['项目','内容'],['数据库版本',database.version],['规范来源',database.source.standard],['原始工作簿',database.source.workbook],['原始工作表及范围',`${database.source.sheet}!${database.source.range}`],['使用说明',database.source.note]]);
    info['!cols']=[{wch:22},{wch:90}];global.XLSX.utils.book_append_sheet(book,info,'数据库说明');
    return book;
  }
  function fromWorkbook(book){
    const sheet=book.Sheets[SHEET];
    if(!sheet)return fromSourceWorkbook(book);
    if(!sheet['!ref'])throw new Error(`工作表 ${SHEET} 没有数据。`);
    const range=global.XLSX.utils.decode_range(sheet['!ref']);
    if(range.s.r!==0||range.s.c!==0||range.e.r>2000||range.e.c>38)throw new Error('室外气象参数表须从 A1 开始，最多 2001 行、39 列。');
    for(const [address,cell] of Object.entries(sheet))if(!address.startsWith('!')&&(cell.f||cell.t==='e'))throw new Error(`${address}：不允许公式或错误单元格。`);
    const rows=global.XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',blankrows:false});
    const fields=global.AHUOutdoorConditions.fields;
    const expected=fields.map(field=>field.label+(field.unit?` (${field.unit})`:''));
    if(JSON.stringify(rows.shift())!==JSON.stringify(expected))throw new Error('表头与系统导出模板不一致。');
    const database=clone(global.AHUOutdoorConditions);
    database.locations=rows.map(row=>Object.fromEntries(fields.map((field,index)=>[field.key,field.type==='number'?(row[index]===''?null:Number(row[index])):String(row[index]).trim()])));
    database.source={...database.source,note:'由用户在维护窗口导入的数据库；字段结构与默认数据库一致。'};
    return validate(database);
  }
  function fromSourceWorkbook(book){
    const sheet=book.Sheets.Sheet2;
    if(!sheet||!sheet['!ref'])throw new Error(`缺少工作表：${SHEET}；也未找到原始格式 Sheet2。`);
    const range=global.XLSX.utils.decode_range(sheet['!ref']);
    if(range.e.r<5||range.e.c<39)throw new Error('原始格式 Sheet2 的数据范围不足 A1:AN6。');
    const rows=global.XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',blankrows:true,range:'A1:AN2001'}),fields=global.AHUOutdoorConditions.fields;
    let province='';const locations=[];
    for(let index=5;index<rows.length;index++){
      const row=rows[index];if(row[0]!==''&&row[0]!=null)province=String(row[0]).trim();const city=String(row[2]??'').trim();if(!city)continue;
      const flat=[province,city,...row.slice(3,40)];
      locations.push(Object.fromEntries(fields.map((field,fieldIndex)=>{
        const raw=flat[fieldIndex];
        if(field.type!=='number')return [field.key,String(raw??'').trim()];
        if(raw===''||raw==null)return [field.key,null];
        const number=Number(raw);
        // Source placeholders mean that no usable numeric value was supplied.
        return [field.key,Number.isFinite(number)?number:null];
      })));
    }
    const database=clone(global.AHUOutdoorConditions);database.locations=locations;database.source={...database.source,sheet:'Sheet2',range:sheet['!ref'],note:'由原始 GB50736 修改版多层表头工作簿导入；正式工程应用前应与正版规范或公司确认数据库核对。'};return validate(database);
  }
  function load(){const saved=global.localStorage.getItem(KEY);return saved?withRecordIds(validate(JSON.parse(saved))):withRecordIds(clone(global.AHUOutdoorConditions));}
  function save(database){validate(database);global.localStorage.setItem(KEY,JSON.stringify(database));}
  function clear(){global.localStorage.removeItem(KEY);}
  global.OutdoorDataIO={KEY,SHEET,clone,validate,toWorkbook,fromWorkbook,fromSourceWorkbook,load,save,clear};
})(window);
