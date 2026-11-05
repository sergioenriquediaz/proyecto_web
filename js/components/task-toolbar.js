/**
 * <task-toolbar> — Acciones principales, buscador y filtros.
 * Propiedad state = { query, status, origin, sort }  (solo escribe los controles)
 * Método update({ counts, total, visible, completable })
 * Eventos:
 *   toolbar:search  → { query }
 *   toolbar:filter  → { status, origin, sort }
 *   toolbar:action  → { action: 'create' | 'import' | 'complete' | 'clear' }
 */
import { applyStyles, baseCSS } from './shared-styles.js';
import { icons } from '../utils/icons.js';
import { emit, debounce } from '../utils/dom.js';
import { plural } from '../utils/text.js';

const css = /* css */ `
  :host { display: block; }
  .toolbar {
    display: grid; gap: 14px;
    padding: 16px;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
  }

  .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  .actions .spacer { flex: 1; }

  .filters {
    display: grid; gap: 10px;
    grid-template-columns: 1fr 180px 180px;
    align-items: center;
  }
  .subbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; }

  .search { position: relative; }
  .search .icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--c-text-subtle); pointer-events: none; }
  .search .input { padding-left: 38px; padding-right: 40px; }
  .search kbd { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); pointer-events: none; }
  .search .input:focus ~ kbd, .search .input:not(:placeholder-shown) ~ kbd { display: none; }
  .search .input::-webkit-search-cancel-button { cursor: pointer; }

  .segmented {
    display: inline-flex; padding: 3px; gap: 2px;
    border-radius: 10px; background: var(--c-surface-2); border: 1px solid var(--c-border);
  }
  .segmented label { position: relative; }
  .segmented input { position: absolute; opacity: 0; inset: 0; margin: 0; cursor: pointer; }
  .segmented span {
    display: inline-flex; align-items: center; gap: 6px;
    min-height: 34px; padding: 0 12px; border-radius: 7px;
    font-size: 0.875rem; font-weight: 600; color: var(--c-text-muted); white-space: nowrap;
    transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
  }
  .segmented label:hover span { color: var(--c-text); }
  .segmented input:checked + span { background: var(--c-surface); color: var(--c-text); box-shadow: var(--shadow-sm); }
  .segmented input:focus-visible + span { box-shadow: var(--focus-ring); }
  .count {
    min-width: 22px; padding: 0 6px; border-radius: 999px;
    font-size: 0.75rem; line-height: 20px; text-align: center;
    background: var(--c-border); color: var(--c-text-muted);
  }
  .segmented input:checked + span .count { background: var(--c-primary-soft); color: var(--c-primary); }

  .select { width: 100%; }

  .summary { font-size: 0.875rem; color: var(--c-text-muted); }

  @media (max-width: 720px) {
    .filters { grid-template-columns: 1fr 1fr; }
    .search { grid-column: 1 / -1; }
    .segmented { display: flex; width: 100%; }
    .segmented label { flex: 1; }
    .segmented span { justify-content: center; width: 100%; }
  }

  @media (max-width: 600px) {
    .toolbar { padding: 12px; border-radius: var(--radius); }
    .actions { display: grid; grid-template-columns: repeat(3, 1fr); }
    .actions .spacer { display: none; }
    .actions [data-action="create"] { grid-column: 1 / -1; }
    .actions .btn:not([data-action="create"]) {
      flex-direction: column; gap: 4px; min-height: 60px; padding: 8px 6px;
      font-size: 0.8125rem; line-height: 1.2; white-space: normal; text-align: center;
    }
    .search kbd { display: none; }
    .segmented span { padding: 0 6px; gap: 4px; }
  }
`;

class TaskToolbar extends HTMLElement {
  #refs = {};

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = /* html */ `
      <div class="toolbar">
        <div class="actions" role="toolbar" aria-label="Acciones de la lista">
          <button type="button" class="btn btn--primary" data-action="create" aria-keyshortcuts="N">
            ${icons.plus}<span>Nueva tarea</span>
          </button>
          <button type="button" class="btn" data-action="import">
            ${icons.download}<span>Importar</span>
          </button>
          <button type="button" class="btn" data-action="complete">
            ${icons.checkAll}<span>Marcar terminadas</span>
          </button>
          <span class="spacer"></span>
          <button type="button" class="btn btn--danger-soft" data-action="clear">
            ${icons.trash}<span>Vaciar lista</span>
          </button>
        </div>

        <div class="filters">
          <div class="search">
            <label for="search" class="sr-only">Buscar tareas</label>
            ${icons.search}
            <input id="search" class="input" type="search" placeholder="Buscar por título o ID…"
              autocomplete="off" spellcheck="false" aria-keyshortcuts="/" aria-controls="summary">
            <kbd aria-hidden="true">/</kbd>
          </div>

          <label for="origin" class="sr-only">Filtrar por origen</label>
          <select id="origin" class="select">
            <option value="all">Todo origen</option>
            <option value="local">Creadas por mí</option>
            <option value="api">Importadas</option>
          </select>

          <label for="sort" class="sr-only">Ordenar</label>
          <select id="sort" class="select">
            <option value="newest">Más recientes</option>
            <option value="oldest">Más antiguas</option>
            <option value="pending-first">Pendientes primero</option>
            <option value="az">Título (A–Z)</option>
          </select>
        </div>

        <div class="subbar">
          <div class="segmented" role="radiogroup" aria-label="Filtrar por estado">
            <label><input type="radio" name="status" value="all"><span>Todas <b class="count" data-count="all">0</b></span></label>
            <label><input type="radio" name="status" value="pending"><span>Pendientes <b class="count" data-count="pending">0</b></span></label>
            <label><input type="radio" name="status" value="completed"><span>Completadas <b class="count" data-count="completed">0</b></span></label>
          </div>
          <p class="summary" id="summary" aria-live="polite"></p>
        </div>
      </div>
    `;
    applyStyles(root, baseCSS, css);

    const $ = (s) => root.querySelector(s);
    this.#refs = {
      search: $('#search'),
      origin: $('#origin'),
      sort: $('#sort'),
      summary: $('#summary'),
      complete: $('[data-action="complete"]'),
      clear: $('[data-action="clear"]'),
      radios: [...root.querySelectorAll('input[name="status"]')],
      counts: Object.fromEntries([...root.querySelectorAll('[data-count]')].map((el) => [el.dataset.count, el])),
    };

    root.querySelector('.actions').addEventListener('click', (e) => {
      const button = e.target.closest('[data-action]');
      if (button && !button.disabled) emit(this, 'toolbar:action', { action: button.dataset.action });
    });

    const emitSearch = debounce(() => emit(this, 'toolbar:search', { query: this.#refs.search.value }), 120);
    this.#refs.search.addEventListener('input', emitSearch);
    this.#refs.search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.#refs.search.value) {
        e.preventDefault();
        this.#refs.search.value = '';
        emit(this, 'toolbar:search', { query: '' });
      }
    });

    const emitFilter = () => emit(this, 'toolbar:filter', this.#readFilters());
    this.#refs.radios.forEach((r) => r.addEventListener('change', emitFilter));
    this.#refs.origin.addEventListener('change', emitFilter);
    this.#refs.sort.addEventListener('change', emitFilter);
  }

  set state({ query = '', status = 'all', origin = 'all', sort = 'newest' }) {
    const r = this.#refs;
    if (r.search.value !== query) r.search.value = query;
    r.radios.forEach((radio) => { radio.checked = radio.value === status; });
    r.origin.value = origin;
    r.sort.value = sort;
  }

  update({ counts, total, visible, completable }) {
    const r = this.#refs;
    for (const key of Object.keys(r.counts)) r.counts[key].textContent = counts[key] ?? 0;

    r.complete.disabled = completable === 0;
    r.complete.title = completable
      ? `Marcar ${plural(completable, 'tarea visible pendiente', 'tareas visibles pendientes')} como terminadas`
      : 'No hay tareas visibles pendientes que se puedan completar';
    r.clear.disabled = total === 0;

    r.summary.textContent = total === 0
      ? 'Tu lista está vacía.'
      : visible === total
        ? `Mostrando ${plural(total, 'tarea')}.`
        : `Mostrando ${visible} de ${plural(total, 'tarea')}.`;
  }

  focusSearch() {
    this.#refs.search.focus();
    this.#refs.search.select();
  }

  #readFilters() {
    return {
      status: this.#refs.radios.find((r) => r.checked)?.value ?? 'all',
      origin: this.#refs.origin.value,
      sort: this.#refs.sort.value,
    };
  }
}

customElements.define('task-toolbar', TaskToolbar);
