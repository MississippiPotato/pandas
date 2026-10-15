import {t} from '../i18n/locale.js';
import {esc,$,$$} from './utils.js';
import {parseFormula} from '../core/formula.js';
import {tasks,local,operationInfo,operationLabel,operationTypes} from './operation-catalog.js';
const types=['string','category','integer','number','boolean','date','datetime'];
const aggregates=['mean','sum','median','min','max','std','var','count','size','nunique'];
export {operationTypes};
export class OperationForm{
  constructor(host,{columns,tables,activeId,onChange,draft=null,charts}){Object.assign(this,{host,columns,tables,activeId,onChange,charts});this.type=draft?.type??'filter';this.saved=draft?.values??null;this.conditions=draft?.conditions??1;this.metricCount=draft?.metricCount??1;this.keyCount=draft?.keyCount??1;this.draw();}
  fieldOptions(columns=this.columns){return columns.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${esc(c.type)}</option>`).join('');}
  select(name,label,values,selected){return `<label>${t(label)}<select name="${name}">${values.map(v=>`<option value="${esc(Array.isArray(v)?v[0]:v)}" ${(Array.isArray(v)?v[0]:v)===selected?'selected':''}>${esc(Array.isArray(v)?v[1]:t(v))}</option>`).join('')}</select></label>`;}
  field(name='field',label='field',columns=this.columns){return `<label>${t(label)}<select name="${name}">${this.fieldOptions(columns)}</select></label>`;}
  input(name,label,value='',type='text'){return `<label>${t(label)}<input name="${name}" type="${type}" value="${esc(value)}" ${type==='number'?'step="any"':''}></label>`;}
  check(name,label,checked=false){return `<label class="check"><input type="checkbox" name="${name}" ${checked?'checked':''}>${t(label)}</label>`;}
  multi(name,label,columns=this.columns){return `<fieldset><legend>${t(label)}</legend><div class="field-options">${columns.map(c=>`<label class="check"><input name="${name}" type="checkbox" value="${esc(c.id)}"><span>${esc(c.name)}</span></label>`).join('')}</div></fieldset>`;}
  remember(){const values={};$$('input,select,textarea',this.host).forEach(el=>{if(!el.name)return;if(el.type==='checkbox'){values[el.name]??=[];if(el.checked)values[el.name].push(el.value);}else values[el.name]=el.value;});return {type:this.type,values,conditions:this.conditions,metricCount:this.metricCount,keyCount:this.keyCount};}
  restore(values){if(!values)return;$$('input,select,textarea',this.host).forEach(el=>{if(!(el.name in values))return;if(el.type==='checkbox')el.checked=values[el.name].includes(el.value);else el.value=values[el.name];});}
  draw(){const s=this.select.bind(this),f=this.field.bind(this),i=this.input.bind(this),m=this.multi.bind(this),c=this.check.bind(this),type=this.type;
    let body='';
    if(type==='filter')body=s('match','matchMode',[['and',t('allConditions')],['or',t('anyConditions')]])+Array.from({length:this.conditions},(_,n)=>`<div class="form-block condition">${f(`field${n}`)}${s(`operator${n}`,'operator',['eq','ne','gt','gte','lt','lte','between','in','contains','startsWith','isMissing','notMissing'])}${i(`value${n}`,'value')}${i(`upper${n}`,'upper')}<button type="button" class="text-button remove-condition" data-index="${n}" ${this.conditions===1?'disabled':''}>${t('remove')}</button></div>`).join('')+`<button type="button" class="button secondary small" data-add="condition">+ ${t('addCondition')}</button>`;
    if(type==='sort')body=Array.from({length:this.keyCount},(_,n)=>`<div class="form-block">${f(`sort${n}`,'order')}${s(`ascending${n}`,'order',['ascending','descending'])}</div>`).join('')+`<button type="button" class="button secondary small" data-add="key">+ ${t('order')}</button>`+s('naPosition','missing',['last','first']);
    if(type==='dropna')body=m('subset','subset')+s('how','howMissing',['any','all']);
    if(type==='dedup')body=m('subset','subset')+s('keep','keep',['first','last','none']);
    if(type==='fillna')body=f()+s('method','method',['constant','mean','median','mode'])+i('value','value');
    if(type==='cast')body=f()+s('targetType','type',types.map(v=>[v,t(v==='date'?'dateType':v==='category'?'categoryType':v)]))+s('errors','method',[['raise',t('strict')],['coerce',t('coerce')]]);
    if(type==='rename')body=f()+i('name','newName','renamed');
    if(type==='select')body=s('mode','method',['keepColumns','dropColumns'])+m('fields','selectFields');
    if(type==='derive')body=i('name','newName','computed')+`<label>${t('formula')}<textarea name="formula" rows="3">${esc(`[${this.columns.find(c=>['number','integer'].includes(c.type))?.name??this.columns[0]?.name}] * 2`)}</textarea></label><p class="hint">${t('formulaHelp')}</p>`+f('insert','insertField')+`<button type="button" class="text-button" data-insert>+ ${t('insertField')}</button>`;
    if(type==='group')body=m('keys','groupKeys')+`<p class="label">${t('metrics')}</p>`+Array.from({length:this.metricCount},(_,n)=>`<div class="form-block">${f(`metric${n}`)}${s(`fn${n}`,'aggregate',aggregates)}${i(`as${n}`,'alias',`metric_${n+1}`)}<details><summary>${t('more')}</summary>${i(`minCount${n}`,'minCount',0,'number')}${i(`ddof${n}`,'ddof',1,'number')}</details></div>`).join('')+`<button type="button" class="button secondary small" data-add="metric">+ ${t('addMetric')}</button>`+c('dropna','dropMissingKeys')+c('sort','ascending');
    if(['pivot','pivot_table'].includes(type))body=m('index','rowKeys')+m('columns','columnKeys')+f('valueField','metric')+(type==='pivot_table'?s('agg','aggregate',aggregates):'')+i('fillValue','fillGaps')+c('dropna','dropna')+c('sort','ascending');
    const others=this.tables.filter(table=>table.id!==this.activeId);
    if(type==='merge'){const other=others.find(v=>v.id===this.saved?.rightTable)??others[0];body=s('rightTable','rightTable',others.map(v=>[v.id,v.provenance?.fileName??v.id]))+Array.from({length:this.keyCount},(_,n)=>`<div class="form-block">${f(`left${n}`,'leftKeys')}${f(`right${n}`,'rightKeys',other?.columns??[])}</div>`).join('')+`<button type="button" class="button secondary small" data-add="key">+ ${t('addKey')}</button>`+s('how','joinType',['inner','left','right','outer'])+s('validate','joinValidation',['many_to_many','one_to_one','one_to_many','many_to_one'])+i('suffixLeft','suffixLeft','_x')+i('suffixRight','suffixRight','_y');}
    if(type==='concat')body=`<fieldset><legend>${t('concatSources')}</legend>${others.map(table=>`<label class="check"><input type="checkbox" name="sources" value="${esc(table.id)}">${esc(table.provenance?.fileName??table.id)} (${table.rows})</label>`).join('')}</fieldset>`+s('join','columnAlignment',[['outer',t('union')],['inner',t('intersection')]]);
    if(['rolling','resample','rank','cumsum','transform'].includes(type))body=f('field','field',['rolling','rank','cumsum'].includes(type)?this.columns.filter(c=>['integer','number'].includes(c.type)):this.columns)+m('by','groupKeys');
    if(type==='rolling')body+=f('order','order')+i('window','window',5,'number')+i('minPeriods','minPeriods',1,'number')+s('fn','aggregate',['mean','sum','min','max','std'])+i('as','newName','rolling_mean')+`<p class="hint">${t('utcNote')}</p>`;
    if(type==='resample')body+=f('date','date',this.columns.filter(c=>['date','datetime'].includes(c.type)))+s('rule','frequency',['D','W-MON','MS'])+s('fn','aggregate',aggregates)+i('as','newName','resampled')+`<p class="hint">${t('utcNote')}</p>`;
    if(type==='rank')body+=s('method','rankMethod',['average','min','max','first','dense'])+c('ascending','ascending',true)+c('pct','percentile')+i('as','newName','rank');
    if(type==='cumsum')body+=i('as','newName','cumulative_sum');
    if(type==='transform')body+=s('fn','aggregate',['mean','sum','count'])+i('as','newName','group_statistic');
    if(type==='cut')body=f('field','field',this.columns.filter(c=>['integer','number'].includes(c.type)))+i('edges','edges','0,10,20,30,50')+c('right','rightClosed',true)+c('includeLowest','includeLowest',true)+i('as','newName','bin');
    if(type==='qcut')body=f('field','field',this.columns.filter(c=>['integer','number'].includes(c.type)))+i('q','q',4,'number')+c('duplicates','dropEdges')+i('as','newName','quantile_bin');
    if(type==='melt')body=m('ids','idFields')+m('values','valueFields')+i('variable','variableName','variable')+i('value','valueName','value');
    if(type==='date_part')body=f('field','date',this.columns.filter(c=>['date','datetime'].includes(c.type)))+s('part','frequency',['year','month','week'])+i('as','newName','date_group');
    if(type==='outliers')body=f('field','field',this.columns.filter(c=>['number','integer'].includes(c.type)))+s('iqr','method',['retainIQR','excludeIQR'])+`<p class="hint">${t('iqrNote')}</p>`;
    const info=operationInfo(type),taskKeys=Object.keys(tasks).filter(k=>k!=='inspect');
    this.host.innerHTML=`<label>${t('taskCategory')}<select name="task">${taskKeys.map(key=>`<option value="${key}" ${key===info.task?'selected':''}>${local(tasks[key].name)}</option>`).join('')}</select></label><label>${t('operation')}<select name="operation">${taskKeys.map(key=>`<optgroup label="${esc(local(tasks[key].name))}">${operationTypes.filter(v=>operationInfo(v).task===key).map(v=>`<option value="${v}" ${v===type?'selected':''}>${esc(operationLabel(v))}</option>`).join('')}</optgroup>`).join('')}</select></label><div class="operation-meaning"><code>${esc(info.method)}</code><p>${esc(info.meaning)}</p><details><summary>${t('parametersAndLimits')}</summary><p>${esc(info.parameters)}</p><p class="hint">${esc(info.limit)}</p></details></div><div class="operation-fields">${body}</div>`;this.restore(this.saved);$('select[name=operation]',this.host).value=type;$('[name=task]',this.host).value=info.task;
    this.host.onchange=event=>{if(['operation','task'].includes(event.target.name)){this.type=event.target.name==='task'?operationTypes.find(v=>operationInfo(v).task===event.target.value):event.target.value;this.saved=null;this.conditions=1;this.keyCount=1;this.metricCount=1;this.draw();}else if(event.target.name==='rightTable'){this.saved=this.remember().values;this.draw();}this.onChange?.();};
    const missingNumeric=['rolling','rank','cumsum','cut','qcut','outliers'].includes(type)&&!this.columns.some(c=>['integer','number'].includes(c.type));
    const missingDate=['resample','date_part'].includes(type)&&!this.columns.some(c=>['date','datetime'].includes(c.type));
    if(missingNumeric||missingDate||(['merge','concat'].includes(type)&&!others.length))this.host.insertAdjacentHTML('beforeend',`<p class="inline-error">${t(missingNumeric?'numericOne':missingDate?'dateNeeded':'secondTableNeeded')}</p>`);
    this.host.oninput=()=>this.onChange?.();
    this.host.onclick=event=>{const add=event.target.closest('[data-add]');if(add){this.saved=this.remember().values;this[{condition:'conditions',key:'keyCount',metric:'metricCount'}[add.dataset.add]]++;this.draw();this.onChange?.();}if(event.target.closest('[data-insert]')){const el=$('[name=formula]',this.host),field=this.columns.find(c=>c.id===$('[name=insert]',this.host).value);el.value+=` [${field.name}]`;this.onChange?.();}const remove=event.target.closest('.remove-condition');if(remove){const d=this.remember().values,n=+remove.dataset.index;for(let k=n;k<this.conditions-1;k++)for(const key of ['field','operator','value','upper'])d[key+k]=d[key+(k+1)];this.conditions--;this.saved=d;this.draw();this.onChange?.();}};
  }
  setField(field){const el=$('[name=field],[name=field0]',this.host);if(el)el.value=field;}
  read(){const values=this.remember().values,v=name=>values[name],many=name=>values[name]??[],b=name=>many(name).length>0,n=name=>Number(v(name)),subset=()=>many('subset').length?{subset:many('subset')}:{},typed=(ref,value)=>{const c=this.columns.find(c=>c.id===ref);if(['number','integer'].includes(c?.type)){const number=Number(value);if(!value.trim()||!Number.isFinite(number))throw new Error('INVALID_VALUE');return number;}if(c?.type==='boolean'){if(!['true','false'].includes(value))throw new Error('INVALID_VALUE');return value==='true';}return value;};
    let params={},inputs=[this.activeId],type=this.type;
    switch(type){
      case 'filter':params={predicate:{op:v('match'),args:Array.from({length:this.conditions},(_,k)=>{const op=v('operator'+k),field=v('field'+k),a={op,field};if(['isMissing','notMissing'].includes(op))return a;if(op==='between')return {...a,min:typed(field,v('value'+k)),max:typed(field,v('upper'+k))};if(op==='in')return {...a,values:v('value'+k).split(',').map(x=>typed(field,x.trim()))};return {...a,value:typed(field,v('value'+k))};})}};break;
      case 'sort':params={by:Array.from({length:this.keyCount},(_,k)=>v('sort'+k)),ascending:Array.from({length:this.keyCount},(_,k)=>v('ascending'+k)==='ascending'),naPosition:v('naPosition')};break;
      case 'dropna':params={...subset(),how:v('how')};break;
      case 'dedup':params={...subset(),keep:v('keep')==='none'?false:v('keep')};break;
      case 'fillna':params={field:v('field'),method:v('method')};if(v('method')==='constant'||(v('method')==='mode'&&v('value')!==''))params.value=typed(v('field'),v('value'));break;
      case 'cast':params={field:v('field'),type:v('targetType'),errors:v('errors')};break;
      case 'rename':params={field:v('field'),name:v('name')};break;
      case 'select':params={fields:v('mode')==='keepColumns'?many('fields'):this.columns.filter(c=>!many('fields').includes(c.id)).map(c=>c.id)};break;
      case 'derive':params={name:v('name'),expression:parseFormula(v('formula'))};break;
      case 'group':params={keys:many('keys'),metrics:Array.from({length:this.metricCount},(_,k)=>({field:v('metric'+k),fn:v('fn'+k),as:v('as'+k),minCount:n('minCount'+k),ddof:n('ddof'+k)})),dropna:b('dropna'),sort:b('sort')};break;
      case 'pivot':case 'pivot_table':params={index:many('index'),columns:many('columns'),value:v('valueField'),dropna:b('dropna'),sort:b('sort')};if(type==='pivot_table')params.agg=v('agg');if(v('fillValue')!=='')params.fillValue=Number(v('fillValue'));break;
      case 'merge':params={leftOn:Array.from({length:this.keyCount},(_,k)=>v('left'+k)),rightOn:Array.from({length:this.keyCount},(_,k)=>v('right'+k)),how:v('how'),validate:v('validate'),suffixes:[v('suffixLeft'),v('suffixRight')]};inputs.push(v('rightTable'));break;
      case 'concat':params={join:v('join')};inputs.push(...many('sources'));if(inputs.length===1)throw new Error('SELECT_FIRST');break;
      case 'rolling':params={field:v('field'),by:many('by'),order:v('order'),window:n('window'),minPeriods:n('minPeriods'),fn:v('fn'),as:v('as')};break;
      case 'resample':params={field:v('field'),by:many('by'),date:v('date'),rule:v('rule'),fn:v('fn'),as:v('as')};break;
      case 'cut':params={field:v('field'),edges:v('edges').split(',').map(Number),right:b('right'),includeLowest:b('includeLowest'),as:v('as')};break;
      case 'qcut':params={field:v('field'),q:n('q'),duplicates:b('duplicates')?'drop':'raise',as:v('as')};break;
      case 'rank':params={field:v('field'),by:many('by'),method:v('method'),ascending:b('ascending'),pct:b('pct'),as:v('as')};break;
      case 'cumsum':params={field:v('field'),by:many('by'),as:v('as')};break;
      case 'transform':params={field:v('field'),by:many('by'),fn:v('fn'),as:v('as')};break;
      case 'melt':params={ids:many('ids'),values:many('values'),variable:v('variable'),value:v('value')};break;
      case 'date_part':params={field:v('field'),part:v('part'),as:v('as')};break;
      case 'outliers':{const box=this.charts(v('field'));if(box?.low===null||!box)throw new Error('SELECT_FIRST');const predicate={op:'between',field:v('field'),min:box.low,max:box.high};type='filter';params={predicate:v('iqr')==='excludeIQR'?{op:'not',arg:predicate}:predicate};break;}
    }
    if(type==='select'&&!params.fields.length)throw new Error('SELECT_FIRST');
    return {spec:{type,version:1,params},inputs};
  }
}
