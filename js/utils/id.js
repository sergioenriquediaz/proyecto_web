/**
 * Estándar de identificadores de Taskly
 * --------------------------------------
 *   TSK-{ORIGEN}-{AAAAMMDD}-{ALEATORIO}
 *
 *   TSK        Prefijo fijo del dominio "tarea".
 *   ORIGEN     L = creada localmente por el usuario · A = importada desde la API.
 *   AAAAMMDD   Fecha (local) en que se generó el identificador.
 *   ALEATORIO  6 caracteres en base32 de Crockford (sin I, L, O, U para evitar
 *              confusiones visuales) generados con crypto.getRandomValues.
 *
 * Ejemplos: TSK-L-20261104-7KQ2XM · TSK-A-20261104-H3B9ZT
 *
 * 32^6 ≈ 1.070 millones de combinaciones por origen y día; además se verifica
 * contra los identificadores existentes para garantizar unicidad.
 */

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // base32 de Crockford
const RANDOM_LENGTH = 6;

export const TASK_ID_PATTERN = /^TSK-[LA]-\d{8}-[0-9A-HJKMNP-TV-Z]{6}$/;

const ORIGIN_CODES = { local: 'L', api: 'A' };

function randomChunk(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  // 256 es múltiplo de 32, así que (byte & 31) es uniforme.
  return Array.from(bytes, (b) => ALPHABET[b & 31]).join('');
}

function datePart(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Genera un identificador único.
 * @param {'local'|'api'} source
 * @param {Set<string>} [existingIds] identificadores ya usados
 * @param {Date} [date]
 */
export function generateTaskId(source = 'local', existingIds = new Set(), date = new Date()) {
  const origin = ORIGIN_CODES[source] ?? ORIGIN_CODES.local;
  let id;
  do {
    id = `TSK-${origin}-${datePart(date)}-${randomChunk(RANDOM_LENGTH)}`;
  } while (existingIds.has(id));
  return id;
}

export function isValidTaskId(id) {
  return typeof id === 'string' && TASK_ID_PATTERN.test(id);
}
