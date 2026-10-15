import { rows } from './dataset.js';
export function exportCSV(table, { bom = false } = {}) {
  const quote = v => { const text = v === null ? '' : String(v); return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; };
  return (bom ? '\uFEFF' : '') + [table.columns.map(c => quote(c.name)).join(','), ...rows(table).map(r => table.columns.map(c => quote(r[c.name])).join(','))].join('\r\n') + '\r\n';
}
