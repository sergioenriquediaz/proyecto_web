/**
 * <task-form-modal> — Modal para crear o editar una tarea.
 * Métodos: openCreate(), openEdit(task), close()
 * Evento: taskform:submit → { mode: 'create'|'edit', id, data: { title, createdAt, completed } }
 *
 * Usa <dialog> nativo con showModal(): bloquea el fondo, atrapa el foco,
 * cierra con Escape y devuelve el foco al elemento que lo abrió.
 */
import { applyStyles, baseCSS, dialogCSS } from './shared-styles.js';
import { icons } from '../utils/icons.js';
import { emit, deepActiveElement, closeOnBackdrop } from '../utils/dom.js';
import { cleanTitle } from '../utils/text.js';
import { toDateInputValue, todayInputValue, dateInputToIso } from '../utils/date.js';
import { validateTitle, TITLE_MAX } from '../models/task.js';

const css = /* css */ `
  .field { display: grid; gap: 6px; margin-bottom: 18px; }
  .label { font-weight: 600; font-size: 0.9375rem; }
  .req { color: var(--c-danger); margin-left: 2px; }
  .field__row { display: flex; justify-content: space-between; gap: 12px; font-size: 0.8125rem; color: var(--c-text-muted); }
  .counter { font-variant-numeric: tabular-nums; }
  .counter.is-near { color: var(--c-warning); }
  .error { display: flex; align-items: center; gap: 6px; font-size: 0.8125rem; font-weight: 600; color: var(--c-danger); }
  .date-input { max-width: 220px; }

  .switch { display: flex; align-items: center; gap: 12px; cursor: pointer; padding: 6px 0; width: fit-content; }
  .switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
  .switch__track {
    position: relative; flex: none; width: 44px; height: 26px; border-radius: 999px;
    background: var(--c-border-strong); transition: background var(--dur) var(--ease);
  }
  .switch__track::after {
    content: ""; position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%;
    background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 0.25); transition: transform var(--dur) var(--ease);
  }
  .switch input:checked + .switch__track { background: var(--c-primary); }
  .switch input:checked + .switch__track::after { transform: translateX(18px); }
  .switch input:focus-visible + .switch__track { box-shadow: var(--focus-ring); }
  .switch__text { font-weight: 600; }
  .switch__hint { display: block; font-weight: 400; font-size: 0.8125rem; color: var(--c-text-muted); }

  .meta-line { margin-top: 14px; font-size: 0.8125rem; color: var(--c-text-muted); }
  .meta-line code { font-family: var(--font-mono); color: var(--c-text); }
  .footer-hint { margin-right: auto; font-size: 0.8125rem; color: var(--c-text-subtle); }
  @media (max-width: 600px) { .footer-hint { display: none; } }
`;

class TaskFormModal extends HTMLElement {
  #refs = {};
  #mode = 'create';
  #editing = null;
  #submitted = false;
  #returnFocus = null;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = /* html */ `
      <dialog aria-labelledby="form-title" aria-describedby="form-desc">
        <form class="dialog__form" novalidate>
          <header class="dialog__header">
            <div>
              <h2 class="dialog__title" id="form-title">Nueva tarea</h2>
              <p class="dialog__subtitle" id="form-desc">Los campos marcados con * son obligatorios.</p>
            </div>
            <button type="button" class="icon-btn" data-close aria-label="Cerrar">${icons.close}</button>
          </header>

          <div class="dialog__body">
            <div class="field">
              <label class="label" for="title">Título<span class="req" aria-hidden="true">*</span></label>
              <textarea id="title" name="title" class="textarea" rows="2" maxlength="${TITLE_MAX}" required
                placeholder="Ej.: Preparar la presentación del lunes"
                aria-describedby="title-help title-error"></textarea>
              <div class="field__row">
                <span id="title-help">Describe brevemente qué hay que hacer.</span>
                <span class="counter" id="counter" aria-live="polite">0/${TITLE_MAX}</span>
              </div>
              <p class="error" id="title-error" hidden></p>
            </div>

            <div class="field">
              <label class="label" for="date">Fecha de registro<span class="req" aria-hidden="true">*</span></label>
              <input id="date" name="date" type="date" class="input date-input" required min="2000-01-01"
                aria-describedby="date-error">
              <p class="error" id="date-error" hidden></p>
            </div>

            <label class="switch">
              <input type="checkbox" id="completed" name="completed" role="switch">
              <span class="switch__track" aria-hidden="true"></span>
              <span class="switch__text">Completada
                <span class="switch__hint">Actívalo si la tarea ya está terminada.</span>
              </span>
            </label>

            <p class="meta-line" id="meta" hidden>Identificador: <code id="meta-id"></code></p>
          </div>

          <footer class="dialog__footer">
            <span class="footer-hint"><kbd>Enter</kbd> guardar · <kbd>Esc</kbd> cancelar</span>
            <button type="button" class="btn btn--ghost" data-close>Cancelar</button>
            <button type="submit" class="btn btn--primary" id="submit">Crear tarea</button>
          </footer>
        </form>
      </dialog>
    `;
    applyStyles(root, baseCSS, dialogCSS, css);

    const $ = (s) => root.querySelector(s);
    this.#refs = {
      dialog: $('dialog'),
      form: $('form'),
      heading: $('#form-title'),
      title: $('#title'),
      counter: $('#counter'),
      titleError: $('#title-error'),
      date: $('#date'),
      dateError: $('#date-error'),
      completed: $('#completed'),
      meta: $('#meta'),
      metaId: $('#meta-id'),
      submit: $('#submit'),
    };

    const r = this.#refs;
    root.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.close()));
    closeOnBackdrop(r.dialog, () => this.close());
    r.dialog.addEventListener('close', () => this.#onClosed());
    r.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.#submit();
    });
    r.title.addEventListener('input', () => {
      this.#updateCounter();
      if (this.#submitted) this.#validate();
    });
    r.title.addEventListener('keydown', (e) => {
      // Enter guarda (los títulos son de una línea); Shift+Enter no inserta saltos.
      if (e.key === 'Enter') {
        e.preventDefault();
        if (!e.shiftKey) r.form.requestSubmit();
      }
    });
    r.date.addEventListener('input', () => this.#submitted && this.#validate());
  }

  get isOpen() {
    return this.#refs.dialog.open;
  }

  openCreate() {
    this.#mode = 'create';
    this.#editing = null;
    this.#fill({ title: '', date: todayInputValue(), completed: false });
    this.#refs.heading.textContent = 'Nueva tarea';
    this.#refs.submit.textContent = 'Crear tarea';
    this.#refs.meta.hidden = true;
    this.#show();
  }

  openEdit(task) {
    this.#mode = 'edit';
    this.#editing = task;
    this.#fill({ title: task.title, date: toDateInputValue(task.createdAt), completed: task.completed });
    this.#refs.heading.textContent = 'Editar tarea';
    this.#refs.submit.textContent = 'Guardar cambios';
    this.#refs.metaId.textContent = task.id;
    this.#refs.meta.hidden = false;
    this.#show();
  }

  close() {
    if (this.#refs.dialog.open) this.#refs.dialog.close();
  }

  #fill({ title, date, completed }) {
    const r = this.#refs;
    this.#submitted = false;
    r.title.value = title;
    r.date.value = date;
    r.date.max = todayInputValue();
    r.completed.checked = completed;
    this.#setError(r.title, r.titleError, null);
    this.#setError(r.date, r.dateError, null);
    this.#updateCounter();
  }

  #show() {
    this.#returnFocus = deepActiveElement();
    this.#refs.dialog.showModal();
    const { title } = this.#refs;
    title.focus();
    title.setSelectionRange(title.value.length, title.value.length);
  }

  #onClosed() {
    const target = this.#returnFocus;
    this.#returnFocus = null;
    if (target?.isConnected) requestAnimationFrame(() => target.focus());
  }

  #updateCounter() {
    const length = this.#refs.title.value.length;
    this.#refs.counter.textContent = `${length}/${TITLE_MAX}`;
    this.#refs.counter.classList.toggle('is-near', length > TITLE_MAX * 0.9);
  }

  #validate() {
    const r = this.#refs;
    const titleError = validateTitle(r.title.value);

    let dateError = null;
    if (!r.date.value) dateError = 'Selecciona la fecha de registro.';
    else if (!dateInputToIso(r.date.value)) dateError = 'La fecha no es válida.';
    else if (r.date.value > todayInputValue()) dateError = 'La fecha de registro no puede ser futura.';
    else if (r.date.value < r.date.min) dateError = 'La fecha debe ser posterior al año 2000.';

    this.#setError(r.title, r.titleError, titleError);
    this.#setError(r.date, r.dateError, dateError);
    return { titleError, dateError };
  }

  #setError(input, output, message) {
    input.setAttribute('aria-invalid', String(Boolean(message)));
    output.hidden = !message;
    output.textContent = message ?? '';
  }

  #submit() {
    this.#submitted = true;
    const { titleError, dateError } = this.#validate();
    if (titleError || dateError) {
      (titleError ? this.#refs.title : this.#refs.date).focus();
      return;
    }

    const r = this.#refs;
    const original = this.#editing;
    // Si la fecha no cambió al editar, se conserva la marca de tiempo original.
    const createdAt =
      original && toDateInputValue(original.createdAt) === r.date.value
        ? original.createdAt
        : dateInputToIso(r.date.value);

    emit(this, 'taskform:submit', {
      mode: this.#mode,
      id: original?.id ?? null,
      data: { title: cleanTitle(r.title.value), createdAt, completed: r.completed.checked },
    });
    this.close();
  }
}

customElements.define('task-form-modal', TaskFormModal);
