/**
 * <task-list> — Lista de tareas con estados vacíos.
 * Método render({ tasks, query, emptyKind }) — reconciliación por id para no
 * recrear filas existentes (conserva foco y animaciones).
 * Eventos: list:action → detail { action: 'create' | 'import' | 'clear-filters' }
 */
import { applyStyles, baseCSS } from './shared-styles.js';
import { icons } from '../utils/icons.js';
import { emit } from '../utils/dom.js';
import './task-item.js';

const css = /* css */ `
  :host { display: block; }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .list > li { animation: row-in 220ms var(--ease); }
  @keyframes row-in { from { opacity: 0; transform: translateY(4px); } }

  .empty {
    display: grid; justify-items: center; gap: 10px;
    padding: 48px 24px; text-align: center;
    background: var(--c-surface);
    border: 1.5px dashed var(--c-border-strong);
    border-radius: var(--radius-lg);
  }
  .empty__icon {
    display: grid; place-items: center; width: 64px; height: 64px; margin-bottom: 4px;
    border-radius: 50%; background: var(--c-primary-soft); color: var(--c-primary);
  }
  .empty__title { font: 700 1.125rem/1.3 var(--font-display); }
  .empty__text { max-width: 42ch; color: var(--c-text-muted); }
  .empty__actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; margin-top: 8px; }
`;

const EMPTY_STATES = {
  'no-tasks': {
    icon: icons.inbox,
    title: 'Aún no tienes tareas',
    text: 'Crea tu primera tarea o importa algunas desde el banco de tareas público para empezar.',
    actions: [
      { action: 'create', label: 'Nueva tarea', icon: icons.plus, cls: 'btn--primary' },
      { action: 'import', label: 'Importar tareas', icon: icons.download, cls: '' },
    ],
  },
  'no-results': {
    icon: icons.searchLarge,
    title: 'Ninguna tarea coincide',
    text: 'Prueba con otra búsqueda o cambia los filtros para ver más tareas.',
    actions: [{ action: 'clear-filters', label: 'Limpiar búsqueda y filtros', icon: '', cls: '' }],
  },
};

class TaskList extends HTMLElement {
  #list;
  #empty;
  #emptyKind = null;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = /* html */ `
      <section aria-labelledby="list-title">
        <h2 id="list-title" class="sr-only">Lista de tareas</h2>
        <ul class="list" id="list" role="list"></ul>
        <div class="empty" id="empty" hidden></div>
      </section>
    `;
    applyStyles(root, baseCSS, css);
    this.#list = root.getElementById('list');
    this.#empty = root.getElementById('empty');

    this.#empty.addEventListener('click', (e) => {
      const button = e.target.closest('[data-action]');
      if (button) emit(this, 'list:action', { action: button.dataset.action });
    });
  }

  render({ tasks, query = '', emptyKind = 'no-tasks' }) {
    const existing = new Map();
    for (const li of this.#list.children) existing.set(li.dataset.id, li);

    tasks.forEach((task, index) => {
      let li = existing.get(task.id);
      if (li) {
        existing.delete(task.id);
      } else {
        li = document.createElement('li');
        li.dataset.id = task.id;
        li.append(document.createElement('task-item'));
      }
      const item = li.firstElementChild;
      item.query = query;
      item.task = task;
      // Solo movemos el nodo si su posición cambió (moverlo haría perder el foco).
      if (this.#list.children[index] !== li) {
        this.#list.insertBefore(li, this.#list.children[index] ?? null);
      }
    });
    for (const li of existing.values()) li.remove();

    const isEmpty = tasks.length === 0;
    this.#list.hidden = isEmpty;
    this.#empty.hidden = !isEmpty;
    if (isEmpty && this.#emptyKind !== emptyKind) this.#renderEmpty(emptyKind);
    this.#emptyKind = isEmpty ? emptyKind : null;
  }

  /** Mueve el foco a la fila en la posición indicada (o al estado vacío). */
  focusAt(index) {
    const items = this.#list.children;
    if (items.length) {
      items[Math.min(index, items.length - 1)].firstElementChild.focus();
    } else {
      this.#empty.querySelector('button')?.focus();
    }
  }

  #renderEmpty(kind) {
    const state = EMPTY_STATES[kind] ?? EMPTY_STATES['no-tasks'];
    this.#empty.innerHTML = /* html */ `
      <div class="empty__icon">${state.icon}</div>
      <h3 class="empty__title">${state.title}</h3>
      <p class="empty__text">${state.text}</p>
      <div class="empty__actions">
        ${state.actions
          .map((a) => `<button type="button" class="btn ${a.cls}" data-action="${a.action}">${a.icon}${a.label}</button>`)
          .join('')}
      </div>
    `;
  }
}

customElements.define('task-list', TaskList);
