import {bin as d3bin,extent} from 'd3';
import {field,columnValues,rows,visibleIds,keyOf} from './dataset.js';
import {aggregate,quantile,correlation,valueCounts} from './statistics.js';
import {filter} from './operations/cleaning.js';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const find=(table,ref,fallback)=>table.columns.find(c=>c.id===ref||c.name===ref)??fallback;
export function chartQuery(base,config={},selection=null){
  const selected=selection?filter(base,{predicate:selection}):base;
  const nums=base.columns.filter(c=>['number','integer'].includes(c.type)),cats=base.columns.filter(c=>!['number','integer','date','datetime'].includes(c.type));
  const x=find(base,config.x,nums[0]),y=find(base,config.y,nums[1]??nums[0]),category=find(base,config.category,cats.find(c=>['team_abbr','team_name','Region'].includes(c.name))??cats[0]);
  const date=find(base,config.date,base.columns.find(c=>['date','datetime'].includes(c.type))),metric=find(base,config.metric,y??x);
  const read=(table,c)=>c?table.index.map(i=>table.values[c.id][i]):[];
  const xbase=read(base,x),xsel=read(selected,x),ybase=read(base,y),selectedIds=new Set(visibleIds(selected)),ids=visibleIds(base),color=read(base,category);
  const labels=find(base,'player_name',category),labelValues=read(base,labels),madeCol=find(base,'made'),madeValues=read(base,madeCol);
  const step=Math.max(1,Math.ceil(base.index.length/5000)),points=[];
  if(x&&y)for(let i=0;i<base.index.length;i+=step)if(finite(xbase[i])&&finite(ybase[i]))points.push({x:xbase[i],y:ybase[i],color:color[i]??null,label:labelValues[i]??null,rowId:ids[i],selected:selectedIds.has(ids[i]),made:madeValues[i]??null});
  if(x&&y&&step>1){const shown=new Set(points.map(p=>p.rowId)),xd=extent(xbase.filter(finite)),yd=extent(ybase.filter(finite));for(let i=0;i<base.index.length;i++){const important=xbase[i]===xd[0]||xbase[i]===xd[1]||ybase[i]===yd[0]||ybase[i]===yd[1]||(x.name==='x_legacy'&&y.name==='y_legacy'&&ybase[i]>417.5);if(important&&!shown.has(ids[i])&&finite(xbase[i])&&finite(ybase[i])&&points.length<5000){points.push({x:xbase[i],y:ybase[i],color:color[i]??null,label:labelValues[i]??null,rowId:ids[i],selected:selectedIds.has(ids[i]),made:madeValues[i]??null});shown.add(ids[i]);}}}
  let histogram=[];
  const domain=extent(xbase.filter(finite));
  if(x&&domain[0]!==undefined){if(domain[0]===domain[1]){domain[0]-=.5;domain[1]+=.5;}const bins=d3bin().domain(domain).thresholds(Math.max(4,Math.min(60,config.bins??20)));
    const all=bins(xbase.filter(finite)),chosen=bins(xsel.filter(finite));histogram=all.map((b,i)=>({x0:b.x0,x1:b.x1,count:b.length,selected:chosen[i].length}));}
  const bars=[];
  if(category){const cvals=read(selected,category),mvals=read(selected,metric),buckets=new Map();cvals.forEach((v,i)=>{const key=keyOf([v]);if(!buckets.has(key))buckets.set(key,{key:v,values:[],count:0});const b=buckets.get(key);b.count++;if(metric)b.values.push(mvals[i]);});
    for(const b of buckets.values())bars.push({key:b.key,count:b.count,value:metric?aggregate(b.values,config.aggregate??'mean'):b.count});bars.sort((a,b)=>(b.value??-Infinity)-(a.value??-Infinity));}
  const boxValues=xsel.filter(finite),q1=quantile(boxValues,.25),q3=quantile(boxValues,.75),iqr=q1===null?null:q3-q1;
  const box={min:quantile(boxValues,0),q1,median:quantile(boxValues,.5),q3,max:quantile(boxValues,1),low:q1===null?null:q1-1.5*iqr,high:q3===null?null:q3+1.5*iqr,n:boxValues.length};
  const inliers=boxValues.filter(v=>v>=box.low&&v<=box.high),whiskers=extent(inliers);box.whiskerLow=whiskers[0]??null;box.whiskerHigh=whiskers[1]??null;const outliers=boxValues.filter(v=>v<box.low||v>box.high);box.outlierCount=outliers.length;box.outliers=[...new Set(outliers)].slice(0,200);
  const timeline=[];
  if(date&&metric){const dvals=read(selected,date),mvals=read(selected,metric),buckets=new Map();dvals.forEach((d,i)=>{if(d===null)return;const day=d.slice(0,10);if(!buckets.has(day))buckets.set(day,[]);buckets.get(day).push(mvals[i]);});for(const [day,values]of buckets)timeline.push({date:day,value:aggregate(values,config.aggregate??'mean'),count:values.length});timeline.sort((a,b)=>a.date.localeCompare(b.date));}
  const missingMatrix={fields:base.columns.map(c=>({id:c.id,name:c.name})),rows:selected.index.slice(0,80).map(i=>base.columns.map(c=>base.values[c.id][i]===null))};
  const requestedCorr=(config.corrFields??nums.slice(0,8).map(c=>c.id)).filter(ref=>nums.some(c=>c.id===ref||c.name===ref)).slice(0,12);
  const matrix=config.correlation?correlation(selected,requestedCorr):[];
  let pivotHeat=[];
  if(base.lineage.kind==='pivot'){const keys=base.lineage.index??[],dimension=keys[0];const names=base.columns.filter(c=>c.pivotValues);if(dimension)pivotHeat=rows(selected).flatMap((r,i)=>names.map(c=>({row:i,rowField:dimension,key:r[field(base,dimension).name],column:c.name,label:c.pivotValues.join(' / '),value:r[c.name]})));}
  const attempts=madeCol?read(selected,madeCol).filter(v=>typeof v==='boolean'):[];
  const regions=[];if(madeCol&&x?.name==='x_legacy'&&y?.name==='y_legacy'){const xs=read(selected,x),ys=read(selected,y),ms=read(selected,madeCol),groups=new Map();xs.forEach((v,i)=>{if(!finite(v)||!finite(ys[i]))return;const x0=Math.floor(v/50)*50,y0=Math.floor(ys[i]/50)*50,key=keyOf([x0,y0]);if(!groups.has(key))groups.set(key,{x0,x1:x0+50,y0,y1:y0+50,count:0,made:0});const g=groups.get(key);g.count++;g.made+=ms[i]===true?1:0;});for(const g of groups.values())regions.push({...g,pct:g.count?g.made/g.count:null});}
  return {version:base.version,selectedRows:selected.index.length,totalRows:base.index.length,fields:{x,y,category,date,metric},points,pointSample:step>1,
    histogram,domain,extentY:extent(ybase.filter(finite)),bars:bars.slice(0,30),barTotal:bars.length,box,timeline,missingMatrix,matrix,pivotHeat,
    regions,shots:madeCol?{attempts:attempts.length,made:attempts.filter(Boolean).length,pct:attempts.length?attempts.filter(Boolean).length/attempts.length:null}:null};
}
export function analysisResult(table,kind,fields){
  if(kind==='correlation')return correlation(table,fields);
  if(kind==='frequencies')return valueCounts(columnValues(table,fields[0]));
  return rows(table);
}
