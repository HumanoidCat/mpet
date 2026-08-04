/**
 * S2-T5 · Agregador de progreso de descarga/carga de modelos. Dueño: Isaac.
 *
 * PROBLEMA QUE RESUELVE
 * transformers.js no reporta "el modelo va al 40%". Reporta un evento por CADA
 * archivo que descarga (config.json, tokenizer.json, encoder.onnx, decoder.onnx…),
 * cada uno con su propio `loaded`/`total`. Si la UI mostrara eso tal cual, la barra
 * saltaría de 100% a 0% en cada archivo nuevo (justo lo que se vio en el spike S1-T7,
 * donde el log escupía cientos de líneas sueltas).
 *
 * SOLUCIÓN
 * Acumular bytes de todos los archivos y reportar UN solo número 0–1 por modelo,
 * que es lo que espera el contrato `AIPipeline.init(onProgress)` y el evento
 * `model-progress` del orquestador.
 *
 * Es lógica pura (sin navegador) a propósito: así se puede testear con vitest.
 */

/** Evento crudo tal como lo emite `progress_callback` de transformers.js. */
export interface RawProgressEvent {
  /** 'initiate' | 'download' | 'progress' | 'done' | 'ready' */
  status: string;
  /** Nombre del archivo, p. ej. 'onnx/encoder_model_quantized.onnx' */
  file?: string;
  /** Bytes descargados de ese archivo */
  loaded?: number;
  /** Bytes totales de ese archivo */
  total?: number;
}

export interface ProgressAggregator {
  /** Procesa un evento crudo; llama a `report` si el progreso global avanzó. */
  handle(event: RawProgressEvent): void;
  /** Fuerza el 100% (se llama cuando el pipeline terminó de cargar). */
  complete(): void;
}

/**
 * Agregador que reporta dentro de un tramo del 0–1 en vez de sobre el total.
 *
 * PROBLEMA QUE RESUELVE (encontrado en el spike S4-T5):
 * un agregador cubre bien UNA carga, porque ve todos los archivos a la vez. Pero el
 * worker de TTS carga primero el tokenizador (10 KB) y después el modelo (109 MB),
 * en dos llamadas seguidas. Con un solo agregador, el tokenizador termina, el
 * cálculo da 100%, y como la barra es monótona se queda clavada en 100% durante los
 * 109 MB que faltan. Se vio literalmente en el registro del spike: un único
 * `carga: 100%` y después medio minuto de silencio.
 *
 * La solución es repartir el rango: el tokenizador ocupa 0–3% y el modelo 3–100%.
 * Cada fase usa su propio agregador y la barra sigue avanzando de forma monótona,
 * siempre que las fases se ejecuten en orden.
 *
 * @param from    Inicio del tramo (0–1).
 * @param to      Fin del tramo (0–1). Debe ser mayor que `from`.
 * @param report  Callback que recibe el progreso GLOBAL ya escalado.
 */
export function createRangedProgressAggregator(
  from: number,
  to: number,
  report: (progress: number) => void
): ProgressAggregator {
  if (!(to > from)) {
    throw new Error(`Tramo de progreso inválido: [${from}, ${to}]`);
  }
  return createProgressAggregator((p) => report(from + p * (to - from)));
}

/**
 * @param report  Callback que recibe el progreso global del modelo, de 0 a 1.
 */
export function createProgressAggregator(
  report: (progress: number) => void
): ProgressAggregator {
  // Un registro por archivo. Usamos Map porque los archivos llegan en desorden
  // y se actualizan muchas veces (decenas de eventos por archivo).
  const files = new Map<string, { loaded: number; total: number }>();

  // POR QUÉ guardamos el último valor: queremos que la barra sea MONÓTONA
  // (nunca retroceda). Cuando aparece un archivo nuevo, el `total` global crece
  // de golpe y el porcentaje real bajaría; preferimos que se quede quieto un
  // instante a que la UI dé un salto hacia atrás, que se ve como un error.
  let lastReported = 0;
  let finished = false;

  return {
    handle(event: RawProgressEvent): void {
      if (finished || !event.file) return;

      if (event.status === 'done') {
        // El archivo terminó: lo marcamos completo aunque no llegara el último
        // evento de progreso (pasa cuando el archivo venía de la caché).
        const entry = files.get(event.file);
        if (entry) entry.loaded = entry.total;
        else return; // 'done' de un archivo que nunca reportó tamaño: se ignora
      } else if (
        typeof event.loaded === 'number' &&
        typeof event.total === 'number' &&
        event.total > 0
      ) {
        // ARCHIVOS QUE LLEGAN DE UNA SOLA VEZ: no cuentan para la barra.
        //
        // Medido en el spike S5-T5 con eventos reales: `config.json` (1656 bytes)
        // aparece en un único evento ya completo —`loaded: 1656, total: 1656`—
        // ANTES de que empiece `onnx/model.onnx` (114 MB). Contándolo, el cálculo
        // daba 1656/1656 = 100%, y como la barra es monótona se quedaba clavada en
        // el 100% durante los 109 MB que faltaban. Ocurría con los tres modelos del
        // proyecto, no solo con el TTS: se veía un único salto al 100% seguido de
        // medio minuto de espera muda.
        //
        // Un archivo que se descarga de verdad llega troceado, así que su primer
        // evento siempre trae `loaded < total`. Los que aparecen completos de golpe
        // (configuraciones, tokenizadores, o cualquier archivo servido desde caché)
        // no representan espera para el usuario y por eso se ignoran. La regla no
        // depende de ningún tamaño mágico, solo de cómo llegan.
        const known = files.get(event.file);
        if (!known && event.loaded >= event.total) return;

        files.set(event.file, { loaded: event.loaded, total: event.total });
      } else {
        return; // eventos sin tamaño (p. ej. 'initiate') no aportan al cálculo
      }

      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      if (total === 0) return;

      const progress = Math.min(1, loaded / total);
      if (progress <= lastReported) return; // monótono: solo avanzamos
      lastReported = progress;
      report(progress);
    },

    complete(): void {
      if (finished) return;
      finished = true;
      // Siempre cerramos en 1: si el modelo salió de caché puede que nunca
      // hayamos visto un solo byte descargado y la barra quedaría a medias.
      if (lastReported < 1) {
        lastReported = 1;
        report(1);
      }
    },
  };
}
