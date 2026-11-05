/**
 * Modelo de tarea (estructura JSON persistida):
 *
 * {
 *   "id": "TSK-L-20261104-7KQ2XM",   // estándar propio (ver utils/id.js)
 *   "title": "Comprar café",          // título / descripción (3–200 caracteres)
 *   "createdAt": "2026-11-05T00:20:00.000Z", // fecha de registro (ISO 8601)
 *   "completed": false,               // estado
 *   "source": "local",                // "local" (creada) | "api" (importada)
 *   "externalId": null,               // id original en la API (solo importadas)
 *   "updatedAt": "2026-11-05T00:20:00.000Z"
 * }
 */
import { generateTaskId, isValidTaskId } from '../utils/id.js';
import { cleanTitle } from '../utils/text.js';
import { isValidIso } from '../utils/date.js';

export const TASK_SOURCE = Object.freeze({ LOCAL: 'local', API: 'api' });
export const TITLE_MIN = 3;
export const TITLE_MAX = 200;

/** Valida un título y devuelve un mensaje de error o null. */
export function validateTitle(rawTitle) {
  const title = cleanTitle(rawTitle);
  if (!title) return 'El título es obligatorio.';
  if (title.length < TITLE_MIN) return `Escribe al menos ${TITLE_MIN} caracteres.`;
  if (title.length > TITLE_MAX) return `El título no puede superar ${TITLE_MAX} caracteres.`;
  return null;
}

export function isReadOnly(task) {
  return task?.source === TASK_SOURCE.API;
}

export function createLocalTask({ title, createdAt, completed = false }, existingIds) {
  const now = new Date();
  const created = isValidIso(createdAt) ? createdAt : now.toISOString();
  return {
    id: generateTaskId(TASK_SOURCE.LOCAL, existingIds, now),
    title: cleanTitle(title),
    createdAt: created,
    completed: Boolean(completed),
    source: TASK_SOURCE.LOCAL,
    externalId: null,
    updatedAt: now.toISOString(),
  };
}

/** Convierte un "todo" de la API en una tarea de Taskly con identificador propio. */
export function createImportedTask(todo, existingIds, now = new Date()) {
  return {
    id: generateTaskId(TASK_SOURCE.API, existingIds, now),
    title: cleanTitle(todo.title).slice(0, TITLE_MAX),
    createdAt: now.toISOString(),
    completed: Boolean(todo.completed),
    source: TASK_SOURCE.API,
    externalId: todo.externalId,
    updatedAt: now.toISOString(),
  };
}

/**
 * Normaliza un objeto leído de localStorage. Devuelve null si no es recuperable,
 * protegiendo la app frente a datos corruptos o editados manualmente.
 */
export function sanitizeTask(raw, existingIds = new Set()) {
  if (!raw || typeof raw !== 'object') return null;
  const title = cleanTitle(raw.title);
  if (!title) return null;

  const source = raw.source === TASK_SOURCE.API ? TASK_SOURCE.API : TASK_SOURCE.LOCAL;
  let id = isValidTaskId(raw.id) && !existingIds.has(raw.id) ? raw.id : null;
  if (!id) id = generateTaskId(source, existingIds);

  const createdAt = isValidIso(raw.createdAt) ? raw.createdAt : new Date().toISOString();
  return {
    id,
    title: title.slice(0, TITLE_MAX),
    createdAt,
    completed: raw.completed === true,
    source,
    externalId: source === TASK_SOURCE.API && Number.isFinite(raw.externalId) ? raw.externalId : null,
    updatedAt: isValidIso(raw.updatedAt) ? raw.updatedAt : createdAt,
  };
}
