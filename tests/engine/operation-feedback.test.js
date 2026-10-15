import test from 'node:test';
import assert from 'node:assert/strict';
import {createTable,rows} from '../../src/core/dataset.js';
import {execute} from '../../src/core/operation-registry.js';
import {operationPreview} from '../../src/core/operation-preview.js';
import {chartQuery} from '../../src/core/analytics.js';
import {Session} from '../../src/core/session.js';

const table=createTable([
  {ID:'003',Region:'East',Value:30,Active:true,Date:'2025-01-03'},
  {ID:'001',Region:'East',Value:10,Active:false,Date:'2025-01-01'},
  {ID:'002',Region:'East',Value:null,Active:true,Date:'2025-01-02'},
  {ID:'004',Region:'West',Value:20,Active:true,Date:'2025-01-01'},
  {ID:'005',Region:'West',Value:40,Active:false,Date:'2025-01-02'},
  {ID:'006',Region:null,Value:0,Active:false,Date:'2025-01-01'}
],{id:'feedback',columns:[{name:'ID',type:'string'},{name:'Region',type:'string'},{name:'Value',type:'number'},{name:'Active',type:'boolean'},{name:'Date',type:'date'}]});
const preview=(inputs,spec)=>operationPreview(Array.isArray(inputs)?inputs:[inputs],spec,execute(inputs,spec));

test('group previews distinguish input size from non-null count, and retain grain after filtering/sorting',()=>{
  const spec={type:'group',params:{keys:['Region'],metrics:[{field:'Value',fn:'sum',as:'total'},{field:'Value',fn:'count',as:'valid'},{field:'Value',fn:'size',as:'n'}],dropna:true,sort:true}};
  const result=execute(table,spec),p=operationPreview([table],spec,result);
  assert.deepEqual(rows(result.table),[{Region:'East',total:40,valid:2,n:3},{Region:'West',total:60,valid:2,n:2}]);
  assert.equal(p.groups.inputRows,6);assert.equal(p.groups.includedRows,5);
  assert.deepEqual(p.groups.items.map(g=>[g.key,g.value,g.sourceCount,g.count]),[['East',40,3,1],['West',60,2,1]]);
  const sorted=execute(result.table,{type:'sort',params:{by:['total'],ascending:false}}).table;
  const data=chartQuery(sorted,{category:'Region',metric:'total',aggregate:'sum'},{op:'eq',field:'Region',value:'East'});
  assert.deepEqual(data.bars.map(b=>[b.key,b.value,b.count,b.sourceCount]),[['East',40,1,3]]);
  assert.match(p.pandas.code,/groupby/);assert.match(p.pandas.code,/count/);
});

test('missing previews report all fields and compare frequencies on identical bins',()=>{
  const p=preview(table,{type:'fillna',params:{field:'Value',method:'constant',value:100}});
  assert.equal(p.report.before.missing,2);assert.equal(p.report.after.missing,1);
  assert.deepEqual(p.missing.find(c=>c.name==='Value'),{id:'feedback:c2',name:'Value',before:1,after:0,beforeRows:6,afterRows:6});
  assert.equal(p.missing.find(c=>c.name==='Region').after,1);
  assert.deepEqual(p.beforeCharts.domain,p.charts.domain);assert.equal(p.charts.domain[1],100);
  assert.equal(p.beforeCharts.histogram.reduce((n,b)=>n+b.count,0),5);
  assert.equal(p.charts.histogram.reduce((n,b)=>n+b.count,0),6);
  assert.equal(rows(table)[2].Value,null);
});

test('join preview separates matched source rows, output pairs, duplicate keys and unmatched rows',()=>{
  const left=createTable([{K:'A',L:1},{K:'A',L:2},{K:'B',L:3},{K:null,L:4}],{id:'L'});
  const right=createTable([{K:'A',R:10},{K:'A',R:20},{K:'A',R:30},{K:'C',R:40},{K:null,R:50}],{id:'R'});
  const p=preview([left,right],{type:'merge',params:{on:'K',how:'outer',validate:'many_to_many'}}),r=p.report;
  assert.equal(r.matched,7);assert.equal(r.matchedLeft,3);assert.equal(r.matchedRight,4);
  assert.equal(r.unmatchedLeft,1);assert.equal(r.unmatchedRight,1);assert.equal(p.rows,9);assert.equal(r.expansion,2.25);
  assert.equal(r.leftDuplicateKeys,1);assert.equal(r.rightDuplicateKeys,1);assert.equal(r.manyToManyKeys,1);
  assert.deepEqual(r.keyRelations.find(k=>k.key[0]==='A'),{key:['A'],left:2,right:3,pairs:6});
  assert.equal(r.keyRelations.find(k=>k.key[0]===null).pairs,1);
});

test('rolling preview compares ordered originals with exact partitioned trailing windows',()=>{
  const p=preview(table,{type:'rolling',params:{field:'Value',by:['Region'],order:'Date',window:2,minPeriods:1,fn:'mean',as:'smooth'}});
  assert.equal(p.rolling.groups,3);assert.equal(p.rolling.totalRows,6);
  const east=p.rolling.series.find(s=>s.key[0]==='East');
  assert.deepEqual(east.points.map(d=>[d.order,d.original,d.value]),[['2025-01-01',10,10],['2025-01-02',null,10],['2025-01-03',30,30]]);
  assert.deepEqual(p.rolling.series.find(s=>s.key[0]==='West').points.map(d=>d.value),[20,30]);
  assert.match(p.pandas.code,/sort_values/);assert.match(p.pandas.code,/rolling/);
  const q=preview(table,{type:'rolling',params:{field:'Value',by:['Region'],order:'Date',window:3,minPeriods:1,fn:'mean',as:'smooth'}});
  assert.equal(q.rolling.series.find(s=>s.key[0]==='East').points[2].value,20);
});

test('read-only feedback, commit, undo, redo and restored flow use the same group counts',()=>{
  const session=new Session();session.add(table);const spec={type:'group',params:{keys:['Region'],metrics:[{field:'Value',fn:'sum',as:'total'}],dropna:false}};
  const before=session.exportFlow();preview(table,spec);assert.deepEqual(session.exportFlow(),before);
  session.commit(spec);const count=()=>chartQuery(session.activeTable,{category:'Region',metric:'total'}).bars.find(b=>b.key==='East').sourceCount;
  assert.equal(count(),3);const flow=session.exportFlow();session.undo();assert.equal(session.activeTable.index.length,6);session.redo();assert.equal(count(),3);
  const restored=new Session();const hashed=createTable(rows(table),{...table,sourceHash:'fixture-feedback-hash'}); // hash binding is required on restoration
  restored.add(hashed);restored.commit(spec);const saved=restored.exportFlow();const reloaded=new Session();reloaded.importFlow(saved,[hashed]);
  assert.equal(chartQuery(reloaded.activeTable,{category:'Region',metric:'total'}).bars.find(b=>b.key==='East').sourceCount,3);
  assert.equal(flow.nodes.length,2);
});
