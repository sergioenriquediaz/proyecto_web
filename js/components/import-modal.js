/**
 * <import-modal> — Selección de tareas del banco público (JSONPlaceholder).
 * Método: open(importedExternalIds: Set<number>)
 * Evento: import:confirm → { todos: Todo[] }
 *
 * Estados: loading → ready | error (con reintento). Las tareas ya importadas
 * aparecen deshabilitadas para evitar duplicados.
 */
import { applyStyles, baseCSS, dialogCSS } from './shared-styles.js';
import { icons } from '../utils/icons.js';
import { emit, deepActiveElement, closeOnBackdrop, debounce } from '../utils/dom.js';
import { fold, highlightHtml, plural } from '../utils/text.js';
import { fetchTodos, TODOS_ENDPOINT } from '../services/api.js';

const css = /* css */ `
  dialog { width: min(760px, calc(100vw - 32px)); height: min(760px, calc(100dvh - 32px)); }
  @media (max-width: 600px) { dialog { height: 94dvh; } }

  .controls {
    display: grid; grid-template-columns: 1fr auto auto; gap: 8px;
    padding: 0 24px 12px;
  }
  .search { position: relative; }
  .search .icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--c-text-subtle); pointer-events: none; }
  .search .input { padding-left: 38px; }
  .select { width: auto; min-width: 140px; }

  .selection-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    padding: 10px 24px; border-block: 1px solid var(--c-border); background: var(--c-surface-2);
    font-size: 0.875rem;
  }
  .select-all { display: inline-flex; align-items: center; gap: 10px; font-weight: 600; cursor: pointer; }
  .selection-bar .actions { display: flex; align-items: center; gap: 12px; color: var(--c-text-muted); }
  .link-btn { border: 0; background: none; padding: 4px; color: var(--c-primary); font-weight: 600; cursor: pointer; border-radius: 4px; }
  .link-btn:hover { text-decoration: underline; }
  .link-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }

  input[type="checkbox"] { width: 18px; height: 18px; margin: 0; accent-color: var(--c-primary); cursor: pointer; flex: none; }
  input[type="checkbox"]:disabled { cursor: not-allowed; }

  .dialog__body { padding-top: 8px; }
  .todo-list { list-style: none; margin: 0; padding: 0; }
  .todo {
    display: flex; align-items: flex-start; gap: 12px;
    padding: 10px 8px; border-radius: var(--radius-sm); cursor: pointer;
    border-bottom: 1px solid var(--c-border);
  }
  .todo-list li:last-child .todo { border-bottom: 0; }
  .todo:hover { background: var(--c-surface-hover); }
  .todo input { margin-top: 2px; }
  .todo.is-selected { background: var(--c-primary-soft); }
  .todo.is-disabled { cursor: not-allowed; opacity: 0.6; }
  .todo__title { display: block; font-weight: 550; overflow-wrap: anywhere; }
  .todo__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 4px; font-size: 0.8125rem; color: var(--c-text-muted); }
  .todo__meta .inline { display: inline-flex; align-items: center; gap: 4px; }

  .state { display: grid; justify-items: center; align-content: center; gap: 12px; min-height: 280px; text-align: center; padding: 24px; }
  .state__icon { display: grid; place-items: center; width: 56px; height: 56px; border-radius: 50%; }
  .state--error .state__icon { background: var(--c-danger-soft); color: var(--c-danger); }
  .state__title { font: 700 1.0625rem var(--font-display); }
  .state__text { max-width: 44ch; color: var(--c-text-muted); }

  .skeleton { display: grid; gap: 10px; padding: 8px 0; width: 100%; }
  .skeleton div {
    height: 44px; border-radius: var(--radius-sm);
    background: linear-gradient(90deg, var(--c-surface-2) 0%, var(--c-surface-hover) 50%, var(--c-surface-2) 100%);
    background-size: 200% 100%; animation: shimmer 1.2s linear infinite;
  }
  @keyframes shimmer { to { background-position: -200% 0; } }

  .footer-count { margin-right: auto; font-size: 0.875rem; color: var(--c-text-muted); }

  @media (max-width: 600px) {
    .controls { grid-template-columns: 1fr 1fr; padding: 0 20px 12px; }
    .search { grid-column: 1 / -1; }
    .select { width: 100%; min-width: 0; }
    .selection-bar { padding: 10px 20px; }
    .footer-count { width: 100%; text-align: center; }
  }
`;

class ImportModal extends HTMLElement {
  #refs = {};
  #todos = [];          // datos de la API
  #status = 'idle';     // idle | loading | ready | error
  #selected = new Set(); // externalIds seleccionados
  #imported = new Set(); // externalIds ya presentes en la lista local
  #controller = null;
  #returnFocus = null;
  #filters = { query: '', status: 'all', user: 'all' };

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = /* html */ `
      <dialog aria-labelledby="imp-title" aria-describedby="imp-desc">
        <header class="dialog__header">
          <div>
            <h2 class="dialog__title" id="imp-title">Importar tareas</h2>
            <p class="dialog__subtitle" id="imp-desc">
              Selecciona tareas del banco público
              <a href="${TODOS_ENDPOINT}" target="_blank" rel="noopener noreferrer">JSONPlaceholder</a>.
              Las tareas importadas son de solo lectura: podrás eliminarlas, pero no editarlas.
            </p>
          </div>
          <button type="button" class="icon-btn" data-close aria-label="Cerrar">${icons.close}</button>
        </header>

        <div class="controls" id="controls" hidden>
          <div class="search">
            <label for="imp-search" class="sr-only">Buscar en el banco de tareas</label>
            ${icons.search}
            <input id="imp-search" class="input" type="search" placeholder="Buscar en el banco…" autocomplete="off">
          </div>
          <label for="imp-status" class="sr-only">Estado</label>
          <select id="imp-status" class="select">
            <option value="all">Todos los estados</option>
            <option value="pending">Pendientes</option>
            <option value="completed">Completadas</option>
          </select>
          <label for="imp-user" class="sr-only">Usuario</label>
          <select id="imp-user" class="select"><option value="all">Todos los usuarios</option></select>
        </div>

        <div class="selection-bar" id="selection-bar" hidden>
          <label class="select-all">
            <input type="checkbox" id="select-all">
            <span id="select-all-label">Seleccionar visibles</span>
          </label>
          <div class="actions">
            <span id="visible-count"></span>
            <button type="button" class="link-btn" id="clear-selection" hidden>Quitar selección</button>
          </div>
        </div>

        <div class="dialog__body" id="body">
          <div class="state" id="loading" role="status" aria-live="polite">
            <div class="spinner" aria-hidden="true"></div>
            <p class="state__text">Cargando tareas desde la API…</p>
            <div class="skeleton" aria-hidden="true"><div></div><div></div><div></div><div></div></div>
          </div>

          <div class="state state--error" id="error" role="alert" hidden>
            <div class="state__icon">${icons.alert}</div>
            <p class="state__title">No pudimos cargar el banco de tareas</p>
            <p class="state__text" id="error-text"></p>
            <button type="button" class="btn btn--primary" id="retry">${icons.refresh}Reintentar</button>
          </div>

          <div class="state" id="empty" hidden>
            <p class="state__title">Sin resultados</p>
            <p class="state__text">No hay tareas en el banco que coincidan con tu búsqueda.</p>
          </div>

          <ul class="todo-list" id="list" aria-label="Tareas disponibles para importar" hidden></ul>
        </div>

        <footer class="dialog__footer">
          <span class="footer-count" id="selected-count" aria-live="polite">Ninguna tarea seleccionada</span>
          <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
          <button type="button" class="btn btn--primary" id="confirm" disabled>${icons.download}<span>Importar</span></button>
        </footer>
      </dialog>
    `;
    applyStyles(root, baseCSS, dialogCSS, css);

    const $ = (s) => root.querySelector(s);
    this.#refs = {
      dialog: $('dialog'),
      controls: $('#controls'),
      selectionBar: $('#selection-bar'),
      search: $('#imp-search'),
      status: $('#imp-status'),
      user: $('#imp-user'),
      selectAll: $('#select-all'),
      visibleCount: $('#visible-count'),
      clearSelection: $('#clear-selection'),
      loading: $('#loading'),
      error: $('#error'),
      errorText: $('#error-text'),
      retry: $('#retry'),
      empty: $('#empty'),
      list: $('#list'),
      selectedCount: $('#selected-count'),
      confirm: $('#confirm'),
    };

    const r = this.#refs;
    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.close()));
    closeOnBackdrop(r.dialog, () => this.close());
    r.dialog.addEventListener('close', () => this.#onClosed());
    r.retry.addEventListener('click', () => this.#load());
    r.confirm.addEventListener('click', () => this.#confirm());
    r.clearSelection.addEventListener('click', () => {
      this.#selected.clear();
      this.#renderList();
    });

    const onSearch = debounce(() => {
      this.#filters.query = r.search.value;
      this.#renderList();
    }, 120);
    r.search.addEventListener('input', onSearch);
    r.status.addEventListener('change', () => { this.#filters.status = r.status.value; this.#renderList(); });
    r.user.addEventListener('change', () => { this.#filters.user = r.user.value; this.#renderList(); });

    r.list.addEventListener('change', (e) => {
      const input = e.target.closest('input[type="checkbox"]');
      if (!input) return;
      const id = Number(input.value);
      if (input.checked) this.#selected.add(id);
      else this.#selected.delete(id);
      input.closest('.todo').classList.toggle('is-selected', input.checked);
      this.#updateSelectionUi();
    });

    r.selectAll.addEventListener('change', () => {
      const selectable = this.#visibleTodos().filter((t) => !this.#imported.has(t.externalId));
      if (r.selectAll.checked) selectable.forEach((t) => this.#selected.add(t.externalId));
      else selectable.forEach((t) => this.#selected.delete(t.externalId));
      this.#renderList();
    });
  }

  get isOpen() {
    return this.#refs.dialog.open;
  }

  open(importedExternalIds = new Set()) {
    this.#imported = importedExternalIds;
    this.#selected.clear();
    this.#returnFocus = deepActiveElement();
    this.#refs.dialog.showModal();

    if (this.#status === 'ready') {
      this.#renderList();
      this.#refs.search.focus();
    } else {
      this.#load();
    }
  }

  close() {
    if (this.#refs.dialog.open) this.#refs.dialog.close();
  }

  #onClosed() {
    this.#controller?.abort();
    if (this.#status === 'loading') this.#status = 'idle';
    const target = this.#returnFocus;
    this.#returnFocus = null;
    if (target?.isConnected) requestAnimationFrame(() => target.focus());
  }

  async #load() {
    this.#controller?.abort();
    this.#controller = new AbortController();
    this.#setStatus('loading');
    try {
      this.#todos = await fetchTodos({ signal: this.#controller.signal });
      this.#populateUsers();
      this.#setStatus('ready');
      this.#renderList();
      this.#refs.search.focus();
    } catch (error) {
      if (error?.name === 'AbortError') return; // el usuario cerró el modal
      console.error('[Taskly] Error al cargar la API', error);
      this.#refs.errorText.textContent = error?.message || 'Ocurrió un error inesperado.';
      this.#setStatus('error');
      this.#refs.retry.focus();
    }
  }

  #setStatus(status) {
    this.#status = status;
    const r = this.#refs;
    const ready = status === 'ready';
    r.loading.hidden = status !== 'loading';
    r.error.hidden = status !== 'error';
    r.controls.hidden = !ready;
    r.selectionBar.hidden = !ready;
    r.list.hidden = !ready;
    r.empty.hidden = true;
    r.dialog.querySelector('#body').setAttribute('aria-busy', String(status === 'loading'));
    this.#updateSelectionUi();
  }

  #populateUsers() {
    const users = [...new Set(this.#todos.map((t) => t.userId).filter((u) => u !== null))].sort((a, b) => a - b);
    this.#refs.user.innerHTML =
      '<option value="all">Todos los usuarios</option>' +
      users.map((u) => `<option value="${u}">Usuario ${u}</option>`).join('');
    this.#refs.user.value = users.includes(Number(this.#filters.user)) ? this.#filters.user : 'all';
    this.#filters.user = this.#refs.user.value;
  }

  #visibleTodos() {
    const { query, status, user } = this.#filters;
    const q = fold(query.trim());
    return this.#todos.filter((t) => {
      if (status === 'pending' && t.completed) return false;
      if (status === 'completed' && !t.completed) return false;
      if (user !== 'all' && String(t.userId) !== user) return false;
      if (q && !fold(t.title).includes(q) && String(t.externalId) !== q.replace('#', '')) return false;
      return true;
    });
  }

  #renderList() {
    if (this.#status !== 'ready') return;
    const visible = this.#visibleTodos();
    const query = this.#filters.query;
    const r = this.#refs;

    r.list.innerHTML = visible
      .map((t) => {
        const imported = this.#imported.has(t.externalId);
        const selected = this.#selected.has(t.externalId);
        const cls = ['todo', imported && 'is-disabled', selected && 'is-selected'].filter(Boolean).join(' ');
        return /* html */ `
          <li>
            <label class="${cls}">
              <input type="checkbox" value="${t.externalId}" ${selected ? 'checked' : ''} ${imported ? 'disabled' : ''}
                aria-describedby="meta-${t.externalId}">
              <span>
                <span class="todo__title">${highlightHtml(t.title, query)}</span>
                <span class="todo__meta" id="meta-${t.externalId}">
                  <span>#${t.externalId}</span>
                  ${t.userId !== null ? `<span class="inline">${icons.user}Usuario ${t.userId}</span>` : ''}
                  <span class="badge ${t.completed ? 'badge--success' : 'badge--warning'}">${t.completed ? 'Completada' : 'Pendiente'}</span>
                  ${imported ? `<span class="badge badge--info">${icons.lock}Ya importada</span>` : ''}
                </span>
              </span>
            </label>
          </li>`;
      })
      .join('');

    r.list.hidden = visible.length === 0;
    r.empty.hidden = visible.length !== 0;
    r.visibleCount.textContent = `${visible.length} de ${this.#todos.length}`;
    this.#updateSelectionUi(visible);
  }

  #updateSelectionUi(visible = this.#status === 'ready' ? this.#visibleTodos() : []) {
    const r = this.#refs;
    const selectable = visible.filter((t) => !this.#imported.has(t.externalId));
    const selectedVisible = selectable.filter((t) => this.#selected.has(t.externalId)).length;

    r.selectAll.disabled = selectable.length === 0;
    r.selectAll.checked = selectable.length > 0 && selectedVisible === selectable.length;
    r.selectAll.indeterminate = selectedVisible > 0 && selectedVisible < selectable.length;

    const count = this.#selected.size;
    r.selectedCount.textContent = count
      ? `${plural(count, 'tarea seleccionada', 'tareas seleccionadas')}`
      : 'Ninguna tarea seleccionada';
    r.clearSelection.hidden = count === 0;
    r.confirm.disabled = count === 0 || this.#status !== 'ready';
    r.confirm.querySelector('span').textContent = count ? `Importar ${count}` : 'Importar';
  }

  #confirm() {
    const todos = this.#todos.filter((t) => this.#selected.has(t.externalId));
    if (!todos.length) return;
    emit(this, 'import:confirm', { todos });
    this.close();
  }
}

customElements.define('import-modal', ImportModal);

