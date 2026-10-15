import {renderChart} from '../charts/render.js';
import {missingFeedback,rollingFeedback} from '../charts/operation-feedback.js';
import {getLocale,t,fmt} from '../i18n/locale.js';
import {esc,$} from './utils.js';

export function drawFeedback(host,p,{onField}={}) {
  if(!host||!p)return;
  const type=p.spec.type, params=p.spec.params, options={locale:getLocale(),title:t(type)};
  host.innerHTML='';
  if(type==='merge') {
    const r=p.report,left=p.inputs[0],right=p.inputs[1];
    const keyNames=(table,refs)=>refs.map(ref=>table.columns.find(c=>c.id===ref||c.name===ref)?.name??ref).join(' + ');
    host.innerHTML=`<div class="join-tables"><div><small>${t('component055')}</small><strong>${esc(left.fileName)}</strong><span>${fmt(r.leftRows,0)} ${t('rows')} · ${esc(keyNames(left,params.leftOn??[params.on].flat()))}</span></div><code>${esc(params.how??'inner')}<br>merge()</code><div><small>${t('rightTable')}</small><strong>${esc(right.fileName)}</strong><span>${fmt(r.rightRows,0)} ${t('rows')} · ${esc(keyNames(right,params.rightOn??[params.on].flat()))}</span></div></div><div class="feedback-metrics">${[
      [t('component056'),r.matched], [t('unmatchedLeft'),r.unmatchedLeft],[t('unmatchedRight'),r.unmatchedRight],
      [t('component057'),r.estimatedRows],[t('component058'),r.leftDuplicateKeys],[t('component059'),r.rightDuplicateKeys],
      [t('component060'),r.manyToManyKeys],[t('expansion'),r.expansion]
    ].map(([label,value])=>`<div><small>${label}</small><strong>${fmt(value,2)}</strong></div>`).join('')}</div><p class="hint">${t('component061')}</p><div class="chart-host" data-join-chart></div><details><summary>${t('component062')} (${Math.min(30,r.keyRelationsTotal)} / ${r.keyRelationsTotal})</summary><div class="table-scroll"><table><thead><tr>${[t('component063'),t('component064'),t('component065'),t('component066')].map(v=>`<th>${v}</th>`).join('')}</tr></thead><tbody>${r.keyRelations.map(k=>`<tr><td>${esc(k.key.map(v=>v??'∅').join(' / '))}</td><td>${k.left}</td><td>${k.right}</td><td>${k.pairs}</td></tr>`).join('')}</tbody></table></div></details>`;
    renderChart($('[data-join-chart]',host),'bar',{bars:[[t('component067'),r.matchedLeft],[t('unmatchedLeft'),r.unmatchedLeft],[t('component068'),r.matchedRight],[t('unmatchedRight'),r.unmatchedRight]].map(([key,value])=>({key,value})),fields:{metric:{name:t('rows')}},aggregate:'size'},{...options,title:t('joinPreview')});
  } else if(type==='group') {
    const g=p.groups,metric=g.metrics[0];
    host.innerHTML=`<div class="split-apply-combine"><span>① ${t('component069')}<strong>${esc(g.keys.join(' + '))}</strong></span><span>② ${t('component070')}<strong>${g.metrics.map(m=>`${esc(m.fieldName)} · ${esc(m.fn)}`).join('<br>')}</strong></span><span>③ ${t('component071')}<strong>${fmt(g.count,0)} ${t('component072')}</strong></span></div><p class="hint">${t('component073')}: ${g.includedRows} / ${g.inputRows} ${t('component074')}</p><div class="chart-host" data-group-values></div><div class="chart-host" data-group-counts></div><p class="hint">${t('component075')}</p>`;
    renderChart($('[data-group-values]',host),'bar',{bars:g.items,fields:{metric:{name:`${metric.as} = ${metric.fn}(${metric.fieldName})`}},aggregate:metric.fn,grain:{kind:'group'}},{...options,caption:`${metric.as} = ${metric.fn}(${metric.fieldName})`,title:t('group')});
    renderChart($('[data-group-counts]',host),'bar',{bars:g.items.map(d=>({...d,value:d.sourceCount})),fields:{metric:{name:t('component076')}},grain:{kind:'group'}},{...options,caption:t('component077'),title:t('component078')});
  } else if(type==='rolling') {
    const r=p.rolling;
    host.innerHTML=`<p class="hint">${t('component079')}: ${esc(r.order)} ↑ · ${t('component080')}: ${esc(r.by.join(' + ')||t('component081'))} · window=${r.window} ${t('component082')} · min_periods=${r.minPeriods} · ${r.fn}</p><div class="chart-host" data-rolling-chart></div>`;
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
      host.insertAdjacentHTML('beforeend',`<p class="hint">${t('component083')}: ${esc(p.focus)}</p><div class="comparison-grid"><div><h4>${t('before')}</h4><div class="chart-host" data-before-chart></div></div><div><h4>${t('after')}</h4><div class="chart-host" data-after-chart></div></div></div>`);
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
