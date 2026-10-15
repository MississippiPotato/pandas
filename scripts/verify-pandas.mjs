// Development-only independent oracle. No Python is used by the web application.
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createTable, rows } from '../src/core/dataset.js';
import { Session } from '../src/core/session.js';
import { sales, schema, groupSpec, predicateSpec } from '../tests/fixtures/cases.js';
import { py } from '../src/core/pandas-code.js';
const cases = [];
function add(name, data, specs, columns, other = null) {
  const session = new Session(), first = session.add(createTable(data, {id:'source',columns}));
  if (other) { const second=session.add(createTable(other,{id:'right'})); session.commit(specs[0],[first,second]); }
  else for(const spec of specs) session.commit(spec);
  cases.push({name,session});
}
add('filter with boolean and numeric range',sales,[predicateSpec],schema);
add('NOT treats missing comparison as false before negation',sales,[{type:'filter',params:{predicate:{op:'not',arg:{field:'Revenue',op:'gte',value:20}}}}],schema);
add('stable multi-column sort and null-last',sales,[{type:'sort',params:{by:['Active','Revenue'],ascending:[false,true]}}],schema);
add('missing-group mean/count/size',sales,[groupSpec],schema);
add('sum minCount and standard deviation ddof',sales,[{type:'group',params:{keys:['Region'],metrics:[{field:'Revenue',fn:'sum',minCount:1,as:'sum'},{field:'Revenue',fn:'std',ddof:0,as:'std'}]}}],schema);
add('fillna mean/zero semantics',sales,[{type:'fillna',params:{field:'Revenue',method:'mean'}}],schema);
add('fillna median',sales,[{type:'fillna',params:{field:'Revenue',method:'median'}}],schema);
add('dropna any and subset',sales,[{type:'dropna',params:{subset:['Region','Revenue'],how:'any'}}],schema);
add('dedup keep last with null', [{x:0},{x:null},{x:0}], [{type:'dedup',params:{keep:'last'}}]);
add('nullable integer coercion rejects fraction',[{x:'1'},{x:'1.2'},{x:null}],[{type:'cast',params:{field:'x',type:'integer',errors:'coerce'}}]);
add('rename and field projection preserve meaning',sales,[{type:'rename',params:{field:'Revenue',name:'营业额 "quoted"'}},{type:'select',params:{fields:['Region','营业额 "quoted"']}}],schema);
add('derived division masks zero',sales,[{type:'derive',params:{name:'ratio',expression:{type:'binary',op:'/',left:{type:'field',field:'Revenue'},right:{type:'field',field:'Units'}}}}],schema);
const pivotRows=[{g:'A',c:'Jan',v:2},{g:'A',c:'Jan',v:4},{g:'B',c:'Feb',v:null},{g:null,c:'Feb',v:10}];
add('flat pivot retains all-null observed rows',pivotRows,[{type:'pivot_table',params:{index:'g',columns:'c',value:'v',agg:'mean'}}]);
add('pivot unique values and fill gaps',[{g:'A',c:'Jan',v:'x'},{g:'B',c:'Feb',v:'y'}],[{type:'pivot',params:{index:'g',columns:'c',value:'v'}}]);
for(const how of ['inner','left','right','outer']) add(`merge ${how} duplicates and null keys`,[{key:1,v:'a'},{key:1,v:'b'},{key:null,v:'n'},{key:3,v:'u'}],[{type:'merge',params:{on:'key',how}}],null,[{key:1,v:'c'},{key:null,v:'n2'},{key:4,v:'r'}]);
add('rolling partition and missing minPeriods',[{g:'B',d:'2025-01-02',x:100},{g:'A',d:'2025-01-02',x:null},{g:'A',d:'2025-01-01',x:10},{g:'A',d:'2025-01-03',x:30}],[{type:'rolling',params:{by:['g'],order:'d',field:'x',window:2,minPeriods:1,as:'smooth'}}]);
for(const rule of ['D','W-MON','MS']) add(`UTC resample ${rule} empty buckets`,[{d:'2024-02-28',x:2},{d:'2024-03-01',x:4}],[{type:'resample',params:{date:'d',field:'x',fn:'sum',as:'total',rule}}],[{name:'d',type:'date'},{name:'x',type:'number'}]);
const advanced=[{g:'a',x:0,y:10,d:'2025-01-01'},{g:'a',x:10,y:20,d:'2025-01-03'},{g:'b',x:10,y:30,d:'2025-02-01'},{g:null,x:30,y:null,d:null},{g:'a',x:null,y:40,d:'2025-02-04'}];
const advancedSchema=[{name:'g',type:'string'},{name:'x',type:'number'},{name:'y',type:'number'},{name:'d',type:'date'}];
for(const method of ['average','min','max','first','dense'])add(`rank ${method} grouped null and percentile`,advanced,[{type:'rank',params:{field:'x',by:['g'],as:'r',method,pct:true,ascending:false}}],advancedSchema);
for(const right of [true,false])add(`cut closure ${right} and lowest`,advanced,[{type:'cut',params:{field:'x',edges:[0,10,30],right,includeLowest:true,as:'bin'}}],advancedSchema);
add('qcut duplicate edges and labels',advanced,[{type:'qcut',params:{field:'x',q:6,duplicates:'drop',as:'q'}}],advancedSchema);
add('cumulative sum with null groups',advanced,[{type:'cumsum',params:{field:'x',by:['g'],as:'total'}}],advancedSchema);
for(const by of [['g'],[]])add(`transform mean grouping ${by.length}`,advanced,[{type:'transform',params:{field:'x',by,fn:'mean',as:'m'}}],advancedSchema);
add('melt ID retention and ordering',advanced,[{type:'melt',params:{ids:['g','d'],values:['x','y'],variable:'measure',value:'value'}}],advancedSchema);
for(const part of ['year','month','week'])add(`date part ${part}`,advanced,[{type:'date_part',params:{field:'d',part,as:'period'}}],advancedSchema);
add('grouped daily resample with missing keys',advanced,[{type:'resample',params:{date:'d',by:['g'],field:'x',fn:'sum',rule:'D',as:'v'}}],advancedSchema);
for(const join of ['inner','outer'])add(`concat ${join} aligns columns`,[{x:1,g:'a'},{x:null,g:'b'}],[{type:'concat',params:{join}}],null,[{x:4,y:8}]);
add('strict date conversion rejects locale guesses',[{d:'2025-01-01'},{d:'01/01/2025'},{d:'2025-02-30'},{d:null}],[{type:'cast',params:{field:'d',type:'date',errors:'coerce'}}],[{name:'d',type:'string'}]);
add('boolean numeric coercion does not become one or zero',[{x:true},{x:false},{x:null}],[{type:'cast',params:{field:'x',type:'number',errors:'coerce'}}],[{name:'x',type:'boolean'}]);
add('numeric text conversion uses decimal JavaScript formatting',[{x:1},{x:.000001},{x:.0000001},{x:null}],[{type:'cast',params:{field:'x',type:'string'}}],[{name:'x',type:'number'}]);
add('qcut all equal values yields missing bins',[{x:3},{x:3},{x:null}],[{type:'qcut',params:{field:'x',q:4,duplicates:'drop',as:'q'}}],[{name:'x',type:'number'}]);
add('derived mixed branch normalizes output text',[{x:0},{x:2},{x:null}],[{type:'derive',params:{name:'label',expression:{type:'call',fn:'if',args:[{type:'binary',op:'>',left:{type:'field',field:'x'},right:{type:'literal',value:1}},{type:'literal',value:'High'},{type:'field',field:'x'}]}}}],[{name:'x',type:'number'}]);
add('identifier role keeps leading zeros in grouping counts',[{id:'001',value:2},{id:'001',value:null},{id:'002',value:5}],[{type:'group',params:{keys:['id'],metrics:[{field:'id',fn:'count',as:'n'},{field:'value',fn:'sum',as:'total'}]}}],[{name:'id',type:'string',semantic:'key'},{name:'value',type:'number'}]);
add('manual identifier conversion enables explicit numeric means',[{id:1001,g:'A'},{id:1003,g:'A'}],[{type:'cast',params:{field:'id',type:'number',semantic:'value'}},{type:'group',params:{keys:['g'],metrics:[{field:'id',fn:'mean',as:'explicit_mean'}]}}],[{name:'id',type:'integer',semantic:'key'},{name:'g',type:'string'}]);
const output = new URL('../output/verification/',import.meta.url); await mkdir(output,{recursive:true});
const results=[];
const selected=process.env.PANDAS_CASE?cases.filter(c=>c.name.includes(process.env.PANDAS_CASE)):cases;
for(const {name,session} of selected){
  const table=session.activeTable, columns=table.columns.map(c=>({name:c.name,type:c.type}));
  const dump=`\n_schema = ${py(columns)}\n_records = []\nfor _, row in result.iterrows():\n    record = {}\n    for col in _schema:\n        value = row[col['name']]\n        if pd.isna(value): value = None\n        elif col['type'] == 'date': value = value.strftime('%Y-%m-%d') if hasattr(value, 'strftime') else str(value)[:10]\n        elif col['type'] == 'datetime': value = value.isoformat().replace('+00:00','Z')\n        elif isinstance(value, np.generic): value = value.item()\n        record[col['name']] = value\n    _records.append(record)\nprint(json.dumps({'pandas':pd.__version__,'records':_records}, ensure_ascii=False, allow_nan=False))\n`;
  const script=session.pandasScript()+dump, run=spawnSync(process.env.PANDAS_PYTHON??'python',['-c',script],{encoding:'utf8',env:{...process.env,PYTHONIOENCODING:'utf-8'},maxBuffer:10*1024*1024});
  const safe=name.replace(/[^a-z0-9]+/gi,'-').toLowerCase(); await writeFile(new URL(`${safe}.py`,output),script);
  if(run.status!==0) throw new Error(`${name}\n${run.stderr}`);
  const actual=JSON.parse(run.stdout.trim()); const expected=rows(table);
  assert.equal(actual.records.length,expected.length,name);
  for(let i=0;i<expected.length;i++) for(const column of columns){
    const a=actual.records[i][column.name], b=expected[i][column.name];
    if(typeof b==='number'&&typeof a==='number') assert.ok(Math.abs(a-b)<=1e-9+1e-9*Math.abs(b),`${name} row ${i} ${column.name}: ${a} != ${b}`);
    else assert.deepEqual(a,b,`${name} row ${i} ${column.name}`);
  }
  results.push({name,passed:true,pandas:actual.pandas,rows:expected.length}); console.log(`PASS ${name}`);
}
await writeFile(new URL(process.env.PANDAS_CASE?'pandas-parity-debug.json':'pandas-parity.json',output),JSON.stringify({scope:'Generated supported-operation code executed independently in offline pandas',cases:results,totalCases:cases.length,partial:!!process.env.PANDAS_CASE,passed:true},null,2));
