import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {importText} from '../../src/data/loader.js';
import {execute} from '../../src/core/operation-registry.js';
import {profile,correlation} from '../../src/core/statistics.js';
import {chartQuery} from '../../src/core/analytics.js';
import {visualSummary,visualDiff} from '../../src/core/visual-summary.js';
import {operationPreview} from '../../src/core/operation-preview.js';
import {rows} from '../../src/core/dataset.js';
const load=text=>importText(text,{id:'manual',format:'csv'}).then(r=>r.table);
test('identifier roles retain exact values and are excluded from numeric suggestions and statistics',async()=>{
  const table=await load('game_id,sensorId,amount\n001,1001,10\n002,1002,20\n003,1003,30\n');
  assert.equal(table.columns[0].semantic,'key');assert.equal(table.columns[1].semantic,'key');
  assert.equal(rows(table)[0].game_id,'001');assert.equal(rows(table)[0].sensorId,1001);
  assert.equal(profile(table).columns[1].mean,undefined);
  assert.equal(chartQuery(table,{x:'sensorId',correlation:true}).fields.x.name,'amount');
  assert.throws(()=>correlation(table,['sensorId','amount']),{code:'NUMERIC_REQUIRED'});
  assert.throws(()=>execute(table,{type:'group',params:{keys:['game_id'],metrics:[{field:'sensorId',fn:'mean',as:'bad'}]}}),{code:'NUMERIC_REQUIRED'});
  assert.throws(()=>execute(table,{type:'fillna',params:{field:'sensorId',method:'mean'}}),{code:'NUMERIC_REQUIRED'});
  const count=execute(table,{type:'group',params:{keys:['game_id'],metrics:[{field:'sensorId',fn:'nunique',as:'ids'}]}}).table;
  assert.deepEqual(rows(count).map(r=>r.ids),[1,1,1]);
  const cast=execute(table,{type:'cast',params:{field:'sensorId',type:'number',semantic:'value'}}).table;
  assert.equal(profile(cast).columns[1].mean,1002);
});
test('ordinary unique amounts and Paid stay numeric rather than becoming identifiers',async()=>{
  const table=await load('Paid,Revenue,customerId\n1200,1500,1\n1800,2500,2\n2400,3500,3');
  assert.deepEqual(table.columns.map(c=>c.semantic),['value','value','key']);
  assert.equal(profile(table).columns[0].mean,1800);assert.equal(profile(table).columns[1].mean,2500);
});
test('custom import skips a title row, uses explicit DMY dates and preserves ID zeros',async()=>{
  const table=(await importText('Report\nRegion;OrderDate;Paid;order_id\nEast;03/11/2025;1200;001\nWest;01/11/2025;;002',{
    format:'csv',delimiter:';',headerRow:2,types:{OrderDate:'date'},dateFormats:{OrderDate:'dmy'}
  })).table;
  assert.deepEqual(rows(table),[{Region:'East',OrderDate:'2025-11-03',Paid:1200,order_id:'001'},{Region:'West',OrderDate:'2025-11-01',Paid:null,order_id:'002'}]);
});
test('visual summaries use full data, exclude null from uniqueness, and cache immutable versions',async()=>{
  const table=await load('group,value\nA,1\nA,2\nB,\n,4\n');
  const summary=visualSummary(table);assert.strictEqual(summary,visualSummary(table));
  assert.equal(summary[0].unique,2);assert.equal(summary[1].bins.reduce((n,b)=>n+b.count,0),3);
  assert.equal(summary[1].mean,7/3);assert.equal(summary[1].median,2);
  const after=execute(table,{type:'fillna',params:{field:'value',method:'constant',value:0}}).table;
  assert.notStrictEqual(visualSummary(after),summary);assert.equal(visualSummary(after)[1].count,4);
});
test('diff identifies removed records by stable ID and changed cells across rename / fill / derive',async()=>{
  const table=await load('id,value\na,1\nb,\nc,3\n');
  for(const [spec,key]of [[{type:'dropna',params:{subset:['value']}},'removed'],[{type:'fillna',params:{field:'value',method:'constant',value:2}},'changed'],[{type:'rename',params:{field:'value',name:'amount'}},'changed']]){
    const result=execute(table,spec),diff=visualDiff(table,result.table,spec);assert.ok(diff[key].length>0);assert.equal(diff.inputRows,3);
    if(spec.type==='fillna')assert.deepEqual(diff.changed[0].cells[0],{field:'value',before:null,after:2,added:false,renamed:false,oldName:'value'});
    if(spec.type==='dropna')assert.equal(diff.removed[0].record.id,'b');
  }
  const sorted=execute(table,{type:'sort',params:{by:['value'],ascending:false}}).table;
  assert.deepEqual(visualDiff(table,sorted,{type:'sort'}).changed,[]);
});
test('merge overlap counts distinct keys and missing cells introduced by absent sides',async()=>{
  const a=await load('key,value\nA,1\nA,\nB,3\n'),b=await load('key,note\nA,x\nA,y\nC,z\n');
  const spec={type:'merge',params:{on:'key',how:'outer'}},result=execute([a,b],spec);
  assert.equal(result.report.sharedDistinctKeys,1);assert.equal(result.report.estimatedRows,6);assert.equal(result.report.generatedMissing,2);
  const p=operationPreview([a,b],spec,result);assert.equal(p.diff.structural,true);assert.equal(p.diff.output.length,6);
});
test('frozen built-in data have truthful size, natural missingness and manually reproducible NBA aggregates',async()=>{
  const base=new URL('../../public/data/',import.meta.url),read=async path=>load(await readFile(new URL(path,base),'utf8'));
  const [players,teams,titanic,raw]=await Promise.all(['examples/nba_players.csv','examples/nba_teams.csv','examples/titanic.csv','nba/2025-26-nov/player_game_stats.csv'].map(read));
  assert.equal(players.index.length,475);assert.equal(players.columns.length,12);assert.equal(teams.index.length,30);assert.equal(titanic.index.length,891);
  const tp=profile(titanic);assert.equal(tp.columns.find(c=>c.name==='age').missing,177);assert.equal(tp.columns.find(c=>c.name==='embarked').missing,2);
  const p=rows(players).find(r=>r.player_name==='Stephen Curry'),played=rows(raw).filter(r=>r.player_name==='Stephen Curry'&&r.played===true);
  assert.equal(p.gp,played.length);assert.equal(p.pts,played.reduce((s,r)=>s+r.pts,0)/played.length);assert.equal(p.fg_pct,played.reduce((s,r)=>s+r.fgm,0)/played.reduce((s,r)=>s+r.fga,0));
  assert.ok(!players.columns.some(c=>['salary_musd','age','player_id'].includes(c.name)));
});
test('NBA practice copy has an exact removal audit and preserves every unmasked real cell',async()=>{
  const base=new URL('../../public/data/examples/',import.meta.url),read=async file=>load(await readFile(new URL(file,base),'utf8'));
  const [original,practice]=await Promise.all(['nba_games.csv','nba_missing.csv'].map(read));
  const audit=JSON.parse(await readFile(new URL('nba-missing-audit.json',base),'utf8'));
  assert.equal(original.index.length,4784);assert.equal(practice.index.length,4784);assert.equal(practice.columns.length,16);assert.equal(audit.removed.length,726);
  const originals=rows(original),copies=rows(practice),masked=new Map(audit.removed.map(r=>[`${r.row}:${r.field}`,r]));
  for(let i=0;i<originals.length;i++)for(const c of original.columns){const record=masked.get(`${i}:${c.name}`);if(record){assert.equal(copies[i][c.name],null);assert.equal(String(originals[i][c.name]),record.original);}else assert.equal(copies[i][c.name],originals[i][c.name]);}
  assert.deepEqual(Object.fromEntries(['fg_pct','minutes','pts'].map(k=>[k,audit.removed.filter(r=>r.field===k).length])),{fg_pct:241,minutes:357,pts:128});
  const spec={type:'rolling',params:{field:'pts',by:['player_name'],order:'game_date',window:5,minPeriods:3,fn:'mean',as:'last5'}};
  const result=execute(practice,spec).table;assert.equal(result.index.length,4784);assert.ok(rows(result).some(r=>r.last5!==null));
});
