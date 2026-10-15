export class DataError extends Error {
  constructor(code, details = {}) { super(code); this.name = 'DataError'; this.code = code; this.details = details; }
}
export function ensure(ok, code, details = {}) { if (!ok) throw new DataError(code, details); }
export function unsupported(options, allowed) {
  for (const key of Object.keys(options)) ensure(allowed.includes(key), 'UNSUPPORTED_PARAMETER', { key });
}
