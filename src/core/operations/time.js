import {isNumericColumn} from '../../data/semantics.js';
import { ensure, unsupported } from '../errors.js';
import { field, rows, replace, resultTable, keyOf } from '../dataset.js';
import { aggregate } from '../statistics.js';
import { sort } from './cleaning.js';
export function rolling(table, p) {
  unsupported(p, ['field', 'by', 'order', 'window', 'minPeriods', 'fn', 'as']);
  const metric = field(table, p.field), keys = (p.by ?? []).map(k => field(table, k));
  ensure(isNumericColumn(metric), 'NUMERIC_REQUIRED');
  ensure(Number.isInteger(p.window) && p.window > 0 && Number.isInteger(p.minPeriods ?? p.window) && (p.minPeriods ?? p.window) >= 0 && (p.minPeriods ?? p.window) <= p.window, 'ROLLING_WINDOW');
  ensure(['sum', 'mean', 'min', 'max', 'std'].includes(p.fn ?? 'mean'), 'ROLLING_FUNCTION');
  ensure(typeof p.as === 'string' && p.as.trim() && !table.columns.some(c => c.name === p.as), 'INVALID_NAME');
  field(table, p.order);
  const ordered = sort(table, { by: [...keys.map(k => k.id), p.order] }), data = rows(ordered), buckets = new Map();
  const output = data.map(r => {
    const key = keyOf(keys.map(c => r[c.name])); if (!buckets.has(key)) buckets.set(key, []);
    const vals = buckets.get(key); vals.push(r[metric.name]); if (vals.length > p.window) vals.shift();
    const value = vals.filter(v => v !== null).length < (p.minPeriods ?? p.window) ? null : aggregate(vals, p.fn ?? 'mean');
    return { ...r, [p.as]: value };
  });
  return replace(ordered, output, [...ordered.columns, { id: `${table.id}:rolling:${p.as}`, name: p.as, type: 'number' }]);
}
export function bucketStart(value, rule) {
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value); ensure(Number.isFinite(+date), 'INVALID_DATE');
  date.setUTCHours(0, 0, 0, 0);
  if (rule === 'MS') date.setUTCDate(1);
  if (rule === 'W-MON') date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}
export function nextBucket(value, rule) {
  const date = new Date(`${value}T00:00:00Z`);
  if (rule === 'MS') date.setUTCMonth(date.getUTCMonth() + 1); else date.setUTCDate(date.getUTCDate() + (rule === 'W-MON' ? 7 : 1));
  return date.toISOString().slice(0, 10);
}
export function resample(table, p) {
  unsupported(p, ['date', 'by', 'field', 'fn', 'rule', 'as', 'maxBuckets']);
  const date = field(table, p.date), metric = field(table, p.field), keys = (p.by ?? []).map(k => field(table, k));
  ensure(['date', 'datetime'].includes(date.type), 'DATE_REQUIRED');
  ensure(['D', 'W-MON', 'MS'].includes(p.rule), 'RESAMPLE_RULE');
  ensure(['sum','mean','median','min','max','std','var','count','size','nunique'].includes(p.fn??'mean'), 'INVALID_AGG');
  ensure(Number.isInteger(p.maxBuckets??10000)&&(p.maxBuckets??10000)>0&&(p.maxBuckets??10000)<=10000,'RESAMPLE_LIMIT_PARAMETER');
  if(!['count','size','nunique'].includes(p.fn??'mean'))ensure((isNumericColumn(metric)||metric.type==='boolean'),'NUMERIC_REQUIRED');
  ensure(typeof p.as === 'string' && p.as.trim() && ![date, ...keys].some(c => c.name === p.as), 'INVALID_NAME');
  const groups = new Map();
  for (const r of rows(table)) {
    if (r[date.name] === null) continue;
    const kv = keys.map(c => r[c.name]), group = keyOf(kv), bucket = bucketStart(r[date.name], p.rule);
    if (!groups.has(group)) groups.set(group, { kv, bins: new Map(), min: bucket, max: bucket });
    const g = groups.get(group); g.min = g.min < bucket ? g.min : bucket; g.max = g.max > bucket ? g.max : bucket;
    if (!g.bins.has(bucket)) g.bins.set(bucket, []); g.bins.get(bucket).push(r[metric.name]);
  }
  const output = [], ids = [];
  for (const [key, g] of groups) for (let bucket = g.min; bucket <= g.max; bucket = nextBucket(bucket, p.rule)) {
    ensure(output.length < (p.maxBuckets ?? 10000), 'RESAMPLE_LIMIT');
    output.push(Object.fromEntries([[date.name, bucket], ...keys.map((c, i) => [c.name, g.kv[i]]), [p.as, aggregate(g.bins.get(bucket) ?? [], p.fn ?? 'mean')]]));
    ids.push(`${table.id}:resample:${key}:${bucket}`);
  }
  return resultTable(table, output, [{ ...date, type: 'date' }, ...keys, { id: `${table.id}:resample:${p.as}`, name: p.as, type: 'number' }], 'resample', ids);
}
