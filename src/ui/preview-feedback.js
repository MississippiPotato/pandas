import {renderChart} from '../charts/render.js';
import {missingFeedback,rollingFeedback} from '../charts/operation-feedback.js';
import {getLocale,t,fmt} from '../i18n/locale.js';
import {local} from './operation-catalog.js';
import {esc,$} from './utils.js';

export function drawFeedback(host,p,{onField}={}) {
  if(!host||!p)return;
  const type=p.spec.type, params=p.spec.params, options={locale:getLocale(),title:t(type)};
  host.innerHTML='';
  if(type==='merge') {
    const r=p.report,left=p.inputs[0],right=p.inputs[1];
    const keyNames=(table,refs)=>refs.map(ref=>table.columns.find(c=>c.id===ref||c.name===ref)?.name??ref).join(' + ');
    host.innerHTML=`<div class="join-tables"><div><small>${local(['左表 · 当前已应用结果','Left · current applied result'])}</small><strong>${esc(left.fileName)}</strong><span>${fmt(r.leftRows,0)} ${t('rows')} · ${esc(keyNames(left,params.leftOn??[params.on].flat()))}</span></div><code>${esc(params.how??'inner')}<br>merge()</code><div><small>${t('rightTable')}</small><strong>${esc(right.fileName)}</strong><span>${fmt(r.rightRows,0)} ${t('rows')} · ${esc(keyNames(right,params.rightOn??[params.on].flat()))}</span></div></div><div class="feedback-metrics">${[
      [local(['匹配结果对数','Matched output pairs']),r.matched], [t('unmatchedLeft'),r.unmatchedLeft],[t('unmatchedRight'),r.unmatchedRight],
      [local(['输出行数','Output rows']),r.estimatedRows],[local(['左表重复键组数','Left duplicate-key groups']),r.leftDuplicateKeys],[local(['右表重复键组数','Right duplicate-key groups']),r.rightDuplicateKeys],
      [local(['多对多键组数','Many-to-many key groups']),r.manyToManyKeys],[t('expansion'),r.expansion]
    ].map(([label,value])=>`<div><small>${label}</small><strong>${fmt(value,2)}</strong></div>`).join('')}</div><p class="hint">${local(['未匹配数按各输入表的行数计算；匹配结果对数会因重复键增加，并非匹配的源记录数。空键可互相匹配。','Unmatched counts refer to input rows. Matched output pairs increase with duplicate keys and are not counts of distinct matched input rows. Null keys can match.'])}</p><div class="chart-host" data-join-chart></div><details><summary>${local(['逐键匹配关系','Matches by key'])} (${Math.min(30,r.keyRelationsTotal)} / ${r.keyRelationsTotal})</summary><div class="table-scroll"><table><thead><tr>${[local(['键值','Key']),local(['左记录','Left rows']),local(['右记录','Right rows']),local(['匹配输出 = 左 × 右','Matched output = left × right'])].map(v=>`<th>${v}</th>`).join('')}</tr></thead><tbody>${r.keyRelations.map(k=>`<tr><td>${esc(k.key.map(v=>v??'∅').join(' / '))}</td><td>${k.left}</td><td>${k.right}</td><td>${k.pairs}</td></tr>`).join('')}</tbody></table></div></details>`;
    renderChart($('[data-join-chart]',host),'bar',{bars:[[local(['左表已匹配','Left matched']),r.matchedLeft],[t('unmatchedLeft'),r.unmatchedLeft],[local(['右表已匹配','Right matched']),r.matchedRight],[t('unmatchedRight'),r.unmatchedRight]].map(([key,value])=>({key,value})),fields:{metric:{name:t('rows')}},aggregate:'size'},{...options,title:t('joinPreview')});
  } else if(type==='group') {
    const g=p.groups,metric=g.metrics[0];
    host.innerHTML=`<div class="split-apply-combine"><span>① ${local(['拆分','Split'])}<strong>${esc(g.keys.join(' + '))}</strong></span><span>② ${local(['计算','Apply'])}<strong>${g.metrics.map(m=>`${esc(m.fieldName)} · ${esc(m.fn)}`).join('<br>')}</strong></span><span>③ ${local(['合并结果','Combine'])}<strong>${fmt(g.count,0)} ${local(['组','groups'])}</strong></span></div><p class="hint">${local(['统计范围','Statistical scope'])}: ${g.includedRows} / ${g.inputRows} ${local(['输入行参与分组；n 为每组输入行数，包含指标缺失值。','input rows included. n counts each group’s input rows, including missing metric values.'])}</p><div class="chart-host" data-group-values></div><div class="chart-host" data-group-counts></div><p class="hint">${local(['展示前 30 组，条形图最多 15 组；计算和导出包含全部组。','First 30 groups available here, up to 15 drawn; calculations and exports contain all groups.'])}</p>`;
    renderChart($('[data-group-values]',host),'bar',{bars:g.items,fields:{metric:{name:`${metric.as} = ${metric.fn}(${metric.fieldName})`}},aggregate:metric.fn,grain:{kind:'group'}},{...options,caption:`${metric.as} = ${metric.fn}(${metric.fieldName})`,title:t('group')});
    renderChart($('[data-group-counts]',host),'bar',{bars:g.items.map(d=>({...d,value:d.sourceCount})),fields:{metric:{name:local(['每组输入行数 · size()','Input rows per group · size()'])}},grain:{kind:'group'}},{...options,caption:local(['每组输入行数 · size()，不是 count()','Input rows per group · size(), not count()']),title:local(['分组样本数','Group sample counts'])});
  } else if(type==='rolling') {
    const r=p.rolling;
    host.innerHTML=`<p class="hint">${local(['排序','Order'])}: ${esc(r.order)} ↑ · ${local(['分组范围','Partitions'])}: ${esc(r.by.join(' + ')||local(['全表','Whole table']))} · window=${r.window} ${local(['行','rows'])} · min_periods=${r.minPeriods} · ${r.fn}</p><div class="chart-host" data-rolling-chart></div>`;
    rollingFeedback($('[data-rolling-chart]',host),r,options);
  } else if(type.startsWith('pivot')) {
    host.innerHTML='<div class="chart-host" data-result-chart></div>';
    renderChart($('[data-result-chart]',host),'heatmap',p.charts,options);
  } else {
    if(['fillna','dropna','cast'].includes(type)) {
      host.innerHTML=`<div class="chart-host missing-summary" data-missing-chart></div>`;
      missingFeedback($('[data-missing-chart]',host),p.missing,{...options,onField});
    }
    if(p.beforeCharts.histogram.length&&p.charts.histogram.length) {
      host.insertAdjacentHTML('beforeend',`<p class="hint">${local(['数值分布使用相同分箱边界，纵轴为频数；关注字段','Distributions use the same bin edges; vertical axes show frequency. Focus field'])}: ${esc(p.focus)}</p><div class="comparison-grid"><div><h4>${t('before')}</h4><div class="chart-host" data-before-chart></div></div><div><h4>${t('after')}</h4><div class="chart-host" data-after-chart></div></div></div>`);
      // Share the vertical frequency scale as well as the bin domain.
      const histogramMax=Math.max(...p.beforeCharts.histogram.map(b=>b.count),...p.charts.histogram.map(b=>b.count),1);
      renderChart($('[data-before-chart]',host),'histogram',p.beforeCharts,{...options,histogramMax,title:t('before')});
      renderChart($('[data-after-chart]',host),'histogram',p.charts,{...options,histogramMax,title:t('after')});
    } else if(!['fillna','dropna','cast'].includes(type)) {
      host.innerHTML=`<div class="comparison-grid"><div><h4>${t('before')}</h4><div class="chart-host" data-before-chart></div></div><div><h4>${t('after')}</h4><div class="chart-host" data-after-chart></div></div></div>`;
      missingFeedback($('[data-before-chart]',host),p.missing.map(f=>({...f,after:f.before,afterRows:f.beforeRows})),{...options,onField});missingFeedback($('[data-after-chart]',host),p.missing,{...options,onField});
    }
  }
}
