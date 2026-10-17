(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.AHUPrototypeDrawing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  const PAGE = { widthPt: 1190.55, heightPt: 841.89, pixelWidth: 1680, pixelHeight: 1188 };
  const text = value => String(value ?? '未提供');
  const esc = value => text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const positive = raw => {
    const v = raw && typeof raw === 'object' && 'value' in raw ? raw.value : raw;
    const n = Number(v);
    return v !== '' && v != null && Number.isFinite(n) && n > 0 ? n : null;
  };
  const viewName = view => ({front:'主视图 · Y-Z',top:'顶视图 · Y-X',left:'左视图 · X-Z'})[view];
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const faceAxes = {front:'U=Y,V=Z',back:'U=Y,V=Z',top:'U=Y,V=X',bottom:'U=Y,V=X',leftEnd:'U=X,V=Z',rightEnd:'U=X,V=Z'};
  const visibleFace = {front:'front',top:'top',left:'leftEnd'};
  const viewAxes = {front:{horizontal:'Y',vertical:'Z'},top:{horizontal:'Y',vertical:'X'},left:{horizontal:'X',vertical:'Z'}};
  function hasLegacyFeature(value) {
    return value != null && value !== '' && !['无','none','false','0'].includes(String(value).trim().toLowerCase());
  }
  function collectFeatures(model) {
    const features = [];
    model.segments.forEach(segment => {
      const source = segment.source;
      if (!source || source.enabled === false) return;
      const geometry = source.drawingGeometry && typeof source.drawingGeometry === 'object' ? source.drawingGeometry : {};
      const doors = Array.isArray(geometry.doors) ? geometry.doors : [];
      const ports = Array.isArray(geometry.ports) ? geometry.ports : [];
      const collect = (rows, kind) => rows.forEach((row, index) => {
        if (row && row.enabled === false) return;
        const feature = {
          ...row,
          offsetU: kind === 'door' ? row?.offsetY : row?.offsetU,
          offsetV: kind === 'door' ? row?.offsetZ : row?.offsetV,
          kind,
          segmentId: segment.id,
          globalY: segment.startY
        };
        if (validFeature(feature, model, segment)) features.push(feature);
        else model.diagnostics.push(segment.name + (kind === 'door' ? ' 门 ' : ' 接口 ') + (index + 1) + ' 定位无效或越界');
      });
      collect(doors, 'door');
      collect(ports, 'port');
      if (hasLegacyFeature(source.doorSide) && !doors.some(row => row && row.enabled !== false)) {
        model.diagnostics.push(segment.name + ' 门定位待补');
      }
      if (hasLegacyFeature(source.portSide) && !ports.some(row => row && row.enabled !== false)) {
        model.diagnostics.push(segment.name + ' 接口定位待补');
      }
    });
    return features;
  }
  function validFeature(feature, model, segment) {
    if (!faceAxes[feature.face] || !['offsetU','offsetV','width','height'].every(key => finite(feature[key]))) return false;
    if (feature.kind === 'door' && !['front','back'].includes(feature.face)) return false;
    if (feature.offsetU < 0 || feature.offsetV < 0 || feature.width <= 0 || feature.height <= 0) return false;
    const maxU = ['front','back','top','bottom'].includes(feature.face) ? segment.length : model.width;
    const maxV = ['front','back','leftEnd','rightEnd'].includes(feature.face) ? model.height : model.width;
    return Boolean(maxU && maxV && feature.offsetU + feature.width <= maxU && feature.offsetV + feature.height <= maxV);
  }
  // Canonical model axes are X=width, Y=airflow/segment length, Z=height.
  function featureCorners(feature, model) {
    const segment = model.segments.find(item => item.id === feature.segmentId);
    if (!segment) throw new Error('接口定位引用了不存在的功能段');
    const y = feature.globalY, u = feature.offsetU, v = feature.offsetV, w = feature.width, h = feature.height;
    if (['front','back'].includes(feature.face)) {
      const x = feature.face === 'front' ? 0 : model.width;
      return [[x,y+u,v],[x,y+u+w,v],[x,y+u+w,v+h],[x,y+u,v+h]];
    }
    if (['top','bottom'].includes(feature.face)) {
      const z = feature.face === 'top' ? model.height : 0;
      return [[v,y+u,z],[v,y+u+w,z],[v+h,y+u+w,z],[v+h,y+u,z]];
    }
    const endY = feature.face === 'leftEnd' ? y : y + segment.length;
    return [[u,endY,v],[u+w,endY,v],[u+w,endY,v+h],[u,endY,v+h]];
  }
  // All previews and exports derive face rectangles from the same world-space corners.
  function projectFeature(feature, model, view) {
    const axes = viewAxes[view];
    if (!axes) throw new Error('未知的正投影视图');
    if (feature.face !== visibleFace[view]) return null;
    const points = featureCorners(feature, model).map(([x,y,z]) => ({X:x,Y:y,Z:z}));
    const horizontal = points.map(point => point[axes.horizontal]);
    const vertical = points.map(point => point[axes.vertical]);
    const left = Math.min(...horizontal), right = Math.max(...horizontal);
    const bottom = Math.min(...vertical), top = Math.max(...vertical);
    return {x:left,y:bottom,width:right-left,height:top-bottom,kind:feature.kind};
  }
  function makeModel(snapshot, generatedAt = new Date().toISOString()) {
    if (!snapshot?.unit) throw new Error('当前没有可输出的机组');
    const p=snapshot.project||{},u=snapshot.unit,c=u.cabinetSelection||{};
    const confirmed=c.confirmed===true&&c.status!=='invalidated';
    const segments=(snapshot.segments||u.segments||[]).filter(s=>s&&s.enabled!==false).map((s,i)=>({
      id:text(s.id||s.segmentId||'section-'+(i+1)),name:text(s.name||s.type||'功能段 '+(i+1)),
      length:positive(s.length??s.interface?.drawing?.length??s.drawing?.length),
      confirmed:s.confirmed===true||['confirmed','complete','completed'].includes(String(s.status||'').toLowerCase()),source:s
    }));
    const width=confirmed?positive(c.width):null,height=confirmed?positive(c.height):null;
    const totalLength=segments.length&&segments.every(s=>s.length)?segments.reduce((n,s)=>n+s.length,0):null;
    const missing=[],diagnostics=[];let cursor=0;segments.forEach(s=>{s.startY=cursor;if(s.length)cursor+=s.length;});
    if(!confirmed)missing.push('箱体截面未确认');
    if(!width)missing.push('箱体宽度 X');
    if(!height)missing.push('箱体高度 Z');
    if(!segments.length)missing.push('功能段');
    segments.forEach(s=>{if(!s.length)missing.push(s.name+'段长 Y');});
    const model={axes:{width:'X',length:'Y',height:'Z'},project:{name:text(p.name),code:text(p.code||p.projectCode),id:text(p.projectId||p.id)},
      unit:{no:text(u.no||u.unitNo),id:text(u.unitId||u.id),revision:text(u.resultRevision||u.calculationRevision||u.revision||'未计算')},
      width,height,totalLength,segments,missing,diagnostics,generatedAt,confirmed,
      source:snapshot.source||'当前工作台内存快照（不代表已保存）',
      disclaimer:'参数化外形与接口定位示意，基于录入尺寸，不是完整三维模型或制造图；门和接口为轮廓，不代表实体切除。'}; model.provenance='parametric-confirmed-envelope';model.features=collectFeatures(model);return model;
  }
  function geometry(model,view) {
    const width=view==='left'?model.width:model.totalLength;
    const height=view==='top'?model.width:model.height;
    return {width,height,valid:Boolean(width&&height),segmented:view!=='left'};
  }
  function exportGate(model) {
    const issues = [...(model.missing || []), ...(model.diagnostics || [])];
    return { blocked: issues.length > 0, issues };
  }
  function dxf3dOffset(model) {
    // Keep the canonical 3D envelope to the right of all three orthographic views.
    return { x: model.totalLength + model.width + 1500, y: 0, z: 0 };
  }
  function viewSvg(model,view) {
    const g=geometry(model,view), W=view==='left'?440:900,H=250,pad=56,maxW=W-pad*2,maxH=126;
    let body='';
    if(g.valid) {
      const scale=Math.min(maxW/g.width,maxH/g.height),w=g.width*scale,h=g.height*scale,x=(W-w)/2,y=53+(maxH-h)/2;
      body='<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="#e8f1f3" stroke="#2d6072" stroke-width="2"/>';
      model.features.forEach(feature=>{const projection=projectFeature(feature,model,view);if(!projection)return;body+='<rect class="feature-'+feature.kind+'" x="'+(x+projection.x*scale)+'" y="'+(y+h-(projection.y+projection.height)*scale)+'" width="'+(projection.width*scale)+'" height="'+(projection.height*scale)+'" fill="none" stroke="'+(feature.kind==='door'?'#b06b2b':'#7b3f8c')+'" stroke-width="2"/>';});
      if(g.segmented) {
        let cursor=x;
        model.segments.forEach((s,i)=>{const sw=s.length*scale;
          if(i)body+='<line x1="'+cursor+'" y1="'+y+'" x2="'+cursor+'" y2="'+(y+h)+'" stroke="#4e7988"/>';
          body+='<text x="'+(cursor+sw/2)+'" y="'+(y+h/2+4)+'" text-anchor="middle" font-size="12" fill="#214958">'+(i+1)+'</text>';
          cursor+=sw;
        });
    }
      body+='<line x1="'+x+'" y1="'+(y+h+18)+'" x2="'+(x+w)+'" y2="'+(y+h+18)+'" stroke="#337d91"/>';
      body+='<text x="'+(W/2)+'" y="'+(y+h+38)+'" text-anchor="middle" font-size="12" fill="#315865">'+(view==='left'?'X '+model.width:'Y '+model.totalLength)+' mm</text>';
      body+='<text x="'+(x+w+7)+'" y="'+(y+h/2)+'" font-size="12" fill="#315865">'+(view==='top'?'X '+model.width:'Z '+model.height)+' mm</text>';
    } else body='<rect x="'+pad+'" y="54" width="'+maxW+'" height="'+maxH+'" fill="#fff9ed" stroke="#b98944" stroke-dasharray="5 4"/><text x="'+(W/2)+'" y="120" text-anchor="middle" font-size="13" fill="#795522">缺少已确认尺寸或完整段长，未按比例绘制</text>';
    return '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+viewName(view)+'"><rect width="'+W+'" height="'+H+'" fill="#f8fbfb"/><text x="18" y="28" fill="#203f4c" font-size="17" font-weight="700">'+viewName(view)+'</text>'+body+'<text x="'+(W-18)+'" y="237" text-anchor="end" font-size="11" fill="#68828d">'+(view==='left'?'向气流方向看':'气流方向 →')+'</text></svg>';
  }
  function dxfText(value) {return [...text(value)].map(c=>c.codePointAt(0)<128?c:'\\U+'+c.codePointAt(0).toString(16).toUpperCase().padStart(4,'0')).join('');}
  function dxf(model) {
    const e=[];
    const line=(x1,y1,x2,y2,layer)=>e.push('0\nLINE\n8\n'+layer+'\n10\n'+x1+'\n20\n'+y1+'\n30\n0\n11\n'+x2+'\n21\n'+y2+'\n31\n0\n');
    const rect=(x,y,w,h,layer)=>{line(x,y,x+w,y,layer);line(x+w,y,x+w,y+h,layer);line(x+w,y+h,x,y+h,layer);line(x,y+h,x,y,layer);};
    const label=(s,x,y,size=45,layer='TEXT')=>e.push('0\nTEXT\n8\n'+layer+'\n10\n'+x+'\n20\n'+y+'\n30\n0\n40\n'+size+'\n1\n'+dxfText(s)+'\n');
    const gate=exportGate(model);if(gate.blocked)throw new Error('图纸存在未补齐或无效定位，已阻止导出：'+gate.issues.join('；'));
    const L=model.totalLength,X=model.width,Z=model.height;
    [{view:'front',x:0,y:0,w:model.totalLength,h:model.height},
     {view:'top',x:0,y:-(X+500),w:model.totalLength,h:model.width},
     {view:'left',x:L+500,y:0,w:model.width,h:model.height}].forEach(v=>{
      label(viewName(v.view),v.x,v.y+Math.max(v.h||Z,500)+130,70,'TITLE');
      if(!(v.w>0&&v.h>0)){label('尺寸未提供 - 未绘制几何',v.x+80,v.y+200,45,'WARN');return;}
      rect(v.x,v.y,v.w,v.h,v.view.toUpperCase());
      if(v.view!=='left'){let cursor=v.x;model.segments.forEach((s,i)=>{if(i)line(cursor,v.y,cursor,v.y+v.h,v.view.toUpperCase());label((i+1)+' '+s.name,cursor+20,v.y+v.h/2,Math.min(48,Math.max(25,s.length/8)));label(s.length+' mm',cursor+20,v.y-80,30,'DIM');cursor+=s.length;});}
      model.features.forEach(feature=>{const projection=projectFeature(feature,model,v.view);if(projection)rect(v.x+projection.x,v.y+projection.y,projection.width,projection.height,v.view.toUpperCase());});
      label((v.view==='left'?'X':'Y')+' '+v.w+' mm',v.x,v.y-150,45,'DIM');
      label((v.view==='top'?'X':'Z')+' '+v.h+' mm',v.x+v.w+50,v.y+v.h/2,45,'DIM');
    });
    if(model.width>0&&model.height>0&&model.totalLength>0){
      const offset=dxf3dOffset(model),translate3d=point=>[point[0]+offset.x,point[1]+offset.y,point[2]+offset.z];
      const face=(a,b,c,d,layer)=>{const points=[a,b,c,d].map(translate3d);e.push('0\n3DFACE\n8\n'+layer+'\n10\n'+points[0][0]+'\n20\n'+points[0][1]+'\n30\n'+points[0][2]+'\n11\n'+points[1][0]+'\n21\n'+points[1][1]+'\n31\n'+points[1][2]+'\n12\n'+points[2][0]+'\n22\n'+points[2][1]+'\n32\n'+points[2][2]+'\n13\n'+points[3][0]+'\n23\n'+points[3][1]+'\n33\n'+points[3][2]+'\n');};
      const Y=model.totalLength,X=model.width,Z=model.height;label('3D 参数化外形（示意）',offset.x,Z+250,70,'TITLE');label('3D 独立区域偏移 X='+offset.x+' Y=0 Z=0 mm',offset.x,Z+170,35,'TITLE');face([0,0,0],[X,0,0],[X,Y,0],[0,Y,0],'SHELL');face([0,0,Z],[0,Y,Z],[X,Y,Z],[X,0,Z],'SHELL');face([0,0,0],[0,0,Z],[X,0,Z],[X,0,0],'SHELL');face([0,Y,0],[X,Y,0],[X,Y,Z],[0,Y,Z],'SHELL');face([0,0,0],[0,Y,0],[0,Y,Z],[0,0,Z],'SHELL');face([X,0,0],[X,0,Z],[X,Y,Z],[X,Y,0],'SHELL');
      const line3=(a,b,layer)=>{const p=translate3d(a),q=translate3d(b);e.push('0\nLINE\n8\n'+layer+'\n10\n'+p[0]+'\n20\n'+p[1]+'\n30\n'+p[2]+'\n11\n'+q[0]+'\n21\n'+q[1]+'\n31\n'+q[2]+'\n');};
      model.segments.slice(1).forEach(segment=>{const y=segment.startY;[[0,y,0],[X,y,0],[X,y,Z],[0,y,Z]].forEach((point,i,points)=>line3(point,points[(i+1)%points.length],'SEGMENTS'));});
      model.features.forEach(feature=>{const layer=feature.kind==='door'?'DOORS':'PORTS',points=featureCorners(feature,model);for(let i=0;i<4;i++)line3(points[i],points[(i+1)%4],layer);});
    }
    [model.project.name+' / '+model.project.code,model.unit.no+' / 修订 '+model.unit.revision,
     '生成 '+model.generatedAt,model.source,model.disclaimer,'待补 '+(model.missing.join('；')||'无')].forEach((s,i)=>label(s,0,-(X+800)-i*80,35,i===4?'WARN':'TITLE'));
    return '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1021\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n'+e.join('')+'0\nENDSEC\n0\nEOF\n';
  }
  function drawCanvasView(c,model,view,box) {
    const g=geometry(model,view),{x,y,w,h}=box;
    c.strokeStyle='#8faab3';c.strokeRect(x,y,w,h);
    c.fillStyle='#183e4c';c.font='bold 26px Microsoft YaHei, sans-serif';c.fillText(viewName(view),x+22,y+37);
    if(!g.valid){c.fillStyle='#8b5b25';c.font='22px Microsoft YaHei, sans-serif';c.fillText('缺少已确认尺寸或完整段长，未按比例绘制',x+22,y+h/2);return;}
    const maxW=w-105,maxH=h-115,scale=Math.min(maxW/g.width,maxH/g.height),dw=g.width*scale,dh=g.height*scale,bx=x+(w-dw)/2,by=y+62+(maxH-dh)/2;
    c.fillStyle='#e8f1f3';c.fillRect(bx,by,dw,dh);c.strokeStyle='#315d6b';c.lineWidth=3;c.strokeRect(bx,by,dw,dh);
    if(g.segmented){let cursor=bx;model.segments.forEach((s,i)=>{const sw=s.length*scale;if(i){c.beginPath();c.moveTo(cursor,by);c.lineTo(cursor,by+dh);c.stroke();}c.fillStyle='#294f5e';c.font='20px Microsoft YaHei, sans-serif';c.fillText(String(i+1),cursor+Math.max(8,sw/2-7),by+dh/2);cursor+=sw;});}
    model.features.forEach(feature=>{const projection=projectFeature(feature,model,view);if(!projection)return;c.strokeStyle=feature.kind==='door'?'#b06b2b':'#7b3f8c';c.strokeRect(bx+projection.x*scale,by+dh-(projection.y+projection.height)*scale,projection.width*scale,projection.height*scale);});
    c.fillStyle='#254e5d';c.font='20px Microsoft YaHei, sans-serif';c.fillText((view==='left'?'X':'Y')+' '+g.width+' mm · '+(view==='top'?'X':'Z')+' '+g.height+' mm',x+22,y+h-24);
  }
  function pdfCanvas(model,doc) {
    const cv=doc.createElement('canvas');cv.width=PAGE.pixelWidth;cv.height=PAGE.pixelHeight;const c=cv.getContext('2d');
    c.fillStyle='#fff';c.fillRect(0,0,cv.width,cv.height);c.strokeStyle='#294b59';c.lineWidth=3;c.strokeRect(25,25,1630,1138);
    c.fillStyle='#183b49';c.font='bold 36px Microsoft YaHei, sans-serif';c.fillText('组合式空调机组 · 三视图配置示意图',52,83);
    c.font='20px Microsoft YaHei, sans-serif';c.fillText(model.project.name+' / '+model.project.code+'    '+model.unit.no+'    修订 '+model.unit.revision,52,122);
    drawCanvasView(c,model,'front',{x:52,y:145,w:1020,h:365});
    drawCanvasView(c,model,'top',{x:52,y:528,w:1020,h:365});
    drawCanvasView(c,model,'left',{x:1090,y:145,w:538,h:748});
    c.strokeStyle='#294b59';c.strokeRect(52,915,1576,226);c.fillStyle='#183b49';c.font='20px Microsoft YaHei, sans-serif';
    c.fillText('箱体 X×Z：'+(model.width??'未提供')+' × '+(model.height??'未提供')+' mm    气流总长 Y：'+(model.totalLength??'未提供')+' mm',68,955);
    const first=model.segments.slice(0,4).map((s,i)=>(i+1)+' '+s.name+' '+(s.length??'未提供')+' mm').join(' / ');
    const second=model.segments.slice(4).map((s,i)=>(i+5)+' '+s.name+' '+(s.length??'未提供')+' mm').join(' / ');
    c.fillText('功能段：'+first,68,990);if(second)c.fillText('　　　　'+second,68,1022);
    c.font='18px Microsoft YaHei, sans-serif';c.fillText('生成：'+model.generatedAt+'    来源：'+model.source,68,1054);
    c.fillStyle='#a3422b';c.fillText(model.disclaimer,68,1086);
    if(model.missing.length)c.fillText('待补：'+model.missing.join('；').slice(0,75),68,1116);
    return cv;
  }
  function pdfBytesFromJpeg(jpeg) {
    if(typeof TextEncoder==='undefined'||typeof Blob==='undefined')throw new Error('当前环境不支持 PDF 字节编码');
    const encoder=new TextEncoder(),chunks=[],offsets=[0];
    const put=value=>{const b=typeof value==='string'?encoder.encode(value):value;chunks.push(b);offsets[0]+=b.length;};
    const obj=(id,header,stream)=>{offsets[id]=offsets[0];put(id+' 0 obj\n'+header);if(stream){put('\nstream\n');put(stream);put('\nendstream');}put('\nendobj\n');};
    put('%PDF-1.4\n');obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
    obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+PAGE.widthPt+' '+PAGE.heightPt+'] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
    obj(4,'<< /Type /XObject /Subtype /Image /Width '+PAGE.pixelWidth+' /Height '+PAGE.pixelHeight+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpeg.length+' >>',jpeg);
    const content=encoder.encode('q\n'+PAGE.widthPt+' 0 0 '+PAGE.heightPt+' 0 0 cm\n/Im0 Do\nQ\n');obj(5,'<< /Length '+content.length+' >>',content);
    const xref=offsets[0];put('xref\n0 6\n0000000000 65535 f \n');for(let i=1;i<=5;i++)put(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
    put('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
    return new Blob(chunks,{type:'application/pdf'});
  }
  function pdf(model,doc) {
    const gate=exportGate(model);if(gate.blocked)throw new Error('图纸存在未补齐或无效定位，已阻止导出：'+gate.issues.join('；'));
    const data=pdfCanvas(model,doc).toDataURL('image/jpeg',.94).split(',')[1],binary=atob(data);
    return pdfBytesFromJpeg(Uint8Array.from(binary,c=>c.charCodeAt(0)));
  }
  function current() {
    const bridge=root.AHUPrototypeDrawingBridge;if(!bridge?.snapshot)throw new Error('机组数据尚未就绪');
    return makeModel(bridge.snapshot());
  }
  function download(filename,blob) {
    const url=URL.createObjectURL(blob),a=root.document.createElement('a');a.href=url;a.download=filename.replace(/[\\/:*?"<>|]/g,'_');
    root.document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
  }
  function showWarning(host,error) {
    host.querySelector('.drawing-warning')?.remove();
    const warning=root.document.createElement('div');warning.className='drawing-warning';warning.setAttribute('role','alert');warning.textContent=error.message;host.prepend(warning);
  }
  function render() {
    const host=root.document?.getElementById('stagePlaceholder');if(!host)return;
    let m;try{m=current();}catch(error){host.textContent=error.message;return;}
    const gate=exportGate(m),disabled=gate.blocked?' disabled title="补齐缺失尺寸或接口定位后可导出" aria-describedby="drawing-export-gate"':'';
    host.hidden=false;
    host.innerHTML='<div class="drawing-page"><header><div><h2>参数化外形与接口定位 · 三视图</h2><p>'+esc(m.project.name)+' / '+esc(m.unit.no)+' · 修订 '+esc(m.unit.revision)+' · '+esc(m.source)+'</p></div><div class="drawing-actions"><button class="btn primary" type="button" data-drawing-dxf'+disabled+(gate.blocked?' aria-label="参数化外形接口 DXF 暂不可用；请查看导出阻断原因"':'')+'>参数化外形/接口 DXF</button><button class="btn" type="button" data-drawing-pdf'+disabled+(gate.blocked?' aria-label="PDF 暂不可用；请查看导出阻断原因"':'')+'>下载 PDF</button></div></header>'+(gate.blocked?'<section class="drawing-export-gate" id="drawing-export-gate" role="alert" aria-live="polite" aria-labelledby="drawing-export-title"><strong id="drawing-export-title">导出已暂停</strong><span>请补齐机组尺寸和接口定位后再生成图纸：</span><ul>'+gate.issues.map(issue=>'<li>'+esc(issue)+'</li>').join('')+'</ul></section>':'')+'<div class="drawing-views"><div class="drawing-long">'+viewSvg(m,'front')+viewSvg(m,'top')+'</div><div class="drawing-end">'+viewSvg(m,'left')+'</div></div><footer><span>箱体 X×Z：'+(m.width??'未提供')+' × '+(m.height??'未提供')+' mm　总长 Y：'+(m.totalLength??'未提供')+' mm</span><span>段序：'+esc(m.segments.map((s,i)=>(i+1)+' '+s.name+' '+(s.length??'未提供')+'mm').join(' / '))+'</span><span>'+esc(m.disclaimer)+'</span></footer></div>';
    host.querySelector('[data-drawing-dxf]').addEventListener('click',async()=>{try{const live=current(),blob=new Blob([dxf(live)],{type:'application/dxf;charset=utf-8'});await root.AHUPrototypeDrawingArchive.saveAndDownload({unitId:live.unit.unitId,kind:'dxf',filename:live.unit.no+'-参数化外形接口图.dxf',blob,buildArtifact:()=>{const fresh=current();return{filename:fresh.unit.no+'-参数化外形接口图.dxf',blob:new Blob([dxf(fresh)],{type:'application/dxf;charset=utf-8'})};}});}catch(error){showWarning(host,error);}});
    host.querySelector('[data-drawing-pdf]').addEventListener('click',async()=>{try{const live=current(),blob=pdf(live,root.document);await root.AHUPrototypeDrawingArchive.saveAndDownload({unitId:live.unit.unitId,kind:'pdf',filename:live.unit.no+'-参数化外形接口图.pdf',blob,buildArtifact:()=>{const fresh=current();return{filename:fresh.unit.no+'-参数化外形接口图.pdf',blob:pdf(fresh,root.document)};}});}catch(error){showWarning(host,error);}});
  }
  if(root.document) {
    const style=root.document.createElement('style');
    style.textContent='.stage-placeholder:has(.drawing-page){display:block;overflow:auto;padding:12px;background:#e5edef}.drawing-page{max-width:1500px;margin:auto;border:1px solid #b9cbd0;background:#f8fbfb;color:#274754}.drawing-page>header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;border-bottom:1px solid #b9cbd0}.drawing-page h2{margin:0;font-size:16px}.drawing-page p{margin:3px 0 0;color:#607b84;font-size:11px}.drawing-actions{display:flex;gap:7px;white-space:nowrap}.drawing-views{display:grid;grid-template-columns:minmax(0,2fr) minmax(260px,1fr);gap:8px;padding:8px}.drawing-long{display:grid;gap:8px}.drawing-views svg{display:block;width:100%;height:100%;border:1px solid #b7cbd1}.drawing-end svg{min-height:100%}.drawing-page footer{display:flex;flex-wrap:wrap;gap:8px 18px;padding:9px 14px;border-top:1px solid #b9cbd0;color:#4f6974;font-size:11px}.drawing-page footer strong{color:#a14d26;font-weight:600}.drawing-warning,.drawing-export-gate{margin:8px;padding:9px 12px;border:1px solid #d8a184;background:#fff3ec;color:#963f24;font-size:12px}.drawing-export-gate{max-height:140px;overflow:auto;display:grid;gap:4px}.drawing-export-gate ul{margin:0;padding-left:20px}.drawing-actions button:disabled{opacity:.55;cursor:not-allowed}@media(max-width:900px){.drawing-views{grid-template-columns:1fr}.drawing-page>header{align-items:flex-start;flex-direction:column}.drawing-end svg{max-height:230px}}';
    root.document.head.appendChild(style);
    root.document.addEventListener('click',e=>{if(e.target.closest('[data-stage="图纸预览"]'))setTimeout(render,0);});
    root.document.getElementById('drawBtn')?.addEventListener('click',e=>{e.stopImmediatePropagation();root.document.querySelector('.stage[data-stage="图纸预览"]')?.click();},true);
  }
  return {PAGE,makeModel,geometry,featureCorners,projectFeature,exportGate,dxf3dOffset,viewSvg,dxf,pdfBytesFromJpeg,pdf,current,render};
});

