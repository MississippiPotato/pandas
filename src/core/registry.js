import { ensure } from './errors.js';
export class DatasetRegistry {
  #tables = new Map();
  add(table) { ensure(!this.#tables.has(table.id), 'DATASET_EXISTS', { id: table.id }); this.#tables.set(table.id, table); return table.id; }
  get(id) { ensure(this.#tables.has(id), 'DATASET_NOT_FOUND', { id }); return this.#tables.get(id); }
  list() { return [...this.#tables.values()]; }
  remove(id, dependencies = []) { ensure(!dependencies.includes(id), 'DATASET_IN_USE', { id }); return this.#tables.delete(id); }
}
