/**
 * S9-T3 — Lector de WAV para las pruebas con voz real.
 *
 * Se escribe a mano en lugar de usar una biblioteca por la misma razón que el
 * resto del módulo: no agregar dependencias al proyecto. Un WAV PCM sin
 * comprimir es un formato trivial —cabecera RIFF y muestras crudas— y leerlo
 * son treinta líneas.
 *
 * Solo se admite **PCM sin comprimir**. Formatos con pérdida como MP3 o M4A
 * quedan descartados a propósito: el códec altera el espectro justamente en lo
 * que las mediciones observan, y contaminaría la calibración del comparador.
 */

import { readFileSync } from 'node:fs';

export interface WavFile {
  /** Muestras normalizadas a [−1, 1], mono. */
  samples: Float32Array;
  sampleRate: number;
  /** Canales del archivo original, antes de mezclar a mono. */
  channels: number;
  durationSeconds: number;
}

/** Lee un identificador de cuatro caracteres ASCII. */
function leerId(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

/**
 * Carga un WAV PCM y devuelve las muestras en mono, normalizadas.
 *
 * Los trozos (*chunks*) se recorren en orden en lugar de asumir posiciones
 * fijas: los editores suelen insertar metadatos entre la cabecera y los datos,
 * y dar por hecho que `data` empieza en el byte 44 falla con esos archivos.
 */
export function readWav(path: string): WavFile {
  const buffer = readFileSync(path);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  if (leerId(view, 0) !== 'RIFF' || leerId(view, 8) !== 'WAVE') {
    throw new Error(`${path} no es un archivo WAV`);
  }

  let formato = 0;
  let canales = 0;
  let sampleRate = 0;
  let bitsPorMuestra = 0;
  let datosOffset = -1;
  let datosLongitud = 0;

  let offset = 12;
  while (offset + 8 <= view.byteLength) {
    const id = leerId(view, offset);
    const tamano = view.getUint32(offset + 4, true);
    const cuerpo = offset + 8;

    if (id === 'fmt ') {
      formato = view.getUint16(cuerpo, true);
      canales = view.getUint16(cuerpo + 2, true);
      sampleRate = view.getUint32(cuerpo + 4, true);
      bitsPorMuestra = view.getUint16(cuerpo + 14, true);
    } else if (id === 'data') {
      datosOffset = cuerpo;
      datosLongitud = tamano;
    }

    // Los trozos se alinean a bytes pares.
    offset = cuerpo + tamano + (tamano % 2);
  }

  if (datosOffset < 0) throw new Error(`${path}: no se encontró el trozo 'data'`);
  if (formato !== 1 && formato !== 3) {
    throw new Error(
      `${path}: formato ${formato} no admitido. Exportar como WAV PCM sin comprimir.`
    );
  }

  const bytesPorMuestra = bitsPorMuestra / 8;
  const totalMuestras = Math.floor(datosLongitud / bytesPorMuestra);
  const porCanal = Math.floor(totalMuestras / canales);
  const salida = new Float32Array(porCanal);

  for (let i = 0; i < porCanal; i++) {
    let suma = 0;
    for (let c = 0; c < canales; c++) {
      const p = datosOffset + (i * canales + c) * bytesPorMuestra;

      if (formato === 3) {
        suma += view.getFloat32(p, true); // ya viene en [−1, 1]
      } else if (bitsPorMuestra === 16) {
        suma += view.getInt16(p, true) / 32768;
      } else if (bitsPorMuestra === 24) {
        // 24 bits con signo, little endian: se arma y se extiende el signo.
        const crudo =
          view.getUint8(p) | (view.getUint8(p + 1) << 8) | (view.getUint8(p + 2) << 16);
        suma += (crudo & 0x800000 ? crudo - 0x1000000 : crudo) / 8388608;
      } else if (bitsPorMuestra === 32) {
        suma += view.getInt32(p, true) / 2147483648;
      } else if (bitsPorMuestra === 8) {
        suma += (view.getUint8(p) - 128) / 128; // 8 bits es sin signo
      } else {
        throw new Error(`${path}: ${bitsPorMuestra} bits por muestra no admitidos`);
      }
    }
    // Mezcla a mono promediando los canales.
    salida[i] = suma / canales;
  }

  return {
    samples: salida,
    sampleRate,
    channels: canales,
    durationSeconds: porCanal / sampleRate,
  };
}
