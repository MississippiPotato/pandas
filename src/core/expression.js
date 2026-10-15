import { ensure } from './errors.js';
import { cell, field } from './dataset.js';
const COMPARE = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'contains', 'startsWith', 'isMissing', 'notMissing'];
export function validatePredicate(table, ast, depth = 0) {
  ensure(ast && depth < 32, 'INVALID_PREDICATE');
  if (['and', 'or'].includes(ast.op)) { ensure(Array.isArray(ast.args) && ast.args.length > 0, 'INVALID_PREDICATE'); ast.args.forEach(a => validatePredicate(table, a, depth + 1)); return; }
  if (ast.op === 'not') { validatePredicate(table, ast.arg, depth + 1); return; }
  ensure(COMPARE.includes(ast.op), 'INVALID_PREDICATE', { op: ast.op });
  const c = field(table, ast.field);
  if (['isMissing', 'notMissing'].includes(ast.op)) return;
  const vals = ast.op === 'between' ? [ast.min, ast.max] : ast.op === 'in' ? ast.values : [ast.value];
  ensure(Array.isArray(vals), 'INVALID_PREDICATE');
  const expected = ['number', 'integer'].includes(c.type) ? 'number' : c.type === 'boolean' ? 'boolean' : 'string';
  ensure(vals.every(v => v === null || typeof v === expected), 'PREDICATE_TYPE', { field: c.name });
  if (ast.op === 'between') ensure(vals.every(v => v !== null) && ast.min <= ast.max && ['both', 'left', 'right', 'neither'].includes(ast.inclusive ?? 'both'), 'INVALID_RANGE');
  if (['contains', 'startsWith'].includes(ast.op)) ensure(expected === 'string', 'TEXT_REQUIRED');
}
export function predicate(table, row, ast) {
  if (ast.op === 'and') return ast.args.every(a => predicate(table, row, a));
  if (ast.op === 'or') return ast.args.some(a => predicate(table, row, a));
  if (ast.op === 'not') return !predicate(table, row, ast.arg);
  const v = cell(table, row, ast.field);
  if (ast.op === 'isMissing') return v === null;
  if (ast.op === 'notMissing') return v !== null;
  if (ast.op === 'in') return ast.values.includes(v);
  if (v === null || ast.value === null) return false;
  switch (ast.op) {
    case 'eq': return v === ast.value; case 'ne': return v !== ast.value;
    case 'gt': return v > ast.value; case 'gte': return v >= ast.value;
    case 'lt': return v < ast.value; case 'lte': return v <= ast.value;
    case 'contains': return v.includes(ast.value); case 'startsWith': return v.startsWith(ast.value);
    case 'between': {
      const inc = ast.inclusive ?? 'both';
      return (['both', 'left'].includes(inc) ? v >= ast.min : v > ast.min) && (['both', 'right'].includes(inc) ? v <= ast.max : v < ast.max);
    }
    default: return false;
  }
}
export function validateExpression(table, ast, depth = 0) {
  ensure(ast && depth < 32, 'INVALID_EXPRESSION');
  if (ast.type === 'field') { field(table, ast.field); return; }
  if (ast.type === 'literal') { ensure(ast.value === null || ['number', 'string', 'boolean'].includes(typeof ast.value), 'INVALID_EXPRESSION'); return; }
  if (ast.type === 'binary') {
    ensure(['+', '-', '*', '/', '>', '>=', '<', '<=', '==', '!='].includes(ast.op), 'INVALID_EXPRESSION');
    validateExpression(table, ast.left, depth + 1); validateExpression(table, ast.right, depth + 1); return;
  }
  ensure(ast.type === 'call' && ['if', 'coalesce', 'abs', 'round'].includes(ast.fn) && Array.isArray(ast.args), 'INVALID_EXPRESSION');
  ensure(ast.fn === 'if' ? ast.args.length === 3 : ast.fn === 'coalesce' ? ast.args.length >= 1 : ast.fn === 'abs' ? ast.args.length === 1 : ast.args.length === 1, 'INVALID_EXPRESSION');
  ast.args.forEach(a => validateExpression(table, a, depth + 1));
}
export function evaluate(table, row, ast) {
  if (ast.type === 'literal') return ast.value;
  if (ast.type === 'field') return cell(table, row, ast.field);
  if (ast.type === 'call') {
    if (ast.fn === 'if') return evaluate(table, row, ast.args[evaluate(table, row, ast.args[0]) === true ? 1 : 2]);
    const args = ast.args.map(a => evaluate(table, row, a));
    if (ast.fn === 'coalesce') return args.find(a => a !== null) ?? null;
    if (args[0] === null) return null;
    ensure(typeof args[0] === 'number', 'NUMERIC_REQUIRED');
    if (ast.fn === 'abs') return Math.abs(args[0]);
    // Banker's rounding, matching pandas/NumPy at integer precision.
    const floor = Math.floor(args[0]), remainder = args[0] - floor;
    return remainder === .5 ? floor + (floor % 2 === 0 ? 0 : 1) : Math.round(args[0]);
  }
  const a = evaluate(table, row, ast.left), b = evaluate(table, row, ast.right);
  if (a === null || b === null) return null;
  if (['==', '!='].includes(ast.op)) return ast.op === '==' ? a === b : a !== b;
  if (['>', '>=', '<', '<='].includes(ast.op)) {
    ensure(typeof a === typeof b, 'EXPRESSION_TYPE');
    return ast.op === '>' ? a > b : ast.op === '>=' ? a >= b : ast.op === '<' ? a < b : a <= b;
  }
  ensure(typeof a === 'number' && typeof b === 'number', 'NUMERIC_REQUIRED');
  const v = ast.op === '+' ? a + b : ast.op === '-' ? a - b : ast.op === '*' ? a * b : b === 0 ? null : a / b;
  return v === null || !Number.isFinite(v) ? null : v;
}
