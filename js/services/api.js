/**
 * Cliente del banco de tareas público (JSONPlaceholder).
 * Maneja: sin conexión, tiempo de espera, errores HTTP, JSON inválido y
 * respuestas con formato inesperado. Todos los errores se exponen como ApiError
 * con un mensaje listo para mostrar al usuario.
 */

export const TODOS_ENDPOINT = 'https://jsonplaceholder.typicode.com/todos';
const DEFAULT_TIMEOUT = 10_000;

export class ApiError extends Error {
  /**
   * @param {string} message mensaje para el usuario
   * @param {{kind: 'offline'|'timeout'|'network'|'http'|'parse', status?: number, cause?: unknown}} info
   */
  constructor(message, { kind, status, cause } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.cause = cause;
  }
}

function isValidTodo(item) {
  return (
    item &&
    Number.isInteger(item.id) &&
    typeof item.title === 'string' &&
    item.title.trim() !== '' &&
    typeof item.completed === 'boolean'
  );
}

/**
 * Obtiene los "todos" de la API y los normaliza.
 * @param {{signal?: AbortSignal, timeout?: number, endpoint?: string}} [options]
 * @returns {Promise<{externalId: number, userId: number|null, title: string, completed: boolean}[]>}
 */
export async function fetchTodos({ signal, timeout = DEFAULT_TIMEOUT, endpoint = TODOS_ENDPOINT } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new ApiError('No tienes conexión a internet. Revisa tu red e inténtalo de nuevo.', { kind: 'offline' });
  }

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  let response;
  try {
    response = await fetch(endpoint, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (timedOut) {
      throw new ApiError('El servidor tardó demasiado en responder. Inténtalo de nuevo.', { kind: 'timeout', cause: error });
    }
    if (signal?.aborted) throw error; // cancelado por el usuario: se propaga el AbortError
    throw new ApiError('No se pudo conectar con el banco de tareas. Comprueba tu conexión.', { kind: 'network', cause: error });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }

  if (!response.ok) {
    const message =
      response.status >= 500
        ? `El banco de tareas no está disponible en este momento (error ${response.status}).`
        : `La solicitud no se pudo completar (error ${response.status}).`;
    throw new ApiError(message, { kind: 'http', status: response.status });
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new ApiError('La respuesta del servidor no es válida.', { kind: 'parse', cause: error });
  }

  if (!Array.isArray(data)) {
    throw new ApiError('La respuesta del servidor tiene un formato inesperado.', { kind: 'parse' });
  }

  return data.filter(isValidTodo).map((item) => ({
    externalId: item.id,
    userId: Number.isInteger(item.userId) ? item.userId : null,
    title: item.title.replace(/\s+/g, ' ').trim(),
    completed: item.completed,
  }));
}
