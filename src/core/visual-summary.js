import {bin,extent} from 'd3';
import {columnValues,rows,visibleIds} from './dataset.js';
import {profile} from './statistics.js';
import {isNumericColumn} from '../data/semantics.js';
// Tables are immutable. Weak keys keep cached profiles scoped to their lifetime.
const cache=new WeakMap();
export function visualSummary(table){
  if(cache.has(table))return cache.get(table);
  const p=profile(table);
  const result=p.columns.map(c=>{
    if(!isNumericColumn(c))return c;
    const vals=columnValues(table,c.id).filter(v=>v!==null),domain=extent(vals);
    if(domain[0]===undefined)return {...c,bins:[]};
    if(domain[0]===domain[1]){domain[0]-=.5;domain[1]+=.5;}
    return {...c,domain,bins:bin().domain(domain).thresholds(12)(vals).map(b=>({x0:b.x0,x1:b.x1,count:b.length}))};
  });
  cache.set(table,result);return result;
}
export function visualDiff(before,after,spec,limit=12){
  const bids=visibleIds(before),aids=visibleIds(after),afterSet=new Set(aids),beforeIndex=new Map(bids.map((id,i)=>[id,i]));
  const structural=['group','pivot','pivot_table','merge','concat','melt','resample'].includes(spec.type);
  const read=(t,i)=>Object.fromEntries(t.columns.map(c=>[c.name,t.values[c.id][t.index[i]]??null]));
  const changed=[];
  if(!structural){
    for(let i=0;i<aids.length&&changed.length<limit;i++){
      const j=beforeIndex.get(aids[i]);if(j===undefined)continue;
      const cells=after.columns.flatMap(c=>{const old=before.columns.find(b=>b.id===c.id),a=after.values[c.id][after.index[i]],b=old?before.values[old.id][before.index[j]]:null;return !old||old.name!==c.name||a!==b?[{field:c.name,before:b,after:a,added:!old,renamed:old&&old.name!==c.name,oldName:old?.name}]:[];});
      if(cells.length)changed.push({rowId:aids[i],record:read(after,i),cells});
    }
  }
  const removed=[];for(let i=0;i<bids.length&&removed.length<limit;i++)if(!afterSet.has(bids[i]))removed.push({rowId:bids[i],record:read(before,i)});
  return {structural,inputColumns:before.columns,outputColumns:after.columns,input:rows(before,0,limit),output:rows(after,0,limit),removed:structural?[]:removed,changed,
    keys:[spec.params?.keys??spec.params?.index??spec.params?.leftOn??spec.params?.ids??[]].flat().map(k=>before.columns.find(c=>c.id===k||c.name===k)?.name??k),limit,inputRows:before.index.length,outputRows:after.index.length};
}
