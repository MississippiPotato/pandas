import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable,rows} from '../../src/core/dataset.js';
import {execute} from '../../src/core/operation-registry.js';
import {parseFormula} from '../../src/core/formula.js';
import {chartQuery,analysisResult} from '../../src/core/analytics.js';
const table=createTable([{g:'a',x:0,y:10,d:'2025-01-01'},{g:'a',x:10,y:20,d:'2025-01-03'},{g:'b',x:10,y:30,d:'2025-02-01'},{g:null,x:30,y:null,d:null},{g:'a',x:null,y:40,d:'2025-02-04'}],{columns:[{name:'g',type:'string'},{name:'x',type:'number'},{name:'y',type:'number'},{name:'d',type:'date'}]});
const op=(type,params,t=table)=>execute(t,{type,params}).table;
test('cut uses explicit endpoint closure and qcut handles repeated quantiles deliberately',()=>{
  assert.deepEqual(rows(op('cut',{field:'x',edges:[0,10,30],includeLowest:true,as:'bin'})).map(r=>r.bin),['[0, 10]','[0, 10]','[0, 10]','(10, 30]',null]);
  assert.deepEqual(rows(op('cut',{field:'x',edges:[0,10,30],right:false,as:'bin'})).map(r=>r.bin),['[0, 10)','[10, 30)','[10, 30)',null,null]);
  assert.throws(()=>op('qcut',{field:'x',q:6,as:'q'}),/DUPLICATE_EDGES/);
  const q=op('qcut',{field:'x',q:6,duplicates:'drop',as:'q'});assert.equal(q.columns.at(-1).binEdges.length,5);assert.equal(rows(q).at(-1).q,null);
});
test('rank ties, null groups and cumulative ordering retain source row identity',()=>{
  assert.deepEqual(rows(op('rank',{field:'x',method:'average',as:'r'})).map(r=>r.r),[1,2.5,2.5,4,null]);
  assert.deepEqual(rows(op('rank',{field:'x',by:['g'],method:'dense',pct:true,as:'r'})).map(r=>r.r),[.5,1,1,1,null]);
  assert.deepEqual(rows(op('cumsum',{field:'x',by:['g'],as:'total'})).map(r=>r.total),[0,10,10,30,null]);
  assert.deepEqual(rows(op('transform',{field:'x',by:['g'],fn:'mean',as:'m'})).map(r=>r.m),[5,5,10,30,5]);
});
test('melt repeats ID fields in column-major order and date parts use UTC boundaries',()=>{
  const melted=op('melt',{ids:['g'],values:['x','y'],variable:'metric',value:'value'});assert.equal(melted.index.length,10);assert.equal(new Set(melted.rowIds).size,10);assert.deepEqual(rows(melted).slice(0,2),[{g:'a',metric:'x',value:0},{g:'a',metric:'x',value:10}]);
  assert.deepEqual(rows(op('date_part',{field:'d',part:'month',as:'month'})).map(r=>r.month),['2025-01-01','2025-01-01','2025-02-01',null,'2025-02-01']);
});
test('formula parser handles quoted names, zero division and prohibits code execution',()=>{
  const formula=parseFormula('if([x] >= 10, [y] / [x], coalesce([x], 7))');assert.deepEqual(rows(op('derive',{name:'value',expression:formula})).map(r=>r.value),[0,2,3,null,7]);
  for(const bad of ['globalThis.alert(1)','(()=>1)()','[x]; fetch("https://example.com")','new Date()'])assert.throws(()=>parseFormula(bad));
});
test('chart selection recomputes full statistics and counts while sample only changes rendered points',()=>{
  const data=createTable(Array.from({length:10001},(_,i)=>({x:i,y:i===10000?610:i%100,g:i%2?'odd':'even',made:i%2===0})),{columns:[{name:'x',type:'number'},{name:'y',type:'number'},{name:'g',type:'string'},{name:'made',type:'boolean'}]});
  const query=chartQuery(data,{x:'x',y:'y',category:'g',metric:'x',correlation:true},{op:'between',field:'x',min:10,max:29});
  assert.equal(query.selectedRows,20);assert.equal(query.totalRows,10001);assert.ok(query.points.length<=5000);assert.equal(query.pointSample,true);assert.equal(query.extentY[1],610);assert.equal(query.histogram.reduce((n,b)=>n+b.selected,0),20);assert.equal(query.shots.attempts,20);assert.equal(query.shots.made,10);assert.equal(query.box.median,19.5);assert.equal(query.matrix.find(c=>c.x==='x'&&c.y==='y').n,20);
  assert.equal(analysisResult(data,'frequencies',['g']).reduce((n,v)=>n+v.count,0),10001);
});
test('empty selection keeps context domains and returns null percentages',()=>{const q=chartQuery(table,{x:'x',y:'y',category:'g'},{op:'gt',field:'x',value:100});assert.equal(q.selectedRows,0);assert.equal(q.box.median,null);assert.equal(q.histogram.reduce((n,b)=>n+b.count,0),4);assert.equal(q.histogram.reduce((n,b)=>n+b.selected,0),0);});
