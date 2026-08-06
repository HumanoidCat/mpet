/**
 * S9-T3 · Exportar a WAV el audio que consume el comparador. Duenio: Alejandro.
 *
 * POR QUE EXISTE
 * La calibracion del comparador con voz real necesita grabaciones con una sola
 * emision por archivo. Producirlas a mano —grabar en Audacity, fijar la
 * frecuencia del proyecto, forzar mono, exportar a 16 bits, recortar el tramo—
 * tiene un paso de error en cada punto, y el recorte manual es justamente lo que
 * la evidencia de S9-T3 senala como probable causa de que la comparacion falle:
 * si un archivo contiene varias tomas, el detector las separa por pausas y un
 * tramo puede quedarse con parte de una frase y otro con parte de otra.
 *
 * La aplicacion ya tiene ese audio. `AudioEngine.stop()` devuelve exactamente el
 * PCM que entra al comparador, a 16 kHz y mono. Exportarlo desde ahi elimina
 * todos los pasos manuales de una vez, y garantiza una emision por archivo por
 * construccion: se pulsa el microfono, se dice la frase, se vuelve a pulsar.
 *
 * IMPORTANTE PARA QUIEN CONSUMA ESTOS ARCHIVOS
 * El PCM que entrega `stop()` **ya esta acondicionado** (pasa-altas de 80 Hz y
 * normalizacion RMS de S2-T2). No hay que volver a preprocesarlo: el
 * acondicionamiento no es idempotente y aplicarlo dos veces desplaza el
 * resultado (ver D-09). Se declara en el nombre del archivo.
 *
 * SE ESCRIBE A MANO Y NO CON UNA BIBLIOTECA
 * Por lo mismo que el lector de `tests/audio/fixtures/wav.ts`: un WAV PCM sin
 * comprimir es una cabecera RIFF y muestras crudas. No justifica una dependencia
 * (D-03).
 */

/** Cabecera RIFF de un WAV PCM: 44 bytes antes de las muestras. */
const CABECERA_BYTES = 44;

/** Escribe cuatro caracteres ASCII en la posicion indicada. */
function escribirId(view: DataView, offset: number, id: string): void {
  for (let i = 0; i < 4; i++) view.setUint8(offset + i, id.charCodeAt(i));
}

/**
 * Codifica muestras en coma flotante como WAV PCM de 16 bits, mono.
 *
 * Se eligen 16 bits y no coma flotante de 32 porque es el formato que todo lector
 * entiende, incluido el del proyecto, y porque el recorte a 16 bits queda muy por
 * debajo de cualquier diferencia que las mediciones observen.
 */
export function encodeWav(
  samples: Float32Array,
  sampleRate: number
  // El tipo del respaldo se declara explicitamente: un `Uint8Array` generico
  // podria estar respaldado por un `SharedArrayBuffer`, y `Blob` no lo acepta.
): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(CABECERA_BYTES + samples.length * 2);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  escribirId(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true); // tamano restante del archivo
  escribirId(view, 8, 'WAVE');

  escribirId(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // tamano del bloque de formato
  view.setUint16(20, 1, true); // 1 = PCM sin comprimir
  view.setUint16(22, 1, true); // canales: mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes por segundo
  view.setUint16(32, 2, true); // alineacion de bloque
  view.setUint16(34, 16, true); // bits por muestra

  escribirId(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  for (let i = 0; i < samples.length; i++) {
    // Se acota antes de convertir: una muestra fuera de [-1, 1] daria la vuelta
    // al entero y se oiria como un chasquido, no como saturacion.
    const s = Math.max(-1, Math.min(1, samples[i]));

    // El factor es 32768 para los dos signos, el mismo divisor que usa el lector
    // del proyecto (`getInt16(p) / 32768`). Escalar los positivos por 32767, que
    // es el maximo del entero, parece mas correcto pero deja de ser la operacion
    // inversa de la lectura y encoge la mitad positiva de la senal.
    //
    // Se redondea en vez de truncar. `setInt16` trunca hacia cero por su cuenta,
    // lo que da hasta un paso entero de error y un sesgo sistematico hacia el
    // silencio; redondeando el error maximo es medio paso y no tiene sesgo.
    //
    // El acotado del entero es necesario porque 1.0 * 32768 se sale del rango.
    const entero = Math.max(-32768, Math.min(32767, Math.round(s * 32768)));
    view.setInt16(CABECERA_BYTES + i * 2, entero, true);
  }

  return bytes;
}

/** Nombre estable y ordenable para una toma de calibracion. */
export function nombreDeToma(hablante: string, frase: string, version: string): string {
  const limpio = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  // El sufijo declara que el audio ya paso por el acondicionamiento de S2-T2,
  // para que quien lo analice no lo vuelva a preprocesar.
  return `${limpio(hablante)}-${limpio(frase)}-${limpio(version)}-acond.wav`;
}

/**
 * Descarga el PCM como WAV desde el navegador.
 *
 * Vive aparte de `encodeWav` para que la codificacion se pueda probar en Node,
 * donde no hay `Blob` ni `document`.
 */
export function descargarWav(
  samples: Float32Array,
  sampleRate: number,
  nombre: string
): void {
  const blob = new Blob([encodeWav(samples, sampleRate)], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
}
