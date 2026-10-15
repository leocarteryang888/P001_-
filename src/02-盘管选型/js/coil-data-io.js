(function (root) {
  'use strict';
  const KEY = 'p001.coil-selector.database.v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const STANDARD_HEADERS = ['箱体规格','换热管径','盘管数量','高度','DN32宽度','DN40宽度','DN50宽度','DN65宽度','DN80宽度','DN100宽度'];
  const THICKNESS_HEADERS = ['换热管径','汇管径','2排','3排','4排','6排','8排'];
  function validate(database) {
    if (!database || database.version !== '1.0.0') throw new Error('数据库版本不正确。');
    if (JSON.stringify(database.headers) !== JSON.stringify([32,40,50,65,80,100]) || JSON.stringify(database.rows) !== JSON.stringify([2,3,4,6,8])) throw new Error('汇管径或排数定义不可改变。');
    for (const mode of ['ceiling','floor']) {
      const rows = database.tables?.[mode];
      if (!Array.isArray(rows) || rows.length < 1 || rows.length > 500) throw new Error((mode==='ceiling'?'吊顶':'落地') + '标准表须有 1–500 条数据。');
      const codes = new Set();
      for (const row of rows) {
        if (!/^\d{4}$/.test(String(row.code)) || codes.has(String(row.code))) throw new Error('箱体规格须为不重复的四位数字。');
        codes.add(String(row.code));
        if (![9.52,12.7].includes(Number(row.tube))) throw new Error(row.code + '：换热管径仅限 9.52 或 12.7。');
        if (!Number.isInteger(Number(row.count)) || row.count < 1 || row.count > 9) throw new Error(row.code + '：盘管数量须为 1–9 整数。');
        if (!(Number(row.height) > 0 && Number(row.height) <= 4000)) throw new Error(row.code + '：高度须大于0且不超过4000mm。');
        if (!Array.isArray(row.widths) || row.widths.length !== 6 || !row.widths.every(value => Number(value) > 0 && Number(value) <= 5000)) throw new Error(row.code + '：须完整填写 DN32–DN100 六个宽度，且不超过5000mm。');
      }
    }
    for (const tube of ['9.52','12.7']) for (const header of [32,40,50,65,80]) {
      const values = database.thickness?.[tube]?.[header];
      if (!Array.isArray(values) || values.length !== 5 || !values.every(value => Number(value) >= 50 && Number(value) <= 1000)) throw new Error('厚度表须完整填写两种管径、DN32–80及五种排数。');
    }
    return database;
  }
  function standardSheet(database, mode) {
    return [STANDARD_HEADERS].concat(database.tables[mode].map(row => [row.code,row.tube,row.count,row.height].concat(row.widths)));
  }
  function toWorkbook(database) {
    validate(database);
    const book = root.XLSX.utils.book_new();
    root.XLSX.utils.book_append_sheet(book, root.XLSX.utils.aoa_to_sheet(standardSheet(database,'ceiling')), '吊顶标准表');
    root.XLSX.utils.book_append_sheet(book, root.XLSX.utils.aoa_to_sheet(standardSheet(database,'floor')), '落地标准表');
    const thickness = [THICKNESS_HEADERS];
    for (const tube of ['9.52','12.7']) for (const header of [32,40,50,65,80]) thickness.push([Number(tube),header].concat(database.thickness[tube][header]));
    root.XLSX.utils.book_append_sheet(book, root.XLSX.utils.aoa_to_sheet(thickness), '厚度表');
    for (const name of book.SheetNames) book.Sheets[name]['!cols'] = Array(name==='厚度表'?7:10).fill({wch:14});
    return book;
  }
  function readSheet(book, name, headers, maxRows) {
    const sheet = book.Sheets[name];
    if (!sheet?.['!ref']) throw new Error('缺少工作表：' + name);
    const range = root.XLSX.utils.decode_range(sheet['!ref']);
    if (range.s.r !== 0 || range.s.c !== 0 || range.e.r > maxRows || range.e.c > headers.length - 1) throw new Error(name + '：表格须从A1开始，行列数超出限制。');
    for (const [address,cell] of Object.entries(sheet)) if (!address.startsWith('!') && (cell.f || cell.t === 'e')) throw new Error(name + ' ' + address + '：不允许公式或错误单元格。');
    const rows = root.XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',blankrows:false});
    if (JSON.stringify(rows.shift()) !== JSON.stringify(headers)) throw new Error(name + '：表头与导出模板不一致。');
    return rows;
  }
  function fromWorkbook(book) {
    const database = clone(root.CoilDatabase);
    for (const [name,mode] of [['吊顶标准表','ceiling'],['落地标准表','floor']]) {
      database.tables[mode] = readSheet(book,name,STANDARD_HEADERS,500).map(row => ({code:String(row[0]).trim().padStart(4,'0'),tube:Number(row[1]),count:Number(row[2]),height:Number(row[3]),widths:row.slice(4,10).map(Number)}));
    }
    database.thickness = {'9.52':{},'12.7':{}};
    const seen = new Set();
    for (const row of readSheet(book,'厚度表',THICKNESS_HEADERS,20)) {
      const tube=String(Number(row[0])), header=Number(row[1]), key=tube+'-'+header;
      if (!['9.52','12.7'].includes(tube) || ![32,40,50,65,80].includes(header) || seen.has(key)) throw new Error('厚度表存在非法或重复的管径/汇管径组合。');
      seen.add(key); database.thickness[tube][header]=row.slice(2,7).map(Number);
    }
    return validate(database);
  }
  function load() { const saved=root.localStorage.getItem(KEY); return saved?validate(JSON.parse(saved)):clone(root.CoilDatabase); }
  function save(database) { validate(database); root.localStorage.setItem(KEY,JSON.stringify(database)); }
  root.CoilDataIO={validate,toWorkbook,fromWorkbook,load,save,standardSheet};
})(window);
