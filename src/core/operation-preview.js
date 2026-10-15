import {chartQuery} from './analytics.js';
import {profile} from './statistics.js';
import {rows, field, visibleIds, keyOf} from './dataset.js';

// Read-only payload shared by the Worker and semantic tests. Counts use full tables.
export function operationPreview(inputs, spec, result) {
  const before=inputs[0], after=result.table, p=spec.params??{};
  const beforeProfile=profile(before), afterProfile=profile(after);
  const focus=before.columns.find(c=>c.id===p.field||c.name===p.field)??before.columns.find(c=>['integer','number'].includes(c.type));
  const afterFocus=after.columns.find(c=>c.id===focus?.id);
  const extentValues=focus&&afterFocus?[...before.index.map(i=>before.values[focus.id][i]),...after.index.map(i=>after.values[afterFocus.id][i])].filter(v=>typeof v==='number'&&Number.isFinite(v)):[];
  const histogramDomain=extentValues.length?extentValues.reduce(([lo,hi],v)=>[Math.min(lo,v),Math.max(hi,v)],[Infinity,-Infinity]):undefined;
  const config={x:focus?.id,category:p.keys?.[0],metric:p.metrics?.[0]?.as,aggregate:'sum',histogramDomain};
  const missing=beforeProfile.columns.map(c=>{const a=afterProfile.columns.find(a=>a.id===c.id);return {id:c.id,name:c.name,before:c.missing,after:a?.missing??null,beforeRows:before.index.length,afterRows:after.index.length};});
  const output={report:result.report,pandas:result.pandas,rows:after.index.length,columns:after.columns,records:rows(after,0,8),profile:afterProfile,
    charts:chartQuery(after,config),beforeCharts:chartQuery(before,config),missing,focus:focus?.name,
    inputs:inputs.map(t=>({id:t.id,fileName:t.provenance?.fileName??t.id,rows:t.index.length,columns:t.columns})),spec};
  if(spec.type==='group') {
    const records=rows(after), ids=visibleIds(after), keys=p.keys.map(k=>field(before,k)), metric=p.metrics[0];
    output.groups={keys:keys.map(k=>k.name),metrics:p.metrics.map(m=>({...m,fieldName:field(before,m.field).name})),inputRows:before.index.length,includedRows:after.grain.includedRows,
      count:records.length,items:records.slice(0,30).map((r,i)=>({key:keys.map(k=>r[k.name]).map(v=>v??'∅').join(' / '),count:1,sourceCount:after.grain.samples[ids[i]],value:r[metric.as],metrics:Object.fromEntries(p.metrics.map(m=>[m.as,r[m.as]]))}))};
  }
  if(spec.type==='rolling') {
    const keys=(p.by??[]).map(k=>field(after,k)), order=field(after,p.order), metric=field(after,p.field), groups=new Map();
    for(const row of rows(after)){const key=keyOf(keys.map(k=>row[k.name]));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
    const entries=[...groups];
    output.rolling={order:order.name,orderType:order.type,field:metric.name,as:p.as,by:keys.map(k=>k.name),window:p.window,minPeriods:p.minPeriods??p.window,fn:p.fn??'mean',groups:entries.length,totalRows:after.index.length,
      series:entries.slice(0,3).map(([key,rs])=>({key:JSON.parse(key),totalRows:rs.length,points:rs.slice(0,200).map((r,i)=>({index:i,order:r[order.name],original:r[metric.name],value:r[p.as]}))}))};
  }
  return output;
}
