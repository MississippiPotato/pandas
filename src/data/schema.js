import { ensure, DataError } from '../core/errors.js';
export const TYPES = ['string', 'category', 'number', 'integer', 'boolean', 'date', 'datetime'];
export function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}
export function convert(value, type) {
  ensure(TYPES.includes(type), 'INVALID_TYPE', { type });
  if (value === null || value === undefined) return null;
  if (type === 'string' || type === 'category') return String(value);
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === 'false') return value === 'true';
    throw new DataError('INVALID_VALUE', { value, type });
  }
  if (type === 'date') { ensure(isoDate(value), 'INVALID_VALUE', { value, type }); return value; }
  if (type === 'datetime') {
    ensure(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value)
      && isoDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value))
      && +value.slice(11, 13) < 24 && +value.slice(14, 16) < 60 && +value.slice(17, 19) < 60,
    'INVALID_VALUE', { value, type });
    return new Date(value).toISOString();
  }
  ensure(typeof value !== 'boolean' && String(value).trim() !== '' && /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(String(value)), 'INVALID_VALUE', { value, type });
  const parsed = Number(value);
  ensure(Number.isFinite(parsed) && (type !== 'integer' || Number.isSafeInteger(parsed)), 'INVALID_VALUE', { value, type });
  ensure(!Number.isInteger(parsed) || Number.isSafeInteger(parsed), 'UNSAFE_INTEGER', { value });
  return parsed;
}
export function inferType(name, values) {
  const nonempty = values.filter(v => v !== null && v !== undefined);
  if (!nonempty.length) return 'string';
  if (/(^|[_\s])(id|code|zip|postcode|phone)($|[_\s])/i.test(name)
    || nonempty.some(v => typeof v === 'string' && /^[-+]?0\d+/.test(v))) return 'string';
  for (const type of ['boolean', 'integer', 'number', 'date', 'datetime']) {
    try { nonempty.forEach(v => convert(v, type)); return type; } catch { /* Try the next strict type. */ }
  }
  return 'string';
}
