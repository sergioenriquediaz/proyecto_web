/**
 * TaskStore: única fuente de verdad de las tareas.
 * - Encapsula el estado (campo privado) y lo expone como copias inmutables.
 * - Cada mutación persiste en localStorage y emite el evento "change".
 * - Aplica las reglas de negocio (p. ej. las tareas importadas son de solo lectura).
 * - Se sincroniza entre pestañas mediante el evento "storage".
 */
import { loadTasks, saveTasks, STORAGE_KEY } from '../services/storage.js';
import { createLocalTask, createImportedTask, isReadOnly, validateTitle, TASK_SOURCE } from '../models/task.js';
import { cleanTitle } from '../utils/text.js';
import { isValidIso } from '../utils/date.js';

export class ReadOnlyTaskError extends Error {
  constructor() {
    super('Las tareas importadas no se pueden modificar; solo eliminar.');
    this.name = 'ReadOnlyTaskError';
  }
}

export class TaskNotFoundError extends Error {
  constructor(id) {
    super(`No existe la tarea ${id}.`);
    this.name = 'TaskNotFoundError';
  }
}

const clone = (task) => ({ ...task });

export class TaskStore extends EventTarget {
  #tasks = [];

  constructor() {
    super();
    this.#tasks = loadTasks();
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        this.#tasks = loadTasks();
        this.#emit('change', { reason: 'sync' });
      }
    });
  }

  /* ---------- Lectura ---------- */

  getAll() {
    return this.#tasks.map(clone);
  }

  get(id) {
    const task = this.#find(id);
    return task ? clone(task) : null;
  }

  get size() {
    return this.#tasks.length;
  }

  importedExternalIds() {
    return new Set(this.#tasks.filter((t) => t.source === TASK_SOURCE.API).map((t) => t.externalId));
  }

  /* ---------- Escritura ---------- */

  add({ title, createdAt, completed }) {
    const error = validateTitle(title);
    if (error) throw new TypeError(error);
    const task = createLocalTask({ title, createdAt, completed }, this.#ids());
    this.#tasks.unshift(task);
    this.#commit('add');
    return clone(task);
  }

  update(id, changes) {
    const task = this.#mutable(id);
    if (changes.title !== undefined) {
      const error = validateTitle(changes.title);
      if (error) throw new TypeError(error);
      task.title = cleanTitle(changes.title);
    }
    if (changes.createdAt !== undefined && isValidIso(changes.createdAt)) task.createdAt = changes.createdAt;
    if (changes.completed !== undefined) task.completed = Boolean(changes.completed);
    task.updatedAt = new Date().toISOString();
    this.#commit('update');
    return clone(task);
  }

  toggle(id) {
    const task = this.#mutable(id);
    return this.update(id, { completed: !task.completed });
  }

  /** Marca varias tareas (locales) con el estado indicado. Devuelve los ids modificados. */
  setCompleted(ids, completed = true) {
    const wanted = new Set(ids);
    const changed = [];
    const now = new Date().toISOString();
    for (const task of this.#tasks) {
      if (wanted.has(task.id) && !isReadOnly(task) && task.completed !== completed) {
        task.completed = completed;
        task.updatedAt = now;
        changed.push(task.id);
      }
    }
    if (changed.length) this.#commit('bulk-complete');
    return changed;
  }

  remove(id) {
    const index = this.#tasks.findIndex((t) => t.id === id);
    if (index === -1) throw new TaskNotFoundError(id);
    const [removed] = this.#tasks.splice(index, 1);
    this.#commit('remove');
    return clone(removed);
  }

  clear() {
    const removed = this.#tasks.map(clone);
    this.#tasks = [];
    this.#commit('clear');
    return removed;
  }

  /** Reinserta tareas eliminadas (usado por "Deshacer"). Ignora ids ya presentes. */
  restore(tasks) {
    const ids = this.#ids();
    const toAdd = tasks.filter((t) => !ids.has(t.id)).map(clone);
    if (!toAdd.length) return 0;
    this.#tasks.push(...toAdd);
    this.#commit('restore');
    return toAdd.length;
  }

  /**
   * Importa "todos" de la API. Cada uno recibe un identificador del estándar
   * propio; se evita importar dos veces el mismo externalId.
   */
  importTodos(todos) {
    const already = this.importedExternalIds();
    const ids = this.#ids();
    const now = new Date();
    const added = [];
    let skipped = 0;
    for (const todo of todos) {
      if (already.has(todo.externalId)) {
        skipped++;
        continue;
      }
      const task = createImportedTask(todo, ids, now);
      ids.add(task.id);
      already.add(todo.externalId);
      added.push(task);
    }
    if (added.length) {
      this.#tasks.unshift(...added);
      this.#commit('import');
    }
    return { added: added.length, skipped };
  }

  /* ---------- Internos ---------- */

  #find(id) {
    return this.#tasks.find((t) => t.id === id);
  }

  #mutable(id) {
    const task = this.#find(id);
    if (!task) throw new TaskNotFoundError(id);
    if (isReadOnly(task)) throw new ReadOnlyTaskError();
    return task;
  }

  #ids() {
    return new Set(this.#tasks.map((t) => t.id));
  }

  #commit(reason) {
    try {
      saveTasks(this.#tasks);
    } catch (error) {
      this.#emit('error', { error });
    }
    this.#emit('change', { reason });
  }

  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
