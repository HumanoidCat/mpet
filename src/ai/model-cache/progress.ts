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
