/**
 * S8-T2 — Detección de habla robusta a ruido ambiental.
 *
 * El VAD de S2-T3 decide por energía, y su limitación estaba anotada desde
 * entonces: **un ruido fuerte y sostenido supera el umbral y se clasifica como
 * habla**. Medido sobre la cadena completa, el problema resultó peor de lo
 * previsto — incluso un ruido muy bajo se detecta como habla continua:
 *
 * | Señal | Habla detectada por energía |
 * |---|---:|
 * | Silencio puro | 0.00 s ✅ |
 * | Ruido de amplitud 0.005 | 2.00 s ❌ |
 * | Ruido de amplitud 0.2 (ventilador) | 2.00 s ❌ |
 * | Voz real (1 s dentro de 2 s) | 1.06 s ✅ |
 *
 * El mecanismo: el piso de ruido se estima como el percentil 10 de las
 * energías, topado a 25 dB por debajo de la trama más fuerte. Ese tope existe
 * para que una grabación de puro habla no quede sin detectar (ver S2-T3), pero
 * con ruido **estacionario** todas las tramas tienen casi la misma energía, así
 * que el percentil 10 casi coincide con el máximo, el tope fuerza un piso 25 dB
 * más abajo, y absolutamente todo supera el umbral.
 *
 * La solución es la que ya anticipaba la evidencia de S2-T3: mirar la
 * **estructura** de la señal y no solo su nivel. La voz es periódica —tiene una
 * frecuencia fundamental— y el ruido de banda ancha no. YIN (S5-T1) ya calcula
 * exactamente eso, y la separación medida es total:
 *
 * | Señal | Tramas con tono detectable |
 * |---|---:|
 * | Ruido, a cualquier nivel | **0 %** |
 * | Voz real | **49 %** |
 *
 * El 49 % no es un defecto: el habla real alterna sonidos sonoros (vocales) con
 * sordos (/s/, /f/, /t/), y solo los primeros tienen tono. Por eso el umbral se
 * pone bajo —basta con que una parte del segmento sea sonora— y aun así el
 * margen contra el ruido es enorme.
 */

import { detectSpeech, type SpeechSegment, type VadOptions } from '../dsp/vad';
import { FRAME_SIZE, HOP_SIZE } from '@shared/constants';
import { detectPitchYin, type YinOptions } from './yin';

export interface VoicedSpeechOptions extends VadOptions {
  /**
   * Fracción mínima de tramas con tono detectable para aceptar un segmento.
   *
   * Por defecto 0.20. La voz real da ~49 % y el ruido 0 %, así que el valor
   * queda con margen amplio a ambos lados: no rechaza habla con muchas
   * consonantes sordas ni acepta ruido.
   */
  minVoicedRatio?: number;
  /** Opciones del detector de tono, por si hay que acotar el rango. */
  yin?: YinOptions;
}

const DEFAULT_MIN_VOICED_RATIO = 0.2;

/**
 * Fracción de tramas de un tramo que tienen tono detectable.
 *
 * Es la medida de "cuán periódica" es esa parte de la señal, y lo que permite
 * distinguir voz de ruido con la misma energía.
 */
export function voicedRatio(
  pcm: Float32Array,
  fromSample: number,
  toSample: number,
  options: VoicedSpeechOptions
): number {
  const frameSize = options.frameSize ?? FRAME_SIZE;
  const hopSize = options.hopSize ?? HOP_SIZE;
  const yinOptions: YinOptions = { sampleRate: options.sampleRate, ...options.yin };

  let conTono = 0;
  let total = 0;

  for (let i = fromSample; i + frameSize <= toSample; i += hopSize) {
    total++;
    if (detectPitchYin(pcm.subarray(i, i + frameSize), yinOptions)) conTono++;
  }
  return total > 0 ? conTono / total : 0;
}

/**
 * Detecta habla combinando energía y periodicidad.
 *
 * Primero se buscan los candidatos por energía —que es barato y no se pierde
 * ningún tramo de voz— y después se descarta el que no tenga suficiente
 * estructura periódica. El orden importa por costo: correr YIN sobre toda la
 * grabación sería mucho más caro que correrlo solo dentro de los candidatos.
 */
export function detectVoicedSpeech(
  pcm: Float32Array,
  options: VoicedSpeechOptions
): SpeechSegment[] {
  const minRatio = options.minVoicedRatio ?? DEFAULT_MIN_VOICED_RATIO;

  return detectSpeech(pcm, options).filter(
    (segmento) =>
      voicedRatio(pcm, segmento.startSample, segmento.endSample, options) >= minRatio
  );
}

/**
 * Recorta la grabación al habla, con el criterio robusto a ruido.
 *
 * Igual que `trimToSpeech` de S2-T3, pero descartando los tramos que solo son
 * ruido. Si no queda nada se devuelve el audio intacto: más vale mandar ruido
 * al reconocedor que perder la frase del usuario por una decisión del detector.
 */
export function trimToVoicedSpeech(
  pcm: Float32Array,
  options: VoicedSpeechOptions
): Float32Array {
  const segmentos = detectVoicedSpeech(pcm, options);
  if (segmentos.length === 0) return pcm.slice();

  return pcm.slice(segmentos[0].startSample, segmentos[segmentos.length - 1].endSample);
}

/**
 * Limitación que sobrevive: un **tono puro sostenido** dentro de la banda de voz
 * —un zumbido de 200 Hz, un pitido— sí es periódico, así que pasa el filtro de
 * periodicidad igual que una vocal. Medido: 99 % de tramas con tono.
 *
 * Distinguirlo de una vocal sostenida requeriría mirar la estructura de
 * formantes, no solo la periodicidad. Se documenta en lugar de resolverse
 * porque el caso realista —el que motivó esta tarea— es el ruido de banda ancha
 * de un ventilador o del ambiente, que sí queda resuelto, y porque una vocal
 * sostenida de verdad tampoco es habla útil para el evaluador.
 */
export const LIMITACION_TONO_PURO =
  'Un tono puro sostenido en la banda de voz pasa el filtro de periodicidad.';
