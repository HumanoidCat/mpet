import type { ChatMessage } from '@shared/contracts';

/**
 * S5-T6 · Persistencia de sesiones. Duenio: Alejandro (core).
 *
 * POR QUE EXISTE
 * El producto promete mostrar la evolucion del estudiante (RF-23, pantalla de
 * progreso S9-T1). Sin persistencia esa pantalla no tiene de donde leer: hoy
 * muestra un arreglo escrito a mano. Aqui se guarda cada sesion de conversacion
 * y su resumen.
 *
 * POR QUE INDEXEDDB Y NO localStorage
 * `localStorage` es sincrono, bloquea el hilo principal y guarda solo cadenas,
 * asi que habria que serializar a JSON en cada turno mientras corre el analisis
 * de audio. IndexedDB es asincrono y guarda objetos por clonado estructurado.
 * Ademas su cuota es de cientos de MB frente a unos 5 MB, y una sesion con
 * puntaje por palabra crece rapido.
 *
 * POR QUE SIN DEPENDENCIAS
 * La biblioteca `idb` es comoda, pero aqui solo hace falta un almacen de objetos
 * y un indice. No justifica sumar un paquete al `package.json`, que ademas
 * exigiria un `shared-change` (D-03).
 *
 * COMO SE PRUEBA
 * IndexedDB no existe en Node y la suite corre en `environment: 'node'`. Por eso
 * la logica pura —calcular el resumen de una sesion— vive en `resumirSesion`, se
 * prueba entera en `tests/core/sessionStore.test.ts`, y la parte de base de datos
 * queda como plomeria fina que se verifica en el navegador. Es el mismo criterio
 * que se aplico a la captura de microfono en `micCapture`.
 */

const DB_NAME = 'mpet';
const DB_VERSION = 1;
const STORE = 'sesiones';

/** Metricas de una sesion, suficientes para la pantalla de progreso. */
export interface SessionSummary {
  id: string;
  /** Instante del primer mensaje, en milisegundos. */
  startedAt: number;
  /** Instante del ultimo mensaje. */
  endedAt: number;
  /** Cuantas veces hablo el estudiante. */
  userTurns: number;
  /** Palabras dichas por el estudiante, para medir volumen de practica. */
  words: number;
  /** Turnos en los que el corrector encontro al menos una edicion. */
  correctedTurns: number;
  /** Media de los puntajes de pronunciacion, o null si no hubo ninguno. */
  pronunciationAvg: number | null;
  /** Mejor y peor puntaje de la sesion, o null si no hubo ninguno. */
  pronunciationBest: number | null;
  pronunciationWorst: number | null;
}

export interface StoredSession extends SessionSummary {
  messages: ChatMessage[];
}

export interface SessionStore {
  /**
   * Guarda o actualiza la sesion con ese `id`. Devuelve null si no hay nada que
   * guardar, para no ensuciar el historial con sesiones en las que el usuario
   * abrio la aplicacion y no hablo.
   */
  save(id: string, messages: ChatMessage[]): Promise<StoredSession | null>;
  /** Resumenes de todas las sesiones, de la mas reciente a la mas antigua. */
  list(): Promise<SessionSummary[]>;
  /** Sesion completa con sus mensajes, o null si no existe. */
  get(id: string): Promise<StoredSession | null>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

/** Cuenta palabras separando por espacios en blanco. */
function contarPalabras(texto: string): number {
  const limpio = texto.trim();
  return limpio.length === 0 ? 0 : limpio.split(/\s+/).length;
}

/**
 * Calcula el resumen de una sesion a partir de sus mensajes.
 *
 * Se calcula al guardar y se almacena junto a los mensajes, en vez de derivarlo
 * al leer. Es denormalizacion deliberada: la pantalla de progreso lista muchas
 * sesiones y solo necesita las metricas, asi que `list()` no tiene que traer ni
 * recorrer los mensajes de cada una.
 *
 * Solo se miden los turnos del estudiante. Lo que dice el tutor no es practica
 * suya y contarlo inflaria las cifras.
 */
export function resumirSesion(id: string, messages: ChatMessage[]): SessionSummary | null {
  const delUsuario = messages.filter((m) => m.role === 'user');
  if (delUsuario.length === 0) return null;

  const tiempos = messages.map((m) => m.ts);
  const puntajes = delUsuario
    .map((m) => m.pronunciation?.overall)
    .filter((p): p is number => typeof p === 'number' && Number.isFinite(p));

  return {
    id,
    startedAt: Math.min(...tiempos),
    endedAt: Math.max(...tiempos),
    userTurns: delUsuario.length,
    words: delUsuario.reduce((n, m) => n + contarPalabras(m.text), 0),
    correctedTurns: delUsuario.filter((m) => (m.correction?.edits.length ?? 0) > 0).length,
    // null y no 0 cuando no hubo puntajes: cero significaria "pronuncio pesimo",
    // y lo cierto es que no se midio. La pantalla de progreso debe distinguirlo.
    pronunciationAvg:
      puntajes.length > 0 ? puntajes.reduce((a, b) => a + b, 0) / puntajes.length : null,
    pronunciationBest: puntajes.length > 0 ? Math.max(...puntajes) : null,
    pronunciationWorst: puntajes.length > 0 ? Math.min(...puntajes) : null,
  };
}

/**
 * Almacen en memoria. Lo usan las pruebas y el modo simulado (`?mock=1`), donde
 * no conviene escribir en el disco del usuario.
 */
export function createMemorySessionStore(): SessionStore {
  const sesiones = new Map<string, StoredSession>();

  return {
    async save(id, messages) {
      const resumen = resumirSesion(id, messages);
      if (!resumen) return null;
      const sesion: StoredSession = { ...resumen, messages: [...messages] };
      sesiones.set(id, sesion);
      return sesion;
    },
    async list() {
      return [...sesiones.values()]
        .map(({ messages: _messages, ...resumen }) => resumen)
        .sort((a, b) => b.startedAt - a.startedAt);
    },
    async get(id) {
      return sesiones.get(id) ?? null;
    },
    async remove(id) {
      sesiones.delete(id);
    },
    async clear() {
      sesiones.clear();
    },
  };
}

/** Envuelve una peticion de IndexedDB en una promesa. */
function promesa<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function abrirBase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const almacen = db.createObjectStore(STORE, { keyPath: 'id' });
        // Indice por fecha de inicio: la pantalla de progreso siempre lee en
        // orden cronologico, y asi no hay que traer todo para ordenarlo.
        almacen.createIndex('startedAt', 'startedAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    // Otra pestania con una version anterior abierta bloquea la actualizacion.
    req.onblocked = () => reject(new Error('Hay otra pestania de MPET abierta'));
  });
}

/** Almacen real sobre IndexedDB. Requiere navegador. */
export function createIndexedDbSessionStore(): SessionStore {
  let base: Promise<IDBDatabase> | null = null;
  const db = () => (base ??= abrirBase());

  /** Ejecuta una operacion dentro de una transaccion y espera a que confirme. */
  async function conAlmacen<T>(
    modo: IDBTransactionMode,
    fn: (almacen: IDBObjectStore) => Promise<T>
  ): Promise<T> {
    const conexion = await db();
    const tx = conexion.transaction(STORE, modo);
    const resultado = await fn(tx.objectStore(STORE));
    // Esperar a `oncomplete` y no solo al exito de la peticion: en escritura,
    // el dato no esta a salvo hasta que la transaccion confirma.
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return resultado;
  }

  return {
    async save(id, messages) {
      const resumen = resumirSesion(id, messages);
      if (!resumen) return null;
      const sesion: StoredSession = { ...resumen, messages };
      await conAlmacen('readwrite', (a) => promesa(a.put(sesion)));
      return sesion;
    },

    async list() {
      const todas = await conAlmacen('readonly', (a) =>
        promesa(a.index('startedAt').getAll() as IDBRequest<StoredSession[]>)
      );
      return todas
        .map(({ messages: _messages, ...resumen }) => resumen)
        .sort((a, b) => b.startedAt - a.startedAt);
    },

    async get(id) {
      const sesion = await conAlmacen('readonly', (a) =>
        promesa(a.get(id) as IDBRequest<StoredSession | undefined>)
      );
      return sesion ?? null;
    },

    async remove(id) {
      await conAlmacen('readwrite', (a) => promesa(a.delete(id)));
    },

    async clear() {
      await conAlmacen('readwrite', (a) => promesa(a.clear()));
    },
  };
}

/**
 * Devuelve el almacen adecuado al entorno.
 *
 * Si IndexedDB no esta disponible —navegacion privada de algunos navegadores,
 * almacenamiento bloqueado por el usuario— se cae al almacen en memoria en vez
 * de romper la aplicacion. La sesion en curso funciona igual y solo se pierde el
 * historial, que es una degradacion honesta y no un fallo silencioso.
 */
export function createSessionStore(): SessionStore {
  const disponible = typeof indexedDB !== 'undefined' && indexedDB !== null;
  return disponible ? createIndexedDbSessionStore() : createMemorySessionStore();
}
