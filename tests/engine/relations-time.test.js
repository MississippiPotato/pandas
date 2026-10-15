import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTable, rows, visibleIds } from '../../src/core/dataset.js';
import { execute } from '../../src/core/operation-registry.js';
import { minutes } from '../../src/data/nba-adapter.js';
const table = (data,id) => createTable(data,{id});
test('joins expand duplicate matches, match null keys, and preserve all four how modes', () => {
  const left = table([{key:1,v:'a'},{key:1,v:'b'},{key:null,v:'n'},{key:3,v:'u'}],'left');
  const right = table([{key:1,v:'c'},{key:null,v:'n2'},{key:4,v:'r'}],'right');
  const run = how => execute([left,right],{type:'merge',params:{on:'key',how}});
  assert.equal(run('inner').table.index.length,3); assert.equal(run('left').table.index.length,4); assert.equal(run('right').table.index.length,4); assert.equal(run('outer').table.index.length,5);
  assert.deepEqual(rows(run('inner').table),[{key:1,v_x:'a',v_y:'c'},{key:1,v_x:'b',v_y:'c'},{key:null,v_x:'n',v_y:'n2'}]);
  assert.equal(new Set(visibleIds(run('outer').table)).size,5);
  assert.throws(()=>execute([left,right],{type:'merge',params:{on:'key',validate:'one_to_one'}}),e=>e.code==='JOIN_LEFT_DUPLICATE');
  assert.throws(()=>execute([left,right],{type:'merge',params:{on:'key',maxRows:2}}),e=>e.code==='JOIN_LIMIT');
});
test('composite joins use tuple keys and preflight blocks incompatible types/suffix names', () => {
  const l = table([{a:'x|y',b:'z',v:1},{a:'x',b:'y|z',v:2}],'l'), r = table([{a:'x',b:'y|z',v:3}],'r');
  assert.equal(execute([l,r],{type:'merge',params:{on:['a','b']}}).table.index.length,1);
  assert.throws(()=>execute([table([{k:1}],'l'),table([{k:'1'}],'r')],{type:'merge',params:{on:'k'}}),e=>e.code==='JOIN_KEY_TYPE');
  assert.throws(()=>execute([l,r],{type:'merge',params:{on:['a','b'],suffixes:['','']}}),e=>e.code==='JOIN_NAME_COLLISION');
});
test('concat aligns union/intersection columns without overlapping row IDs', () => {
  const a = table([{a:1,b:2}],'a'), b = table([{a:3,c:'x'}],'b');
  assert.deepEqual(rows(execute([a,b],{type:'concat',params:{join:'outer'}}).table),[{a:1,b:2,c:null},{a:3,b:null,c:'x'}]);
  assert.deepEqual(rows(execute([a,b],{type:'concat',params:{join:'inner'}}).table),[{a:1},{a:3}]);
  assert.equal(new Set(visibleIds(execute([a,a],{type:'concat',params:{}}).table)).size,2);
  assert.throws(()=>execute([a,b],{type:'concat',params:{axis:1}}),e=>e.code==='UNSUPPORTED_PARAMETER');
});
test('rolling sorts and partitions, counts valid observations and never crosses groups', () => {
  const t = table([{g:'B',d:'2025-01-02',x:100},{g:'A',d:'2025-01-02',x:null},{g:'A',d:'2025-01-01',x:10},{g:'A',d:'2025-01-03',x:30}],'t');
  const p = {by:['g'],order:'d',field:'x',window:2,minPeriods:1,as:'smooth'};
  assert.deepEqual(rows(execute(t,{type:'rolling',params:p}).table).map(r=>r.smooth),[10,10,30,100]);
  assert.deepEqual(rows(execute(t,{type:'rolling',params:{...p,minPeriods:2}}).table).map(r=>r.smooth),[null,null,null,null]);
});
test('UTC resample includes missing buckets, week starts Monday and leap-day grouping is valid', () => {
  const t = createTable([{d:'2024-02-28',x:2},{d:'2024-03-01',x:4}],{columns:[{name:'d',type:'date'},{name:'x',type:'number'}]});
  const base = {date:'d',field:'x',as:'total',fn:'sum'};
  assert.deepEqual(rows(execute(t,{type:'resample',params:{...base,rule:'D'}}).table),[{d:'2024-02-28',total:2},{d:'2024-02-29',total:0},{d:'2024-03-01',total:4}]);
  assert.deepEqual(rows(execute(t,{type:'resample',params:{...base,rule:'MS'}}).table),[{d:'2024-02-01',total:2},{d:'2024-03-01',total:4}]);
  assert.deepEqual(rows(execute(t,{type:'resample',params:{...base,rule:'W-MON'}}).table),[{d:'2024-02-26',total:6}]);
});
test('NBA minutes retain transparent carry semantics and reject other malformed values',()=>{
  assert.equal(minutes('32:60'),33); assert.equal(minutes('45:15'),45.25); assert.equal(minutes(''),null);
  assert.throws(()=>minutes('32:99'),e=>e.code==='NBA_MINUTES');
});
test('time parameters reject executable-looking functions even for an empty table',()=>{
  const t=createTable([],{columns:[{name:'d',type:'date'},{name:'x',type:'number'}]});
  assert.throws(()=>execute(t,{type:'resample',params:{date:'d',field:'x',rule:'D',as:'total',fn:'__import__("os")'}}),e=>e.code==='INVALID_AGG');
});
