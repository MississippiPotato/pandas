// A semantic role never changes the stored value or the exported pandas dtype.
export const isNumericColumn = c => ['number','integer'].includes(c?.type) && c.semantic !== 'key';
export function inferSemantic(name, values, type) {
  // Recognize identifier tokens, not words such as Paid or a unique sales amount.
  const tokens=name.replace(/([a-z0-9])([A-Z])/g,'$1_$2');
  if (/(^|[_\s-])(id|code|uuid|zip|postcode|phone)($|[_\s-])/i.test(tokens)) return 'key';
  return 'value';
}
