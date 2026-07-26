/**
 * S2-T2 — Preprocesamiento: pasa-banda de voz + normalización RMS.
 *
 * Entre la captura (S2-T1) y el análisis hay que dejar la señal comparable:
 *
 *   1. Pasa-banda 80–8000 Hz — fuera de esa banda no hay información fonética,
 *      solo estorbo: offset de continua del micrófono, zumbido de la red
 *      eléctrica (50/60 Hz), golpes de mesa y retumbe de baja frecuencia.
 *   2. Normalización RMS — dos personas que dicen la misma frase a distinto
 *      volumen deben puntuar igual. Sin esto el comparador de la Semana 6
 *      mediría qué tan fuerte habla el usuario, no qué tan bien pronuncia.
 *
 * El orden importa: primero filtrar, después normalizar. Al revés, un zumbido
 * de 60 Hz inflaría el RMS y la normalización bajaría la voz para compensar
 * un ruido que el filtro iba a eliminar de todas formas.
 */

import { BiquadCascade, designHighpass, designLowpass, type BiquadCoeffs } from './biquad';

/** Borde inferior de la banda de voz: por debajo solo hay continua y zumbido. */
export const VOICE_BAND_LOW_HZ = 80;

/** Borde superior: el límite de las fricativas más agudas (/s/, /ʃ/). */
export const VOICE_BAND_HIGH_HZ = 8000;

/** RMS objetivo tras normalizar (≈ −20 dBFS, con holgura ante picos). */
export const TARGET_RMS = 0.1;

/**
 * Ganancia máxima al normalizar. Sin este tope, un fragmento en silencio (RMS
 * ~1e-6) se multiplicaría por cien mil y convertiría el ruido de fondo del
 * micrófono en un rugido — que el VAD de S2-T3 leería como habla.
 */
export const MAX_NORMALIZATION_GAIN = 20;

/**
 * Diseña el pasa-banda de voz para un sample rate dado.
 *
 * ⚠️ A 16 kHz el borde superior de 8 000 Hz coincide exactamente con el
 * Nyquist, y ahí un biquad es degenerado: sus polos caen sobre el círculo
 * unitario (z = −1) y el filtro deja de ser estable. Pero no hace falta: por
 * definición del muestreo, una señal a 16 kHz **no puede contener** nada por
 * encima de 8 kHz, y el filtro anti-aliasing de S2-T1 ya dejó −44.6 dB en ese
 * punto. El límite superior de la banda lo impone el propio sample rate.
 *
 * Por eso la etapa pasa-bajas solo se incluye cuando el borde superior queda
 * genuinamente por debajo del Nyquist (p. ej. si se preprocesara a 48 kHz).
 * A 16 kHz el pasa-banda se reduce, correctamente, a un pasa-altas de 80 Hz.
 */
export function designVoiceBandpass(
  sampleRate: number,
  lowHz: number = VOICE_BAND_LOW_HZ,
  highHz: number = VOICE_BAND_HIGH_HZ
): BiquadCoeffs[] {
  const stages: BiquadCoeffs[] = [designHighpass(lowHz, sampleRate)];
  if (highHz < sampleRate / 2) stages.push(designLowpass(highHz, sampleRate));
  return stages;
}

/** Valor eficaz (raíz de la media de los cuadrados): la "energía" de la señal. */
export function rms(pcm: Float32Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / pcm.length);
}

/** Muestra de mayor valor absoluto: sirve para detectar saturación. */
export function peak(pcm: Float32Array): number {
  let max = 0;
  for (let i = 0; i < pcm.length; i++) {
    const abs = Math.abs(pcm[i]);
    if (abs > max) max = abs;
  }
  return max;
}

/**
 * Ganancia que lleva la señal al RMS objetivo, acotada por dos motivos:
 * `MAX_NORMALIZATION_GAIN` evita amplificar silencio, y el límite por pico
 * evita que la normalización sature la señal (un recorte introduce armónicos
 * que ensuciarían el espectro de la Semana 3).
 */
export function normalizationGain(pcm: Float32Array, targetRms: number = TARGET_RMS): number {
  const level = rms(pcm);
  if (level === 0) return 1;

  const gain = Math.min(targetRms / level, MAX_NORMALIZATION_GAIN);
  const p = peak(pcm);
  return p > 0 ? Math.min(gain, 1 / p) : gain;
}

/** Escala la señal al RMS objetivo. No modifica la entrada. */
export function rmsNormalize(pcm: Float32Array, targetRms: number = TARGET_RMS): Float32Array {
  const gain = normalizationGain(pcm, targetRms);
  const out = new Float32Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) out[i] = pcm[i] * gain;
  return out;
}

/**
 * Preprocesamiento completo de un buffer ya grabado: filtrar y luego normalizar.
 * Es el camino del PCM que va a Whisper y al comparador, donde se conoce la
 * frase entera y la ganancia puede calcularse sobre todo el enunciado.
 */
export function preprocess(
  pcm: Float32Array,
  sampleRate: number,
  targetRms: number = TARGET_RMS
): Float32Array {
  const filtered = new BiquadCascade(designVoiceBandpass(sampleRate)).process(pcm);
  return rmsNormalize(filtered, targetRms);
}

/**
 * Preprocesamiento en vivo, bloque a bloque.
 *
 * Aquí la normalización NO puede calcularse sobre el enunciado completo —
 * todavía no terminó. Normalizar cada bloque por separado sería peor: la
 * ganancia saltaría entre bloques y bombearía el volumen en cada pausa. La
 * solución es un RMS con memoria (media móvil exponencial) que sube y baja
 * despacio, de modo que la ganancia varíe suavemente dentro de una frase.
 */
export class StreamingPreprocessor {
  private readonly bandpass: BiquadCascade;
  /** RMS suavizado; null hasta el primer bloque con señal. */
  private smoothedRms: number | null = null;

  /**
   * @param smoothing Peso del historial en la media móvil (0 = sin memoria,
   *   cercano a 1 = muy lento). 0.9 da una respuesta de ~10 bloques.
   */
  constructor(
    readonly sampleRate: number,
    readonly targetRms: number = TARGET_RMS,
    private readonly smoothing = 0.9
  ) {
    this.bandpass = new BiquadCascade(designVoiceBandpass(sampleRate));
  }

  /** Ganancia aplicada al último bloque (útil para diagnóstico en la UI). */
  get gain(): number {
    if (this.smoothedRms === null || this.smoothedRms === 0) return 1;
    return Math.min(this.targetRms / this.smoothedRms, MAX_NORMALIZATION_GAIN);
  }

  process(block: Float32Array): Float32Array {
    const filtered = this.bandpass.process(block);
    const level = rms(filtered);

    this.smoothedRms =
      this.smoothedRms === null
        ? level
        : this.smoothing * this.smoothedRms + (1 - this.smoothing) * level;

    const gain = this.gain;
    const out = new Float32Array(filtered.length);
    for (let i = 0; i < filtered.length; i++) out[i] = filtered[i] * gain;
    return out;
  }

  reset(): void {
    this.bandpass.reset();
    this.smoothedRms = null;
  }
}
