/**
 * <toast-region> — Notificaciones no intrusivas con acción opcional ("Deshacer").
 *   toasts.show({ message, tone: 'info'|'success'|'error', actionLabel, onAction, duration })
 * Región aria-live para lectores de pantalla; se pausa al pasar el cursor o enfocar.
 */
import { applyStyles, baseCSS } from './shared-styles.js';
import { icons } from '../utils/icons.js';

const MAX_TOASTS = 3;

const css = /* css */ `
  :host {
    position: fixed; z-index: 50; right: 20px; bottom: 20px;
    width: min(400px, calc(100vw - 32px));
    pointer-events: none;
  }
  .region { display: flex; flex-direction: column; gap: 10px; margin: 0; padding: 0; list-style: none; }
  .toast {
    pointer-events: auto;
    display: flex; align-items: center; gap: 12px;
    padding: 12px 10px 12px 14px;
    border-radius: var(--radius);
    background: var(--c-text); color: var(--c-bg);
    box-shadow: var(--shadow-lg);
    animation: toast-in 220ms var(--ease);
  }
  .toast.is-leaving { animation: toast-out 180ms ease forwards; }
  @keyframes toast-in { from { opacity: 0; transform: translateY(12px); } }
  @keyframes toast-out { to { opacity: 0; transform: translateY(8px); } }
  .toast__icon { flex: none; }
  .toast--success .toast__icon { color: color-mix(in srgb, var(--c-success) 60%, var(--c-bg)); }
  .toast--error .toast__icon { color: color-mix(in srgb, var(--c-danger) 60%, var(--c-bg)); }
  .toast__msg { flex: 1; font-size: 0.9375rem; line-height: 1.4; }
  .toast__action {
    flex: none; border: 0; border-radius: 6px; padding: 6px 10px; cursor: pointer;
    background: color-mix(in srgb, var(--c-bg) 16%, transparent); color: var(--c-bg); font-weight: 700;
  }
  .toast__action:hover { background: color-mix(in srgb, var(--c-bg) 26%, transparent); }
  .toast__close {
    flex: none; display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 6px;
    background: transparent; color: inherit; opacity: 0.7; cursor: pointer;
  }
  .toast__close:hover { opacity: 1; background: color-mix(in srgb, var(--c-bg) 12%, transparent); }
  .toast button:focus-visible { outline: 2px solid var(--c-bg); outline-offset: 2px; }

  @media (max-width: 600px) {
    :host { left: 16px; right: 16px; width: auto; bottom: calc(16px + env(safe-area-inset-bottom)); }
  }
`;

const TONE_ICONS = { info: icons.info, success: icons.success, error: icons.error };

class ToastRegion extends HTMLElement {
  #region;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<ol class="region" aria-live="polite" aria-label="Notificaciones"></ol>`;
    applyStyles(root, baseCSS, css);
    this.#region = root.querySelector('.region');
  }

  show({ message, tone = 'info', actionLabel, onAction, duration = actionLabel ? 6000 : 3500 }) {
    while (this.#region.children.length >= MAX_TOASTS) this.#region.firstElementChild.remove();

    const li = document.createElement('li');
    li.className = `toast toast--${tone}`;
    li.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    li.innerHTML = /* html */ `
      <span class="toast__icon">${TONE_ICONS[tone] ?? icons.info}</span>
      <span class="toast__msg"></span>
      ${actionLabel ? '<button type="button" class="toast__action"></button>' : ''}
      <button type="button" class="toast__close" aria-label="Cerrar notificación">${icons.close}</button>
    `;
    li.querySelector('.toast__msg').textContent = message;

    let timer;
    let remaining = duration;
    let startedAt;
    const dismiss = () => {
      clearTimeout(timer);
      if (li.classList.contains('is-leaving')) return;
      li.classList.add('is-leaving');
      li.addEventListener('animationend', () => li.remove(), { once: true });
      setTimeout(() => li.remove(), 400); // por si no hay animaciones
    };
    let holds = 0; // hover y foco pueden solaparse
    const start = () => { startedAt = Date.now(); timer = setTimeout(dismiss, remaining); };
    const pause = () => {
      if (holds++ === 0) { clearTimeout(timer); remaining = Math.max(1000, remaining - (Date.now() - startedAt)); }
    };
    const resume = () => { if (holds > 0 && --holds === 0) start(); };

    if (actionLabel) {
      const action = li.querySelector('.toast__action');
      action.textContent = actionLabel;
      action.addEventListener('click', () => { onAction?.(); dismiss(); });
    }
    li.querySelector('.toast__close').addEventListener('click', dismiss);
    li.addEventListener('mouseenter', pause);
    li.addEventListener('mouseleave', resume);
    li.addEventListener('focusin', pause);
    li.addEventListener('focusout', resume);

    this.#region.append(li);
    start();
    return dismiss;
  }
}

customElements.define('toast-region', ToastRegion);
