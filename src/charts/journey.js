import * as d3 from 'd3';
import {getLocale,t,fmt} from '../i18n/locale.js';
import {columnLabel} from '../ui/dataframe-visuals.js';
const colors={green:'#217b65',orange:'#d58d4d',muted:'#dfe8e1',ink:'#29493c'};
function canvas(host,height=300){const sel=d3.select(host);sel.selectAll('*').remove();return sel.append('svg').attr('viewBox',`0 0 780 ${height}`).attr('role','img').attr('font-family','Inter, system-ui, Microsoft YaHei, sans-serif').attr('font-size',12).attr('fill',colors.ink);}
function action(nodes,fn){nodes.attr('tabindex',0).attr('role','button').style('cursor','pointer').on('click',(_,d)=>fn(d)).on('keydown',(e,d)=>{if(e.key==='Enter'){e.preventDefault();fn(d);}});}
export function drawJourneyMissing(host,columns,{field,onField,before=null,after=null}={}){
  if(!host)return;const shown=columns.filter(c=>['minutes','pts','fg_pct'].includes(c.name)),svg=canvas(host,245),scale=d3.scaleLinear().domain([0,Math.max(1,...shown.map(c=>c.count+c.missing))]).range([0,490]);
  const groups=svg.selectAll('g.field').data(shown).join('g').attr('class','field').attr('transform',(_,i)=>`translate(0,${35+i*65})`);
  groups.append('rect').attr('x',0).attr('y',-20).attr('width',780).attr('height',60).attr('rx',8).attr('fill',d=>d.id===field?'#eef4eb':'#fff');
  groups.append('text').attr('x',12).attr('y',4).attr('font-size',14).text(columnLabel);
  groups.append('rect').attr('x',170).attr('y',-9).attr('width',490).attr('height',20).attr('rx',4).attr('fill',colors.muted);
  groups.append('rect').attr('x',170).attr('y',-9).attr('width',d=>scale(before?.find(c=>c.id===d.id)?.missing??d.missing)).attr('height',20).attr('rx',4).attr('fill',colors.orange);
  if(after)groups.append('rect').attr('x',170).attr('y',15).attr('width',d=>scale(after.find(c=>c.id===d.id)?.missing??0)).attr('height',9).attr('rx',3).attr('fill',colors.green);
  groups.append('text').attr('x',675).attr('y',6).attr('font-size',13).text(d=>{const b=before?.find(c=>c.id===d.id)?.missing??d.missing,a=after?.find(c=>c.id===d.id)?.missing;return a!==undefined?`${b} → ${a}`:`${b} / ${d.count+d.missing}`;});
  groups.append('title').text(d=>`${columnLabel(d)}: ${d.missing} (${fmt(d.missingRate*100,1)}%)`);
  if(onField)action(groups,d=>onField(d.id));
  svg.append('text').attr('x',170).attr('y',238).attr('font-size',11).text(t('journeyPractice'));
}
export function drawJourneyFilter(host,column,range,onBrush){
  if(!host||!column?.bins?.length)return;const svg=canvas(host,320),x=d3.scaleLinear().domain(column.domain).range([58,746]),y=d3.scaleLinear().domain([0,d3.max(column.bins,d=>d.count)||1]).nice().range([265,35]);
  const low=Math.max(58,Math.min(746,x(range[0]))),high=Math.max(low,Math.min(746,x(range[1])));
  svg.append('rect').attr('x',low).attr('y',25).attr('width',high-low).attr('height',240).attr('fill','#e7f0df');
  svg.append('defs').append('clipPath').attr('id','journey-filter-range').append('rect').attr('x',low).attr('y',25).attr('width',high-low).attr('height',240);
  const bins=group=>group.selectAll('rect.bin').data(column.bins).join('rect').attr('class','bin').attr('x',d=>x(d.x0)+2).attr('y',d=>y(d.count)).attr('width',d=>Math.max(1,x(d.x1)-x(d.x0)-4)).attr('height',d=>265-y(d.count)).attr('rx',3);
  bins(svg.append('g')).attr('fill',colors.muted).append('title').text(d=>`${fmt(d.x0,2)}–${fmt(d.x1,2)}: ${d.count}`);
  bins(svg.append('g').attr('clip-path','url(#journey-filter-range)')).attr('fill',colors.green);
  svg.append('g').attr('transform','translate(0,265)').call(d3.axisBottom(x).ticks(8));svg.append('g').attr('transform','translate(58,0)').call(d3.axisLeft(y).ticks(4));
  svg.append('text').attr('x',746).attr('y',309).attr('text-anchor','end').text(columnLabel(column));
  const brush=d3.brushX().extent([[58,25],[746,266]]).on('end',event=>{if(event.sourceEvent&&event.selection)onBrush([+x.invert(event.selection[0]).toFixed(1),+x.invert(event.selection[1]).toFixed(1)]);});
  svg.append('g').attr('class','journey-brush brush').call(brush).call(brush.move,[low,high]);
}
export function drawJourneyFill(host,column,method,onMethod){
  if(!host||!column?.bins?.length)return;const svg=canvas(host,340),value=column[method],bins=column.bins.map(b=>({...b,after:b.count+(value>=b.x0&&(value<b.x1||value===column.domain[1]&&value===b.x1)?column.missing:0)}));
  const x=d3.scaleLinear().domain(column.domain).range([58,745]),y=d3.scaleLinear().domain([0,d3.max(bins,b=>b.after)||1]).nice().range([260,50]);
  for(const [key,color,offset]of [['count',colors.orange,0],['after',colors.green,.5]])svg.append('g').selectAll('rect').data(bins).join('rect').attr('x',b=>x(b.x0)+offset*(x(b.x1)-x(b.x0))+1).attr('y',b=>y(b[key])).attr('width',b=>Math.max(1,(x(b.x1)-x(b.x0))/2-2)).attr('height',b=>260-y(b[key])).attr('fill',color).attr('opacity',.8).append('title').text(b=>`${fmt(b.x0,2)}–${fmt(b.x1,2)}: ${b.count} → ${b.after}`);
  svg.append('g').attr('transform','translate(0,260)').call(d3.axisBottom(x).ticks(7));svg.append('g').attr('transform','translate(58,0)').call(d3.axisLeft(y).ticks(4));
  for(const [key,color]of [['mean','#bd7a3d'],['median','#205f50']]){
    const group=svg.append('g');group.append('line').attr('x1',x(column[key])).attr('x2',x(column[key])).attr('y1',45).attr('y2',260).attr('stroke',color).attr('stroke-width',2).attr('stroke-dasharray','4 3');
    group.append('rect').attr('x',key==='mean'?58:385).attr('y',8).attr('width',305).attr('height',28).attr('rx',5).attr('fill',key===method?'#e7f0e0':'#f6f8f0');group.append('text').attr('x',key==='mean'?70:397).attr('y',27).attr('fill',color).text(`${t(key)} ${fmt(column[key],2)}${key===method?' ✓':''}`);action(group,()=>onMethod(key));
  }
  svg.append('text').attr('x',58).attr('y',310).attr('fill',colors.orange).text(t('before'));svg.append('text').attr('x',170).attr('y',310).attr('fill',colors.green).text(t('after'));
  svg.append('text').attr('x',745).attr('y',310).attr('text-anchor','end').text(`${columnLabel(column)} · ${t('journeyImputeValue')} ${fmt(value,2)}`);
}
export function drawJourneyRolling(host,records,field='rolling_points'){
  if(!host)return;const svg=canvas(host,350),valid=records.flatMap(r=>[r.pts,r[field]]).filter(v=>typeof v==='number');if(!records.length||!valid.length)return;
  const x=d3.scaleUtc().domain(d3.extent(records,r=>new Date(r.game_date))).range([58,745]),y=d3.scaleLinear().domain([0,d3.max(valid)||1]).nice().range([285,45]);
  for(const [label,color,left]of [[t('pts'),colors.orange,58],[t('rolling'),colors.green,330]]){svg.append('line').attr('x1',left).attr('x2',left+22).attr('y1',17).attr('y2',17).attr('stroke',color).attr('stroke-width',3);svg.append('text').attr('x',left+30).attr('y',21).text(label);}
  svg.append('g').attr('transform','translate(0,285)').call(d3.axisBottom(x).ticks(5).tickFormat(d3.utcFormat('%m/%d')));svg.append('g').attr('transform','translate(58,0)').call(d3.axisLeft(y).ticks(5));
  for(const [key,color]of [['pts',colors.orange],[field,colors.green]]){
    svg.append('path').datum(records).attr('fill','none').attr('stroke',color).attr('stroke-width',3).attr('d',d3.line().defined(r=>typeof r[key]==='number').x(r=>x(new Date(r.game_date))).y(r=>y(r[key])));
    svg.append('g').selectAll('circle').data(records.filter(r=>typeof r[key]==='number')).join('circle').attr('cx',r=>x(new Date(r.game_date))).attr('cy',r=>y(r[key])).attr('r',4).attr('fill',color).append('title').text(r=>`${r.player_name} · ${r.game_date}\npts=${r.pts} · ${field}=${fmt(r[field],3)}`);
  }
  svg.append('text').attr('x',745).attr('y',333).attr('text-anchor','end').text(t('journeyDateAxis'));
}
export function drawJourneyRanking(host,records){
  if(!host)return;const shown=records.slice(0,10),svg=canvas(host,Math.max(180,shown.length*35+68));if(!shown.length){svg.append('text').attr('x',30).attr('y',80).text(t('journeyScopeWarn'));return;}
  const x=d3.scaleLinear().domain([0,d3.max(shown,r=>r.mean_points)||1]).range([195,610]);
  shown.forEach((r,i)=>{const y=35+i*35;svg.append('text').attr('x',178).attr('y',y+17).attr('text-anchor','end').text(r.player_name);svg.append('rect').attr('x',195).attr('y',y).attr('height',24).attr('width',x(r.mean_points)-195).attr('fill',i===0?colors.green:'#8db39b').attr('rx',3).append('title').text(`${r.player_name}: ${fmt(r.mean_points,2)} · n=${r.appearances} · std=${fmt(r.std_points,2)}`);svg.append('text').attr('x',x(r.mean_points)+8).attr('y',y+17).attr('font-weight',600).text(fmt(r.mean_points,1));svg.append('text').attr('x',670).attr('y',y+17).attr('font-size',11).text(`n=${r.appearances} · σ=${fmt(r.std_points,1)}`);});
  const bottom=shown.length*35+43;svg.append('g').attr('transform',`translate(0,${bottom})`).call(d3.axisBottom(x).ticks(5));
}
export function drawJourneyBalance(host,records){
  if(!host)return;const svg=canvas(host,360),shown=records.filter(r=>Number.isFinite(r.mean_points)&&Number.isFinite(r.std_points));if(!shown.length){svg.append('text').attr('x',30).attr('y',100).text(t('journeyScopeWarn'));return;}
  const x=d3.scaleLinear().domain([0,d3.max(shown,r=>r.std_points)||1]).nice().range([70,745]),y=d3.scaleLinear().domain([0,d3.max(shown,r=>r.mean_points)||1]).nice().range([290,45]),size=d3.scaleSqrt().domain([1,d3.max(shown,r=>r.appearances)||1]).range([4,10]);
  svg.append('rect').attr('x',70).attr('y',45).attr('width',675).attr('height',245).attr('rx',5).attr('fill','#f5f8ed');
  svg.append('g').attr('transform','translate(0,290)').call(d3.axisBottom(x).ticks(6));svg.append('g').attr('transform','translate(70,0)').call(d3.axisLeft(y).ticks(5));
  svg.append('text').attr('x',745).attr('y',333).attr('text-anchor','end').text(t('journeyStdPoints'));svg.append('text').attr('x',70).attr('y',24).text(t('journeyMeanPoints'));
  const dots=svg.append('g').selectAll('circle').data(shown).join('circle').attr('cx',r=>x(r.std_points)).attr('cy',r=>y(r.mean_points)).attr('r',r=>size(r.appearances)).attr('fill',colors.green).attr('fill-opacity',.55).attr('stroke','#fff').attr('stroke-width',1).attr('tabindex',0);
  dots.append('title').text(r=>`${r.player_name}\n${t('journeyMeanPoints')}: ${fmt(r.mean_points,2)}\n${t('journeyStdPoints')}: ${fmt(r.std_points,2)}\nn=${r.appearances}`);
  const detail=d3.select(host).append('div').attr('class','journey-point-detail').attr('role','status').text(t('journeyPointDetails'));
  const show=function(_,r){d3.select(this).attr('stroke',colors.orange).attr('stroke-width',3);detail.text(`${r.player_name} · ${t('journeyMeanPoints')} ${fmt(r.mean_points,2)} · ${t('journeyStdPoints')} ${fmt(r.std_points,2)} · n=${r.appearances}`);};
  const hide=function(){d3.select(this).attr('stroke','#fff').attr('stroke-width',1);};
  dots.attr('role','img').attr('aria-label',r=>`${r.player_name}, ${t('journeyMeanPoints')} ${fmt(r.mean_points,2)}, ${t('journeyStdPoints')} ${fmt(r.std_points,2)}, n=${r.appearances}`).on('pointerenter',show).on('focus',show).on('pointerleave',hide).on('blur',hide);
  const legend=svg.append('g').attr('transform','translate(70,340)');legend.append('text').attr('y',0).text(t('journeySizeLegend'));
  const sizes=[...new Set([1,Math.round(d3.max(shown,r=>r.appearances)/2),d3.max(shown,r=>r.appearances)])];
  sizes.forEach((n,i)=>{const left=205+i*95;legend.append('circle').attr('cx',left).attr('cy',-4).attr('r',size(n)).attr('fill',colors.green).attr('opacity',.55);legend.append('text').attr('x',left+16).text(n);});
  for(const r of shown.slice(0,3))svg.append('text').attr('x',Math.min(615,x(r.std_points)+10)).attr('y',Math.max(40,y(r.mean_points)-10)).attr('font-size',10).text(r.player_name);
}
