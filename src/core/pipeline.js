import { ensure } from './errors.js';
import { execute } from './operation-registry.js';
export function replay(nodes, sourceTables) {
  const cache = new Map(), visiting = new Set();
  function visit(id) {
    if (cache.has(id)) return cache.get(id);
    ensure(!visiting.has(id), 'PIPELINE_CYCLE', { id }); visiting.add(id);
    const node = nodes.get(id); ensure(node, 'NODE_NOT_FOUND', { id });
    let result;
    if (node.kind === 'source') { ensure(sourceTables.has(node.sourceId), 'SOURCE_MISSING', { id }); result = { table: sourceTables.get(node.sourceId) }; }
    else {
      try { result = execute(node.inputs.map(input => visit(input).table), node.spec); }
      catch (error) { error.details = { ...error.details, node: id }; throw error; }
    }
    visiting.delete(id); cache.set(id, result); return result;
  }
  for (const id of nodes.keys()) visit(id);
  return cache;
}
