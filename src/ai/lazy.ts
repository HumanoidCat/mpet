/**
 * S7-T4 · Carga bajo demanda de modelos. Dueño: Isaac.
 *
 * QUÉ PROBLEMA RESUELVE
 * La aplicación descarga hoy ~411 MiB antes de dejar hacer nada: reconocedor (41),
 * corrector (241), sintetizador (109) y el runtime de WebAssembly (21). Pero un turno
 * de conversación **no necesita los cuatro a la vez**: el estudiante primero habla
 * —ahí hacen falta el reconocedor y el corrector— y solo después pulsa "escuchar",
 * que es cuando entra el sintetizador. Muchos usuarios ni llegan a pulsarlo.
 *
 * Cargando el sintetizador la primera vez que se usa, la espera inicial baja a ~303
 * MiB y los 109 restantes se pagan solo si hacen falta. Es la vía que queda abierta
 * tras descartar la cuantización por medición (D-05): reducir bits no bajaba el peso.
 *
 * POR QUÉ ESTA PIEZA EXISTE APARTE
 * "Cargar la primera vez que se use" tiene tres trampas que se ven fáciles y no lo son:
 *
 *   1. **Llamadas simultáneas.** Si la interfaz pide dos frases seguidas antes de que
 *      termine la carga, dos `init()` a la vez descargarían el modelo dos veces y
 *      dejarían dos copias en memoria. Aquí se comparte la misma promesa.
 *   2. **Errores que se quedan pegados.** Si el primer intento falla (se cayó la red),
 *      guardar la promesa fallida condenaría a la aplicación a fallar para siempre.
 *      Aquí un fallo se olvida y el siguiente intento vuelve a probar.
 *   3. **El progreso se queda sin destinatario.** El contrato solo entrega el callback
 *      de progreso en `init()`. Si el modelo se carga más tarde, hay que haber
 *      guardado ese callback o la barra no se entera. Eso lo resuelve quien usa esto.
 *
 * Es lógica pura (sin navegador ni modelo) a propósito: así se puede testear.
 */

export interface LazyLoader {
  /**
   * Garantiza que la carga ocurrió, una sola vez.
   * Llamarlo muchas veces en paralelo lanza una única carga.
   */
  ensure(): Promise<void>;
  /** ¿Ya está cargado? Útil para decidir si conviene avisar de una espera larga. */
  readonly loaded: boolean;
  /** ¿Hay una carga en curso ahora mismo? */
  readonly loading: boolean;
}

/**
 * @param load  La carga real del modelo. Se ejecuta como mucho una vez con éxito.
 */
export function createLazyLoader(load: () => Promise<void>): LazyLoader {
  let inFlight: Promise<void> | null = null;
  let done = false;

  return {
    ensure(): Promise<void> {
      if (done) return Promise.resolve();
      if (inFlight) return inFlight; // ya hay una carga en curso: se engancha a ella

      inFlight = load().then(
        () => {
          done = true;
          inFlight = null;
        },
        (err) => {
          // Se olvida el intento fallido para que se pueda reintentar. Si se
          // guardara la promesa rechazada, un corte de red momentáneo dejaría la
          // función inutilizable durante toda la sesión.
          inFlight = null;
          throw err;
        }
      );

      return inFlight;
    },

    get loaded(): boolean {
      return done;
    },

    get loading(): boolean {
      return inFlight !== null;
    },
  };
}
