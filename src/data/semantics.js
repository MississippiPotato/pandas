// A semantic role never changes the stored value or the exported pandas dtype.
export const isNumericColumn = c => ['number','integer'].includes(c?.type) && c.semantic !== 'key';
export function inferSemantic(name, values, type) {
  if (/(^id$|_id$|id$|^code$|_code$|^uuid$)/i.test(name)) return 'key';
  const valid=values.filter(v=>v!==null&&v!==undefined);
  if (type==='integer' && valid.length && new Set(valid).size/valid.length>.95 && valid.every(v=>Math.abs(Number(v))>1000)) return 'key';
  return 'value';
}
