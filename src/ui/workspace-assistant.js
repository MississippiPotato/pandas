import {isNumericColumn} from '../data/semantics.js';
import {t,fmt} from '../i18n/locale.js';
import {columnLabel} from './dataframe-visuals.js';
import {esc} from './utils.js';

export function assessData(columns=[],profile=[]){
  const numeric=columns.filter(isNumericColumn),dates=columns.filter(c=>['date','datetime'].includes(c.type)),keys=columns.filter(c=>c.semantic==='key');
  const categories=columns.filter(c=>!isNumericColumn(c)&&c.semantic!=='key'&&!dates.includes(c));
  const missing=profile.filter(c=>c.missing>0).map(p=>columns.find(c=>(p.id&&c.id===p.id)||c.name===p.name)).filter(Boolean);
  return {numeric,dates,keys,categories,missing};
}
export function suggestChart(columns){
  const a=assessData(columns),category=a.categories[0]??a.keys[0]??columns[0],metric=a.numeric[0];
  return {type:a.dates.length&&metric?'line':a.numeric.length>=2?'scatter':metric?'histogram':'bar',config:{x:metric?.id,y:(a.numeric[1]??metric)?.id,metric:metric?.id,category:category?.id,date:a.dates[0]?.id,aggregate:'mean',correlation:true}};
}
export function starterDraft(goal,columns,profile=[]){
  const a=assessData(columns,profile),number=a.numeric[0],category=a.categories[0]??a.keys[0]??columns[0];
  if(goal==='clean'){const c=a.missing[0];return c?{type:'fillna',values:{field:c.id,method:isNumericColumn(c)?'median':'mode',value:''}}:null;}
  if(goal==='group')return {type:'group',values:{keys:[category.id],metric0:(number??category).id,fn0:number?'mean':'size',as0:number?'mean_value':'row_count',minCount0:'0',ddof0:'1'}};
  if(goal==='trend')return number&&a.dates.length?{type:'rolling',values:{field:number.id,order:a.dates[0].id,by:[],window:'5',minPeriods:'1',fn:'mean',as:'rolling_mean'}}:null;
  if(goal==='reshape'){const values=a.numeric.map(c=>c.id);return {type:'melt',values:{ids:columns.filter(c=>!values.includes(c.id)).map(c=>c.id),values,variable:'variable',value:'value'}};}
  return {type:'filter',values:{match:'and',field0:(number??category).id,operator0:'notMissing',value0:'',upper0:''}};
}
export function schemaSummary(columns,profile=[]){
  const a=assessData(columns,profile),fields=list=>list.length?list.slice(0,3).map(c=>esc(columnLabel(c))).join(' · ')+(list.length>3?` +${list.length-3}`:''):t('workspaceNoFields');
  return `<div class="schema-summary">${[['Numeric',a.numeric],['Categories',a.categories],['Dates',a.dates],['Keys',a.keys]].map(([kind,list])=>`<div><span>${t('workspace'+kind)} <b>${list.length}</b></span><p>${fields(list)}</p></div>`).join('')}</div>${!a.dates.length?`<p class="schema-note">${t('importNoDate')}</p>`:''}${!a.numeric.length?`<p class="schema-note">${t('importNoNumeric')}</p>`:''}`;
}
export function workspaceAssistant(app){
  const s=app.snapshot,a=assessData(s.columns,s.profile?.columns),names={clean:'goalClean',filter:'goalFilter',group:'goalGroup',trend:'goalTrend'};
  return `<section class="workspace-assistant" id="workspace-start"><div class="workspace-current"><div><span class="eyebrow">${t('workspaceCurrent')}</span><strong>${esc(app.name(s.activeId))}</strong><span>${fmt(s.rows,0)} ${t('rows')} × ${s.columns?.length??0} ${t('columns')}</span></div><button class="text-button" data-action="data-format-help">${t('workspaceFormats')} ↗</button></div><ol class="workspace-roadmap">${[1,2,3,4].map(i=>`<li><span>0${i}</span><div><strong>${t('workspaceStep'+i)}</strong><small>${t('workspaceStep'+i+'Help')}</small></div></li>`).join('')}</ol>${s.provenance?.parseOptions?.rowMeaning?`<p class="workspace-row-meaning">${t('importRowLabel')} · ${esc(s.provenance.parseOptions.rowMeaning)}</p>`:''}<details class="workspace-schema"><summary>${t('workspaceSchema')}<span>${a.numeric.length} ${t('workspaceNumeric')} · ${a.dates.length} ${t('workspaceDates')}</span></summary><p>${t('workspaceGeneric')}</p><p>${t('workspaceBranchNote')}</p>${schemaSummary(s.columns,s.profile?.columns)}</details><div class="workspace-goal-heading"><h2>${t('workspaceNext')}</h2><span>${t('workspaceMore')}</span></div><div class="workspace-goals">${Object.entries(names).map(([goal,key])=>{const disabled=goal==='clean'?!a.missing.length:goal==='trend'?(!a.dates.length||!a.numeric.length):false;return `<button data-workspace-goal="${goal}" ${disabled?'disabled':''}><strong>${t(key)} <span>↗</span></strong><small>${t(disabled?(goal==='clean'?'noMissingGoal':'noTimeGoal'):key+'Hint')}</small><code>${({clean:'fillna() / dropna()',filter:'.loc[mask]',group:'groupby() + agg()',trend:'sort_values() + rolling()'})[goal]}</code></button>`;}).join('')}</div></section>`;
}
