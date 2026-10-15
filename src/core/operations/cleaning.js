import {isNumericColumn} from '../../data/semantics.js';
import { ensure, unsupported } from '../errors.js';
import { rows, field, columnValues, replace, view, rowCount, keyOf } from '../dataset.js';
import { convert, TYPES } from '../../data/schema.js';
import { aggregate, valueCounts } from '../statistics.js';
import { validateExpression, evaluate, validatePredicate, predicate } from '../expression.js';
export function filter(table, p) {
  unsupported(p, ['predicate']); validatePredicate(table, p.predicate);
  return view(table, table.index.map((_, i) => i).filter(i => predicate(table, i, p.predicate)), 'filter');
}
export function sort(table, p) {
  unsupported(p, ['by', 'ascending', 'naPosition']);
  ensure(Array.isArray(p.by) && p.by.length, 'SORT_KEYS');
  p.by.forEach(c => field(table, c));
  const ascending = Array.isArray(p.ascending) ? p.ascending : p.by.map(() => p.ascending ?? true);
  ensure(ascending.length === p.by.length && ascending.every(v => typeof v === 'boolean'), 'SORT_DIRECTION');
  ensure(['first', 'last'].includes(p.naPosition ?? 'last'), 'SORT_NULL_POSITION');
  const values = p.by.map(c => columnValues(table, c));
  const pos = table.index.map((_, i) => i).sort((a, b) => {
    for (let k = 0; k < values.length; k++) {
      const x = values[k][a], y = values[k][b]; if (x === y) continue;
      if (x === null || y === null) return (x === null ? 1 : -1) * ((p.naPosition ?? 'last') === 'last' ? 1 : -1);
      const c = x < y ? -1 : x > y ? 1 : 0; if (c) return ascending[k] ? c : -c;
    }
    return a - b;
  });
  return view(table, pos, 'sort');
}
export function dropna(table, p) {
  unsupported(p, ['subset', 'how']);
  const refs = p.subset ?? table.columns.map(c => c.id);
  ensure(refs.length && ['any', 'all'].includes(p.how ?? 'any'), 'MISSING_OPTIONS');
  const cols = refs.map(c => columnValues(table, c));
  return view(table, table.index.map((_, i) => i).filter(i => !(p.how === 'all' ? cols.every(c => c[i] === null) : cols.some(c => c[i] === null))), 'dropna');
}
export function fillna(table, p) {
  unsupported(p, ['field', 'method', 'value']); const c = field(table, p.field);
  ensure(['constant', 'mean', 'median', 'mode'].includes(p.method), 'FILL_METHOD');
  if(['mean','median'].includes(p.method))ensure(c.semantic!=='key','NUMERIC_REQUIRED');
  const vals = columnValues(table, c.id);
  let value = p.method === 'constant' ? p.value : p.method === 'mode' ? valueCounts(vals, { dropna: true })[0]?.value ?? null : aggregate(vals, p.method);
  if (p.method === 'mode' && valueCounts(vals, { dropna: true }).filter(v => v.count === valueCounts(vals, { dropna: true })[0]?.count).length > 1) {
    const modes = valueCounts(vals, { dropna: true });
    ensure(modes.some(v => v.count === modes[0].count && v.value === p.value), 'CHOOSE_MODE'); value = p.value;
  }
  ensure(value !== null && value !== undefined, 'NO_FILL_VALUE');
  // A mean can promote a nullable integer column to a floating column.
  const type = c.type === 'integer' && typeof value === 'number' && !Number.isInteger(value) ? 'number' : c.type;
  value = convert(value, type);
  return replace(table, rows(table).map(r => ({ ...r, [c.name]: r[c.name] === null ? value : r[c.name] })), table.columns.map(col => col.id === c.id ? { ...col, type } : col));
}
export function duplicated(table, p = {}) {
  unsupported(p, ['subset', 'keep']);
  const refs = p.subset ?? table.columns.map(c => c.id); ensure(refs.length, 'EMPTY_SUBSET');
  const vals = refs.map(c => columnValues(table, c)); const keep = p.keep ?? 'first';
  ensure(['first', 'last', false].includes(keep), 'DUPLICATE_KEEP');
  const keys = table.index.map((_, i) => keyOf(vals.map(v => v[i]))), groups = new Map();
  keys.forEach((key, i) => { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(i); });
  return keys.map((key, i) => { const group = groups.get(key); return group.length > 1 && (keep === false || i !== group[keep === 'last' ? group.length - 1 : 0]); });
}
export function dedup(table, p) { const mask = duplicated(table, p); return view(table, table.index.map((_, i) => i).filter(i => !mask[i]), 'dedup'); }
export function cast(table, p) {
  unsupported(p, ['field', 'type', 'errors', 'semantic']);
  const c = field(table, p.field); ensure(['key','value'].includes(p.semantic??'value'),'INVALID_TYPE'); ensure(TYPES.includes(p.type), 'INVALID_TYPE'); ensure(['raise', 'coerce'].includes(p.errors ?? 'raise'), 'CONVERSION_ERRORS');
  const invalid = [];
  const data = rows(table).map((r, i) => {
    try { return { ...r, [c.name]: convert(r[c.name], p.type) }; }
    catch (error) { if (p.errors !== 'coerce') throw error; invalid.push(i); return { ...r, [c.name]: null }; }
  });
  const result = replace(table, data, table.columns.map(col => col.id === c.id ? { ...col, type: p.type, semantic:p.semantic??'value' } : col));
  return { table: result, report: { invalidRows: invalid } };
}
export function rename(table, p) {
  unsupported(p, ['field', 'name']); const c = field(table, p.field);
  ensure(typeof p.name === 'string' && p.name.trim() && !table.columns.some(col => col.id !== c.id && col.name === p.name), 'INVALID_NAME');
  // Column storage is keyed by stable field ID, so rename has no data copy.
  return Object.freeze({ ...table, version: table.version + 1, columns: Object.freeze(table.columns.map(col => Object.freeze(col.id === c.id ? { ...col, name: p.name, label:undefined } : col))) });
}
export function select(table, p) {
  unsupported(p, ['fields']); ensure(Array.isArray(p.fields), 'SELECT_FIELDS');
  const cols = p.fields.map(c => field(table, c)); ensure(new Set(cols.map(c => c.id)).size === cols.length, 'DUPLICATE_FIELD');
  return Object.freeze({ ...table, version: table.version + 1, columns: Object.freeze(cols) });
}
export function derive(table, p) {
  unsupported(p, ['name', 'expression', 'type']);
  ensure(typeof p.name === 'string' && p.name.trim() && !table.columns.some(c => c.name === p.name), 'INVALID_NAME');
  validateExpression(table, p.expression);
  const vals = table.index.map((_, i) => evaluate(table, i, p.expression));
  const type = p.type ?? (vals.some(v => typeof v === 'boolean') ? 'boolean' : vals.some(v => typeof v === 'string') ? 'string' : 'number');
  const data = rows(table).map((r, i) => ({ ...r, [p.name]: convert(vals[i], type) }));
  return replace(table, data, [...table.columns, { id: `${table.id}:derived:${p.name}`, name: p.name, type }]);
}
