import {isNumericColumn} from '../../data/semantics.js';
import { ensure, unsupported } from '../errors.js';
import { field, rows, keyOf, resultTable, columnValues } from '../dataset.js';
import { aggregate } from '../statistics.js';
export function validateMetrics(table, metrics) {
  ensure(Array.isArray(metrics) && metrics.length, 'METRICS_REQUIRED');
  metrics.forEach(m => {
    unsupported(m, ['field', 'fn', 'as', 'minCount', 'ddof']);
    ensure(Number.isInteger(m.minCount ?? 0) && (m.minCount ?? 0) >= 0, 'INVALID_MIN_COUNT');
    ensure(Number.isInteger(m.ddof ?? 1) && (m.ddof ?? 1) >= 0, 'INVALID_DDOF');
    const c = field(table, m.field);
    ensure(['sum', 'mean', 'median', 'min', 'max', 'std', 'var', 'count', 'size', 'nunique'].includes(m.fn), 'INVALID_AGG');
    ensure(typeof m.as === 'string' && m.as.trim(), 'METRIC_NAME');
    if (!['count', 'size', 'nunique'].includes(m.fn)) ensure((isNumericColumn(c)||c.type==='boolean'), 'NUMERIC_REQUIRED');
  });
  ensure(new Set(metrics.map(m => m.as)).size === metrics.length, 'DUPLICATE_METRIC');
}
export function group(table, p) {
  unsupported(p, ['keys', 'metrics', 'dropna', 'sort']);
  ensure(Array.isArray(p.keys) && p.keys.length && new Set(p.keys).size === p.keys.length, 'GROUP_KEYS');
  const keys = p.keys.map(k => field(table, k)); validateMetrics(table, p.metrics);
  ensure(!p.metrics.some(m => keys.some(k => k.name === m.as)), 'METRIC_NAME_COLLISION');
  const buckets = new Map(), keyColumns = keys.map(k => table.values[k.id]);
  const metricColumns = p.metrics.map(m => table.values[field(table,m.field).id]);
  for (const index of table.index) {
    const vals = keyColumns.map(column => column[index]); if (p.dropna && vals.includes(null)) continue;
    const key = keyOf(vals); if (!buckets.has(key)) buckets.set(key, { vals, indices: [] }); buckets.get(key).indices.push(index);
  }
  let entries = [...buckets.entries()];
  if (p.sort) entries.sort(([, a], [, b]) => { for (let i = 0; i < keys.length; i++) { const x = a.vals[i], y = b.vals[i]; if (x === y) continue; return x === null ? 1 : y === null ? -1 : x < y ? -1 : 1; } return 0; });
  const output = entries.map(([, bucket]) => Object.fromEntries([
    ...keys.map((k, i) => [k.name, bucket.vals[i]]),
    ...p.metrics.map((m, i) => [m.as, aggregate(bucket.indices.map(index => metricColumns[i][index]), m.fn, m)])
  ]));
  const columns = [...keys, ...p.metrics.map(m => ({ id: `${table.id}:agg:${encodeURIComponent(m.as)}`, name: m.as, type: ['count', 'size', 'nunique'].includes(m.fn) ? 'integer' : 'number' }))];
  const ids = entries.map(([key]) => `${table.id}:group:${key}`);
  const grain = {kind:'group',keys:keys.map(k=>({id:k.id,name:k.name})),metrics:p.metrics.map((m,i)=>({...m,fieldName:field(table,m.field).name,id:columns[keys.length+i].id})),inputRows:table.index.length,
    includedRows:entries.reduce((n,[,b])=>n+b.indices.length,0),samples:Object.fromEntries(entries.map(([,b],i)=>[ids[i],b.indices.length]))};
  return resultTable(table, output, columns, 'group', ids, { keys: keys.map(k => k.id), groups: entries.map(([, b]) => b.vals), grain });
}
export function pivot(table, p, aggregateValues = true) {
  unsupported(p, ['index', 'columns', 'value', 'agg', 'fillValue', 'dropna', 'sort', 'maxCells']);
  ensure(Number.isInteger(p.maxCells ?? 10000) && (p.maxCells ?? 10000)>0 && (p.maxCells ?? 10000)<=10000, 'PIVOT_LIMIT_PARAMETER');
  const refs = (value) => Array.isArray(value) ? value : [value];
  const index = refs(p.index).map(c => field(table, c)), columns = refs(p.columns).map(c => field(table, c)), metric = field(table, p.value);
  ensure(index.length && columns.length && new Set([...index, ...columns].map(c => c.id)).size === index.length + columns.length, 'PIVOT_KEYS');
  if (aggregateValues) validateMetrics(table, [{ field: metric.id, fn: p.agg ?? 'mean', as: 'value' }]);
  const rowKeys = new Map(), colKeys = new Map(), buckets = new Map();
  for (const r of rows(table)) {
    const rv = index.map(c => r[c.name]), cv = columns.map(c => r[c.name]);
    if (p.dropna && [...rv, ...cv].includes(null)) continue;
    const rk = keyOf(rv), ck = keyOf(cv), key = keyOf([rv, cv]);
    rowKeys.set(rk, rv); colKeys.set(ck, cv);
    if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(r[metric.name]);
    ensure(aggregateValues || buckets.get(key).length === 1, 'PIVOT_DUPLICATE', { row: rv, column: cv });
    ensure(rowKeys.size * colKeys.size <= (p.maxCells ?? 10000), 'PIVOT_LIMIT');
  }
  let rEntries = [...rowKeys], cEntries = [...colKeys];
  if (p.sort) { rEntries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0); cEntries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0); }
  const colMeta = cEntries.map(([key, values]) => ({ id: `${table.id}:pivot:${encodeURIComponent(keyOf([columns.map(c=>c.id),values]))}`, name: `pivot_${key}`, type: aggregateValues ? 'number' : metric.type, pivotValues: values }));
  ensure(!colMeta.some(c => index.some(k => k.name === c.name)), 'PIVOT_NAME_COLLISION');
  const output = rEntries.map(([, rv]) => Object.fromEntries([
    ...index.map((c, i) => [c.name, rv[i]]), ...cEntries.map(([, cv], i) => {
      const bucket = buckets.get(keyOf([rv, cv]));
      const v = bucket ? aggregateValues ? aggregate(bucket, p.agg ?? 'mean') : bucket[0] : null;
      return [colMeta[i].name, v === null ? p.fillValue ?? null : v];
    })
  ]));
  return resultTable(table, output, [...index, ...colMeta], 'pivot', rEntries.map(([key]) => `${table.id}:pivot:${key}`), { index: index.map(c => c.id), columns: columns.map(c => c.id), columnKeys: cEntries.map(([, cv]) => cv) });
}
