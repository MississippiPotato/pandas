export class History {
  #states = []; #cursor = -1;
  push(state) { this.#states = this.#states.slice(0, this.#cursor + 1); this.#states.push(state); this.#cursor++; }
  replaceCurrent(state) { this.#states[this.#cursor] = state; }
  undo() { if (this.#cursor > 0) this.#cursor--; return this.current; }
  redo() { if (this.#cursor + 1 < this.#states.length) this.#cursor++; return this.current; }
  get current() { return this.#states[this.#cursor]; }
  get position() { return { cursor: this.#cursor, length: this.#states.length, canUndo: this.#cursor > 0, canRedo: this.#cursor + 1 < this.#states.length }; }
}
