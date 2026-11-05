/** Utilidades de texto: escape seguro, búsqueda sin tildes y resaltado. */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Normaliza para comparar: minúsculas y sin diacríticos ("Canción" → "cancion"). */
export function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Limpia un título: quita saltos de línea y espacios repetidos. */
export function cleanTitle(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Divide un texto en segmentos marcando las coincidencias con la búsqueda,
 * ignorando mayúsculas y tildes pero conservando el texto original.
 * @returns {{text: string, match: boolean}[]}
 */
export function splitMatches(text, query) {
  const source = String(text ?? '');
  const needle = fold(String(query ?? '').trim());
  if (!needle) return [{ text: source, match: false }];

  // Construye el texto normalizado y un mapa índice-normalizado → índice-original.
  let folded = '';
  const map = [];
  let originalIndex = 0;
  for (const ch of source) {
    const f = fold(ch);
    folded += f;
    for (let k = 0; k < f.length; k++) map.push(originalIndex);
    originalIndex += ch.length;
  }
  map.push(source.length); // centinela

  const segments = [];
  let cursor = 0;
  let found = folded.indexOf(needle);
  while (found !== -1) {
    const start = map[found];
    const end = map[found + needle.length] ?? source.length;
    if (start > cursor) segments.push({ text: source.slice(cursor, start), match: false });
    if (end > start) segments.push({ text: source.slice(start, end), match: true });
    cursor = Math.max(cursor, end);
    found = folded.indexOf(needle, found + needle.length);
  }
  if (cursor < source.length) segments.push({ text: source.slice(cursor), match: false });
  return segments.length ? segments : [{ text: source, match: false }];
}

/** Versión HTML (escapada) del resaltado, para plantillas con innerHTML. */
export function highlightHtml(text, query) {
  return splitMatches(text, query)
    .map((s) => (s.match ? `<mark>${escapeHtml(s.text)}</mark>` : escapeHtml(s.text)))
    .join('');
}

/** Versión DOM del resaltado (sin innerHTML). */
export function renderHighlight(target, text, query) {
  const fragment = document.createDocumentFragment();
  for (const seg of splitMatches(text, query)) {
    if (seg.match) {
      const mark = document.createElement('mark');
      mark.textContent = seg.text;
      fragment.append(mark);
    } else {
      fragment.append(document.createTextNode(seg.text));
    }
  }
  target.replaceChildren(fragment);
}

export function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
