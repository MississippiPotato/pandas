import { ensure } from './errors.js';
export const isMissing = value => value === null || value === undefined;
export const keyOf = values => JSON.stringify(values.map(v => isMissing(v) ? null : v));
export function createTable(records, options = {}) {
  const id = options.id ?? 'table';
  const names = options.columns?.map(c => typeof c === 'string' ? c : c.name)
    ?? [...new Set(records.flatMap(r => Object.keys(r)))];
  ensure(new Set(names).size === names.length && names.every(n => typeof n === 'string' && n.length), 'INVALID_COLUMNS');
  const columns = names.map((name, i) => {
    const raw = options.columns?.[i], supplied = typeof raw === 'string' ? { name: raw } : raw;
    const values = records.map(r => r[name] ?? null).filter(v => v !== null);
    const type = supplied?.type ?? (values.length && values.every(v => typeof v === 'number') ? 'number'
      : values.length && values.every(v => typeof v === 'boolean') ? 'boolean' : 'string');
    return Object.freeze({ id: supplied?.id ?? `${id}:c${i}`, name, type, nullable: true, ...supplied });
  });
  ensure(new Set(columns.map(c => c.id)).size === columns.length, 'DUPLICATE_FIELD_ID');
  const values = Object.create(null);
  for (const c of columns) {
    values[c.id] = Object.freeze(records.map((r, row) => {
      const value = r[c.name] ?? null;
      ensure(value === null || ['string', 'boolean', 'number'].includes(typeof value), 'NESTED_VALUE', { field: c.name, row });
      ensure(typeof value !== 'number' || Number.isFinite(value), 'NONFINITE_VALUE', { field: c.name, row });
      return value;
    }));
  }
  const rowIds = options.rowIds ?? records.map((_, i) => `${options.sourceHash ?? id}:${i}`);
  ensure(rowIds.length === records.length && new Set(rowIds).size === rowIds.length, 'INVALID_ROW_IDS');
  return Object.freeze({ id, version: options.version ?? 1, sourceHash: options.sourceHash ?? null,
    provenance: Object.freeze({ ...options.provenance }), columns: Object.freeze(columns), values: Object.freeze(values),
    rowIds: Object.freeze([...rowIds]), index: Object.freeze(records.map((_, i) => i)),
    lineage: Object.freeze(options.lineage ?? { kind: 'source' }) });
}
export function field(table, ref) {
  const column = table.columns.find(c => c.id === ref) ?? table.columns.find(c => c.name === ref);
  ensure(column, 'FIELD_NOT_FOUND', { field: ref }); return column;
}
export function cell(table, row, ref) { return table.values[field(table, ref).id][table.index[row]]; }
export function columnValues(table, ref) { const c = field(table, ref); return table.index.map(i => table.values[c.id][i]); }
export function rowCount(table) { return table.index.length; }
export function rows(table, start = 0, count = rowCount(table)) {
  return table.index.slice(start, start + count).map(index => Object.fromEntries(table.columns.map(c => [c.name, table.values[c.id][index]])));
}
export function visibleIds(table) { return table.index.map(i => table.rowIds[i]); }
export function view(table, positions, kind) {
  return Object.freeze({ ...table, version: table.version + 1,
    index: Object.freeze(positions.map(i => table.index[i])), lineage: Object.freeze({ kind, input: table.id }) });
}
export function replace(table, records, columns = table.columns, options = {}) {
  return createTable(records, { id: table.id, version: table.version + 1, columns,
    rowIds: visibleIds(table), sourceHash: table.sourceHash, provenance: table.provenance,
    lineage: { kind: 'row-transform', input: table.id }, ...options });
}
export function resultTable(table, records, columns, kind, rowIds, metadata = {}) {
  return createTable(records, { id: `${table.id}:${kind}`, version: table.version + 1, columns, rowIds,
    lineage: { kind, input: table.id, ...metadata } });
}
export function copyTable(table) {
  return createTable(rows(table), { ...table, rowIds: visibleIds(table), columns: table.columns });
}
