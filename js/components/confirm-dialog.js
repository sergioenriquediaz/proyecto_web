/**
 * <confirm-dialog> — Confirmación accesible basada en promesas.
 *   const ok = await confirmDialog.ask({ title, message, confirmLabel, tone: 'danger' });
 */
import { applyStyles, baseCSS, dialogCSS } from './shared-styles.js';
import { icons } from '../utils/icons.js';
import { deepActiveElement, closeOnBackdrop } from '../utils/dom.js';

const css = /* css */ `
  dialog { width: min(440px, calc(100vw - 32px)); }
  .content { display: flex; gap: 16px; padding: 24px 24px 20px; }
  .icon-wrap {
    flex: none; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%;
    background: var(--c-primary-soft); color: var(--c-primary);
  }
  .is-danger .icon-wrap { background: var(--c-danger-soft); color: var(--c-danger); }
  .message { margin-top: 6px; color: var(--c-text-muted); }
  @media (max-width: 600px) { .content { padding: 20px; } }
`;

class ConfirmDialog extends HTMLElement {
  #refs = {};
  #resolve = null;
  #returnFocus = null;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = /* html */ `
      <dialog role="alertdialog" aria-labelledby="c-title" aria-describedby="c-message">
        <div class="content">
          <div class="icon-wrap" aria-hidden="true">${icons.alert}</div>
          <div>
            <h2 class="dialog__title" id="c-title"></h2>
            <p class="message" id="c-message"></p>
          </div>
        </div>
        <footer class="dialog__footer">
          <button type="button" class="btn btn--ghost" id="cancel">Cancelar</button>
          <button type="button" class="btn" id="accept">Confirmar</button>
        </footer>
      </dialog>
    `;
    applyStyles(root, baseCSS, dialogCSS, css);
    const $ = (s) => root.querySelector(s);
    this.#refs = { dialog: $('dialog'), title: $('#c-title'), message: $('#c-message'), cancel: $('#cancel'), accept: $('#accept') };

    this.#refs.cancel.addEventListener('click', () => this.#finish(false));
    this.#refs.accept.addEventListener('click', () => this.#finish(true));
    closeOnBackdrop(this.#refs.dialog, () => this.#finish(false));
    this.#refs.dialog.addEventListener('close', () => this.#finish(false));
  }

  get isOpen() {
    return this.#refs.dialog.open;
  }

  ask({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'primary' }) {
    const r = this.#refs;
    this.#finish(false); // resuelve cualquier pregunta previa
    r.title.textContent = title;
    r.message.textContent = message;
    r.accept.textContent = confirmLabel;
    r.cancel.textContent = cancelLabel;
    r.accept.className = `btn ${tone === 'danger' ? 'btn--danger' : 'btn--primary'}`;
    r.dialog.classList.toggle('is-danger', tone === 'danger');

    this.#returnFocus = deepActiveElement();
    r.dialog.showModal();
    // En acciones destructivas el foco inicial va a "Cancelar" (opción segura).
    (tone === 'danger' ? r.cancel : r.accept).focus();
    return new Promise((resolve) => { this.#resolve = resolve; });
  }

  #finish(result) {
    if (!this.#resolve) return;
    const resolve = this.#resolve;
    this.#resolve = null;
    if (this.#refs.dialog.open) this.#refs.dialog.close();
    const target = this.#returnFocus;
    this.#returnFocus = null;
    if (target?.isConnected) target.focus();
    resolve(result);
  }
}

customElements.define('confirm-dialog', ConfirmDialog);
