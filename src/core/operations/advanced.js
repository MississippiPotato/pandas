import {ensure,unsupported} from '../errors.js';
import {field,rows,replace,columnValues,keyOf,resultTable,visibleIds} from '../dataset.js';
import {aggregate,quantile} from '../statistics.js';
import {bucketStart} from './time.js';
function output(table,p,type){ensure(typeof p.as==='string'&&p.as.trim()&&!table.columns.some(c=>c.name===p.as),'INVALID_NAME');return [...table.columns,{id:`${table.id}:${p.as}`,name:p.as,type}];}
export function bin(table,p,quantiles=false){
  unsupported(p,quantiles?['field','q','duplicates','as']:['field','edges','right','includeLowest','as']);
  const c=field(table,p.field);ensure(['number','integer'].includes(c.type),'NUMERIC_REQUIRED');
  let edges=p.edges;
  if(quantiles){ensure(Number.isInteger(p.q)&&p.q>=1&&p.q<=100,'INVALID_BINS');edges=Array.from({length:p.q+1},(_,i)=>quantile(columnValues(table,c.id),i/p.q));
    ensure(!edges.includes(null),'NO_BIN_VALUES');
    if(p.duplicates==='drop')edges=[...new Set(edges)];else ensure(new Set(edges).size===edges.length,'DUPLICATE_EDGES');
  }
  ensure(Array.isArray(edges)&&edges.length>=(quantiles?1:2)&&edges.every(Number.isFinite)&&edges.every((v,i)=>!i||v>edges[i-1]),'INVALID_BINS');
  const right=quantiles?true:p.right??true,includeLowest=quantiles?true:p.includeLowest??false;
  const labels=edges.slice(1).map((hi,i)=>`${right&&!(includeLowest&&i===0)?'(':'['}${edges[i]}, ${hi}${right?']':')'}`);
  const records=rows(table).map(r=>{const value=r[c.name];let index=-1;
    if(value!==null)index=edges.slice(1).findIndex((hi,i)=>right?(value>edges[i]||(includeLowest&&i===0&&value===edges[0]))&&value<=hi:value>=edges[i]&&value<hi);
    return {...r,[p.as]:index<0?null:labels[index]};});
  const columns=output(table,p,'category');columns[columns.length-1]={...columns.at(-1),binEdges:edges,binLabels:labels};
  return {table:replace(table,records,columns),report:{edges,labels,right,includeLowest}};
}
export function rank(table,p){
  unsupported(p,['field','by','as','method','ascending','pct']);const c=field(table,p.field),keys=(p.by??[]).map(k=>field(table,k));
  ensure(['number','integer'].includes(c.type),'NUMERIC_REQUIRED');ensure(['average','min','max','first','dense'].includes(p.method??'average'),'RANK_METHOD');
  const data=rows(table),groups=new Map(),ranks=Array(data.length).fill(null);
  data.forEach((r,i)=>{const key=keyOf(keys.map(k=>r[k.name]));if(!groups.has(key))groups.set(key,[]);if(r[c.name]!==null)groups.get(key).push(i);});
  for(const indices of groups.values()){
    indices.sort((a,b)=>(data[a][c.name]-data[b][c.name])*(p.ascending===false?-1:1)||a-b);let dense=0;
    const distinct=new Set(indices.map(i=>data[i][c.name])).size;
    for(let start=0;start<indices.length;){let end=start+1;while(end<indices.length&&data[indices[end]][c.name]===data[indices[start]][c.name])end++;dense++;
      for(let j=start;j<end;j++){const value=p.method==='min'?start+1:p.method==='max'?end:p.method==='dense'?dense:p.method==='first'?j+1:(start+1+end)/2;ranks[indices[j]]=p.pct?value/(p.method==='dense'?distinct:indices.length):value;}start=end;}
  }
  return replace(table,data.map((r,i)=>({...r,[p.as]:ranks[i]})),output(table,p,'number'));
}
export function cumulative(table,p){
  unsupported(p,['field','by','as']);const c=field(table,p.field),keys=(p.by??[]).map(k=>field(table,k));ensure(['number','integer'].includes(c.type),'NUMERIC_REQUIRED');const sums=new Map();
  return replace(table,rows(table).map(r=>{const key=keyOf(keys.map(k=>r[k.name]));if(r[c.name]===null)return {...r,[p.as]:null};const value=(sums.get(key)??0)+r[c.name];sums.set(key,value);return {...r,[p.as]:value};}),output(table,p,'number'));
}
export function transform(table,p){
  unsupported(p,['field','by','fn','as']);const c=field(table,p.field),keys=p.by.map(k=>field(table,k));ensure(['sum','mean','count'].includes(p.fn),'INVALID_AGG');const data=rows(table),groups=new Map();
  data.forEach(r=>{const key=keyOf(keys.map(k=>r[k.name]));if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r[c.name]);});
  const values=new Map([...groups].map(([k,v])=>[k,aggregate(v,p.fn)]));
  return replace(table,data.map(r=>({...r,[p.as]:values.get(keyOf(keys.map(k=>r[k.name])))})),output(table,p,'number'));
}
export function melt(table,p){
  unsupported(p,['ids','values','variable','value']);const ids=p.ids.map(c=>field(table,c)),values=p.values.map(c=>field(table,c));
  ensure(values.length&&new Set([...ids,...values].map(c=>c.id)).size===ids.length+values.length,'MELT_FIELDS');
  const types=[...new Set(values.map(c=>c.type))];ensure(types.length===1||types.every(t=>['number','integer'].includes(t)),'CONCAT_TYPE');
  ensure(p.variable&&p.value&&p.variable!==p.value&&!ids.some(c=>[p.variable,p.value].includes(c.name)),'INVALID_NAME');
  ensure(table.index.length*values.length<=100000,'MELT_LIMIT');const data=rows(table),rowIDs=visibleIds(table);
  return resultTable(table,values.flatMap(c=>data.map(r=>Object.fromEntries([...ids.map(k=>[k.name,r[k.name]]),[p.variable,c.name],[p.value,r[c.name]]]))),
    [...ids,{id:`${table.id}:variable`,name:p.variable,type:'string'},{id:`${table.id}:value`,name:p.value,type:types.length===1?types[0]:'number'}],'melt',values.flatMap(c=>rowIDs.map(id=>keyOf([id,c.id]))));
}
export function datePart(table,p){
  unsupported(p,['field','part','as']);const c=field(table,p.field);ensure(['date','datetime'].includes(c.type),'DATE_REQUIRED');ensure(['year','month','week'].includes(p.part),'DATE_PART');
  return replace(table,rows(table).map(r=>{const value=r[c.name];return {...r,[p.as]:value===null?null:p.part==='year'?new Date(value).getUTCFullYear():bucketStart(value,p.part==='month'?'MS':'W-MON')};}),output(table,p,p.part==='year'?'integer':'date'));
}
