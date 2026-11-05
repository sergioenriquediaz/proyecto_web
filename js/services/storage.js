/**
 * Persistencia en localStorage con estructura JSON versionada:
 *
 *   localStorage["taskly:tasks"] = {
 *     "version": 1,
 *     "savedAt": "2026-11-05T00:20:00.000Z",
 *     "tasks": [ ...Task ]
 *   }
 *
 * Además se guardan, por separado, las preferencias de la vista y el tema.
 */
import { sanitizeTask } from '../models/task.js';

export const STORAGE_KEY = 'taskly:tasks';
export const PREFS_KEY = 'taskly:prefs';
export const THEME_KEY = 'taskly:theme';
export const SCHEMA_VERSION = 1;

export class StorageError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'StorageError';
    this.cause = cause;
  }
}

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // modo privado estricto o almacenamiento bloqueado
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/** Lee y valida las tareas. Si el JSON está corrupto, lo respalda y empieza vacío. */
export function loadTasks() {
  const raw = safeGet(STORAGE_KEY);
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    const list = Array.isArray(data) ? data : data?.tasks;
    if (!Array.isArray(list)) throw new Error('Formato no reconocido');
    const ids = new Set();
    const tasks = [];
    for (const item of list) {
      const task = sanitizeTask(item, ids);
      if (task) {
        ids.add(task.id);
        tasks.push(task);
      }
    }
    return tasks;
  } catch (error) {
    console.warn('[Taskly] Datos guardados no válidos; se crea una copia de respaldo.', error);
    safeSet(`${STORAGE_KEY}:backup-${Date.now()}`, raw);
    return [];
  }
}

/** Guarda las tareas. Lanza StorageError si el navegador lo impide (cuota, permisos…). */
export function saveTasks(tasks) {
  const payload = JSON.stringify({ version: SCHEMA_VERSION, savedAt: new Date().toISOString(), tasks });
  try {
    localStorage.setItem(STORAGE_KEY, payload);
  } catch (error) {
    const quota = error?.name === 'QuotaExceededError';
    throw new StorageError(
      quota
        ? 'No hay espacio suficiente en el navegador para guardar los cambios.'
        : 'No se pudieron guardar los cambios en este navegador.',
      error,
    );
  }
}

const DEFAULT_PREFS = { status: 'all', origin: 'all', sort: 'newest' };
const ALLOWED = {
  status: ['all', 'pending', 'completed'],
  origin: ['all', 'local', 'api'],
  sort: ['newest', 'oldest', 'az', 'pending-first'],
};

export function loadPrefs() {
  try {
    const data = JSON.parse(safeGet(PREFS_KEY) ?? '{}');
    const prefs = { ...DEFAULT_PREFS };
    for (const key of Object.keys(ALLOWED)) {
      if (ALLOWED[key].includes(data?.[key])) prefs[key] = data[key];
    }
    return prefs;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs({ status, origin, sort }) {
  safeSet(PREFS_KEY, JSON.stringify({ status, origin, sort }));
}

export function loadTheme() {
  const theme = safeGet(THEME_KEY);
  return theme === 'light' || theme === 'dark' ? theme : null;
}

export function saveTheme(theme) {
  safeSet(THEME_KEY, theme);
}
