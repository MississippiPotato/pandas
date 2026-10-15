import { ensure, unsupported } from '../errors.js';
import { field, rows, keyOf, visibleIds, resultTable, createTable } from '../dataset.js';
const refs = value => Array.isArray(value) ? value : [value];
export function join(left, right, p) {
  unsupported(p, ['on', 'leftOn', 'rightOn', 'how', 'suffixes', 'validate', 'maxRows']);
  const how = p.how ?? 'inner'; ensure(['inner', 'left', 'right', 'outer'].includes(how), 'JOIN_HOW');
  ensure(Number.isInteger(p.maxRows ?? 100000) && (p.maxRows ?? 100000) > 0 && (p.maxRows ?? 100000) <= 100000, 'JOIN_LIMIT_PARAMETER');
  const lk = refs(p.on ?? p.leftOn).map(c => field(left, c)), rk = refs(p.on ?? p.rightOn).map(c => field(right, c));
  ensure(lk.length === rk.length && lk.length > 0, 'JOIN_KEYS');
  lk.forEach((c, i) => ensure(c.type === rk[i].type || (['integer', 'number'].includes(c.type) && ['integer', 'number'].includes(rk[i].type)), 'JOIN_KEY_TYPE', { left: c.name, right: rk[i].name }));
  const lrows = rows(left), rrows = rows(right), lIDs = visibleIds(left), rIDs = visibleIds(right);
  const lkeys = lrows.map(r => keyOf(lk.map(c => r[c.name]))), rkeys = rrows.map(r => keyOf(rk.map(c => r[c.name])));
  const bucket = keys => { const map = new Map(); keys.forEach((k, i) => { if (!map.has(k)) map.set(k, []); map.get(k).push(i); }); return map; };
  const lm = bucket(lkeys), rm = bucket(rkeys);
  const validate = p.validate ?? 'many_to_many';
  ensure(['one_to_one', 'one_to_many', 'many_to_one', 'many_to_many'].includes(validate), 'JOIN_VALIDATE');
  if (['one_to_one', 'one_to_many'].includes(validate)) ensure([...lm.values()].every(v => v.length === 1), 'JOIN_LEFT_DUPLICATE');
  if (['one_to_one', 'many_to_one'].includes(validate)) ensure([...rm.values()].every(v => v.length === 1), 'JOIN_RIGHT_DUPLICATE');
  let estimate = 0, unmatchedLeft = 0, unmatchedRight = 0;
  for (const [k, inds] of lm) { const n = rm.get(k)?.length ?? 0; estimate += n ? inds.length * n : ['left', 'outer'].includes(how) ? inds.length : 0; if (!n) unmatchedLeft += inds.length; }
  for (const [k, inds] of rm) if (!lm.has(k)) { unmatchedRight += inds.length; if (['right', 'outer'].includes(how)) estimate += inds.length; }
  ensure(estimate <= (p.maxRows ?? 100000), 'JOIN_LIMIT', { estimate, maxRows: p.maxRows ?? 100000 });
  const suffixes = p.suffixes ?? ['_x', '_y']; ensure(Array.isArray(suffixes) && suffixes.length === 2 && suffixes.every(s => typeof s === 'string'), 'JOIN_SUFFIXES');
  const sharedKeys = new Map(lk.filter((c, i) => c.name === rk[i].name).map(c => [c.name, c]));
  const rightCols = right.columns.filter(c => !sharedKeys.has(c.name));
  const collisions = new Set(left.columns.filter(c => rightCols.some(r => r.name === c.name)).map(c => c.name));
  const outputCols = [
    ...left.columns.map(c => ({ ...c, name: c.name + (collisions.has(c.name) ? suffixes[0] : ''), side: 'left', original: c.name })),
    ...rightCols.map(c => ({ ...c, id: `join-right:${c.id}`, name: c.name + (collisions.has(c.name) ? suffixes[1] : ''), side: 'right', original: c.name }))
  ];
  ensure(new Set(outputCols.map(c => c.name)).size === outputCols.length, 'JOIN_NAME_COLLISION');
  const pairs = [];
  if (how === 'right') {
    rkeys.forEach((key, j) => { const matches = lm.get(key) ?? [null]; matches.forEach(i => pairs.push([i, j])); });
  } else {
    lkeys.forEach((key, i) => { const matches = rm.get(key) ?? (['left', 'outer'].includes(how) ? [null] : []); matches.forEach(j => pairs.push([i, j])); });
    if (how === 'outer') rkeys.forEach((key, j) => { if (!lm.has(key)) pairs.push([null, j]); });
  }
  if (how === 'outer') pairs.sort((a, b) => {
    const av = a[0] === null ? rk.map(c => rrows[a[1]][c.name]) : lk.map(c => lrows[a[0]][c.name]);
    const bv = b[0] === null ? rk.map(c => rrows[b[1]][c.name]) : lk.map(c => lrows[b[0]][c.name]);
    for (let k = 0; k < av.length; k++) { if (av[k] === bv[k]) continue; return av[k] === null ? 1 : bv[k] === null ? -1 : av[k] < bv[k] ? -1 : 1; } return 0;
  });
  const output = pairs.map(([i, j]) => Object.fromEntries(outputCols.map(c => {
    let v = c.side === 'left' ? i === null ? null : lrows[i][c.original] : j === null ? null : rrows[j][c.original];
    if (c.side === 'left' && i === null && sharedKeys.has(c.original) && j !== null) v = rrows[j][c.original];
    return [c.name, v];
  })));
  return { table: resultTable(left, output, outputCols, 'join', pairs.map(([i, j]) => keyOf(['join', i === null ? null : lIDs[i], j === null ? null : rIDs[j]])),
    { rightInput: right.id, leftKeys: lk.map(c => c.id), rightKeys: rk.map(c => c.id) }),
    report: { estimatedRows: estimate, matched:estimate-(['left','outer'].includes(how)?unmatchedLeft:0)-(['right','outer'].includes(how)?unmatchedRight:0),unmatchedLeft, unmatchedRight, expansion: lrows.length ? estimate / lrows.length : null,
      leftRows:lrows.length,rightRows:rrows.length,matchedLeft:lrows.length-unmatchedLeft,matchedRight:rrows.length-unmatchedRight,
      leftDistinctKeys:lm.size,rightDistinctKeys:rm.size,leftDuplicateKeys:[...lm.values()].filter(v=>v.length>1).length,rightDuplicateKeys:[...rm.values()].filter(v=>v.length>1).length,
      manyToManyKeys:[...lm].filter(([k,v])=>v.length>1&&(rm.get(k)?.length??0)>1).length,
      keyRelations:[...new Set([...lm.keys(),...rm.keys()])].slice(0,30).map(key=>({key:JSON.parse(key),left:lm.get(key)?.length??0,right:rm.get(key)?.length??0,pairs:(lm.get(key)?.length??0)*(rm.get(key)?.length??0)})),keyRelationsTotal:new Set([...lm.keys(),...rm.keys()]).size } };
}
export function concat(tables, p) {
  unsupported(p, ['join', 'maxRows']); ensure(tables.length >= 2, 'CONCAT_INPUTS');
  ensure(Number.isInteger(p.maxRows ?? 100000) && (p.maxRows ?? 100000) > 0 && (p.maxRows ?? 100000) <= 100000, 'CONCAT_LIMIT_PARAMETER');
  const mode = p.join ?? 'outer'; ensure(['inner', 'outer'].includes(mode), 'CONCAT_JOIN');
  const names = [...new Set(tables.flatMap(t => t.columns.map(c => c.name)))].filter(name => mode === 'outer' || tables.every(t => t.columns.some(c => c.name === name)));
  const columns = names.map((name, i) => {
    const cs = tables.flatMap(t => t.columns.filter(c => c.name === name)), types = [...new Set(cs.map(c => c.type))];
    ensure(types.length === 1 || types.every(t => ['integer', 'number'].includes(t)), 'CONCAT_TYPE', { field: name, types });
    return { ...cs[0], id: `concat:${i}`, type: types.length > 1 ? 'number' : types[0] };
  });
  const total = tables.reduce((n, t) => n + t.index.length, 0); ensure(total <= (p.maxRows ?? 100000), 'CONCAT_LIMIT', { total });
  const records = tables.flatMap(t => rows(t).map(r => Object.fromEntries(names.map(name => [name, r[name] ?? null]))));
  return createTable(records, { id: 'concat', columns, rowIds: tables.flatMap((t, i) => visibleIds(t).map(id => keyOf(['concat', i, id]))), lineage: { kind: 'concat', inputs: tables.map(t => t.id) } });
}
