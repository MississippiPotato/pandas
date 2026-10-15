import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Session } from '../../src/core/session.js';
import { createTable, rows } from '../../src/core/dataset.js';
import { createStore } from '../../src/core/store.js';
import { importText } from '../../src/data/loader.js';
import { replay } from '../../src/core/pipeline.js';
import { groupSpec, sales, schema } from '../fixtures/cases.js';
test('upstream edits cannot silently retarget metric or pivot column identities',()=>{
  const session=new Session();session.add(createTable([{g:'A',c:'Jan',v:2},{g:'A',c:'Feb',v:4}]));
  const metrics=[{field:'v',fn:'sum',as:'Total'},{field:'v',fn:'mean',as:'Average'}],group=session.commit({type:'group',params:{keys:['g'],metrics}});
  const total=group.table.columns.find(c=>c.name==='Total').id;session.commit({type:'select',params:{fields:[total]}});
  session.edit(group.id,{type:'group',params:{keys:['g'],metrics:[...metrics].reverse()}});assert.deepEqual(rows(session.activeTable),[{Total:6}]);
  const pivot=new Session();pivot.add(createTable([{g:'A',c:'Jan',v:2},{g:'A',c:'Feb',v:4}]));
  const filter=pivot.commit({type:'filter',params:{predicate:{op:'in',field:'c',values:['Jan','Feb']}}});pivot.commit({type:'pivot_table',params:{index:'g',columns:'c',value:'v',agg:'sum'}});
  const january=pivot.activeTable.columns.find(c=>c.pivotValues?.[0]==='Jan').id;pivot.commit({type:'select',params:{fields:[january]}});const original=rows(pivot.activeTable);
  assert.throws(()=>pivot.edit(filter.id,{type:'filter',params:{predicate:{op:'eq',field:'c',value:'Feb'}}}),error=>error.code==='FIELD_NOT_FOUND');assert.deepEqual(rows(pivot.activeTable),original);
});
const filtered = value => ({type:'filter',params:{predicate:{field:'Revenue',op:'gte',value}}});
test('undo of a new branch returns to the table actually selected before committing',()=>{
  const s=new Session(),source=s.add(createTable(sales,{id:'branch',columns:schema}));s.commit(filtered(10));s.commit(groupSpec);
  s.select(source);const before=rows(s.activeTable);s.commit(filtered(20));s.undo();assert.equal(s.activeId,source);assert.deepEqual(rows(s.activeTable),before);
  s.redo();assert.equal(s.activeTable.index.length,2);
});
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
