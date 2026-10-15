import { ensure } from './errors.js';
import { rowCount, columnValues } from './dataset.js';
import * as clean from './operations/cleaning.js';
import { group, pivot } from './operations/group.js';
import { join, concat } from './operations/join.js';
import { rolling, resample } from './operations/time.js';
import { toPandas } from './pandas-code.js';
import {bin,rank,cumulative,transform,melt,datePart} from './operations/advanced.js';
const functions = { filter: clean.filter, sort: clean.sort, dropna: clean.dropna, fillna: clean.fillna,
  dedup: clean.dedup, cast: clean.cast, rename: clean.rename, select: clean.select, derive: clean.derive,
  group, pivot_table: (t, p) => pivot(t, p, true), pivot: (t, p) => pivot(t, p, false), rolling, resample,
  cut:(t,p)=>bin(t,p,false),qcut:(t,p)=>bin(t,p,true),rank,cumsum:cumulative,transform,melt,date_part:datePart };
export const OPERATIONS = Object.freeze([...Object.keys(functions), 'merge', 'concat']);
const missingCount = table => table.columns.reduce((n, c) => n + columnValues(table, c.id).filter(v => v === null).length, 0);
export function execute(inputs, spec, context = {}) {
  ensure(spec && OPERATIONS.includes(spec.type), 'UNKNOWN_OPERATION', { type: spec?.type });
  ensure((spec.version ?? 1) === 1, 'OPERATION_VERSION');
  const tables = Array.isArray(inputs) ? inputs : [inputs];
  ensure(tables.length === (spec.type === 'merge' ? 2 : spec.type === 'concat' ? tables.length : 1) && tables.length > 0, 'INPUT_COUNT');
  if (context.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const raw = spec.type === 'merge' ? join(tables[0], tables[1], spec.params ?? {}) : spec.type === 'concat' ? concat(tables, spec.params ?? {}) : functions[spec.type](tables[0], spec.params ?? {});
  const table = raw.table ?? raw;
  const report = { before: { rows: rowCount(tables[0]), columns: tables[0].columns.length, missing: missingCount(tables[0]) },
    after: { rows: rowCount(table), columns: table.columns.length, missing: missingCount(table) }, ...raw.report };
  const code = toPandas(tables, spec, table);
  return { table, report, pandas: { status: code === null ? 'unavailable' : 'generated-unverified', code,
    note: code === null ? 'Code parity for this parameter combination has not been verified.' : 'Requires the included DataLab input/helper definitions; parity is tested per operation.' } };
}
