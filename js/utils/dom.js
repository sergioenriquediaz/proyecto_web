/** Utilidades DOM compartidas por los componentes. */

/** Elemento con foco real, atravesando shadow roots. */
export function deepActiveElement(root = document) {
  let el = root.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

/** Despacha un CustomEvent que atraviesa los límites del Shadow DOM. */
export function emit(host, type, detail = {}) {
  host.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
}

/** true si el evento de teclado ocurre mientras se escribe en un campo. */
export function isTypingTarget(event) {
  const target = event.composedPath()[0];
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function debounce(fn, wait = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Cierra un <dialog> al hacer clic en el fondo (backdrop). */
export function closeOnBackdrop(dialog, onClose = () => dialog.close()) {
  let pressedOnBackdrop = false;
  dialog.addEventListener('pointerdown', (e) => { pressedOnBackdrop = e.target === dialog; });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog && pressedOnBackdrop) onClose();
    pressedOnBackdrop = false;
  });
}
