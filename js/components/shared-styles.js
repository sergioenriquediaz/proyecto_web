/**
 * Estilos compartidos entre los Shadow DOM de todos los componentes.
 * Se usan Constructable Stylesheets (adoptedStyleSheets): una sola instancia
 * de CSSStyleSheet se comparte en memoria entre todos los shadow roots.
 * Si el navegador no las soporta, se recurre a etiquetas <style>.
 */

const supportsAdopted =
  'adoptedStyleSheets' in Document.prototype && 'replaceSync' in CSSStyleSheet.prototype;

const sheetCache = new Map();

/** Aplica las hojas de estilo a un shadow root (llamar después de asignar innerHTML). */
export function applyStyles(shadowRoot, ...cssTexts) {
  if (supportsAdopted) {
    shadowRoot.adoptedStyleSheets = cssTexts.map((text) => {
      if (!sheetCache.has(text)) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(text);
        sheetCache.set(text, sheet);
      }
      return sheetCache.get(text);
    });
  } else {
    const styles = cssTexts.map((text) => {
      const style = document.createElement('style');
      style.textContent = text;
      return style;
    });
    shadowRoot.prepend(...styles);
  }
}

export const baseCSS = /* css */ `
  :host { box-sizing: border-box; font-family: var(--font-sans); color: var(--c-text); }
  :host([hidden]) { display: none !important; }
  *, *::before, *::after { box-sizing: inherit; }
  [hidden] { display: none !important; }

  h1, h2, h3, p { margin: 0; }
  button, input, select, textarea { font: inherit; color: inherit; }

  .sr-only {
    position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }

  .icon { flex: none; display: block; }

  :focus-visible { outline: 2px solid var(--c-primary); outline-offset: 2px; }

  /* ---------- Botones ---------- */
  .btn {
    --btn-bg: var(--c-surface);
    --btn-fg: var(--c-text);
    --btn-border: var(--c-border-strong);
    --btn-bg-hover: var(--c-surface-hover);
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 42px; padding: 0 16px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--btn-border);
    background: var(--btn-bg); color: var(--btn-fg);
    font-weight: 600; font-size: 0.9375rem; line-height: 1; white-space: nowrap;
    cursor: pointer; user-select: none;
    transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease),
      transform var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
  }
  .btn:hover:not(:disabled) { background: var(--btn-bg-hover); }
  .btn:active:not(:disabled) { transform: translateY(1px); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }

  .btn--primary {
    --btn-bg: var(--c-primary); --btn-fg: var(--c-on-primary);
    --btn-border: var(--c-primary); --btn-bg-hover: var(--c-primary-hover);
    box-shadow: var(--shadow-sm);
  }
  .btn--ghost { --btn-bg: transparent; --btn-border: transparent; --btn-bg-hover: var(--c-surface-2); }
  .btn--danger {
    --btn-bg: var(--c-danger); --btn-fg: #fff; --btn-border: var(--c-danger); --btn-bg-hover: var(--c-danger-hover);
  }
  .btn--danger-soft {
    --btn-bg: transparent; --btn-fg: var(--c-danger);
    --btn-border: color-mix(in srgb, var(--c-danger) 35%, transparent);
    --btn-bg-hover: var(--c-danger-soft);
  }
  .btn--sm { min-height: 34px; padding: 0 12px; font-size: 0.875rem; }

  .icon-btn {
    display: inline-grid; place-items: center;
    width: 40px; height: 40px; padding: 0;
    border-radius: var(--radius-sm); border: 1px solid transparent;
    background: transparent; color: var(--c-text-muted); cursor: pointer;
    transition: background var(--dur) var(--ease), color var(--dur) var(--ease);
  }
  .icon-btn:hover { background: var(--c-surface-2); color: var(--c-text); }
  .icon-btn:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  .icon-btn--danger:hover { background: var(--c-danger-soft); color: var(--c-danger); }
  .icon-btn[aria-disabled="true"] { opacity: 0.45; cursor: not-allowed; }
  .icon-btn[aria-disabled="true"]:hover { background: transparent; color: var(--c-text-muted); }

  /* ---------- Campos ---------- */
  .input, .select, .textarea {
    width: 100%; min-height: 42px; padding: 9px 12px;
    border: 1px solid var(--c-border-strong); border-radius: var(--radius-sm);
    background: var(--c-surface); color: var(--c-text);
    transition: border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease);
  }
  .input::placeholder, .textarea::placeholder { color: var(--c-text-subtle); }
  .input:hover, .select:hover, .textarea:hover { border-color: var(--c-text-subtle); }
  .input:focus, .select:focus, .textarea:focus {
    outline: none; border-color: var(--c-primary); box-shadow: var(--focus-ring);
  }
  .input[aria-invalid="true"], .textarea[aria-invalid="true"] { border-color: var(--c-danger); }
  .input[aria-invalid="true"]:focus, .textarea[aria-invalid="true"]:focus {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-danger) 25%, transparent);
  }
  .textarea { resize: vertical; line-height: 1.45; }
  .select {
    appearance: none; padding-right: 36px; cursor: pointer;
    background-image: linear-gradient(45deg, transparent 50%, currentColor 50%),
      linear-gradient(135deg, currentColor 50%, transparent 50%);
    background-position: calc(100% - 18px) 52%, calc(100% - 13px) 52%;
    background-size: 5px 5px; background-repeat: no-repeat;
  }

  kbd {
    display: inline-block; min-width: 1.6em; padding: 1px 6px;
    font: 600 0.75rem/1.4 var(--font-mono); text-align: center;
    color: var(--c-text-muted); background: var(--c-surface-2);
    border: 1px solid var(--c-border); border-bottom-width: 2px; border-radius: 5px;
  }

  mark { background: var(--c-mark); color: inherit; border-radius: 3px; padding: 0 1px; }

  .spinner {
    width: 22px; height: 22px; border-radius: 50%;
    border: 2.5px solid var(--c-border-strong); border-top-color: var(--c-primary);
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .badge {
    display: inline-flex; align-items: center; gap: 4px;
    padding: 2px 8px; border-radius: 999px;
    font-size: 0.75rem; font-weight: 600; line-height: 1.5; white-space: nowrap;
    background: var(--c-surface-2); color: var(--c-text-muted);
  }
  .badge--success { background: var(--c-success-soft); color: var(--c-success); }
  .badge--warning { background: var(--c-warning-soft); color: var(--c-warning); }
  .badge--info { background: var(--c-info-soft); color: var(--c-info); }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
  }
`;

/** Estilos comunes de los modales basados en <dialog>. */
export const dialogCSS = /* css */ `
  dialog {
    width: min(560px, calc(100vw - 32px));
    max-height: min(760px, calc(100dvh - 32px));
    padding: 0; border: 1px solid var(--c-border); border-radius: var(--radius-lg);
    background: var(--c-surface); color: var(--c-text);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }
  dialog[open] { display: flex; flex-direction: column; animation: dialog-in 200ms var(--ease); }
  dialog::backdrop { background: var(--c-backdrop); backdrop-filter: blur(2px); animation: fade-in 200ms ease; }
  @keyframes dialog-in { from { opacity: 0; transform: translateY(8px) scale(0.98); } }
  @keyframes fade-in { from { opacity: 0; } }

  .dialog__form { display: flex; flex-direction: column; min-height: 0; flex: 1; }
  .dialog__header {
    display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
    padding: 20px 20px 12px 24px;
  }
  .dialog__title { font: 700 1.25rem/1.3 var(--font-display); letter-spacing: -0.01em; }
  .dialog__subtitle { margin-top: 4px; font-size: 0.875rem; color: var(--c-text-muted); }
  .dialog__subtitle a { color: var(--c-primary); }
  .dialog__body { padding: 8px 24px 20px; overflow: auto; flex: 1; min-height: 0; }
  .dialog__footer {
    display: flex; justify-content: flex-end; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 14px 24px; border-top: 1px solid var(--c-border); background: var(--c-surface-2);
  }

  /* En móvil los modales se muestran como "bottom sheet" */
  @media (max-width: 600px) {
    dialog {
      width: 100vw; max-width: 100vw; max-height: 94dvh;
      margin: auto 0 0; border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      border-left: 0; border-right: 0; border-bottom: 0;
    }
    dialog[open] { animation: sheet-in 240ms var(--ease); }
    @keyframes sheet-in { from { transform: translateY(40px); opacity: 0; } }
    .dialog__header { padding: 18px 16px 10px 20px; }
    .dialog__body { padding: 8px 20px 18px; }
    .dialog__footer { padding: 12px 20px calc(12px + env(safe-area-inset-bottom)); }
    .dialog__footer .btn { flex: 1; }
  }
`;
