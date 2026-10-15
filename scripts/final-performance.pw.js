async(page)=>{
 const result=await page.evaluate(async()=>{
   const {WorkerClient}=await import('/src/services/worker-client.js');
   const client=new WorkerClient(),count=100000,header=['ID','Group',...Array.from({length:18},(_,i)=>`n${i}`)];
   const text=[header.join(','),...Array.from({length:count},(_,i)=>[String(i).padStart(6,'0'),`g${i%100}`,...Array.from({length:18},(_,j)=>(i*(j+1))%1000)].join(','))].join('\n');
   let ticks=0;const timer=setInterval(()=>ticks++,20),measure=async(action,payload)=>{const start=performance.now(),value=await client.call(action,payload);return {ms:Math.round(performance.now()-start),rows:value.rows,columns:value.columns.length};};
   try{const imported=await measure('import',{text,options:{format:'csv',fileName:'SYNTHETIC-BENCHMARK-100k.csv'}}),filtered=await measure('commit',{spec:{type:'filter',params:{predicate:{op:'gte',field:'n0',value:500}}}}),grouped=await measure('commit',{spec:{type:'group',params:{keys:['Group'],metrics:[{field:'n1',fn:'mean',as:'mean'},{field:'n1',fn:'size',as:'N'}]}}});
     const exported=await client.call('analysisExport',{kind:'rows'});if(imported.rows!==100000||filtered.rows!==50000||exported.reduce((n,r)=>n+r.N,0)!==50000)throw new Error('benchmark row-count mismatch');
     return {type:'synthetic browser Worker + message-transfer benchmark; not an NBA dataset or an SLA',rows:count,columns:20,imported,filtered,grouped,mainThreadTicks:ticks,passed:ticks>5};
   }finally{clearInterval(timer);client.worker.terminate();}
 });return result;
}
