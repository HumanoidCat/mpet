/**
 * S5-T5 · Caché de audio de referencia por frase. Dueño: Isaac.
 *
 * PROBLEMA QUE RESUELVE (medido, no supuesto):
 * al ejecutar el worker real con la misma frase tres veces seguidas, MMS-TTS devolvió
 * audios distintos: 53 760, 55 040 y 57 088 muestras para
 * *"Would you like to practice your pronunciation today?"*. No es un fallo: VITS lleva
 * un predictor de duración estocástico —muestrea ruido a propósito— para que la
 * prosodia no suene siempre idéntica. Y como el grafo ONNX solo acepta `input_ids` y
 * `attention_mask`, ese ruido no se puede desactivar desde el código.
 *
 * POR QUÉ IMPORTA AQUÍ MÁS QUE EN OTRA APLICACIÓN:
 * este audio no es solo para escuchar, es la **referencia contra la que se puntúa la
 * pronunciación del estudiante**. Si cambia en cada llamada, la misma pronunciación
 * puede sacar puntajes distintos, y las pruebas del comparador (Fabrizio) no tendrían
 * contra qué fijarse. Guardando el PCM por frase, la referencia queda estable durante
 * toda la sesión y, de paso, volver a escuchar una frase ya sintetizada es inmediato
 * en vez de costar varios segundos.
 *
 * LIMITACIÓN HONESTA: la estabilidad es *dentro de la sesión*. Al recargar la página
 * la caché se vacía y la frase se vuelve a sintetizar distinta. Persistirla entre
 * sesiones sería trabajo del almacenamiento en IndexedDB (S5-T6, Alejandro): no se
 * hace aquí porque ese módulo no es mío.
 *
 * Es lógica pura (sin navegador ni modelo) a propósito: así se puede testear.
 */

export interface PcmCache {
  /** Devuelve una copia del audio guardado, o `undefined` si no está. */
  get(text: string): Float32Array | undefined;
  /** Guarda el audio de una frase, desalojando el más antiguo si se llenó. */
  set(text: string, pcm: Float32Array): void;
  /** Cuántas frases hay guardadas. */
  readonly size: number;
}

/**
 * Número de frases guardadas antes de empezar a desalojar.
 *
 * Cada frase ronda las 55 000 muestras de 4 bytes, es decir ~220 KB. Con 32 frases
 * el techo son ~7 MB, despreciable frente a los ~109 MB del propio modelo, y cubre
 * de sobra una conversación de práctica.
 */
export const DEFAULT_MAX_ENTRIES = 32;

export function createPcmCache(maxEntries: number = DEFAULT_MAX_ENTRIES): PcmCache {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error(`El tamaño de la caché debe ser un entero positivo: ${maxEntries}`);
  }

  // `Map` conserva el orden de inserción, así que la primera clave es siempre la
  // más antigua: alcanza para desalojar sin llevar una lista aparte.
  const entries = new Map<string, Float32Array>();

  return {
    get(text: string): Float32Array | undefined {
      const hit = entries.get(text);
      // COPIA AL DEVOLVER, a propósito: el PCM sale hacia dos consumidores a la vez
      // (el reproductor de `App.tsx` y el comparador de pronunciación). Si les
      // entregáramos el mismo objeto y uno lo modificara, la referencia guardada
      // quedaría corrupta y el error aparecería mucho después, en el puntaje. La
      // copia de ~220 KB es barata comparada con perseguir ese fallo.
      return hit ? new Float32Array(hit) : undefined;
    },

    set(text: string, pcm: Float32Array): void {
      if (entries.has(text)) entries.delete(text); // reinserta para renovar su edad
      else if (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(text, new Float32Array(pcm));
    },

    get size(): number {
      return entries.size;
    },
  };
}
