import {isNumericColumn} from '../data/semantics.js';
import { ensure } from './errors.js';
import { columnValues, rowCount, field } from './dataset.js';
export const numeric = values => values.filter(v => typeof v === 'number' && Number.isFinite(v));
export function quantile(values, q) {
  ensure(q >= 0 && q <= 1, 'INVALID_QUANTILE');
  const sorted = numeric(values).sort((a, b) => a - b); if (!sorted.length) return null;
  const index = (sorted.length - 1) * q, low = Math.floor(index);
  return sorted[low] + (sorted[Math.ceil(index)] - sorted[low]) * (index - low);
}
export function aggregate(values, fn, options = {}) {
  const nonnull = values.filter(v => v !== null);
  if (fn === 'size') return values.length;
  if (fn === 'count') return nonnull.length;
  if (fn === 'nunique') return new Set(nonnull.map(v => JSON.stringify(v))).size;
  ensure(['sum', 'mean', 'median', 'min', 'max', 'std', 'var'].includes(fn), 'INVALID_AGG', { fn });
  ensure(nonnull.every(v => typeof v === 'number' || typeof v === 'boolean'), 'NUMERIC_REQUIRED');
  const nums = nonnull.map(Number);
  let mean = 0, m2 = 0, sum = 0;
  nums.forEach((v, i) => { const d = v - mean; mean += d / (i + 1); m2 += d * (v - mean); sum += v; });
  if (fn === 'sum') return nums.length < (options.minCount ?? 0) ? null : sum;
  if (!nums.length) return null;
  if (fn === 'mean') return mean;
  if (fn === 'median') return quantile(nums, .5);
  if (fn === 'min') return nums.reduce((a, b) => Math.min(a, b));
  if (fn === 'max') return nums.reduce((a, b) => Math.max(a, b));
  const ddof = options.ddof ?? 1;
  ensure(Number.isInteger(ddof) && ddof >= 0, 'INVALID_DDOF');
  if (nums.length <= ddof) return null;
  const variance = m2 / (nums.length - ddof); return fn === 'std' ? Math.sqrt(variance) : variance;
}
export function valueCounts(values, { dropna = false, normalize = false } = {}) {
  const counts = new Map();
  for (const value of values) if (!(value === null && dropna)) counts.set(value, (counts.get(value) ?? 0) + 1);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return [...counts].map(([value, count]) => ({ value, count, proportion: total ? count / total : null, result: normalize ? count / total : count }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value), 'en'));
}
export function profile(table) {
  return { rows: rowCount(table), columns: table.columns.map(c => {
    const vals = columnValues(table, c.id), missing = vals.filter(v => v === null).length;
    const base = { ...c, count: vals.length - missing, missing, missingRate: vals.length ? missing / vals.length : null, unique: new Set(vals.filter(v=>v!==null)).size };
    if (isNumericColumn(c)) return { ...base,
      ...Object.fromEntries(['mean', 'median', 'min', 'max', 'std', 'var'].map(fn => [fn, aggregate(vals, fn)])),
      q1: quantile(vals, .25), q3: quantile(vals, .75) };
    return { ...base, values: valueCounts(vals) };
  }) };
}
export function correlation(table, fields, minPeriods = 2) {
  ensure(Number.isInteger(minPeriods) && minPeriods >= 2, 'INVALID_MIN_PERIODS');
  fields.forEach(ref => ensure(isNumericColumn(field(table, ref)), 'NUMERIC_REQUIRED', { field: ref }));
  return fields.flatMap(x => fields.map(y => {
    const xs = columnValues(table, x), ys = columnValues(table, y), pairs = xs.map((v, i) => [v, ys[i]]).filter(p => p.every(v => typeof v === 'number'));
    const n = pairs.length;
    const mx = n ? aggregate(pairs.map(p => p[0]), 'mean') : 0, my = n ? aggregate(pairs.map(p => p[1]), 'mean') : 0;
    let xx = 0, yy = 0, xy = 0;
    for (const [a, b] of pairs) { xx += (a - mx) ** 2; yy += (b - my) ** 2; xy += (a - mx) * (b - my); }
    return { x: field(table, x).name, y: field(table, y).name, n, value: n < minPeriods || !xx || !yy ? null : Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))) };
  }));
}
