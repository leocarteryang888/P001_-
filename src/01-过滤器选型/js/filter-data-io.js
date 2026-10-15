(function (global) {
  'use strict';
  const KEY = 'p001.filter-selector.database.v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const headers = {
    '过滤器类型': ['标识', '名称', '说明'],
    '宽度排布': ['模数', '抽拉组合', '框架组合'],
    '高度排布': ['模数', '抽拉组合', '框架组合']
  };
  function validate(data) {
    if (!data || data.version !== '1.0.0' || data.moduleRange?.min !== 6 || data.moduleRange?.max !== 33 || data.moduleRange?.unitMm !== 100) throw new Error('数据库版本或模数范围不正确。');
    if (!Array.isArray(data.filterTypes) || !data.filterTypes.length || data.filterTypes.length > 200) throw new Error('过滤器类型必须有 1–200 项。');
    const ids = new Set();
    for (const type of data.filterTypes) {
      if (typeof type.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,49}$/.test(type.id) || ids.has(type.id)) throw new Error('类型标识须以字母开头，仅含字母、数字、下划线或短横线，且不能重复。');
      ids.add(type.id);
      if (typeof type.name !== 'string' || !type.name.trim() || type.name.length > 100 || typeof type.detail !== 'string' || type.detail.length > 100) throw new Error('类型名称不能为空，名称和说明均不可超过 100 字。');
    }
    for (const mode of ['pull', 'frame']) for (const axis of ['width', 'height']) {
      const map = data.arrangements?.[mode]?.[axis];
      if (!map || Object.keys(map).length !== 28) throw new Error('排布表必须完整包含 6–33M。');
      for (let mod = 6; mod <= 33; mod++) {
        const values = map[mod];
        if (!Array.isArray(values) || !values.length || values.length > 16 || !values.every(v => Number.isInteger(v) && v >= 3 && v <= 6)) throw new Error(`${mode}/${axis} 的 ${mod}M 组合必须为 1–16 个 3、4、5 或 6。`);
      }
    }
    return data;
  }
  function toWorkbook(data) {
    validate(data);
    const book = global.XLSX.utils.book_new();
    const types = [headers['过滤器类型'], ...data.filterTypes.map(t => [t.id, t.name, t.detail])];
    global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet(types), '过滤器类型');
    for (const [sheet, axis] of [['宽度排布', 'width'], ['高度排布', 'height']]) {
      const rows = [headers[sheet]];
      for (let mod = 6; mod <= 33; mod++) rows.push([mod, data.arrangements.pull[axis][mod].join('+'), data.arrangements.frame[axis][mod].join('+')]);
      global.XLSX.utils.book_append_sheet(book, global.XLSX.utils.aoa_to_sheet(rows), sheet);
    }
    for (const sheet of book.SheetNames) book.Sheets[sheet]['!cols'] = [{wch: 20}, {wch: 36}, {wch: 36}];
    return book;
  }
  function fromWorkbook(book) {
    const data = clone(global.FilterDatabase);
    const tables = {};
    for (const name of Object.keys(headers)) {
      const sheet = book.Sheets[name];
      if (!sheet || !sheet['!ref']) throw new Error(`缺少工作表：${name}`);
      const range = global.XLSX.utils.decode_range(sheet['!ref']);
      if (range.e.r > 200 || range.e.c > 2 || range.s.r !== 0 || range.s.c !== 0) throw new Error(`${name}：表格须从 A1 开始，最多 201 行、3 列。`);
      for (const [address, cell] of Object.entries(sheet)) {
        if (!address.startsWith('!') && (cell.f || cell.t === 'e')) throw new Error(`${name} ${address}：请填写固定值，不允许公式或错误单元格。`);
      }
      const rows = global.XLSX.utils.sheet_to_json(sheet, {header: 1, defval: '', blankrows: false});
      if (JSON.stringify(rows.shift()) !== JSON.stringify(headers[name])) throw new Error(`${name}：表头与导出模板不一致。`);
      tables[name] = rows;
    }
    data.filterTypes = tables['过滤器类型'].map(row => ({id: String(row[0]).trim(), name: String(row[1]).trim(), detail: String(row[2]).trim()}));
    for (const [name, axis] of [['宽度排布', 'width'], ['高度排布', 'height']]) {
      const seen = new Set();
      data.arrangements.pull[axis] = {};
      data.arrangements.frame[axis] = {};
      for (const row of tables[name]) {
        const mod = Number(row[0]);
        if (!Number.isInteger(mod) || mod < 6 || mod > 33 || seen.has(mod)) throw new Error(`${name}：模数须为不重复的 6–33 整数。`);
        seen.add(mod);
        ['pull', 'frame'].forEach((mode, index) => {
          const text = String(row[index + 1]).trim();
          if (!/^[3-6](\s*\+\s*[3-6])*$/.test(text)) throw new Error(`${name} ${mod}M：组合格式应为 5+5 或 4+6。`);
          data.arrangements[mode][axis][mod] = text.split('+').map(Number);
        });
      }
    }
    return validate(data);
  }
  function load() {
    const saved = global.localStorage.getItem(KEY);
    return saved ? validate(JSON.parse(saved)) : clone(global.FilterDatabase);
  }
  function save(data) {
    validate(data);
    // 保存成功后调用方才替换运行时数据，写入失败不改变当前选型。
    global.localStorage.setItem(KEY, JSON.stringify(data));
  }
  global.FilterDataIO = {validate, toWorkbook, fromWorkbook, load, save};
})(window);
