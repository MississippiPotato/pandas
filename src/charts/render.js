import {chartMessages} from '../i18n/charts.js';
import * as d3 from 'd3';
const palette=['#168b80','#4581ce','#df8f45','#9778bb','#ce788f','#5c8c9a'];
const format=(value,locale,digits=1)=>value===null||value===undefined?'—':new Intl.NumberFormat(locale,{maximumFractionDigits:digits}).format(value);
function focus(node,handler){node.attr('tabindex',0).attr('role','button').on('click',(_,d)=>handler(d)).on('keydown',(event,d)=>{if(['Enter',' '].includes(event.key)){event.preventDefault();handler(d);}});return node;}
export function renderChart(container,type,data,options={}){
  const host=d3.select(container);host.selectAll('*').remove();
  const W=800,H=type==='court'?530:type==='missing'?Math.max(180,Math.min(400,data.missingMatrix.fields.length*15)):330,M={t:22,r:28,b:46,l:58};
  const svg=host.append('svg').attr('xmlns','http://www.w3.org/2000/svg').attr('viewBox',`0 0 ${W} ${H}`).attr('role','img').attr('aria-label',options.title??type)
    .attr('font-family','Inter, system-ui, Microsoft YaHei, sans-serif').attr('font-size',12).attr('fill','#506174');
  svg.append('rect').attr('width',W).attr('height',H).attr('fill','#ffffff');
  const g=svg.append('g'),locale=options.locale??'zh-CN',zh=locale==='zh-CN',ct=key=>chartMessages[key][zh?0:1];
  const empty=()=>svg.append('text').attr('x',W/2).attr('y',H/2).attr('text-anchor','middle').attr('fill','#81909d').text(ct('chart001'));
  const label=c=>c?.label?.[ct('chart002')]??c?.name??'';
  const axes=(x,y,xLabel='',yLabel='')=>{
    g.append('g').attr('transform',`translate(0,${H-M.b})`).call(d3.axisBottom(x).ticks(6).tickSizeOuter(0));
    g.append('g').attr('transform',`translate(${M.l},0)`).call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));
    g.append('text').attr('x',W-M.r).attr('y',H-5).attr('text-anchor','end').text(xLabel);
    g.append('text').attr('x',M.l).attr('y',12).text(yLabel);
    g.selectAll('.domain').attr('stroke','#d6dee6');g.selectAll('.tick line').attr('stroke','#e4eaf0');
  };
  let tooltip=document.querySelector('#chart-tooltip');if(!tooltip){tooltip=document.createElement('div');tooltip.id='chart-tooltip';tooltip.className='chart-tooltip';tooltip.hidden=true;document.body.append(tooltip);}tooltip.hidden=true;
  const tip=(nodes,fn)=>{nodes.append('title').text(fn);nodes.on('pointermove.tooltip',(event,d)=>{tooltip.textContent=fn(d);tooltip.hidden=false;tooltip.style.left=Math.max(5,Math.min(innerWidth-330,event.clientX+12))+'px';tooltip.style.top=Math.max(5,Math.min(innerHeight-100,event.clientY+12))+'px';}).on('pointerleave.tooltip',()=>tooltip.hidden=true).on('blur.tooltip',()=>tooltip.hidden=true);return nodes;};
  const showTip=(event,content)=>{tooltip.hidden=!content;if(!content)return;tooltip.textContent=content;tooltip.style.left=Math.max(5,Math.min(innerWidth-330,event.clientX+12))+'px';tooltip.style.top=Math.max(5,Math.min(innerHeight-100,event.clientY+12))+'px';};
  const legend=(scale,lo,hi,label='',percent=false)=>{const left=W-M.r-175,top=4;for(let i=0;i<25;i++)svg.append('rect').attr('x',left+i*5).attr('y',top).attr('width',5).attr('height',7).attr('fill',scale(lo+(hi-lo)*i/24));svg.append('text').attr('x',left).attr('y',top+18).attr('font-size',8).text(`${format(percent?lo*100:lo,locale,2)}${percent?'%':''}`);svg.append('text').attr('x',left+125).attr('y',top+18).attr('text-anchor','end').attr('font-size',8).text(`${format(percent?hi*100:hi,locale,2)}${percent?'%':''}`);svg.append('text').attr('x',left+132).attr('y',top+7).attr('font-size',8).text(label);};
  if(type==='scatter'||type==='court'){
    const points=data.points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));if(!points.length){empty();return svg.node();}
    let xd=data.domain??d3.extent(points,p=>p.x),yd=data.extentY??d3.extent(points,p=>p.y);
    if(type==='court'){xd=[-250,250];yd=[-52.5,Math.max(417.5,data.extentY?.[1]??d3.max(points,p=>p.y))];}
    if(xd[0]===xd[1])xd=[xd[0]-1,xd[1]+1];if(yd[0]===yd[1])yd=[yd[0]-1,yd[1]+1];
    let left=M.l,right=W-M.r,top=M.t,bottom=H-M.b;
    if(type==='court'){const unit=Math.min((right-left)/500,(bottom-top)/(yd[1]-yd[0]));const width=500*unit;left=(W-width)/2;right=left+width;}
    const x=d3.scaleLinear().domain(xd).range([left,right]),y=d3.scaleLinear().domain(yd).range([bottom,top]);if(type!=='court'){x.nice();y.nice();}
    if(type==='court'){
      const line=(points)=>g.append('path').attr('d',d3.line().x(p=>x(p[0])).y(p=>y(p[1]))(points)).attr('fill','none').attr('stroke','#bfcabf').attr('stroke-width',1.4);
      g.append('rect').attr('x',x(-250)).attr('y',y(417.5)).attr('width',x(250)-x(-250)).attr('height',y(-52.5)-y(417.5)).attr('fill','#fbfaf5').attr('stroke','#bdcabb');
      line([[-80,-52.5],[-80,137.5],[80,137.5],[80,-52.5]]);line([[-60,-52.5],[-60,137.5],[60,137.5],[60,-52.5]]);
      const circle=(cx,cy,r)=>line(d3.range(0,Math.PI*2+.05,.05).map(a=>[cx+Math.cos(a)*r,cy+Math.sin(a)*r]));
      circle(0,137.5,60);circle(0,0,7.5);line([[-30,-7.5],[30,-7.5]]);
      const a=Math.acos(220/237.5),arc=d3.range(a,Math.PI-a+.01,.025).map(t=>[237.5*Math.cos(t),237.5*Math.sin(t)]);
      line([[-220,-52.5],[-220,Math.sqrt(237.5**2-220**2)]]);line([[220,-52.5],[220,Math.sqrt(237.5**2-220**2)]]);line(arc);
      line([[-250,417.5],[250,417.5]]);
    }else axes(x,y,label(data.fields.x),label(data.fields.y));
    svg.node().__rowScales={x,y};
    const colorKeys=[...new Set(points.map(p=>p.color))],color=d3.scaleOrdinal(palette).domain(colorKeys);
    const marks=g.append('g').selectAll('path').data(type==='court'&&options.courtMode&&options.courtMode!=='points'?[]:points).join('path').attr('data-row-id',p=>p.rowId).attr('d',p=>d3.symbol().type(type==='court'&&p.made===false?d3.symbolCross:d3.symbolCircle).size(type==='court'?12:22)())
      .attr('transform',p=>`translate(${x(p.x)},${y(p.y)})`).attr('fill',p=>p.selected?(type==='court'?(p.made?'#198d7f':'#ce9770'):colorKeys.length<=6?color(p.color):'#168b80'):'#c5d1dc').attr('opacity',p=>p.selected?.66:.22);
    const pointTip=p=>`${p.label??p.rowId}\n${label(data.fields.x)}: ${p.x}\n${label(data.fields.y)}: ${p.y}\n${label(data.fields.category)}: ${p.color??'∅'}`;tip(marks,pointTip);focus(marks,p=>options.onSelection?.('point',{op:'and',args:[{field:data.fields.x.id,op:'eq',value:p.x},{field:data.fields.y.id,op:'eq',value:p.y}]}));
    if(data.pointSample&&!(type==='court'&&options.courtMode&&options.courtMode!=='points'))svg.append('text').attr('class','sampling-caption').attr('x',W-M.r).attr('y',12).attr('text-anchor','end').attr('font-size',9).text(zh?`显示抽样 ${points.length} / ${data.totalRows} 行 · 统计使用全量`:`Display sample ${points.length} / ${data.totalRows} rows · full-data statistics`);
    if(type==='court'&&options.courtMode&&options.courtMode!=='points'){
      const rate=options.courtMode==='rate',scale=rate?d3.scaleSequential([0,1],d3.interpolateYlGnBu):d3.scaleSequential([0,d3.max(data.regions,d=>d.count)||1],d3.interpolateYlGnBu);
      const rects=g.append('g').selectAll('rect').data(data.regions).join('rect').attr('x',d=>x(Math.max(-250,d.x0))).attr('y',d=>y(d.y1)).attr('width',d=>Math.max(2,x(Math.min(250,d.x1))-x(Math.max(-250,d.x0)))).attr('height',d=>y(d.y0)-y(d.y1)).attr('fill',d=>scale(rate?d.pct:d.count)).attr('opacity',.8).attr('stroke','#fff').attr('stroke-width',.5);
      tip(rects,d=>`n=${d.count} · ${ct('chart003')}=${d.made} · FG%=${format(d.pct*100,locale,1)}%`);
      legend(scale,0,rate?1:d3.max(data.regions,d=>d.count)||1,rate?'FG%':'n',rate);
      if(options.onSelection)focus(rects,d=>options.onSelection('region',{op:'and',args:[{op:'between',field:data.fields.x.id,min:d.x0,max:d.x1,inclusive:'left'},{op:'between',field:data.fields.y.id,min:d.y0,max:d.y1,inclusive:'left'}]}));
    }
    const nearest=event=>{const [px,py]=d3.pointer(event,svg.node());return points.find(p=>Math.hypot(x(p.x)-px,y(p.y)-py)<8);};
    const brush=d3.brush().extent([[left,top],[right,bottom]]).on('end',event=>{if(!event.sourceEvent||!options.onSelection)return;if(!event.selection){const p=nearest(event.sourceEvent);if(p)options.onSelection('point',{op:'and',args:[{field:data.fields.x.id,op:'eq',value:p.x},{field:data.fields.y.id,op:'eq',value:p.y}]});return;}
      const [[a,b],[c,d]]=event.selection;
      options.onSelection('scatter',{op:'and',args:[{field:data.fields.x.id,op:'between',min:x.invert(a),max:x.invert(c)},{field:data.fields.y.id,op:'between',min:y.invert(d),max:y.invert(b)}]});});
    if(options.onSelection&&!(type==='court'&&options.courtMode&&options.courtMode!=='points')){const brushHost=g.append('g').attr('class','brush scatter-brush').call(brush);brushHost.on('pointermove.tooltip',event=>{const p=nearest(event);tooltip.hidden=!p;if(p){tooltip.textContent=pointTip(p);tooltip.style.left=Math.max(5,Math.min(innerWidth-330,event.clientX+12))+'px';tooltip.style.top=Math.min(innerHeight-100,event.clientY+12)+'px';}}).on('pointerleave.tooltip',()=>tooltip.hidden=true);}
    if(type==='court')svg.append('text').attr('x',M.l).attr('y',H-8).text(options.courtMode&&options.courtMode!=='points'?(ct('chart004')):(ct('chart005')));
    else if(colorKeys.length<=6)colorKeys.forEach((key,i)=>{svg.append('circle').attr('cx',M.l+i*115).attr('cy',H-22).attr('r',3).attr('fill',color(key));svg.append('text').attr('x',M.l+8+i*115).attr('y',H-18).attr('font-size',9).text(String(key??'∅').slice(0,14));});
  }else if(type==='histogram'||type==='distribution'){
    if(!data.histogram.length){empty();return svg.node();}const x=d3.scaleLinear().domain(data.domain).range([M.l,W-M.r]),y=d3.scaleLinear().domain([0,options.histogramMax??(d3.max(data.histogram,b=>b.count)||1)]).nice().range([H-M.b,M.t]);axes(x,y,label(data.fields.x),ct('chart006'));
    g.selectAll('.base').data(data.histogram).join('rect').attr('x',d=>x(d.x0)+1).attr('y',d=>y(d.count)).attr('width',d=>Math.max(0,x(d.x1)-x(d.x0)-2)).attr('height',d=>H-M.b-y(d.count)).attr('fill','#e2eaf1');
    g.selectAll('.chosen').data(data.histogram).join('rect').attr('x',d=>x(d.x0)+1).attr('y',d=>y(d.selected)).attr('width',d=>Math.max(0,x(d.x1)-x(d.x0)-2)).attr('height',d=>H-M.b-y(d.selected)).attr('fill','#21988a');
    tip(g.selectAll('rect.chosen'),d=>`${label(data.fields.x)}: ${format(d.x0,locale,4)}–${format(d.x1,locale,4)} / n=${d.count}`);
    if(options.onSelection)g.append('g').attr('class','brush histogram-brush').call(d3.brushX().extent([[M.l,M.t],[W-M.r,H-M.b]]).on('end',event=>{if(event.sourceEvent&&event.selection)options.onSelection('histogram',{field:data.fields.x.id,op:'between',min:x.invert(event.selection[0]),max:x.invert(event.selection[1])});})).on('pointermove.tooltip',event=>{const [px]=d3.pointer(event,svg.node()),value=x.invert(px),b=data.histogram.find(b=>value>=b.x0&&value<=b.x1);showTip(event,b?`${label(data.fields.x)}: ${format(b.x0,locale,4)}–${format(b.x1,locale,4)} / n=${b.count} / ${ct('chart008')}=${b.selected}`:null);}).on('pointerleave.tooltip',()=>tooltip.hidden=true);
  }else if(type==='bar'){
    const bars=data.bars.filter(b=>b.value!==null).slice(0,15);if(!bars.length){empty();return svg.node();}
    const x=d3.scaleLinear().domain([Math.min(0,d3.min(bars,d=>d.value)),Math.max(1,d3.max(bars,d=>d.value))]).nice().range([160,W-M.r]),y=d3.scaleBand().domain(bars.map((_,i)=>i)).range([M.t,H-M.b]).padding(.3);
    g.append('g').attr('transform',`translate(0,${H-M.b})`).call(d3.axisBottom(x).ticks(5));
    const groups=g.selectAll('.bar-row').data(bars).join('g').attr('class','bar-row');
    groups.append('text').attr('x',149).attr('y',(_,i)=>y(i)+y.bandwidth()/2+4).attr('text-anchor','end').text(d=>String(d.key??(ct('chart007'))).slice(0,24));
    const rects=groups.append('rect').attr('x',d=>x(Math.min(0,d.value))).attr('y',(_,i)=>y(i)).attr('width',d=>Math.max(1,Math.abs(x(d.value)-x(0)))).attr('height',y.bandwidth()).attr('rx',3).attr('fill','#21988a');
    tip(rects,d=>`${d.key??'∅'}: ${format(d.value,locale,4)}${d.count===undefined?'':` / ${ct('chart008')}=${d.count}`}${d.sourceCount===undefined?'':` / ${ct('chart009')}=${d.sourceCount}`}`);
    if(options.onSelection)focus(rects,d=>options.onSelection('category',d.key===null?{field:data.fields.category.id,op:'isMissing'}:{field:data.fields.category.id,op:'eq',value:d.key}));
    svg.append('text').attr('x',W-M.r).attr('y',H-5).attr('text-anchor','end').text(`${ct('chart010')} · ${options.caption??`${data.aggregate??''}(${data.fields.metric?.name??(ct('chart011'))})`}`);
  }else if(type==='line'||type==='area'){
    const values=data.timeline.filter(d=>d.value!==null);if(!values.length){empty();return svg.node();}
    const x=d3.scaleUtc().domain(d3.extent(data.timeline,d=>new Date(d.date))).range([M.l,W-M.r]),y=d3.scaleLinear().domain([Math.min(0,d3.min(values,d=>d.value)),d3.max(values,d=>d.value)||1]).nice().range([H-M.b,M.t]);axes(x,y,label(data.fields.date),label(data.fields.metric));
    if(type==='area')g.append('path').datum(data.timeline).attr('d',d3.area().defined(d=>d.value!==null).x(d=>x(new Date(d.date))).y0(y(0)).y1(d=>y(d.value))).attr('fill','#e1f1eb');
    g.append('path').datum(data.timeline).attr('d',d3.line().defined(d=>d.value!==null).x(d=>x(new Date(d.date))).y(d=>y(d.value))).attr('fill','none').attr('stroke','#188a80').attr('stroke-width',2.5);
    const dots=g.selectAll('circle').data(values).join('circle').attr('cx',d=>x(new Date(d.date))).attr('cy',d=>y(d.value)).attr('r',3).attr('fill','#188a80');tip(dots,d=>`${d.date}: ${format(d.value,locale,3)} (${data.grain?(ct('chart012')):'n'}=${d.count})`);
    if(options.onSelection)g.append('g').attr('class','brush time-brush').call(d3.brushX().extent([[M.l,M.t],[W-M.r,H-M.b]]).on('end',event=>{if(event.sourceEvent&&event.selection)options.onSelection('time',{field:data.fields.date.id,op:'between',min:data.fields.date.type==='datetime'?x.invert(event.selection[0]).toISOString():x.invert(event.selection[0]).toISOString().slice(0,10),max:data.fields.date.type==='datetime'?x.invert(event.selection[1]).toISOString():x.invert(event.selection[1]).toISOString().slice(0,10)});})).on('pointermove.tooltip',event=>{const [px]=d3.pointer(event,svg.node()),nearest=values.reduce((best,d)=>!best||Math.abs(x(new Date(d.date))-px)<Math.abs(x(new Date(best.date))-px)?d:best,null);showTip(event,nearest?`${nearest.date}: ${label(data.fields.metric)}=${format(nearest.value,locale,4)} / n=${nearest.count}`:null);}).on('pointerleave.tooltip',()=>tooltip.hidden=true);
  }else if(type==='box'){
    const b=data.box;if(!b.n){empty();return svg.node();}const domain=b.min===b.max?[b.min-1,b.max+1]:[b.min,b.max];const x=d3.scaleLinear().domain(domain).nice().range([M.l,W-M.r]);const y=H/2;
    g.append('g').attr('transform',`translate(0,${H-M.b})`).call(d3.axisBottom(x).ticks(7));
    g.append('line').attr('x1',x(b.whiskerLow??b.min)).attr('x2',x(b.whiskerHigh??b.max)).attr('y1',y).attr('y2',y).attr('stroke','#819787');
    for(const value of [b.whiskerLow,b.whiskerHigh])if(value!==null)g.append('line').attr('x1',x(value)).attr('x2',x(value)).attr('y1',y-20).attr('y2',y+20).attr('stroke','#819787');
    g.append('rect').attr('x',x(b.q1)).attr('width',Math.max(2,x(b.q3)-x(b.q1))).attr('y',y-45).attr('height',90).attr('fill','#dff1eb').attr('stroke','#188a80');
    tip(g.selectAll('rect'),()=>`n=${b.n} · Q1=${format(b.q1,locale,4)} · median=${format(b.median,locale,4)} · Q3=${format(b.q3,locale,4)} · min=${format(b.min,locale,4)} · max=${format(b.max,locale,4)}`);
    g.append('line').attr('x1',x(b.median)).attr('x2',x(b.median)).attr('y1',y-45).attr('y2',y+45).attr('stroke','#0f766e').attr('stroke-width',3);
    for(const [label,value]of [[ct('chart013'),b.min],['Q1',b.q1],[ct('chart014'),b.median],['Q3',b.q3],[ct('chart015'),b.max]])svg.append('text').attr('x',x(value)).attr('y',y+70).attr('text-anchor','middle').text(`${label} ${format(value,locale)}`);
    const dots=g.selectAll('circle.outlier').data(b.outliers??[]).join('circle').attr('class','outlier').attr('cx',x).attr('cy',y).attr('r',4).attr('fill','#ce9770');tip(dots,d=>`${data.fields.x?.name}: ${format(d,locale,3)}`);if(options.onSelection)focus(dots,value=>options.onSelection('outlier',{op:'eq',field:data.fields.x.id,value}));svg.append('text').attr('x',M.l).attr('y',24).text(`n=${b.n} · 1.5 × IQR · ${ct('chart016')}=${b.outlierCount??0}`);
  }else if(type==='correlation'||type==='heatmap'){
    const corr=type==='correlation'||!data.pivotHeat.length,items=corr?data.matrix:data.pivotHeat;
    if(!items.length){empty();return svg.node();}const xs=[...new Set(items.map(d=>corr?d.x:d.label))],ys=[...new Set(items.map(d=>corr?d.y:String(d.key??'∅')))];
    const x=d3.scaleBand().domain(xs).range([140,W-M.r]).padding(.035),y=d3.scaleBand().domain(ys).range([M.t,H-70]).padding(.035);
    const color=corr?d3.scaleDiverging([-1,0,1],d3.interpolateBrBG):d3.scaleSequential(d3.extent(items.filter(d=>d.value!==null),d=>d.value),d3.interpolateGnBu);
    const domain=corr?[-1,1]:d3.extent(items.filter(d=>d.value!==null),d=>d.value);if(domain[0]!==undefined)legend(color,domain[0],domain[1],corr?'r':'');
    const rects=g.selectAll('rect.cell').data(items).join('rect').attr('class','cell').attr('x',d=>x(corr?d.x:d.label)).attr('y',d=>y(corr?d.y:String(d.key??'∅'))).attr('width',x.bandwidth()).attr('height',y.bandwidth()).attr('rx',2).attr('fill',d=>d.value===null?'#edf1f5':color(d.value));
    tip(rects,d=>`${corr?`${d.x} × ${d.y}`:`${d.key} × ${d.label}`}: ${format(d.value,locale,3)}${corr?` / n=${d.n}`:''}`);
    if(corr&&options.onPair)focus(rects,d=>options.onPair(d.x,d.y));
    if(!corr&&options.onSelection)focus(rects,d=>options.onSelection('pivot',{field:d.rowField,op:d.key===null?'isMissing':'eq',...(d.key===null?{}:{value:d.key})}));
    g.append('g').attr('transform',`translate(0,${H-70})`).call(d3.axisBottom(x).tickSize(0)).selectAll('text').attr('transform','rotate(-25)').attr('text-anchor','end');
    g.append('g').attr('transform','translate(134,0)').call(d3.axisLeft(y).tickSize(0));g.selectAll('.domain').remove();
  }else if(type==='missing'){
    const values=data.missingMatrix,cols=values.fields.slice(0,40),sample=values.rows;
    if(!cols.length||!sample.length){empty();return svg.node();}
    const x=d3.scaleBand().domain(d3.range(sample.length)).range([155,W-M.r]),y=d3.scaleBand().domain(cols.map(c=>c.id)).range([M.t,H-M.b]);
    const cells=cols.flatMap((c,j)=>sample.map((r,i)=>({c,i,missing:r[j]})));
    const rects=g.selectAll('rect').data(cells).join('rect').attr('x',d=>x(d.i)).attr('y',d=>y(d.c.id)).attr('width',Math.max(1,x.bandwidth()-.5)).attr('height',Math.max(1,y.bandwidth()-.5)).attr('fill',d=>d.missing?'#d28b4f':'#e3eee9');
    tip(rects,d=>`${d.c.name} · ${d.i+1}: ${d.missing?(ct('chart017')):(ct('chart018'))}`);
    if(options.onField)focus(rects,d=>options.onField(d.c.id));
    for(const c of cols)svg.append('text').attr('x',145).attr('y',y(c.id)+y.bandwidth()/2+4).attr('text-anchor','end').text(c.name.slice(0,22));
    svg.append('text').attr('x',155).attr('y',H-10).text(ct('chart019'));
  }else empty();
  return svg.node();
}
export async function exportChart(container,format,title,subtitle){
  const source=container.querySelector('svg');if(!source)throw new Error('NO_CHART');
  const clone=source.cloneNode(true),vb=clone.getAttribute('viewBox').split(' ').map(Number);clone.setAttribute('viewBox',`0 -55 ${vb[2]} ${vb[3]+75}`);clone.setAttribute('width',String(vb[2]));clone.setAttribute('height',String(vb[3]+75));
  for(const [text,y,size]of [[title,-30,18],[subtitle,-8,10]]){const el=document.createElementNS('http://www.w3.org/2000/svg','text');el.setAttribute('x','20');el.setAttribute('y',y);el.setAttribute('font-size',size);el.setAttribute('fill','#243a42');el.textContent=text;clone.append(el);}
  const bg=document.createElementNS('http://www.w3.org/2000/svg','rect');bg.setAttribute('x','0');bg.setAttribute('y','-55');bg.setAttribute('width',vb[2]);bg.setAttribute('height',vb[3]+75);bg.setAttribute('fill','#ffffff');clone.prepend(bg);
  clone.querySelectorAll('.brush').forEach(node=>node.remove());const xml=new XMLSerializer().serializeToString(clone);if(format==='svg')return new Blob([xml],{type:'image/svg+xml'});
  const url=URL.createObjectURL(new Blob([xml],{type:'image/svg+xml'}));try{const img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=vb[2]*2;canvas.height=(vb[3]+75)*2;const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img,0,0,canvas.width,canvas.height);return await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));}finally{URL.revokeObjectURL(url);}
}
