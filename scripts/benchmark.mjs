import os from 'node:os';
import { mkdir, writeFile } from 'node:fs/promises';
import { createTable } from '../src/core/dataset.js';
import { execute } from '../src/core/operation-registry.js';
const data=Array.from({length:100000},(_,i)=>Object.fromEntries([['group',`G${i%100}`],...Array.from({length:19},(_,j)=>[`m${j}`,(i*(j+1))%997]) ]));
const table=createTable(data,{id:'performance'});
const specs=[{type:'filter',params:{predicate:{field:'m0',op:'gte',value:500}}}, {type:'group',params:{keys:['group'],metrics:[{field:'m0',fn:'mean',as:'average'}]}}];
const results=[];
for(const spec of specs){const times=[];let output;
  for(let run=0;run<6;run++){const start=performance.now();output=execute(table,spec);times.push(performance.now()-start);}
  const warm=times.slice(1).sort((a,b)=>a-b),p95=warm.at(-1);
  results.push({operation:spec.type,coldMs:times[0],warmMs:times.slice(1),p95Ms:p95,outputRows:output.table.index.length,targetMs:spec.type==='filter'?500:1000,withinTarget:p95<=(spec.type==='filter'?500:1000)});
}
const report={scope:'Node execution including operation report and code generation, not browser interaction latency',node:process.version,cpu:os.cpus()[0].model,rows:100000,columns:20,results};
await mkdir(new URL('../output/phase1/',import.meta.url),{recursive:true});await writeFile(new URL('../output/phase1/benchmark.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
