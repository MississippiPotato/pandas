import { ensure } from './errors.js';
import { History } from './history.js';
import { execute } from './operation-registry.js';
import { replay } from './pipeline.js';
import { rows, rowCount, visibleIds } from './dataset.js';
import { profile } from './statistics.js';
import { PANDAS_PREAMBLE, py, toPandas } from './pandas-code.js';
function immutable(value) { if (value && typeof value === 'object') { Object.values(value).forEach(immutable); Object.freeze(value); } return value; }
export class Session {
  #sources = new Map(); #nodes = new Map(); #results = new Map(); #active = null; #history = new History(); #sequence = 0; #version = 0;
  constructor() { this.#save(); }
  #save() { this.#history.push({ nodes: new Map(this.#nodes), results: new Map(this.#results), active: this.#active }); this.#version++; }
  #restore(state) { this.#nodes = new Map(state.nodes); this.#results = new Map(state.results); this.#active = state.active; this.#version++; }
  add(table) {
    ensure(!this.#nodes.has(`source:${table.id}`), 'DATASET_EXISTS', { id: table.id });
    if (this.#sources.has(table.id)) ensure(this.#sources.get(table.id) === table || (table.sourceHash !== null && this.#sources.get(table.id).sourceHash === table.sourceHash), 'SOURCE_MISMATCH');
    this.#sources.set(table.id, table); const id = `source:${table.id}`;
    this.#nodes.set(id, Object.freeze({ id, kind: 'source', sourceId: table.id })); this.#results.set(id, { table }); this.#active = id; this.#save(); return id;
  }
  get activeId() { return this.#active; }
  get activeTable() { return this.#active ? this.#results.get(this.#active).table : null; }
  get version() { return this.#version; }
  get history() { return this.#history.position; }
  nodes() { return [...this.#nodes.values()]; }
  select(id) { ensure(this.#nodes.has(id), 'NODE_NOT_FOUND', { id }); this.#active = id; this.#version++; }
  table(id) { ensure(this.#results.has(id), 'NODE_NOT_FOUND', { id }); return this.#results.get(id).table; }
  sources(){return [...this.#sources.values()].filter(t=>this.#nodes.has(`source:${t.id}`));}
  removeSource(id){const sourceNode=`source:${id}`;ensure(this.#nodes.has(sourceNode),'SOURCE_MISSING');ensure(![...this.#nodes.values()].some(n=>n.inputs?.includes(sourceNode)),'DATASET_IN_USE');this.#nodes.delete(sourceNode);this.#results.delete(sourceNode);if(this.#active===sourceNode)this.#active=[...this.#nodes.keys()].at(-1)??null;this.#save();}
  removeNode(id){const node=this.#nodes.get(id);ensure(node?.kind==='operation','NOT_OPERATION');const dependents=[...this.#nodes.values()].filter(n=>n.inputs?.includes(id));ensure(dependents.length===0,'NODE_IN_USE');this.#nodes.delete(id);this.#results.delete(id);if(this.#active===id)this.#active=node.inputs[0];this.#save();}
  preview(spec, inputIds = [this.#active]) { return execute(inputIds.map(id => this.table(id)), spec); }
  commit(spec, inputIds = [this.#active]) {
    const immutableSpec = immutable(structuredClone(spec)), result = this.preview(immutableSpec, inputIds), id = `op:${++this.#sequence}`;
    this.#nodes.set(id, Object.freeze({ id, kind: 'operation', inputs: Object.freeze([...inputIds]), spec: immutableSpec }));
    this.#results.set(id, result); this.#active = id; this.#save(); return { id, ...result };
  }
  edit(id, spec) {
    const old = this.#nodes.get(id); ensure(old?.kind === 'operation', 'NOT_OPERATION', { id });
    const next = new Map(this.#nodes); next.set(id, Object.freeze({ ...old, spec: immutable(structuredClone(spec)) }));
    const results = replay(next, this.#sources); // Validate whole dependency graph before atomic publication.
    this.#nodes = next; this.#results = results; this.#save(); return this.table(id);
  }
  undo() { this.#restore(this.#history.undo()); return this.activeTable; }
  redo() { this.#restore(this.#history.redo()); return this.activeTable; }
  snapshot({ offset = 0, limit = 50, selection = null } = {}) {
    if (!this.activeTable) return { version: this.#version, activeId: null, nodes: this.nodes(), history: this.history };
    let table = this.activeTable;
    if (selection) table = execute(table, { type: 'filter', params: { predicate: selection } }).table;
    return { version: this.#version, activeId: this.#active, rows: rowCount(table), committedRows: rowCount(this.activeTable),
      columns: table.columns, records: rows(table, offset, limit), rowIds: visibleIds(table).slice(offset, offset + limit),
      profile: profile(table), nodes: this.nodes(), history: this.history, result: this.#results.get(this.#active).report ?? null,
      provenance:table.provenance,lineage:table.lineage,pandas:this.#results.get(this.#active).pandas??null,
      tables:[...this.#results].map(([id,r])=>({id,rows:rowCount(r.table),columns:r.table.columns,provenance:r.table.provenance})) };
  }
  exportFlow() {
    return { schemaVersion: 1, sources: [...this.#nodes.values()].filter(n => n.kind === 'source').map(n => ({ sourceId: n.sourceId, sourceHash: this.#sources.get(n.sourceId).sourceHash,
      columns: this.#sources.get(n.sourceId).columns })), nodes: this.nodes(), activeId: this.#active };
  }
  importFlow(config, tables) {
    ensure(config.schemaVersion === 1 && Array.isArray(config.nodes), 'FLOW_VERSION');
    const sources = new Map(tables.map(t => [t.id, t]));
    for (const source of config.sources) ensure(sources.has(source.sourceId) && sources.get(source.sourceId).sourceHash === source.sourceHash && source.sourceHash !== null
      && JSON.stringify(sources.get(source.sourceId).columns) === JSON.stringify(source.columns), 'SOURCE_MISMATCH', { source: source.sourceId });
    const graph = new Map(config.nodes.map(n => [n.id, immutable(structuredClone(n))]));
    ensure(graph.size === config.nodes.length && graph.has(config.activeId), 'INVALID_FLOW');
    ensure([...graph.values()].filter(n=>n.kind==='source').every(n=>config.sources.some(s=>s.sourceId===n.sourceId)), 'SOURCE_MISMATCH');
    const results = replay(graph, sources);
    this.#sources = sources; this.#nodes = graph; this.#results = results; this.#active = config.activeId;
    this.#sequence = Math.max(0, ...config.nodes.map(n => /^op:(\d+)$/.test(n.id) ? Number(n.id.slice(3)) : 0)); this.#save();
  }
  pandasScript() {
    let code = PANDAS_PREAMBLE, index = 0; const variables = new Map();
    const ordered = [], visited = new Set();
    const visit = id => { if (visited.has(id)) return; const node=this.#nodes.get(id); for(const input of node.inputs??[])visit(input); visited.add(id); ordered.push(node); };
    ensure(this.#active,'NODE_NOT_FOUND');visit(this.#active);
    for (const node of ordered) {
      const variable = `df_${index++}`; variables.set(node.id, variable);
      if (node.kind === 'source') {
        const t = this.#sources.get(node.sourceId);
        code += `\n# Source: ${node.sourceId.replaceAll('\n', ' ')}\n${variable} = _nd_input(${py(rows(t))}, ${py(t.columns.map(c => ({ name: c.name, type: c.type })))})\n`;
      } else {
        const fragment = toPandas(node.inputs.map(id => this.table(id)), node.spec, this.table(node.id), { variables: node.inputs.map(id => variables.get(id)), output: variable });
        ensure(fragment !== null, 'PANDAS_UNAVAILABLE', { node: node.id }); code += `\n${fragment}\n`;
      }
    }
    return code + `\nresult = ${variables.get(this.#active)}\n`;
  }
}
