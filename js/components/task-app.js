/**
 * <task-app> — Componente raíz. Orquesta:
 *   TaskStore (estado + persistencia) ⇄ componentes de presentación.
 *
 * Flujo unidireccional: los componentes hijos emiten eventos (bubbles + composed),
 * task-app los traduce en operaciones del store, y ante cada "change" del store
 * vuelve a calcular la vista (filtros, búsqueda, orden) y la pasa a los hijos.
 */
import { applyStyles, baseCSS } from './shared-styles.js';
import { icons } from '../utils/icons.js';
import { fold, plural } from '../utils/text.js';
import { isTypingTarget } from '../utils/dom.js';
import { TaskStore, ReadOnlyTaskError } from '../store/task-store.js';
import { loadPrefs, savePrefs, loadTheme, saveTheme } from '../services/storage.js';
import { isReadOnly } from '../models/task.js';
import './task-toolbar.js';
import './task-list.js';
import './task-form-modal.js';
import './import-modal.js';
import './confirm-dialog.js';
import './toast-region.js';

const css = /* css */ `
  :host { display: block; }
  .shell { width: min(960px, 100%); margin: 0 auto; padding: 28px 20px 48px; }

  .topbar { display: flex; align-items: center; gap: 16px; margin-bottom: 20px; }
  .brand { display: flex; align-items: center; gap: 12px; color: var(--c-primary); }
  .brand h1 { font: 800 1.625rem/1.1 var(--font-display); letter-spacing: -0.02em; color: var(--c-text); }
  .brand p { font-size: 0.875rem; color: var(--c-text-muted); }

  .progress { margin-left: auto; display: grid; gap: 6px; min-width: 200px; }
  .progress__label { display: flex; justify-content: space-between; gap: 12px; font-size: 0.8125rem; color: var(--c-text-muted); }
  .progress__label strong { color: var(--c-text); font-variant-numeric: tabular-nums; }
  .progress__track { height: 8px; border-radius: 999px; background: var(--c-border); overflow: hidden; }
  .progress__bar {
    height: 100%; width: 0; border-radius: inherit; background: var(--c-primary);
    transition: width 400ms var(--ease);
  }

  .stack { display: grid; gap: 16px; }

  .shortcuts { margin-top: 24px; text-align: center; font-size: 0.8125rem; color: var(--c-text-subtle); }
  .shortcuts kbd { margin: 0 2px; }

  @media (max-width: 680px) {
    .shell { padding: 16px 16px 96px; }
    .topbar { flex-wrap: wrap; gap: 12px; }
    .brand h1 { font-size: 1.375rem; }
    .progress { order: 3; width: 100%; margin-left: 0; }
    .theme { margin-left: auto; }
    .shortcuts { display: none; }
  }
`;

const SORTERS = {
  newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
  oldest: (a, b) => a.createdAt.localeCompare(b.createdAt),
  az: (a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }),
  'pending-first': (a, b) => Number(a.completed) - Number(b.completed) || b.createdAt.localeCompare(a.createdAt),
};

class TaskApp extends HTMLElement {
  #store;
  #view = { query: '', ...loadPrefs() };
  #visible = [];
  #els = {};

  connectedCallback() {
    if (this.shadowRoot) return; // ya inicializado
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = /* html */ `
      <div class="shell">
        <header class="topbar">
          <div class="brand">
            ${icons.logo}
            <div>
              <h1>Taskly</h1>
              <p>Tus tareas, claras y en orden.</p>
            </div>
          </div>
          <div class="progress" id="progress">
            <div class="progress__label">
              <span>Progreso</span>
              <strong id="progress-text">0 de 0</strong>
            </div>
            <div class="progress__track" role="progressbar" id="progressbar"
              aria-label="Tareas completadas" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
              <div class="progress__bar" id="progress-bar"></div>
            </div>
          </div>
          <button type="button" class="icon-btn theme" id="theme"></button>
        </header>

        <main class="stack">
          <task-toolbar></task-toolbar>
          <task-list></task-list>
        </main>

        <p class="shortcuts">Atajos: <kbd>N</kbd> nueva tarea · <kbd>/</kbd> buscar · <kbd>Esc</kbd> cerrar</p>
      </div>

      <task-form-modal></task-form-modal>
      <import-modal></import-modal>
      <confirm-dialog></confirm-dialog>
      <toast-region></toast-region>
    `;
    applyStyles(root, baseCSS, css);

    const $ = (s) => root.querySelector(s);
    this.#els = {
      toolbar: $('task-toolbar'),
      list: $('task-list'),
      form: $('task-form-modal'),
      importer: $('import-modal'),
      confirm: $('confirm-dialog'),
      toasts: $('toast-region'),
      progressText: $('#progress-text'),
      progressBar: $('#progress-bar'),
      progressTrack: $('#progressbar'),
      theme: $('#theme'),
    };

    this.#store = new TaskStore();
    this.#store.addEventListener('change', (e) => {
      this.#render();
      if (e.detail.reason === 'sync') this.#toast('La lista se actualizó desde otra pestaña.');
    });
    this.#store.addEventListener('error', (e) => this.#toast(e.detail.error.message, 'error'));

    this.#bindEvents(root);
    this.#initTheme();
    this.#els.toolbar.state = this.#view;
    this.#render();
  }

  /* ---------------- Vista ---------------- */

  #computeView() {
    const all = this.#store.getAll();
    const { query, status, origin, sort } = this.#view;
    const q = fold(query.trim());

    // Los contadores del filtro de estado respetan origen y búsqueda (lo que el usuario "ve").
    const scoped = all.filter((t) => {
      if (origin !== 'all' && t.source !== origin) return false;
      if (q && !fold(t.title).includes(q) && !t.id.toLowerCase().includes(q)) return false;
      return true;
    });
    const counts = {
      all: scoped.length,
      pending: scoped.filter((t) => !t.completed).length,
      completed: scoped.filter((t) => t.completed).length,
    };
    const visible = scoped
      .filter((t) => (status === 'pending' ? !t.completed : status === 'completed' ? t.completed : true))
      .sort(SORTERS[sort] ?? SORTERS.newest);

    return { all, visible, counts };
  }

  #render() {
    const { all, visible, counts } = this.#computeView();
    this.#visible = visible;
    const completable = visible.filter((t) => !t.completed && !isReadOnly(t)).length;

    this.#els.toolbar.update({ counts, total: all.length, visible: visible.length, completable });
    this.#els.list.render({
      tasks: visible,
      query: this.#view.query,
      emptyKind: all.length === 0 ? 'no-tasks' : 'no-results',
    });

    const done = all.filter((t) => t.completed).length;
    const pct = all.length ? Math.round((done / all.length) * 100) : 0;
    this.#els.progressText.textContent = `${done} de ${all.length} · ${pct}%`;
    this.#els.progressBar.style.width = `${pct}%`;
    this.#els.progressTrack.setAttribute('aria-valuenow', String(pct));
    this.#els.progressTrack.setAttribute('aria-valuetext', `${done} de ${all.length} tareas completadas`);
  }

  /* ---------------- Eventos ---------------- */

  #bindEvents(root) {
    const on = (type, handler) => root.addEventListener(type, (e) => handler(e.detail ?? {}));

    on('toolbar:search', ({ query }) => {
      this.#view.query = query;
      this.#render();
    });
    on('toolbar:filter', ({ status, origin, sort }) => {
      Object.assign(this.#view, { status, origin, sort });
      savePrefs(this.#view);
      this.#render();
    });
    on('toolbar:action', ({ action }) => this.#runAction(action));
    on('list:action', ({ action }) => this.#runAction(action));

    // El cambio de estado se refleja en la casilla (anunciada por lectores de pantalla) y en el progreso.
    on('task:toggle', ({ id }) => this.#safely(() => this.#store.toggle(id)));
    on('task:edit', ({ id }) => {
      const task = this.#store.get(id);
      if (!task) return;
      if (isReadOnly(task)) {
        this.#toast('Las tareas importadas no se pueden editar; solo eliminar.', 'info');
        return;
      }
      this.#els.form.openEdit(task);
    });
    on('task:delete', ({ id }) => this.#deleteTask(id));

    on('taskform:submit', ({ mode, id, data }) => this.#safely(() => {
      if (mode === 'edit') {
        this.#store.update(id, data);
        this.#toast('Cambios guardados.', 'success');
      } else {
        this.#store.add(data);
        this.#toast('Tarea creada.', 'success');
        this.#revealIfHidden(data.completed);
      }
    }));

    on('import:confirm', ({ todos }) => {
      const { added, skipped } = this.#store.importTodos(todos);
      const extra = skipped ? ` (${plural(skipped, 'ya existía', 'ya existían')})` : '';
      this.#toast(
        added ? `${plural(added, 'tarea importada', 'tareas importadas')}${extra}.` : `No se importó nada${extra}.`,
        added ? 'success' : 'info',
      );
      if (added && this.#view.origin === 'local') {
        this.#setView({ origin: 'all' });
      }
    });

    document.addEventListener('keydown', (e) => this.#onShortcut(e));
    this.#els.theme.addEventListener('click', () => this.#toggleTheme());
  }

  async #runAction(action) {
    switch (action) {
      case 'create':
        this.#els.form.openCreate();
        break;
      case 'import':
        this.#els.importer.open(this.#store.importedExternalIds());
        break;
      case 'complete':
        await this.#completeVisible();
        break;
      case 'clear':
        await this.#clearAll();
        break;
      case 'clear-filters':
        this.#setView({ query: '', status: 'all', origin: 'all' });
        break;
    }
  }

  async #completeVisible() {
    const candidates = this.#visible.filter((t) => !t.completed);
    const editable = candidates.filter((t) => !isReadOnly(t));
    const skipped = candidates.length - editable.length;
    if (!editable.length) {
      this.#toast('No hay tareas visibles pendientes que se puedan completar.');
      return;
    }
    const ok = await this.#els.confirm.ask({
      title: 'Marcar como terminadas',
      message:
        `Se marcarán ${plural(editable.length, 'tarea pendiente', 'tareas pendientes')} de la vista actual como completadas.` +
        (skipped ? ` ${plural(skipped, 'tarea importada se omitirá', 'tareas importadas se omitirán')} porque son de solo lectura.` : ''),
      confirmLabel: 'Marcar terminadas',
    });
    if (!ok) return;
    const changed = this.#store.setCompleted(editable.map((t) => t.id), true);
    this.#toast(`${plural(changed.length, 'tarea marcada', 'tareas marcadas')} como terminadas.`, 'success', {
      actionLabel: 'Deshacer',
      onAction: () => this.#store.setCompleted(changed, false),
    });
  }

  async #clearAll() {
    const total = this.#store.size;
    if (!total) return;
    const ok = await this.#els.confirm.ask({
      title: '¿Vaciar la lista de tareas?',
      message: `Se eliminarán las ${plural(total, 'tarea', 'tareas')} (creadas e importadas). Podrás deshacerlo durante unos segundos.`,
      confirmLabel: 'Vaciar lista',
      tone: 'danger',
    });
    if (!ok) return;
    const removed = this.#store.clear();
    this.#toast('Lista vaciada.', 'info', {
      actionLabel: 'Deshacer',
      onAction: () => this.#store.restore(removed),
      duration: 8000,
    });
  }

  #deleteTask(id) {
    const index = this.#visible.findIndex((t) => t.id === id);
    this.#safely(() => {
      const removed = this.#store.remove(id);
      this.#els.list.focusAt(Math.max(0, index));
      this.#toast(`Se eliminó “${removed.title.length > 40 ? `${removed.title.slice(0, 40)}…` : removed.title}”.`, 'info', {
        actionLabel: 'Deshacer',
        onAction: () => this.#store.restore([removed]),
      });
    });
  }

  /** Si la tarea recién creada queda oculta por los filtros, se avisa al usuario. */
  #revealIfHidden(completed) {
    const { status, origin, query } = this.#view;
    const hidden = (status === 'pending' && completed) || (status === 'completed' && !completed) || origin === 'api' || query;
    if (hidden) {
      this.#toast('La tarea se creó, pero los filtros actuales la ocultan.', 'info', {
        actionLabel: 'Ver todas',
        onAction: () => this.#setView({ query: '', status: 'all', origin: 'all' }),
      });
    }
  }

  #setView(changes) {
    Object.assign(this.#view, changes);
    savePrefs(this.#view);
    this.#els.toolbar.state = this.#view;
    this.#render();
  }

  #safely(fn) {
    try {
      fn();
    } catch (error) {
      const message = error instanceof ReadOnlyTaskError || error instanceof TypeError
        ? error.message
        : 'Ocurrió un error inesperado. Inténtalo de nuevo.';
      if (!(error instanceof ReadOnlyTaskError)) console.error('[Taskly]', error);
      this.#toast(message, 'error');
    }
  }

  #toast(message, tone = 'info', options = {}) {
    this.#els.toasts.show({ message, tone, ...options });
  }

  /* ---------------- Atajos de teclado ---------------- */

  #anyModalOpen() {
    const { form, importer, confirm } = this.#els;
    return form.isOpen || importer.isOpen || confirm.isOpen;
  }

  #onShortcut(e) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.#anyModalOpen() || isTypingTarget(e)) return;
    if (e.key === 'n' || e.key === 'N') {
      e.preventDefault();
      this.#els.form.openCreate();
    } else if (e.key === '/') {
      e.preventDefault();
      this.#els.toolbar.focusSearch();
    }
  }

  /* ---------------- Tema ---------------- */

  #initTheme() {
    const saved = loadTheme();
    if (saved) document.documentElement.dataset.theme = saved;
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.#paintThemeButton());
    this.#paintThemeButton();
  }

  #effectiveTheme() {
    return document.documentElement.dataset.theme
      ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  #toggleTheme() {
    const next = this.#effectiveTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    saveTheme(next);
    this.#paintThemeButton();
  }

  #paintThemeButton() {
    const dark = this.#effectiveTheme() === 'dark';
    const button = this.#els.theme;
    button.innerHTML = dark ? icons.sun : icons.moon;
    button.setAttribute('aria-label', dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    button.title = button.getAttribute('aria-label');
  }
}

customElements.define('task-app', TaskApp);
