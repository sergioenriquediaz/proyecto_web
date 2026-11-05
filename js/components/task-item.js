/**
 * <task-item> — Fila de una tarea.
 * Propiedades: task (objeto Task), query (texto a resaltar).
 * Eventos (bubbles + composed): task:toggle, task:edit, task:delete → detail { id }
 *
 * La estructura se crea una sola vez y luego solo se actualiza su contenido,
 * de modo que el foco del teclado no se pierde al cambiar el estado.
 */
import { applyStyles, baseCSS } from './shared-styles.js';
import { icons } from '../utils/icons.js';
import { emit } from '../utils/dom.js';
import { renderHighlight } from '../utils/text.js';
import { formatRelativeDate, formatFullDate } from '../utils/date.js';
import { isReadOnly } from '../models/task.js';

const css = /* css */ `
  :host { display: block; }

  .item {
    position: relative;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 6px 14px;
    padding: 12px 10px 12px 14px;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--radius);
    transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease), background var(--dur) var(--ease);
  }
  .item:hover { border-color: var(--c-border-strong); box-shadow: var(--shadow); }
  .item.is-done { background: color-mix(in srgb, var(--c-surface) 70%, var(--c-surface-2)); }

  /* Casilla de completado (checkbox nativo accesible, apariencia propia) */
  .check { position: relative; display: grid; place-items: center; width: 36px; height: 36px; cursor: pointer; }
  .check input {
    position: absolute; inset: 0; margin: 0; opacity: 0; cursor: inherit;
  }
  .check .box {
    display: grid; place-items: center; width: 24px; height: 24px;
    border-radius: 50%; border: 2px solid var(--c-border-strong);
    color: transparent; background: var(--c-surface);
    transition: all var(--dur) var(--ease);
  }
  .check:hover .box { border-color: var(--c-primary); }
  .check input:checked + .box { background: var(--c-primary); border-color: var(--c-primary); color: var(--c-on-primary); }
  .check input:focus-visible + .box { box-shadow: var(--focus-ring); }
  .check input:disabled { cursor: not-allowed; }
  .check input:disabled + .box { border-style: dashed; opacity: 0.75; }
  .check input:disabled:checked + .box { border-style: solid; opacity: 0.6; }
  .is-done .check input:checked + .box { animation: pop 260ms var(--ease); }
  @keyframes pop { 50% { transform: scale(1.15); } }

  .content { min-width: 0; }
  .title {
    font-size: 1rem; font-weight: 550; line-height: 1.4;
    overflow-wrap: anywhere;
    transition: color var(--dur) var(--ease);
  }
  .is-done .title { color: var(--c-text-subtle); text-decoration: line-through; text-decoration-thickness: 1.5px; }

  .meta {
    display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px;
    margin-top: 4px; font-size: 0.8125rem; color: var(--c-text-muted);
  }
  .meta .sep { width: 3px; height: 3px; border-radius: 50%; background: var(--c-border-strong); }
  .id { font: 500 0.75rem var(--font-mono); color: var(--c-text-subtle); letter-spacing: 0.02em; }

  .actions { display: flex; gap: 2px; }

  @media (max-width: 520px) {
    .item { grid-template-columns: auto 1fr; padding: 12px 8px 8px 10px; gap: 4px 10px; }
    .actions { grid-column: 2; justify-content: flex-end; margin-top: 2px; }
    .id { display: none; }
  }
`;

class TaskItem extends HTMLElement {
  #task = null;
  #query = '';
  #refs = {};

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = /* html */ `
      <article class="item" part="item">
        <label class="check">
          <input type="checkbox" id="done">
          <span class="box" aria-hidden="true">${icons.check}</span>
          <span class="sr-only" id="done-label"></span>
        </label>
        <div class="content">
          <p class="title" id="title"></p>
          <div class="meta">
            <span class="badge" id="status"></span>
            <time id="date"></time>
            <span class="sep" aria-hidden="true"></span>
            <span class="badge" id="origin"></span>
            <code class="id" id="task-id"></code>
          </div>
        </div>
        <div class="actions">
          <button type="button" class="icon-btn" data-act="edit">${icons.pencil}</button>
          <button type="button" class="icon-btn icon-btn--danger" data-act="delete">${icons.trash}</button>
        </div>
      </article>
    `;
    applyStyles(root, baseCSS, css);

    const $ = (sel) => root.querySelector(sel);
    this.#refs = {
      item: $('.item'),
      checkbox: $('#done'),
      checkLabel: $('#done-label'),
      title: $('#title'),
      status: $('#status'),
      date: $('#date'),
      origin: $('#origin'),
      id: $('#task-id'),
      edit: $('[data-act="edit"]'),
      del: $('[data-act="delete"]'),
    };

    this.#refs.checkbox.addEventListener('change', () => {
      // El estado real lo decide el store; revertimos hasta recibir la actualización.
      this.#refs.checkbox.checked = Boolean(this.#task?.completed);
      emit(this, 'task:toggle', { id: this.#task.id });
    });
    this.#refs.edit.addEventListener('click', () => emit(this, 'task:edit', { id: this.#task.id }));
    this.#refs.del.addEventListener('click', () => emit(this, 'task:delete', { id: this.#task.id }));
  }

  set task(value) {
    this.#task = value;
    this.#update();
  }
  get task() {
    return this.#task;
  }

  set query(value) {
    if (value === this.#query) return;
    this.#query = value ?? '';
    if (this.#task) renderHighlight(this.#refs.title, this.#task.title, this.#query);
  }

  /** Enfoca el control principal (casilla o botón eliminar si es de solo lectura). */
  focus() {
    const { checkbox, del } = this.#refs;
    (checkbox.disabled ? del : checkbox).focus();
  }

  #update() {
    const t = this.#task;
    if (!t) return;
    const r = this.#refs;
    const readOnly = isReadOnly(t);

    r.item.classList.toggle('is-done', t.completed);
    r.checkbox.checked = t.completed;
    r.checkbox.disabled = readOnly;
    r.checkLabel.textContent = readOnly
      ? `Tarea importada de solo lectura: ${t.title}`
      : `Marcar “${t.title}” como ${t.completed ? 'pendiente' : 'completada'}`;
    r.checkbox.title = readOnly ? 'Las tareas importadas no se pueden modificar' : '';

    renderHighlight(r.title, t.title, this.#query);

    r.status.textContent = t.completed ? 'Completada' : 'Pendiente';
    r.status.className = `badge ${t.completed ? 'badge--success' : 'badge--warning'}`;

    r.date.dateTime = t.createdAt;
    r.date.textContent = formatRelativeDate(t.createdAt);
    r.date.title = `Registrada: ${formatFullDate(t.createdAt)}`;

    if (readOnly) {
      r.origin.className = 'badge badge--info';
      r.origin.innerHTML = `${icons.lock}<span>Importada · API #${t.externalId}</span>`;
      r.origin.title = 'Solo lectura: las tareas importadas solo se pueden eliminar';
    } else {
      r.origin.className = 'badge';
      r.origin.textContent = 'Creada por ti';
      r.origin.title = '';
    }
    r.id.textContent = t.id;

    r.edit.setAttribute('aria-label', readOnly ? `No editable: “${t.title}” es importada` : `Editar “${t.title}”`);
    r.edit.title = readOnly ? 'Las tareas importadas no se pueden editar' : 'Editar';
    r.edit.toggleAttribute('aria-disabled', readOnly);
    if (readOnly) r.edit.setAttribute('aria-disabled', 'true');
    r.del.setAttribute('aria-label', `Eliminar “${t.title}”`);
    r.del.title = 'Eliminar';
  }
}

customElements.define('task-item', TaskItem);
