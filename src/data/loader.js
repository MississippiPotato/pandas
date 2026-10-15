import { createTable } from '../core/dataset.js';
import { ensure } from '../core/errors.js';
import { inferType, convert } from './schema.js';
export const LIMITS = Object.freeze({ bytes: 50 * 1024 * 1024, rows: 100000, columns: 200, cells: 5000000 });
export async function sha256(text) {
  const bytes = typeof text === 'string' ? new TextEncoder().encode(text) : text;
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(n => n.toString(16).padStart(2, '0')).join('');
}
// Strict state machine: stop malformed/oversized input before materializing a whole table.
export function parseDelimited(text, delimiter = ',', limits = LIMITS) {
  ensure(delimiter.length === 1 && !['"', '\r', '\n'].includes(delimiter), 'INVALID_DELIMITER');
  text = text.replace(/^\uFEFF/, '');
  const result = []; let row = [], value = '', state = 'plain', line = 1;
  function pushValue() { row.push(value); value = ''; ensure(row.length <= limits.columns, 'COLUMN_LIMIT', { line }); }
  function pushRow() {
    pushValue(); result.push(row); row = [];
    ensure(result.length <= limits.rows + 1 && result.length * result[0].length <= limits.cells + result[0].length, 'ROW_LIMIT', { line });
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (state === 'quoted') {
      if (ch === '"') { if (text[i + 1] === '"') { value += '"'; i++; } else state = 'closed'; }
      else { value += ch; if (ch === '\n') line++; }
    } else if (ch === delimiter) { pushValue(); state = 'plain'; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      pushRow(); state = 'plain'; line++;
    } else if (ch === '"') {
      ensure(state === 'plain' && value.length === 0, 'CSV_QUOTE', { line }); state = 'quoted';
    } else { ensure(state !== 'closed', 'CSV_AFTER_QUOTE', { line }); value += ch; }
  }
  ensure(state !== 'quoted', 'CSV_UNCLOSED_QUOTE', { line });
  if (value.length || row.length || state === 'closed') pushRow();
  ensure(result.length > 0, 'EMPTY_FILE');
  const names = result.shift();
  ensure(names.every(n => n.trim().length) && new Set(names).size === names.length, 'INVALID_HEADER');
  for (let i = 0; i < result.length; i++) ensure(result[i].length === names.length, 'CSV_WIDTH', { row: i + 2, expected: names.length, actual: result[i].length });
  return { names, records: result.map(r => Object.fromEntries(names.map((name, i) => [name, r[i]]))) };
}
export function parseInput(text, options = {}) {
  const limits = { ...LIMITS, ...options.limits };
  ensure(new TextEncoder().encode(text).byteLength <= limits.bytes, 'FILE_LIMIT');
  let names, records;
  if (options.format === 'json') {
    let parsed; try { parsed = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { ensure(false, 'INVALID_JSON'); }
    ensure(Array.isArray(parsed) && parsed.every(r => r && typeof r === 'object' && !Array.isArray(r)), 'JSON_RECORDS');
    records = parsed; names = [...new Set(records.flatMap(r => Object.keys(r)))];
    ensure(names.every(n => n.trim()), 'INVALID_HEADER');
  } else ({ names, records } = parseDelimited(text, options.delimiter ?? (options.format === 'tsv' ? '\t' : ','), limits));
  ensure(records.length <= limits.rows && names.length <= limits.columns && records.length * names.length <= limits.cells, 'TABLE_LIMIT');
  ensure(names.length > 0, 'EMPTY_SCHEMA');
  for (const [i, record] of records.entries()) for (const name of names) {
    const v = record[name]; ensure(v === null || v === undefined || ['number', 'boolean', 'string'].includes(typeof v), 'NESTED_VALUE', { row: i + 1, field: name });
    // JSON.parse materializes IEEE-754 values before schema inference. Refuse
    // numbers that could silently round identifiers or overflow on import.
    if(options.format==='json'&&typeof v==='number')ensure(Number.isFinite(v)&&(!Number.isInteger(v)||Number.isSafeInteger(v)),'JSON_NUMBER',{row:i+1,field:name});
  }
  const tokens = new Set(options.nullTokens ?? []);
  records = records.map(r => Object.fromEntries(names.map(n => {
    const v = r[n] ?? null;
    return [n, v === null || tokens.has(v) || (options.format !== 'json' && v === '') ? null : v];
  })));
  return { names, records };
}
export function prepareImport(text, options = {}) {
  const parsed = parseInput(text, options);
  const schema = parsed.names.map(name => ({ name, type: options.types?.[name] ?? inferType(name, parsed.records.map(r => r[name])) }));
  const errors = []; const records = parsed.records.map((r, row) => Object.fromEntries(schema.map(c => {
    try { return [c.name, convert(r[c.name], c.type)]; }
    catch (error) { errors.push({ row: row + 1, field: c.name, value: r[c.name], code: error.code }); return [c.name, null]; }
  })));
  return { schema, records, errors, rowCount: records.length, preview: records.slice(0, 20) };
}
export async function importText(text, options = {}) {
  const prepared = prepareImport(text, options);
  ensure(!prepared.errors.length || options.errors === 'coerce', 'IMPORT_CONVERSION', { errors: prepared.errors.slice(0, 20), count: prepared.errors.length });
  const sourceHash = await sha256(text);
  const table = createTable(prepared.records, { id: options.id ?? `ds_${sourceHash.slice(0, 12)}`, columns: prepared.schema, sourceHash,
    provenance: { fileName: options.fileName ?? 'data', format: options.format ?? 'csv', parseOptions: options, errors: prepared.errors.length } });
  return { table, report: { rows: prepared.rowCount, columns: prepared.schema.length, invalid: prepared.errors } };
}
export async function importFile(file, options = {}) {
  ensure(file.size <= LIMITS.bytes, 'FILE_LIMIT');
  const buffer = await file.arrayBuffer(); let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { ensure(false, 'INVALID_ENCODING'); }
  const extension = file.name.split('.').pop().toLowerCase();
  ensure(['csv', 'tsv', 'json'].includes(extension), 'UNSUPPORTED_FORMAT', { extension });
  return importText(text, { ...options, format: extension, fileName: file.name });
}
