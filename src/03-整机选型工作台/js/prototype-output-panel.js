renderOutputs=function(){};
const fullscreenBtn=$('fullscreenBtn');
function syncFullscreenButton(){fullscreenBtn.hidden=!document.fullscreenElement;}
fullscreenBtn.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();}catch(error){console.error('无法退出全屏',error);}});
document.addEventListener('fullscreenchange',syncFullscreenButton);
syncFullscreenButton();
window.AHUThreeBridge={state:()=>{const d=previewDimensionsMm(),unit=formalReadonly?null:projects[selectedProject]?.units?.[selectedUnit],series=formalReadonly?(formalInfo.cabinetSeries||null):(unit?.cabinetSeries||unit?.designConditions?.cabinetSeries||'25W');return{segments,selectedId,view,cutaway,readOnly:formalReadonly,cabinetDimensions:formalReadonly?{width:formalInfo.width,height:formalInfo.height,mode:'formal',unitNo:formalInfo.unitNo,cabinetSeries:series}:{width:d.widthKnown?d.width:null,height:d.heightKnown?d.height:null,mode:'prototype',unitNo:unit?.no||'',cabinetSeries:series}}},select:id=>selectSegment(id),replaceRenderer:fn=>{renderView=fn;},previousRenderer:renderView};
function updatePrototypeStatus(){document.querySelector('.status .push').textContent=formalReadonly?'已读取正式项目保存值，只读展示；未验证实际部件的仍为示意':'当前最终工作台 · 过滤器与盘管专业选型已接入 · 共享3D库待接入'}
updatePrototypeStatus();
