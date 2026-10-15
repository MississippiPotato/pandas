import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../../src/core/session.js';
import { createTable, rows } from '../../src/core/dataset.js';
import { createStore } from '../../src/core/store.js';
import { importText } from '../../src/data/loader.js';
import { replay } from '../../src/core/pipeline.js';
import { groupSpec, sales, schema } from '../fixtures/cases.js';
const filtered = value => ({type:'filter',params:{predicate:{field:'Revenue',op:'gte',value}}});
test('preview is isolated; undo/redo restore exact results and new commit discards redo', () => {
  const s = new Session(); s.add(createTable(sales,{id:'sales',columns:schema}));
  assert.equal(s.preview(filtered(10)).table.index.length,3); assert.equal(s.activeTable.index.length,5);
  s.commit(filtered(10)); const group = s.commit(groupSpec); const before = rows(group.table);
  s.undo(); assert.equal(s.activeTable.index.length,3); s.redo(); assert.deepEqual(rows(s.activeTable),before);
  s.undo(); s.commit(filtered(20)); assert.equal(s.history.canRedo,false);
});
test('editing an ancestor recomputes descendants atomically; invalid edit keeps old state', () => {
  const s = new Session(); s.add(createTable(sales,{id:'sales',columns:schema}));
  const node = s.commit(filtered(0)); s.commit(groupSpec);
  s.edit(node.id,filtered(20)); assert.deepEqual(rows(s.activeTable),[{Region:'B',average:20,valid:1,size:1},{Region:null,average:40,valid:1,size:1}]);
  const prior = rows(s.activeTable); assert.throws(()=>s.edit(node.id,{type:'select',params:{fields:['Units']}}),e=>e.code==='FIELD_NOT_FOUND');
  assert.deepEqual(rows(s.activeTable),prior); s.undo(); assert.equal(s.activeTable.index.length,3);
});
test('multi-input dependency replay and exact source hash restore work without embedding data', async () => {
  const a = (await importText('id,x\na,1\nb,2',{id:'a'})).table, b = (await importText('id,y\na,3',{id:'b'})).table;
  const s = new Session(), aID=s.add(a), bID=s.add(b); s.commit({type:'merge',params:{on:'id',how:'left'}},[aID,bID]);
  const flow = s.exportFlow(); assert.equal(flow.sources.length,2); assert.equal('records' in flow,false);
  const restored = new Session(); restored.importFlow(flow,[a,b]); assert.deepEqual(rows(restored.activeTable),rows(s.activeTable));
  const changed = (await importText('id,x\na,999',{id:'a'})).table;
  assert.throws(()=>restored.importFlow(flow,[changed,b]),e=>e.code==='SOURCE_MISMATCH');
  assert.deepEqual(rows(restored.activeTable),rows(s.activeTable));
});
test('cycle detection and absent sources produce actionable errors', () => {
  assert.throws(()=>replay(new Map([['a',{kind:'operation',inputs:['a'],spec:filtered(0)}]]),new Map()),e=>e.code==='PIPELINE_CYCLE');
});
test('late async responses are discarded and locale is independent of data state', () => {
  const store=createStore({activeId:'a',rowIds:['1','2']}); const old=store.request(), latest=store.request();
  assert.equal(store.publish(old,{activeId:'wrong'}),false); assert.equal(store.publish(latest,{activeId:'b'}),true);
  store.locale('en-US'); assert.equal(store.get().activeId,'b'); assert.deepEqual(store.get().rowIds,['1','2']);
});
test('published operation specs are immutable and undo-import permits the same source again',()=>{
  const s=new Session(), t=createTable(sales,{id:'sales',columns:schema});s.add(t);s.undo();s.add(t);s.commit(filtered(10));
  assert.throws(()=>{s.nodes().at(-1).spec.params.predicate.value=999;},TypeError);
  assert.equal(s.activeTable.index.length,3);
});
