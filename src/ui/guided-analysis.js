import {t,fmt,getLocale,errorText} from '../i18n/locale.js';
import {esc,$,$$,icon} from './utils.js';
import {columnLabel,diffHTML} from './dataframe-visuals.js';
import {drawJourneyMissing,drawJourneyFill,drawJourneyFilter,drawJourneyRolling,drawJourneyRanking,drawJourneyBalance} from '../charts/journey.js';
const SOURCE='source:example_nba_missing';
const DEFAULTS={field:'minutes',method:'median',minMinutes:20,maxMinutes:60,window:5,player:'Stephen Curry',minGames:5,rankingView:'balance'};
const validStage=value=>Math.max(0,Math.min(4,Number(value)||0));
export class GuidedAnalysis{
  constructor(app){this.app=app;this.stage=0;this.outputs=[SOURCE];this.settings={...DEFAULTS};this.preview=null;this.input=null;this.revision=0;this.finished=false;this.error=null;this.appliedSpecs={};}
  get isComplete(){return this.finished&&this.stage===4;}
  view(){return {outputs:this.outputs,settings:this.settings,finished:this.finished,appliedSpecs:this.appliedSpecs};}
  restore(state){if(!state)return;this.outputs=state.outputs??[SOURCE];this.settings={...this.settings,...state.settings};this.finished=!!state.finished;this.appliedSpecs=state.appliedSpecs??{};}
  async enter(value){
    let state=await this.app.worker.call('snapshot');if(!state.nodes.some(n=>n.id===SOURCE)){await this.app.loadExamples(['nba_missing']);state=await this.app.worker.call('snapshot');}if(!this.outputs.every(id=>state.nodes.some(n=>n.id===id))){this.outputs=[SOURCE];this.appliedSpecs={};this.finished=false;}
    this.stage=Math.min(validStage(value),this.outputs.length-1);this.preview=null;this.error=null;this.revision++;
    await this.load();if(this.stage>0)await this.makePreview();if(this.finished&&this.stage===4){await this.app.worker.call('select',{id:this.outputs[5]});this.app.snapshot=await this.app.worker.call('analyze',{config:{category:'player_name',metric:'mean_points',x:'mean_points',y:'std_points',aggregate:'mean'},limit:500});}
  }
  async load(){
    const id=this.outputs[this.stage];await this.app.worker.call('select',{id});
    this.input=await this.app.worker.call('analyze',{config:{x:'minutes',y:'pts',category:'player_name',date:'game_date',metric:'pts',aggregate:'mean'},limit:8});
    this.app.snapshot=this.input;
    if(this.stage===3){this.players=(await this.app.worker.call('values',{id,field:'player_name'})).map(v=>v.value).filter(Boolean).sort();if(!this.players.includes(this.settings.player))this.settings.player=this.players[0]??'';}
  }
  specs(){const s=this.settings;
    if(this.stage===1)return [{type:'fillna',params:{field:s.field,method:s.method}}];
    if(this.stage===2)return [{type:'filter',params:{predicate:{op:'and',args:[{field:'minutes',op:'between',min:Number(s.minMinutes),max:Number(s.maxMinutes)},{field:'pts',op:'notMissing'}]}}}];
    if(this.stage===3)return [{type:'rolling',params:{field:'pts',by:['player_name'],order:'game_date',window:Number(s.window),minPeriods:Math.min(3,Number(s.window)),fn:'mean',as:'rolling_points'}}];
    if(this.stage===4)return [
      {type:'group',params:{keys:['player_name'],metrics:[{field:'pts',fn:'mean',as:'mean_points'},{field:'pts',fn:'size',as:'appearances'},{field:'pts',fn:'std',as:'std_points'},{field:'minutes',fn:'mean',as:'mean_minutes'}]}},
      {type:'filter',params:{predicate:{field:'appearances',op:'gte',value:Number(s.minGames)}}},
      {type:'sort',params:{by:['mean_points'],ascending:false}}
    ];return [];
  }
  async makePreview(){
    const rev=++this.revision,specs=this.specs();this.error=null;if(!specs.length)return;
    try{const result=await this.app.worker.call('previewSequence',{id:this.outputs[this.stage],specs,selection:this.stage===3?{field:'player_name',op:'eq',value:this.settings.player}:null,limit:this.stage===3?200:this.stage===4?500:40});
      if(rev!==this.revision)return;this.preview={...result,specs};
    }catch(error){if(rev!==this.revision)return;this.preview=null;this.error=errorText(error);}
  }
  async updatePreview(){this.preview=null;this.app.render();await this.makePreview();this.app.render();}
  async apply(){
    const fingerprint=JSON.stringify(this.specs());if(!this.preview||JSON.stringify(this.preview.specs)!==fingerprint)await this.makePreview();if(!this.preview||this.error)return;
    const stage=this.stage;let id=this.outputs[stage];
    // previewSequence validates the entire sequence before any session mutation.
    for(const spec of this.preview.specs){const state=await this.app.worker.call('commit',{spec,inputs:[id]});id=state.activeId;}
    this.outputs=this.outputs.slice(0,stage+1);this.outputs.push(id);this.appliedSpecs[stage]=structuredClone(this.preview.specs);for(const key of Object.keys(this.appliedSpecs))if(Number(key)>stage)delete this.appliedSpecs[key];
    this.finished=stage===4;await this.app.worker.retain();
    if(this.finished){this.app.snapshot=await this.app.worker.call('analyze',{config:{category:'player_name',metric:'mean_points',x:'mean_points',y:'std_points',aggregate:'mean'},limit:500});this.app.render();}
    else this.go(stage+1);
  }
  go(stage){location.hash=`/guide?step=${stage}`;}
  async reset(){this.settings={...DEFAULTS};this.outputs=[SOURCE];this.appliedSpecs={};this.finished=false;this.preview=null;await this.enter(0);await this.app.worker.retain();if(location.hash==='#/guide?step=0')this.app.render();else this.go(0);}
  async toStudio(){await this.app.worker.call('select',{id:this.isComplete?this.outputs[5]:this.outputs[this.stage]});this.app.config=this.stage===4&&this.finished?{category:'player_name',metric:'mean_points',x:'mean_points',y:'std_points',aggregate:'mean'}:{x:'pts',y:'ast',category:'player_name',date:'game_date',metric:'pts',aggregate:'mean'};this.app.chartType=this.stage===4&&this.finished?'bar':'scatter';this.app.draft=null;this.app.channels={};this.app.goto('studio');}
  handleClick(button){const d=button.dataset;if(!('journeyAction'in d)&&!('journeyStep'in d))return false;
    this.app.safe(async()=>{if('journeyStep'in d){this.go(Number(d.journeyStep));return;}switch(d.journeyAction){case 'next':this.outputs[1]=SOURCE;await this.app.worker.retain();this.go(1);break;case 'apply':await this.apply();break;case 'preview':await this.updatePreview();break;case 'reset':await this.reset();break;case 'studio':await this.toStudio();break;case 'csv':case 'python':await this.app.export(d.journeyAction);break;}});return true;
  }
  handleChange(el){if(!el.dataset.journeySetting)return false;const key=el.dataset.journeySetting;this.settings[key]=['minMinutes','maxMinutes','window','minGames'].includes(key)?Number(el.value):el.value;
    if(key==='rankingView'){this.app.render();return true;}this.finished=false;this.app.safe(()=>this.updatePreview());return true;
  }
  sidebar(){return `<aside class="journey-nav"><a class="journey-home" href="#/overview">← ${t('navStory')}</a><p class="eyebrow">${t('journeySteps')}</p><nav aria-label="${t('journeySteps')}">${Array.from({length:5},(_,i)=>`<button data-journey-step="${i}" ${i>=this.outputs.length?'disabled':''} class="${i===this.stage?'current':''}"><span class="journey-step-index">${i<this.outputs.length-1?'✓':String(i+1).padStart(2,'0')}</span><span><strong>${t('journeyShort'+i)}</strong><small>${t('journeyMethods'+i)}</small></span></button>`).join('')}</nav><div class="journey-nav-bottom"><p>${t('journeyOneRow')}</p><button class="text-button" data-journey-action="studio">${t('navStudio')} ↗</button><a href="#/nba">${t('cases')} ↗</a><button class="text-button" data-journey-action="reset" title="${t('journeyRestartNote')}">${t('journeyReset')} ↻</button></div></aside>`;}
  controls(){const s=this.settings,select=(key,label,values)=>`<label>${t(label)}<select data-journey-setting="${key}">${values.map(([v,name])=>`<option value="${esc(v)}" ${String(v)===String(s[key])?'selected':''}>${esc(name)}</option>`).join('')}</select></label>`;
    if(this.stage===0)return `<p class="journey-ready">${icon('check')}${t('journeyReady')}</p><button class="button primary full" data-journey-action="next">${t('journeyNext')}${icon()}</button>`;
    if(this.stage===1)return select('field','journeyFillField',(this.input?.columns??[]).filter(c=>['minutes','pts','fg_pct'].includes(c.name)).map(c=>[c.name,columnLabel(c)]))+select('method','journeyFillChoice',['median','mean'].map(v=>[v,t(v)]))+`<details class="journey-choice-help"><summary>${t('journeyHowChoose')}</summary><p>${t('journeyMedianHelp')}</p></details>`;
    if(this.stage===2)return `<label>${t('journeyMinutesRange')}<div class="journey-range"><input data-journey-setting="minMinutes" type="number" min="0" max="60" step="1" value="${s.minMinutes}" aria-label="${t('min')}"><span>—</span><input data-journey-setting="maxMinutes" type="number" min="0" max="60" step="1" value="${s.maxMinutes}" aria-label="${t('max')}"></div></label><p>${t('journeyFilterHint')}</p>`;
    if(this.stage===3)return select('player','journeyPlayer',(this.players??[]).map(v=>[v,v]))+select('window','journeyWindow',[3,5,7,10].map(v=>[v,`${v}`]))+`<p>${t('journeyWindowHint')}</p>`;
    return select('minGames','journeyMinGames',[1,3,5,8,10].map(v=>[v,`${v}`]))+select('rankingView','journeyRankingView',[['balance',t('journeyRankingBalance')],['bars',t('journeyRankingBars')]])+`<p>${t('journeyRankingHint')}</p>`;
  }
  methodHTML(){return `<details class="journey-code"><summary>${icon('chart')}${t('journeySeeCode')} <code>${t('journeyMethods'+this.stage)}</code></summary><p>${t('jsEngine')}</p><pre><code>${esc(this.stage===0?"df.shape\ndf[['minutes', 'pts', 'fg_pct']].isna().sum()\ndf.describe()":this.preview?.steps.map(s=>s.code).join('\n\n')??'')}</code></pre></details>`;}
  tableHTML(){const records=this.isComplete?this.app.snapshot.records:this.preview?.records??this.input?.records??[],allCols=this.isComplete?this.app.snapshot.columns:this.preview?.columns??this.input?.columns??[];
    const names=this.stage===4?['player_name','mean_points','appearances','std_points','mean_minutes']:['player_name','team','game_date','minutes','pts',...(this.stage===3?['rolling_points']:[])],cols=allCols.filter(c=>names.includes(c.name));
    const label=c=>({mean_points:t('journeyMeanPoints'),appearances:t('journeyAppearances'),std_points:t('journeyStdPoints'),mean_minutes:t('journeyMeanMinutes'),rolling_points:t('journeyRollingPoints')})[c.name]??columnLabel(c);
    return `<details class="journey-records"><summary>${t('journeySeeRows')} <span>${t('journeySample')}</span></summary><div class="table-scroll"><table><thead><tr>${cols.map(c=>`<th>${esc(label(c))}</th>`).join('')}</tr></thead><tbody>${records.slice(0,8).map(r=>`<tr>${cols.map(c=>`<td class="${r[c.name]===null?'null':''}">${r[c.name]===null?t('na'):typeof r[c.name]==='number'?fmt(r[c.name],2):esc(r[c.name])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  }
  resultSummary(){
    const input=this.input,preview=this.preview,cols=input?.profile?.columns??[],value=(label,v)=>`<span><small>${label}</small><strong>${v}</strong></span>`;
    if(this.stage===0)return `<div class="journey-summary">${value(t('journeyGames'),fmt(input?.rows,0))}${value(t('journeyPlayers'),fmt(cols.find(c=>c.name==='player_name')?.unique,0))}${value(t('journeyExerciseGaps'),fmt(cols.filter(c=>['minutes','pts','fg_pct'].includes(c.name)).reduce((n,c)=>n+c.missing,0),0))}</div>`;
    if(this.stage===3)return `<div class="journey-summary">${value(t('journeyInput'),fmt(input?.rows,0))}${value(t('journeyPlayerRows'),fmt(preview?.records.length,0))}${value(t('journeyWindow'),this.settings.window)}</div>`;
    const focused=cols.find(c=>c.name===this.settings.field),target=preview?.profile.columns.find(c=>c.name===this.settings.field),after=this.isComplete?this.app.snapshot.rows:preview?.rows??input?.rows;
    const extra=this.stage===1?value(`${columnLabel(focused??{})} · ${t('missing')}`,`${fmt(focused?.missing,0)} <em>→ ${fmt(target?.missing,0)}</em>`):this.stage===2?value(t('journeyRemoved'),fmt(input?.rows-after,0)):value(t('journeyMinGames'),this.settings.minGames);
    return `<div class="journey-summary">${value(t('journeyInput'),fmt(input?.rows,0))}<span class="journey-arrow">→</span>${value(t(this.stage===4?'journeyEligiblePlayers':this.isComplete?'journeyApplied':'journeyOutput'),fmt(after,0))}${extra}</div>`;
  }
  html(){return `<div class="guided-analysis">${this.sidebar()}<div class="journey-content"><header class="journey-chapter"><span class="chapter-number">0${this.stage+1}</span><div><span class="eyebrow">${t('journeyKicker')}</span><h1>${t('journeyStep'+this.stage)}</h1><p>${t('journeyDesc'+this.stage)}</p></div></header>${this.resultSummary()}${this.isComplete?`<section class="journey-finished"><span>✓</span><div><h2>${t('journeyDone')}</h2><p>${t('journeyDoneText')}</p></div></section>`:''}<div class="journey-stage"><article class="card journey-visual"><div class="journey-chart-heading"><span class="pill">${t('journeyShort'+this.stage)}</span><p>${t(this.stage===4&&this.settings.rankingView==='balance'?'journeyBalanceHint':'journeyLook'+this.stage)}</p></div>${this.stage===0?`<div id="journey-example-row"></div>`:''}<div id="journey-chart" class="journey-chart"></div></article><aside class="card journey-controls"><span class="eyebrow">${t('journeyConfigure')}</span>${this.controls()}${this.stage>0&&!this.isComplete?`<div class="journey-status ${this.error?'error':''}">${esc(this.error??(this.preview?t('journeyReadOnly'):t('journeyPreviewBusy')))}</div><button class="button primary full" data-journey-action="apply" ${this.preview&&!this.error?'':'disabled'}>${t(this.stage===4?'journeyFinish':'journeyApply')}${icon()}</button><button class="text-button" data-journey-action="preview">${t('journeyPreview')} ↻</button>`:''}${this.isComplete?`<button class="button primary full" data-journey-action="csv">${t('journeyDownload')}${icon('download')}</button><button class="button secondary full" data-journey-action="python">${t('journeyDownloadPython')}</button><button class="text-button" data-journey-action="studio">${t('journeyWorkbench')} ↗</button>`:''}</aside></div>${this.preview?.diff&&this.stage<3?`<details class="journey-diff"><summary>${t('journeySeeChanges')}</summary>${diffHTML(this.preview.diff)}</details>`:''}${this.stage===4?`<aside class="journey-reading"><strong>${t('journeyConclusion')}</strong><p>${t('journeyConclusionText')}</p><small>${t('journeyRankingScope')}</small></aside>`:''}${this.methodHTML()}${this.tableHTML()}<details class="journey-source"><summary>${t('journeyPracticeMore')}</summary><p>${t('journeyPracticeDetail')}</p><a href="${import.meta.env.BASE_URL}data/examples/nba-missing-audit.json" target="_blank" rel="noreferrer">${t('auditData')} ↗</a><p>${t('journeySourceNote')}</p></details><footer class="journey-footer"><span>${t('journeyPeriod')}</span>${this.stage>0?`<button class="text-button" data-journey-step="${this.stage-1}">← ${t('journeyPrevious')}</button>`:''}</footer></div></div>`;}
  draw(){const host=$('#journey-chart');if(!host)return;const cols=this.input?.profile?.columns??[];
    const nav=$('.journey-nav nav'),current=$('.journey-nav .current');if(nav&&current&&nav.scrollWidth>nav.clientWidth)nav.scrollLeft=current.offsetLeft-nav.offsetLeft-(nav.clientWidth-current.offsetWidth)/2;
    if(!$('.journey-swipe',host.parentElement))host.insertAdjacentHTML('beforebegin',`<p class="journey-swipe">↔ ${t('journeySwipe')}</p>`);
    if(this.stage===0)drawJourneyMissing(host,cols,{field:this.input?.columns.find(c=>c.name===this.settings.field)?.id,onField:id=>{const c=cols.find(c=>c.id===id);this.settings.field=c.name;this.outputs[1]=SOURCE;this.go(1);}});
    else if(this.stage===1)drawJourneyFill(host,cols.find(c=>c.name===this.settings.field),this.settings.method,method=>{this.settings.method=method;this.app.safe(()=>this.updatePreview());});
    else if(this.stage===2)drawJourneyFilter(host,cols.find(c=>c.name==='minutes'),[this.settings.minMinutes,this.settings.maxMinutes],range=>{[this.settings.minMinutes,this.settings.maxMinutes]=range;this.app.safe(()=>this.updatePreview());});
    else if(this.stage===3)drawJourneyRolling(host,this.preview?.records??[]);
    else (this.settings.rankingView==='balance'?drawJourneyBalance:drawJourneyRanking)(host,this.isComplete?this.app.snapshot.records:this.preview?.records??[]);
    if(this.stage===0){const r=this.input?.records?.[0];if(r)$('#journey-example-row').innerHTML=`<div class="journey-row-example"><strong>${esc(r.player_name)} <small>${r.team} · ${r.game_date}</small></strong><span><b>${r.pts}</b>${t('journeyFieldPoints')}</span><span><b>${fmt(r.minutes,1)}</b>${t('journeyFieldMinutes')}</span></div><p class="journey-row-caption">${t('journeyOneRow')}</p>`;}
  }
}
