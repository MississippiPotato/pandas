import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTable, rows, visibleIds, field } from '../../src/core/dataset.js';
import { execute } from '../../src/core/operation-registry.js';
import { aggregate, quantile, profile, correlation } from '../../src/core/statistics.js';
import { sales, schema, groupSpec, predicateSpec } from '../fixtures/cases.js';
const table = () => createTable(sales, { id:'sales', columns:schema });
const run = (t, type, params) => execute(t, { type, params }).table;
test('describe uses sample std, linear quantiles and excludes null but includes zero', () => {
  const p = profile(table()).columns[1]; assert.equal(p.count,4); assert.equal(p.mean,17.5); assert.equal(p.q1,7.5); assert.equal(p.median,15); assert.equal(p.q3,25);
  assert.ok(Math.abs(p.std - Math.sqrt(875/3)) < 1e-12);
  assert.equal(aggregate([null], 'sum'),0); assert.equal(aggregate([null], 'sum',{ minCount:1 }),null);
  assert.equal(aggregate([4], 'std'),null); assert.equal(quantile([], .5),null);
});
test('compound filter, negation and ranges retain identity, never mutate sources', () => {
  const t = table(), before = JSON.stringify(rows(t));
  const out = execute(t, predicateSpec).table; assert.deepEqual(rows(out).map(r => r.Revenue),[10,20]);
  assert.deepEqual(visibleIds(out), ['sales:1','sales:2']); assert.equal(JSON.stringify(rows(t)), before);
  const neg = run(t,'filter',{ predicate:{op:'not',arg:{field:'Revenue',op:'gte',value:20}} }); assert.equal(neg.index.length,3);
  assert.throws(()=>run(t,'filter',{predicate:{field:'Revenue',op:'gte',value:'2'}}),e=>e.code==='PREDICATE_TYPE');
});
test('sort is stable with null last in both directions', () => {
  const t = createTable([{ x:1,n:'a' },{x:null,n:'z'},{x:1,n:'b'},{x:2,n:'c'}]);
  assert.deepEqual(rows(run(t,'sort',{by:['x'],ascending:false})).map(r=>r.n),['c','a','b','z']);
});
test('groupby retains missing groups and distinguishes count from size', () => {
  assert.deepEqual(rows(execute(table(),groupSpec).table), [
    {Region:'A',average:5,valid:2,size:2}, {Region:'B',average:20,valid:1,size:2}, {Region:null,average:40,valid:1,size:1}
  ]);
});
test('fillna mean promotes integer when needed, mode ties require a deliberate value', () => {
  const t = createTable([{ x:1 },{x:2},{x:null}],{columns:[{name:'x',type:'integer'}]});
  const out = run(t,'fillna',{field:'x',method:'mean'}); assert.equal(rows(out)[2].x,1.5); assert.equal(out.columns[0].type,'number');
  assert.throws(()=>run(t,'fillna',{field:'x',method:'mode'}),e=>e.code==='CHOOSE_MODE');
  assert.equal(rows(run(t,'fillna',{field:'x',method:'mode',value:2}))[2].x,2);
  assert.throws(()=>run(createTable([{x:null}]),'fillna',{field:'x',method:'mean'}),e=>e.code==='NO_FILL_VALUE');
});
test('dropna any/all and dedup keep first/last/false treat 0 as a value', () => {
  const t = createTable([{x:0,y:null},{x:null,y:null},{x:0,y:null}]);
  assert.equal(run(t,'dropna',{how:'all'}).index.length,2); assert.equal(run(t,'dropna',{how:'any'}).index.length,0);
  assert.deepEqual(visibleIds(run(t,'dedup',{keep:'first'})),['table:0','table:1']);
  assert.deepEqual(visibleIds(run(t,'dedup',{keep:'last'})),['table:1','table:2']);
  assert.deepEqual(visibleIds(run(t,'dedup',{keep:false})),['table:1']);
});
test('rename preserves stable field ID; select and coerce cast validate fields', () => {
  const t = table(), id = field(t,'Revenue').id, out = run(t,'rename',{field:id,name:'营业额'});
  assert.equal(field(out,'营业额').id,id); assert.equal(field(t,'Revenue').name,'Revenue');
  assert.equal(run(out,'select',{fields:[id]}).columns.length,1);
  assert.throws(()=>run(out,'select',{fields:['no such field']}),e=>e.code==='FIELD_NOT_FOUND');
  const cast = execute(createTable([{x:'1'},{x:'1.2'}]),{type:'cast',params:{field:'x',type:'integer',errors:'coerce'}});
  assert.deepEqual(rows(cast.table),[{x:1},{x:null}]); assert.deepEqual(cast.report.invalidRows,[1]);
});
test('pivot is real aggregation with reversible column metadata and explicit duplicate rejection', () => {
  const t = createTable([{region:'A',month:'Jan',v:2},{region:'A',month:'Jan',v:4},{region:'B',month:'Feb',v:10}]);
  const p = { index:'region',columns:'month',value:'v',agg:'mean' };
  const out = run(t,'pivot_table',p);
  assert.deepEqual(rows(out),[{region:'A','pivot_["Jan"]':3,'pivot_["Feb"]':null},{region:'B','pivot_["Jan"]':null,'pivot_["Feb"]':10}]);
  assert.deepEqual(out.columns[1].pivotValues,['Jan']);
  assert.throws(()=>run(t,'pivot',{index:'region',columns:'month',value:'v'}),e=>e.code==='PIVOT_DUPLICATE');
  assert.throws(()=>run(t,'pivot_table',{...p,maxCells:1}),e=>e.code==='PIVOT_LIMIT');
});
test('safe expression AST handles divide-zero, false conditions and rejects executable content', () => {
  const ratio = {type:'binary',op:'/',left:{type:'field',field:'Revenue'},right:{type:'field',field:'Units'}};
  const out = run(table(),'derive',{name:'ratio',expression:ratio}); assert.deepEqual(rows(out).map(r=>r.ratio),[null,5,5,null,5]);
  assert.throws(()=>run(table(),'derive',{name:'hack',expression:{type:'call',fn:'eval',args:[]}}),e=>e.code==='INVALID_EXPRESSION');
});
test('Pearson uses pairwise sample n, null for constants and missing-only pairs', () => {
  const t = createTable([{x:1,y:2,z:1},{x:2,y:4,z:1},{x:3,y:null,z:1}]);
  const out = correlation(t,['x','y','z']); assert.deepEqual(out.find(c=>c.x==='x'&&c.y==='y'),{x:'x',y:'y',n:2,value:1});
  assert.equal(out.find(c=>c.x==='z'&&c.y==='z').value,null);
});
test('unsupported params and operation versions never silently execute', () => {
  assert.throws(()=>execute(table(),{type:'sort',params:{by:['Revenue'],inplace:true}}),e=>e.code==='UNSUPPORTED_PARAMETER');
  assert.throws(()=>execute(table(),{type:'filter',version:9}),e=>e.code==='OPERATION_VERSION');
});
