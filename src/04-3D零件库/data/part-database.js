(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AHUPartDatabase = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const categories = [
    { id: 'air', name: '风口法兰' },
    { id: 'damper', name: '风阀' },
    { id: 'actuator', name: '风阀执行器' },
    { id: 'fan', name: '风机' },
    { id: 'coil', name: '换热器' },
    { id: 'filter', name: '过滤器' }
  ];

  const parts = [
    { id:'air-rect', category:'air', kind:'rectFlange', name:'矩形风口法兰', model:'FL-RECT', source:'用户实物照片', description:'40 mm翻边，50 mm轴向法兰深度。', dimensions:{width:800,height:600,depth:50}, params:{flange:40,holes:3} },
    { id:'air-round', category:'air', kind:'roundFlange', name:'圆形风口法兰', model:'FL-ROUND', source:'参数化补建', description:'圆管短接与平面圆法兰。', dimensions:{diameter:500,depth:80}, params:{flange:45,holes:8} },
    { id:'damper-opposed', category:'damper', kind:'damper', name:'对开多叶风阀', model:'DMP-OPP', source:'用户实物照片', description:'镀锌外框，叶片相邻反向。', dimensions:{width:800,height:600,depth:180}, params:{blades:7,angle:28,mode:'opposed'} },
    { id:'damper-parallel', category:'damper', kind:'damper', name:'平行多叶风阀', model:'DMP-PAR', source:'参数化补建', description:'镀锌外框，叶片同向联动。', dimensions:{width:800,height:600,depth:180}, params:{blades:7,angle:28,mode:'parallel'} },
    { id:'actuator-standard', category:'actuator', kind:'actuator', name:'标准风阀执行器', model:'ACT-STD', source:'用户实物照片', description:'外置浅灰壳体、深色输出轮、方轴和红色操作件。', dimensions:{width:240,height:170,depth:105}, params:{shaft:14} },
    { id:'actuator-compact', category:'actuator', kind:'actuator', name:'紧凑型风阀执行器', model:'ACT-CMP', source:'参数化补建', description:'适用于小规格风阀。', dimensions:{width:170,height:120,depth:80}, params:{shaft:12} },
    { id:'fan-forward', category:'fan', kind:'centrifugal', name:'前倾离心风机', model:'FAN-FWD', source:'STEP整机结构参考 + 参数化重建', description:'分体蜗壳、侧板、前倾叶轮、进风锥、电机和底座。', dimensions:{width:900,height:900,depth:700}, params:{blades:12,style:'forward'} },
    { id:'fan-backward', category:'fan', kind:'centrifugal', name:'后倾离心风机', model:'FAN-BWD', source:'STEP整机结构参考 + 参数化重建', description:'分体蜗壳、侧板、后倾叶轮、进风锥、电机和底座。', dimensions:{width:1000,height:1000,depth:780}, params:{blades:9,style:'backward'} },
    { id:'fan-plug', category:'fan', kind:'plugFan', name:'无蜗壳后倾风机', model:'FAN-PLUG', source:'参数化补建', description:'自由叶轮、锥形进风圈和直联电机。', dimensions:{diameter:800,depth:650}, params:{blades:7} },
    { id:'fan-axial', category:'fan', kind:'axialFan', name:'轴流风机', model:'FAN-AXIAL', source:'参数化补建', description:'圆筒风道、轴流叶轮和中心电机。', dimensions:{diameter:700,depth:500}, params:{blades:6} },
    { id:'coil-cooling', category:'coil', kind:'coil', name:'冷水表冷器', model:'COIL-CW', source:'用户实物照片', description:'蓝色翅片、铜U弯、双集水管及两根外伸接口。', dimensions:{width:1100,height:1200,depth:320}, params:{rows:6,circuits:12,pipeDiameter:65,mode:'cooling'} },
    { id:'coil-heating', category:'coil', kind:'coil', name:'热水盘管', model:'COIL-HW', source:'盘管模型复用', description:'铜管铝翅片热水换热器。', dimensions:{width:1100,height:1000,depth:260}, params:{rows:4,circuits:10,pipeDiameter:50,mode:'heating'} },
    { id:'coil-evaporator', category:'coil', kind:'coil', name:'直接蒸发器', model:'COIL-DX', source:'盘管模型参数化补建', description:'制冷剂分液管、回气集管和翅片芯体。', dimensions:{width:1100,height:1200,depth:360}, params:{rows:6,circuits:14,pipeDiameter:54,mode:'evaporator'} },
    { id:'filter-panel', category:'filter', kind:'panelFilter', name:'初效板式过滤器', model:'FLT-PANEL', source:'用户实物照片', description:'镀锌边框与白色折褶滤材。', dimensions:{width:595,height:595,depth:46}, params:{pleats:18} },
    { id:'filter-bag', category:'filter', kind:'bagFilter', name:'袋式过滤器', model:'FLT-BAG', source:'用户实物照片', description:'前部金属框与后伸柔性滤袋。', dimensions:{width:592,height:592,depth:600}, params:{bags:6} },
    { id:'filter-compact', category:'filter', kind:'compactFilter', name:'密褶式过滤器', model:'FLT-COMPACT', source:'用户实物照片', description:'深色外框、竖向滤芯列与细密褶纹。', dimensions:{width:610,height:610,depth:292}, params:{columns:4,pleats:32} }
  ];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function normalizePart(input) {
    const source = input || {};
    const result = clone(source);
    result.id = String(source.id || '').trim();
    result.name = String(source.name || '未命名零件').trim();
    result.model = String(source.model || '').trim();
    result.dimensions = result.dimensions || {};
    Object.keys(result.dimensions).forEach(key => result.dimensions[key] = Math.max(1, Number(result.dimensions[key]) || 1));
    result.params = result.params || {};
    return result;
  }
  function getPart(id) { const found = parts.find(item => item.id === id); return found ? clone(found) : null; }
  return { schemaVersion:1, categories:clone(categories), parts:clone(parts), getPart, normalizePart };
});
