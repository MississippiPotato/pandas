import {chartMessages} from '../i18n/charts.js';
import * as d3 from 'd3';

// These previews use full-table counts. Display limits never change calculations.
function canvas(host, height, title) {
  d3.select(host).selectAll('*').remove();
  const svg=d3.select(host).append('svg').attr('viewBox',`0 0 800 ${height}`).attr('role','img').attr('aria-label',title).attr('font-family','Inter, Microsoft YaHei, sans-serif').attr('font-size',12).attr('fill','#506174');
  svg.append('rect').attr('width',800).attr('height',height).attr('fill','#fff');
  return svg;
}
export function missingFeedback(host, fields, {locale='zh-CN',onField}={}) {
  const zh=locale==='zh-CN',ct=key=>chartMessages[key][zh?0:1], shown=fields.slice(0,40), H=60+shown.length*36;
  const svg=canvas(host,H,ct('chart020'));
  svg.append('text').attr('x',205).attr('y',18).text(ct('chart021'));svg.append('text').attr('x',455).attr('y',18).text(ct('chart022'));
  const max=d3.max(fields,d=>Math.max(d.before,d.after??0))||1, scale=d3.scaleLinear().domain([0,max]).range([0,180]);
  const rows=svg.selectAll('g.field-missing').data(shown).join('g').attr('class','field-missing').attr('transform',(_,i)=>`translate(0,${32+i*36})`);
  rows.append('rect').attr('width',800).attr('height',34).attr('fill',(_,i)=>i%2?'#f5f8f5':'white');
  rows.append('text').attr('x',5).attr('y',21).text(d=>d.name.length>23?d.name.slice(0,21)+'…':d.name).append('title').text(d=>d.name);
  for(const [key,x,color,total]of [['before',205,'#d99b67','beforeRows'],['after',455,'#168b80','afterRows']]) {
    rows.append('rect').attr('x',x).attr('y',8).attr('width',d=>scale(d[key]??0)).attr('height',18).attr('rx',3).attr('fill',color);
    rows.append('text').attr('x',x+190).attr('y',21).text(d=>d[key]===null?'—':`${d[key]} (${d[total]?(100*d[key]/d[total]).toFixed(1):'0.0'}%)`);
  }
  rows.append('title').text(d=>`${d.name}: ${d.before} / ${d.beforeRows} → ${d.after??'—'} / ${d.afterRows}`);
  if(onField)rows.attr('role','button').attr('tabindex',0).style('cursor','pointer').on('click',(_,d)=>onField(d.id)).on('keydown',(e,d)=>{if(['Enter',' '].includes(e.key)){e.preventDefault();onField(d.id);}});
  svg.append('text').attr('x',5).attr('y',H-5).text(zh?`完整统计 ${fields.length} 个字段；展示前 ${shown.length} 个。点击字段配置清洗。`:`Full counts for ${fields.length} fields; first ${shown.length} shown. Select a field to configure cleaning.`);
}
export function rollingFeedback(host, rolling, {locale='zh-CN'}={}) {
  const zh=locale==='zh-CN',ct=key=>chartMessages[key][zh?0:1], series=rolling.series, H=70+Math.max(1,series.length)*240;
  const svg=canvas(host,H,ct('chart023'));
  for(const [label,color,x]of [[`${ct('chart024')} · ${rolling.field}`,'#a7825a',15],[`${rolling.fn} · ${rolling.as}`,'#168b80',380]]){
    svg.append('line').attr('x1',x).attr('x2',x+25).attr('y1',15).attr('y2',15).attr('stroke',color).attr('stroke-width',3);svg.append('text').attr('x',x+32).attr('y',19).text(label);
  }
  series.forEach((s,j)=>{
    const top=55+j*240, values=s.points.flatMap(p=>[p.original,p.value]).filter(v=>typeof v==='number'),extent=d3.extent(values), lo=extent[0]??0, hi=extent[1]??1;
    const x=d3.scaleLinear().domain([0,Math.max(1,s.points.length-1)]).range([65,765]),y=d3.scaleLinear().domain(lo===hi?[lo-1,hi+1]:[lo,hi]).nice().range([top+175,top+15]);
    svg.append('text').attr('x',65).attr('y',top).text(`${rolling.by.length?rolling.by.join(' / ')+' = '+s.key.map(v=>v??'∅').join(' / '):(ct('chart025'))} · ${s.points.length} / ${s.totalRows} ${ct('chart026')}`);
    svg.append('g').attr('transform',`translate(0,${top+175})`).call(d3.axisBottom(x).ticks(6).tickFormat(v=>v+1));svg.append('g').attr('transform','translate(65,0)').call(d3.axisLeft(y).ticks(4));
    for(const [key,color]of [['original','#a7825a'],['value','#168b80']]) {
      svg.append('path').datum(s.points).attr('class',`rolling-${key}`).attr('fill','none').attr('stroke',color).attr('stroke-width',2.5).attr('d',d3.line().defined(d=>typeof d[key]==='number').x(d=>x(d.index)).y(d=>y(d[key])));
      svg.append('g').selectAll('circle').data(s.points.filter(p=>typeof p[key]==='number')).join('circle').attr('cx',d=>x(d.index)).attr('cy',d=>y(d[key])).attr('r',3).attr('fill',color).append('title').text(d=>`${rolling.order}=${d.order??'∅'}\n${rolling.field}=${d.original??'∅'}\n${rolling.as}=${d.value??'∅'}`);
    }
    svg.append('text').attr('x',765).attr('y',top+215).attr('text-anchor','end').text(zh?`按 ${rolling.order} 升序后的组内行位置；空值断线`:`Row position after ascending ${rolling.order} sort; gaps indicate nulls`);
  });
  svg.append('text').attr('x',15).attr('y',H-5).text(zh?`全部 ${rolling.groups} 组 / ${rolling.totalRows} 行参与计算；预览前 3 组、每组前 200 行。`:`All ${rolling.groups} groups / ${rolling.totalRows} rows computed; preview first 3 groups, first 200 rows each.`);
}
