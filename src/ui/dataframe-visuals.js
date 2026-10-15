import * as d3 from 'd3';
import {t,fmt,getLocale} from '../i18n/locale.js';
import {isNumericColumn} from '../data/semantics.js';
import {esc,$,$$} from './utils.js';
export const columnLabel=c=>c.label?.[getLocale()==='zh-CN'?'zh':'en']??c.name;
const val=v=>v===null||v===undefined?'∅':typeof v==='number'?fmt(v,4):String(v);
function svgAt(host,w=180,h=66){return d3.select(host).append('svg').attr('viewBox',`0 0 ${w} ${h}`).attr('role','img');}
export function headerHTML(c,p){
  if(!p)return '';
  const ratio=p.count/(p.count+p.missing||1);
  return `<div class="column-summary" data-summary="${esc(c.id)}"><div class="validity" title="${t('valid')}: ${p.count} / ${t('missing')}: ${p.missing}"><i style="width:${ratio*100}%"></i></div>${c.semantic==='key'?`<div class="key-summary">${t('keyRole')}<br>${fmt(p.count?p.unique/p.count*100:0,1)}% ${t('uniqueKeys')}</div>`:`<div class="header-spark"></div><span class="spark-label">${isNumericColumn(c)?`${t('mean')} ${val(p.mean)} / ${t('median')} ${val(p.median)}`:`${p.unique} ${t('unique')}`}</span>`}</div>`;
}
export function drawHeaders(root,columns,summary,onSelection){
  for(const host of $$('[data-summary]',root)){
    const c=columns.find(c=>c.id===host.dataset.summary),p=summary.find(p=>p.id===c.id);if(!p||c.semantic==='key')continue;
    const target=$('.header-spark',host);if(!target)continue;target.replaceChildren();
    const svg=svgAt(target,170,44);
    if(isNumericColumn(c)&&p.bins?.length){
      const x=d3.scaleLinear().domain(p.domain).range([2,168]),y=d3.scaleLinear().domain([0,d3.max(p.bins,b=>b.count)||1]).range([41,2]);
      svg.selectAll('rect.bin').data(p.bins).join('rect').attr('class','bin').attr('x',b=>x(b.x0)+.5).attr('y',b=>y(b.count)).attr('width',b=>Math.max(1,x(b.x1)-x(b.x0)-1)).attr('height',b=>41-y(b.count)).attr('fill','#7caa93').append('title').text(b=>`${val(b.x0)}–${val(b.x1)}: ${b.count}`);
      svg.append('g').attr('class','header-brush brush').call(d3.brushX().extent([[1,0],[169,44]]).on('end',e=>{if(e.sourceEvent&&e.selection)onSelection('header',{field:c.id,op:'between',min:x.invert(e.selection[0]),max:x.invert(e.selection[1])});}));
    }else{
      const items=(p.values??[]).slice(0,3),y=d3.scaleBand().domain(d3.range(items.length)).range([1,43]).padding(.2);
      const bars=svg.selectAll('g').data(items).join('g').attr('tabindex',0).attr('role','button').attr('aria-label',d=>`${val(d.value)}: ${d.count}`).on('click',(_,d)=>onSelection('header',{field:c.id,op:d.value===null?'isMissing':'eq',...(d.value===null?{}:{value:d.value})})).on('keydown',(e,d)=>{if(e.key==='Enter')onSelection('header',{field:c.id,op:d.value===null?'isMissing':'eq',...(d.value===null?{}:{value:d.value})});});
      bars.append('rect').attr('x',0).attr('y',(_,i)=>y(i)).attr('width',d=>Math.max(2,170*d.proportion)).attr('height',y.bandwidth()).attr('fill','#d6e7dc');
      bars.append('text').attr('x',3).attr('y',(_,i)=>y(i)+10).attr('font-size',9).text(d=>`${val(d.value).slice(0,20)} · ${d.count}`);
      bars.append('title').text(d=>`${val(d.value)}: ${d.count} (${fmt(d.proportion*100,1)}%)`);
    }
  }
}
const table=(records,columns,keys=[],deleted=false)=>`<div class="table-scroll"><table><thead><tr>${columns.map(c=>`<th>${esc(columnLabel(c))}<small>${esc(c.name)}</small></th>`).join('')}</tr></thead><tbody>${records.map(r=>{const key=keys.map(k=>r[k]).join('|');let hash=0;for(const ch of key)hash=(hash*31+ch.charCodeAt(0))>>>0;return `<tr class="${deleted?'diff-removed':''}" ${keys.length?`style="--group-color:${d3.schemeSet3[hash%12]};border-left:5px solid var(--group-color)"`:''}>${columns.map(c=>`<td>${esc(val(r[c.name]))}${deleted?` <small>${t('filteredOut')}</small>`:''}</td>`).join('')}</tr>`;}).join('')}</tbody></table></div>`;
export function diffHTML(d){
  if(!d)return `<p class="hint">${t('noDraftDiff')}</p>`;
  return `<p class="hint">${t('diffHint')} · ${d.inputRows} × ${d.inputColumns.length} → ${d.outputRows} × ${d.outputColumns.length}</p>${d.structural?`<div class="diff-split"><section><h4>${t('inputTable')}</h4>${table(d.input,d.inputColumns,d.keys)}</section><section><h4>${t('outputTable')}</h4>${table(d.output,d.outputColumns,d.keys)}</section></div>`:`${d.removed.length?`<h4>${t('filteredOut')}</h4>${table(d.removed.map(r=>r.record),d.inputColumns,[],true)}`:''}${d.changed.length?`<h4>${t('changedCells')}</h4><div class="table-scroll"><table><tbody>${d.changed.map(r=>`<tr><th>${esc(r.rowId)}</th>${r.cells.map(c=>`<td class="diff-changed"><small>${esc(c.renamed?c.oldName+' → '+c.field:c.field)}</small><span class="diff-pill">${esc(val(c.before))} → <b>${esc(val(c.after))}</b></span></td>`).join('')}</tr>`).join('')}</tbody></table></div>`:''}${!d.removed.length&&!d.changed.length?`<p>${t('noDiff')}</p>`:''}`}`;
}
export function shapeHTML(before,after){
  const maxR=Math.max(before.rows,after.rows,1),maxC=Math.max(before.columns,after.columns,1),rect=(s,x)=>`<rect x="${x}" y="${29-25*Math.sqrt(s.rows/maxR)}" width="${Math.max(2,48*Math.sqrt(s.columns/maxC))}" height="${Math.max(2,25*Math.sqrt(s.rows/maxR))}" rx="2" fill="${x===0?'#c5d8c9':'#52927b'}"/>`;
  return `<svg class="shape-indicator" viewBox="0 0 116 32" aria-label="${before.rows} × ${before.columns} → ${after.rows} × ${after.columns}">${rect(before,0)}<text x="52" y="22" fill="#6b806a">→</text>${rect(after,68)}</svg><span class="shape-badge">${before.rows} × ${before.columns} → ${after.rows} × ${after.columns}</span><small>${after.rows-before.rows>0?'+':''}${after.rows-before.rows} ${t('rows')} (${fmt(before.rows?100*(after.rows-before.rows)/before.rows:0,1)}%)</small>`;
}
export function drawWidgets(host,form,summary,preview,onChange){
  if(!host||!form)return;host.replaceChildren();const type=form.type,p=preview?.spec.params??{},v=n=>$(`[name="${n}"]`,form.host)?.value;
  const set=(n,value)=>{const el=$(`[name="${n}"]`,form.host);if(el)el.value=String(value);};
  const heading=document.createElement('p');heading.className='hint';heading.textContent=t('widgetHint');host.append(heading);
  if(['dropna','fillna'].includes(type)){
    const cols=summary.filter(c=>c.missing>0).slice(0,20),svg=svgAt(host,240,Math.max(38,cols.length*22+4));
    const gs=svg.selectAll('g').data(cols).join('g').attr('tabindex',0).attr('role','button').attr('aria-label',d=>`${d.name}: ${d.missing}`).on('click',(_,d)=>{if(type==='fillna')set('field',d.id);else{const box=$$('[name=subset]',form.host).find(el=>el.value===d.id);if(box)box.checked=!box.checked;}onChange();}).on('keydown',(e,d)=>{if(e.key==='Enter'){if(type==='fillna')set('field',d.id);else{const box=$$('[name=subset]',form.host).find(el=>el.value===d.id);if(box)box.checked=!box.checked;}onChange();}});
    gs.append('rect').attr('x',0).attr('y',(_,i)=>i*22).attr('width',d=>Math.max(3,240*d.missingRate)).attr('height',18).attr('fill','#eed8bb');
    gs.append('text').attr('x',4).attr('y',(_,i)=>i*22+13).attr('font-size',10).text(d=>`${columnLabel(d)} · ${d.missing} (${fmt(d.missingRate*100,1)}%)`);
  }
  if(['fillna','filter','cut','qcut'].includes(type)){
    const c=summary.find(c=>c.id===v(type==='filter'?'field0':'field'));if(!c||!isNumericColumn(c)||!c.bins?.length)return;
    const svg=svgAt(host,240,120),x=d3.scaleLinear().domain(c.domain).range([8,232]),y=d3.scaleLinear().domain([0,d3.max(c.bins,b=>b.count)||1]).range([87,10]);
    svg.selectAll('rect.bin').data(c.bins).join('rect').attr('class','bin').attr('x',b=>x(b.x0)).attr('y',b=>y(b.count)).attr('width',b=>Math.max(1,x(b.x1)-x(b.x0)-1)).attr('height',b=>87-y(b.count)).attr('fill','#afcaba').append('title').text(b=>`${val(b.x0)}–${val(b.x1)}: ${b.count}`);
    svg.append('g').attr('transform','translate(0,88)').call(d3.axisBottom(x).ticks(4)).attr('font-size',9);
    if(type==='fillna'){
      for(const [method,value,color]of [['mean',c.mean,'#c17c38'],['median',c.median,'#227f77']]){
        const g=svg.append('g').attr('role','button').attr('tabindex',0).attr('aria-label',`${t(method)} ${val(value)}`).on('click',()=>{set('method',method);onChange();}).on('keydown',e=>{if(e.key==='Enter'){set('method',method);onChange();}});
        g.append('line').attr('x1',x(value)).attr('x2',x(value)).attr('y1',4).attr('y2',88).attr('stroke',color).attr('stroke-width',2);
        g.append('text').attr('x',method==='mean'?125:6).attr('y',118).attr('fill',color).attr('font-size',10).text(`${t(method)} ${val(value)}`);
      }
      if(c.mean>c.median+.3*(c.q3-c.q1)&&c.q3>c.q1){const note=document.createElement('p');note.className='hint';note.textContent=t('rightSkew');host.append(note);}
    }else if(type==='filter')svg.append('g').attr('class','widget-brush brush').call(d3.brushX().extent([[8,4],[232,88]]).on('end',e=>{if(e.sourceEvent&&e.selection){set('operator0','between');set('value0',+x.invert(e.selection[0]).toPrecision(6));set('upper0',+x.invert(e.selection[1]).toPrecision(6));onChange();}}));
    else{
      const edges=(type==='cut'?v('edges')?.split(',').map(Number):preview?.report.edges)??[];
      const lines=svg.selectAll('line.edge').data(edges).join('line').attr('class','edge').attr('x1',d=>x(d)).attr('x2',d=>x(d)).attr('y1',2).attr('y2',88).attr('stroke','#bf8244').attr('stroke-width',4).attr('tabindex',type==='cut'?0:null);
      if(type==='cut')lines.call(d3.drag().on('drag',function(e){d3.select(this).attr('x1',Math.max(8,Math.min(232,e.x))).attr('x2',Math.max(8,Math.min(232,e.x)));}).on('end',(e,d)=>{const i=edges.indexOf(d),value=+x.invert(Math.max(8,Math.min(232,e.x))).toPrecision(6);if((i===0||value>edges[i-1])&&(i===edges.length-1||value<edges[i+1])){edges[i]=value;set('edges',edges.join(','));onChange();}})).on('keydown',(e,d)=>{if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const i=edges.indexOf(d),value=d+(e.key==='ArrowRight'?1:-1)*(c.domain[1]-c.domain[0])/100;if((i===0||value>edges[i-1])&&(i===edges.length-1||value<edges[i+1])){edges[i]=value;set('edges',edges.join(','));onChange();}});
      const note=document.createElement('p');note.className='hint';note.textContent=t('binDrag');host.append(note);
      if(preview){const groups=preview.profile.columns.find(col=>col.name===p.as)?.values??[];const legend=document.createElement('p');legend.className='hint';legend.textContent=groups.map(g=>`${g.value??'∅'}: ${g.count} (${fmt(g.proportion*100,1)}%)`).join(' · ');host.append(legend);}
    }
    if(type==='filter'&&preview){const info=document.createElement('p');info.className='hint';info.textContent=`${t('selectionCount')}: ${preview.rows} / ${preview.report.before.rows} (${fmt(100*preview.rows/(preview.report.before.rows||1),1)}%)`;host.append(info);}
  }
  if(type==='merge'&&preview){
    const r=preview.report,items=[{name:'leftOnly',count:r.leftDistinctKeys-r.sharedDistinctKeys,how:'left'},{name:'sharedKeys',count:r.sharedDistinctKeys,how:'inner'},{name:'rightOnly',count:r.rightDistinctKeys-r.sharedDistinctKeys,how:'right'}],total=items.reduce((n,d)=>n+d.count,0)||1;
    for(const item of items){const b=document.createElement('button');b.type='button';b.className='overlap-choice';b.textContent=`${t(item.name)}: ${item.count}`;b.style.setProperty('--share',`${item.count/total*100}%`);b.onclick=()=>{set('how',item.how);onChange();};host.append(b);}
    const outer=document.createElement('button');outer.type='button';outer.className='text-button';outer.textContent='outer · '+t('allDataHint');outer.onclick=()=>{set('how','outer');onChange();};host.append(outer);
    const info=document.createElement('p');info.className='hint';info.textContent=`${t('outputTable')}: ${r.after.rows} × ${r.after.columns} · ${t('newMissing')}: ${r.generatedMissing}`;host.append(info);
  }
  if(type==='group'&&preview?.groups){
    const items=preview.groups.items,svg=svgAt(host,240,Math.max(40,items.length*19+4));
    svg.selectAll('rect').data(items).join('rect').attr('y',(_,i)=>i*19).attr('width',d=>240*d.sourceCount/(preview.groups.includedRows||1)).attr('height',16).attr('fill','#b1cebd');
    svg.selectAll('text').data(items).join('text').attr('x',3).attr('y',(_,i)=>i*19+12).attr('font-size',9).text(d=>`${d.key.slice(0,20)}: n=${d.sourceCount} (${fmt(d.sourceCount/(preview.groups.includedRows||1)*100,1)}%)`);
  }
}
