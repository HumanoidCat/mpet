/**
 * S2-T3 — Detección de actividad de voz (VAD) por umbral de energía.
 *
 * Decide dónde empieza y dónde termina el habla dentro de la grabación. Sirve
 * para dos cosas: recortar el silencio antes de mandar el audio a Whisper
 * (menos muestras = menos latencia) y delimitar el tramo que el comparador de
 * la Semana 6 alineará contra la referencia.
 *
 * La señal se divide en frames de 32 ms con 50 % de solape y de cada uno se
 * calcula la energía en dB:
 *
 *   E[m] = 20·log₁₀( RMS(frame m) )
 *
 * Un umbral fijo no funciona — depende del micrófono y del cuarto — así que el
 * umbral se calcula **relativo al ruido de fondo medido en la propia
 * grabación**. Tres mecanismos evitan los errores típicos de un umbral simple:
 *
 *   · Histéresis: cuesta más entrar en habla (+10 dB) que salir (+6 dB), así
 *     que la decisión no oscila cuando la energía ronda el umbral.
 *   · Confirmación: hacen falta varios frames seguidos por encima para declarar
 *     habla, de modo que un clic o un golpe no abra un segmento.
 *   · Hangover: se toleran ~200 ms por debajo del umbral antes de cerrar. Sin
 *     esto, el VAD cortaría la frase en cada oclusiva (/p/, /t/, /k/), que son
 *     silencios reales de hasta 100 ms en medio de una palabra.
 */

import { FRAME_SIZE, HOP_SIZE } from '@shared/constants';
import { rms } from './preprocess';

/** dB asignados a un frame con energía nula (evita −Infinity). */
export const SILENCE_DB = -100;

export interface VadOptions {
  sampleRate: number;
  /** Muestras por frame de análisis. */
  frameSize?: number;
  /** Avance entre frames. */
  hopSize?: number;
  /** Cuántos dB sobre el ruido de fondo hay que superar para entrar en habla. */
  startOffsetDb?: number;
  /** Umbral de salida, más bajo que el de entrada (histéresis). */
  endOffsetDb?: number;
  /** Umbral absoluto mínimo: protege ante grabaciones sin nada de ruido. */
  floorDb?: number;
  /** Tiempo por encima del umbral para confirmar el inicio del habla. */
  startConfirmMs?: number;
  /** Tolerancia por debajo del umbral antes de cerrar (oclusivas, pausas). */
  hangoverMs?: number;
  /** Segmentos más cortos que esto se descartan por ruido. */
  minSpeechMs?: number;
}

const DEFAULTS = {
  startOffsetDb: 10,
  endOffsetDb: 6,
  floorDb: -50,
  startConfirmMs: 48,
  hangoverMs: 200,
  minSpeechMs: 100,
};

export interface SpeechSegment {
  /** Índice de la primera muestra del segmento. */
  startSample: number;
  /** Índice siguiente a la última muestra (exclusivo). */
  endSample: number;
  /** Segundos desde el inicio de la grabación. */
  startTime: number;
  endTime: number;
}

export interface VadThresholds {
  /** Ruido de fondo estimado, en dB. */
  noiseFloorDb: number;
  /** Umbral para declarar inicio de habla. */
  startDb: number;
  /** Umbral para declarar fin de habla. */
  endDb: number;
}

/** Energía de un frame en dB, acotada por abajo. */
export function frameEnergyDb(frame: Float32Array): number {
  const level = rms(frame);
  return level === 0 ? SILENCE_DB : Math.max(SILENCE_DB, 20 * Math.log10(level));
}

/** Energía en dB de cada frame de la señal. */
export function frameEnergies(
  pcm: Float32Array,
  frameSize: number = FRAME_SIZE,
  hopSize: number = HOP_SIZE
): Float32Array {
  if (pcm.length < frameSize) return new Float32Array(0);

  const count = Math.floor((pcm.length - frameSize) / hopSize) + 1;
  const out = new Float32Array(count);
  for (let m = 0; m < count; m++) {
    out[m] = frameEnergyDb(pcm.subarray(m * hopSize, m * hopSize + frameSize));
  }
  return out;
}

/**
 * Estima el ruido de fondo como el percentil 10 de las energías: se asume que
 * al menos una décima parte de la grabación es silencio. El tope de −25 dB por
 * debajo del frame más fuerte cubre el caso contrario — una grabación que es
 * casi toda habla — donde el percentil caería dentro de la voz y el umbral
 * quedaría tan alto que no se detectaría nada.
 */
export function estimateNoiseFloorDb(energies: Float32Array): number {
  if (energies.length === 0) return SILENCE_DB;

  const ordenadas = Float32Array.from(energies).sort();
  const percentil10 = ordenadas[Math.floor(ordenadas.length * 0.1)];
  const maxima = ordenadas[ordenadas.length - 1];

  return Math.min(percentil10, maxima - 25);
}

/** Umbrales de entrada y salida a partir del ruido de fondo. */
export function computeThresholds(
  energies: Float32Array,
  options: VadOptions
): VadThresholds {
  const startOffsetDb = options.startOffsetDb ?? DEFAULTS.startOffsetDb;
  const endOffsetDb = options.endOffsetDb ?? DEFAULTS.endOffsetDb;
  const floorDb = options.floorDb ?? DEFAULTS.floorDb;

  const noiseFloorDb = estimateNoiseFloorDb(energies);
  return {
    noiseFloorDb,
    startDb: Math.max(noiseFloorDb + startOffsetDb, floorDb),
    endDb: Math.max(noiseFloorDb + endOffsetDb, floorDb - startOffsetDb + endOffsetDb),
  };
}

/** Convierte milisegundos a un número entero de frames (mínimo 1). */
function msToFrames(ms: number, hopSize: number, sampleRate: number): number {
  return Math.max(1, Math.round((ms / 1000) * (sampleRate / hopSize)));
}

/**
 * Máquina de estados sobre las energías por frame. Devuelve los tramos de habla
 * en índices de frame, con `endFrame` exclusivo. Separada del troceado para
 * poder reutilizarla tal cual en la versión en vivo.
 */
function segmentar(
  energies: Float32Array,
  thresholds: VadThresholds,
  startConfirmFrames: number,
  hangoverFrames: number
): { startFrame: number; endFrame: number }[] {
  const segmentos: { startFrame: number; endFrame: number }[] = [];

  let enHabla = false;
  let inicio = 0;
  let sobreUmbral = 0;
  let bajoUmbral = 0;

  for (let m = 0; m < energies.length; m++) {
    const e = energies[m];

    if (!enHabla) {
      sobreUmbral = e > thresholds.startDb ? sobreUmbral + 1 : 0;
      if (sobreUmbral >= startConfirmFrames) {
        enHabla = true;
        // Se retrocede hasta el primer frame que superó el umbral: el habla
        // empezó ahí, no cuando terminamos de confirmarla.
        inicio = m - sobreUmbral + 1;
        bajoUmbral = 0;
      }
    } else {
      bajoUmbral = e < thresholds.endDb ? bajoUmbral + 1 : 0;
      if (bajoUmbral >= hangoverFrames) {
        enHabla = false;
        // El hangover no forma parte del habla: se descuenta.
        segmentos.push({ startFrame: inicio, endFrame: m - bajoUmbral + 1 });
        sobreUmbral = 0;
      }
    }
  }

  // La grabación terminó mientras seguía hablando.
  if (enHabla) {
    segmentos.push({ startFrame: inicio, endFrame: energies.length });
  }
  return segmentos;
}

/**
 * Detecta los tramos de habla de un buffer completo. Se espera PCM ya
 * preprocesado (S2-T2): el pasa-altas quita la continua y el zumbido, que si no
 * aportarían energía constante y levantarían el piso de ruido artificialmente.
 */
export function detectSpeech(pcm: Float32Array, options: VadOptions): SpeechSegment[] {
  const { sampleRate } = options;
  const frameSize = options.frameSize ?? FRAME_SIZE;
  const hopSize = options.hopSize ?? HOP_SIZE;

  const energies = frameEnergies(pcm, frameSize, hopSize);
  if (energies.length === 0) return [];

  const thresholds = computeThresholds(energies, options);
  const startConfirmFrames = msToFrames(
    options.startConfirmMs ?? DEFAULTS.startConfirmMs,
    hopSize,
    sampleRate
  );
  const hangoverFrames = msToFrames(options.hangoverMs ?? DEFAULTS.hangoverMs, hopSize, sampleRate);
  const minSpeechSamples = ((options.minSpeechMs ?? DEFAULTS.minSpeechMs) / 1000) * sampleRate;

  return segmentar(energies, thresholds, startConfirmFrames, hangoverFrames)
    .map(({ startFrame, endFrame }) => {
      const startSample = startFrame * hopSize;
      // El último frame cubre hasta `frameSize` muestras más allá de su inicio.
      const endSample = Math.min((endFrame - 1) * hopSize + frameSize, pcm.length);
      return {
        startSample,
        endSample,
        startTime: startSample / sampleRate,
        endTime: endSample / sampleRate,
      };
    })
    .filter((s) => s.endSample - s.startSample >= minSpeechSamples);
}

/**
 * Recorta la grabación al habla: desde el inicio del primer segmento hasta el
 * fin del último. Es lo que se manda al ASR — Whisper procesa en bloques de
 * 30 s y quitar el silencio de los extremos reduce la latencia directamente.
 * Si no se detecta habla se devuelve el buffer intacto, para no perder audio
 * por una decisión del VAD.
 */
export function trimToSpeech(pcm: Float32Array, options: VadOptions): Float32Array {
  const segmentos = detectSpeech(pcm, options);
  if (segmentos.length === 0) return pcm.slice();

  return pcm.slice(segmentos[0].startSample, segmentos[segmentos.length - 1].endSample);
}

export type VadEvent =
  | { type: 'speech-start'; sample: number; time: number }
  | { type: 'speech-end'; sample: number; time: number };

/**
 * VAD en vivo, bloque a bloque.
 *
 * Diferencia esencial con la versión offline: el ruido de fondo no puede
 * calcularse sobre toda la grabación porque todavía no existe. Se estima con
 * los primeros `calibrationMs` de audio — el instante en que el usuario acaba
 * de pulsar el micrófono y aún no habló — y después se sigue adaptando, pero
 * solo hacia arriba y solo durante el silencio, para que la voz no contamine
 * la estimación.
 */
export class StreamingVad {
  private readonly frameSize: number;
  private readonly hopSize: number;
  private readonly startConfirmFrames: number;
  private readonly hangoverFrames: number;

  /** Muestras aún sin completar un frame. */
  private pending: Float32Array = new Float32Array(0);
  private framesVistos = 0;

  private noiseFloorDb: number | null = null;
  private calibracion: number[] = [];

  private enHabla = false;
  private sobreUmbral = 0;
  private bajoUmbral = 0;

  constructor(
    private readonly options: VadOptions,
    /** Duración del tramo inicial usado para medir el ruido de fondo. */
    private readonly calibrationMs = 300
  ) {
    this.frameSize = options.frameSize ?? FRAME_SIZE;
    this.hopSize = options.hopSize ?? HOP_SIZE;
    this.startConfirmFrames = msToFrames(
      options.startConfirmMs ?? DEFAULTS.startConfirmMs,
      this.hopSize,
      options.sampleRate
    );
    this.hangoverFrames = msToFrames(
      options.hangoverMs ?? DEFAULTS.hangoverMs,
      this.hopSize,
      options.sampleRate
    );
  }

  /** ¿Se está detectando habla en este momento? */
  get isSpeaking(): boolean {
    return this.enHabla;
  }

  /** Ruido de fondo estimado, o null si aún se está calibrando. */
  get noiseFloor(): number | null {
    return this.noiseFloorDb;
  }

  private get thresholds(): VadThresholds | null {
    if (this.noiseFloorDb === null) return null;
    const startOffsetDb = this.options.startOffsetDb ?? DEFAULTS.startOffsetDb;
    const endOffsetDb = this.options.endOffsetDb ?? DEFAULTS.endOffsetDb;
    const floorDb = this.options.floorDb ?? DEFAULTS.floorDb;
    return {
      noiseFloorDb: this.noiseFloorDb,
      startDb: Math.max(this.noiseFloorDb + startOffsetDb, floorDb),
      endDb: Math.max(this.noiseFloorDb + endOffsetDb, floorDb - startOffsetDb + endOffsetDb),
    };
  }

  /** Procesa un bloque y devuelve los cambios de estado que produjo. */
  process(block: Float32Array): VadEvent[] {
    const eventos: VadEvent[] = [];

    // Se acumula con lo que sobró del bloque anterior: los frames no coinciden
    // con los límites de bloque.
    const buffer = new Float32Array(this.pending.length + block.length);
    buffer.set(this.pending);
    buffer.set(block, this.pending.length);

    let offset = 0;
    while (offset + this.frameSize <= buffer.length) {
      this.procesarFrame(buffer.subarray(offset, offset + this.frameSize), eventos);
      offset += this.hopSize;
      this.framesVistos++;
    }

    this.pending = buffer.slice(offset);
    return eventos;
  }

  private procesarFrame(frame: Float32Array, eventos: VadEvent[]): void {
    const e = frameEnergyDb(frame);
    const framesCalibracion = msToFrames(this.calibrationMs, this.hopSize, this.options.sampleRate);

    // Fase de calibración: solo se mide, no se decide.
    if (this.noiseFloorDb === null) {
      this.calibracion.push(e);
      if (this.calibracion.length >= framesCalibracion) {
        this.noiseFloorDb = estimateNoiseFloorDb(Float32Array.from(this.calibracion));
        this.calibracion = [];
      }
      return;
    }

    const t = this.thresholds!;

    if (!this.enHabla) {
      // Adaptación al ruido: solo durante el silencio y solo hacia arriba, para
      // seguir un ambiente que se vuelve más ruidoso sin que la voz lo arrastre.
      if (e < t.endDb) {
        this.noiseFloorDb = Math.max(this.noiseFloorDb, 0.995 * this.noiseFloorDb + 0.005 * e);
      }

      this.sobreUmbral = e > t.startDb ? this.sobreUmbral + 1 : 0;
      if (this.sobreUmbral >= this.startConfirmFrames) {
        this.enHabla = true;
        this.bajoUmbral = 0;
        const frameInicio = this.framesVistos - this.sobreUmbral + 1;
        eventos.push(this.evento('speech-start', frameInicio * this.hopSize));
      }
    } else {
      this.bajoUmbral = e < t.endDb ? this.bajoUmbral + 1 : 0;
      if (this.bajoUmbral >= this.hangoverFrames) {
        this.enHabla = false;
        this.sobreUmbral = 0;
        const frameFin = this.framesVistos - this.bajoUmbral + 1;
        eventos.push(this.evento('speech-end', frameFin * this.hopSize + this.frameSize));
      }
    }
  }

  private evento(type: VadEvent['type'], sample: number): VadEvent {
    const s = Math.max(0, sample);
    return { type, sample: s, time: s / this.options.sampleRate };
  }

  reset(): void {
    this.pending = new Float32Array(0);
    this.framesVistos = 0;
    this.noiseFloorDb = null;
    this.calibracion = [];
    this.enHabla = false;
    this.sobreUmbral = 0;
    this.bajoUmbral = 0;
  }
}
