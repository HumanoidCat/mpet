/**
 * S2-T1 — Captura de micrófono a 16 kHz.
 *
 * Cadena completa:
 *
 *   getUserMedia (48 kHz) → AudioWorklet (bloques de 1024) → hilo principal
 *     → StreamingResampler (FIR 7.2 kHz + decimación ÷3) → RingBuffer (16 kHz)
 *
 * Es la base del `AudioEngine` del contrato, pero todavía no lo implementa: el
 * `AudioFrame` necesita FFT (S3-T1), MFCC y pitch (S5), que aún no existen.
 * Este módulo entrega PCM limpio a 16 kHz; el resto se monta encima.
 *
 * No se puede probar en Node (necesita Web Audio). Lo testeable —el buffer
 * circular y el remuestreo— está aislado en `ringBuffer.ts` y `dsp/`, con
 * cobertura en `tests/audio/`.
 */

// `?worker&url` y NO `?url`: con `?url` Vite inlinea el worklet como data URI
// (pesa 2.5 KB, por debajo del assetsInlineLimit de 4 KB) y `addModule()` sobre
// un data: URL depende del navegador y lo bloquea un CSP estricto. Con
// `?worker&url` se emite como archivo real en `assets/` y se referencia por URL.
// Verificado en el bundle de producción: el asset sale como IIFE autocontenido
// que llama a `registerProcessor('capture-processor', …)`.
import processorUrl from './captureProcessor.js?worker&url';
import { SAMPLE_RATE } from '@shared/constants';
import { RingBuffer } from './ringBuffer';
import { StreamingResampler } from '../dsp/resampler';

/** Muestras que junta el worklet antes de postear (a 48 kHz ≈ 21 ms). */
const WORKLET_BLOCK_SIZE = 1024;

/** Capacidad del buffer de salida: 60 s a 16 kHz. Sobra para un turno de habla. */
const RING_CAPACITY = SAMPLE_RATE * 60;

export interface MicCaptureOptions {
  /** Rate destino. Por defecto 16 kHz (requisito de Whisper). */
  targetRate?: number;
  /** Muestras por bloque del worklet. */
  blockSize?: number;
}

export interface CaptureStats {
  /** Rate real que entregó el navegador (48 kHz en el hardware del equipo). */
  inputRate: number;
  outputRate: number;
  /** Muestras a 16 kHz capturadas hasta ahora. */
  samplesCaptured: number;
  /** Muestras perdidas por desbordamiento del buffer circular. */
  dropped: number;
  /** Retardo del filtro anti-aliasing, en ms. */
  latencyMs: number;
}

export interface MicCapture {
  /** Pide permiso de micrófono y arranca la captura. */
  start(): Promise<void>;
  /** Detiene, libera el micrófono y devuelve el PCM completo a 16 kHz. */
  stop(): Promise<Float32Array>;
  /** Suscripción a bloques remuestreados a 16 kHz. Devuelve unsubscribe. */
  onBlock(cb: (pcm: Float32Array) => void): () => void;
  stats(): CaptureStats;
}

export function createMicCapture(options: MicCaptureOptions = {}): MicCapture {
  const targetRate = options.targetRate ?? SAMPLE_RATE;
  const blockSize = options.blockSize ?? WORKLET_BLOCK_SIZE;

  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let node: AudioWorkletNode | null = null;
  let resampler: StreamingResampler | null = null;
  let inputRate = 0;
  let samplesCaptured = 0;

  const ring = new RingBuffer(RING_CAPACITY);
  const subs = new Set<(pcm: Float32Array) => void>();

  async function start(): Promise<void> {
    if (ctx) throw new Error('La captura ya está activa');

    // Apagamos el procesamiento del navegador: son filtros no documentados que
    // alterarían espectro y RMS antes de nuestro análisis (igual que en S1-T6).
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    // No forzamos `sampleRate` en el AudioContext: queremos el rate nativo y
    // hacer el remuestreo nosotros (decisión documentada en 09-marco-teorico).
    ctx = new AudioContext();
    inputRate = ctx.sampleRate;
    resampler = new StreamingResampler(inputRate, targetRate);

    await ctx.audioWorklet.addModule(processorUrl);

    node = new AudioWorkletNode(ctx, 'capture-processor', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
      channelCount: 1,
      processorOptions: { blockSize },
    });

    node.port.onmessage = (e: MessageEvent) => {
      if (e.data?.type !== 'block' || !resampler) return;
      const pcm = resampler.process(e.data.pcm as Float32Array);
      if (pcm.length === 0) return;
      ring.write(pcm);
      samplesCaptured += pcm.length;
      subs.forEach((cb) => cb(pcm));
    };

    ctx.createMediaStreamSource(stream).connect(node);
  }

  async function stop(): Promise<Float32Array> {
    // Pedimos al worklet que vacíe su buffer parcial antes de desmontar todo,
    // si no se pierde hasta un bloque (~21 ms) del final de la frase.
    node?.port.postMessage({ type: 'stop' });
    await new Promise((r) => setTimeout(r, 0));

    node?.disconnect();
    stream?.getTracks().forEach((t) => t.stop());
    await ctx?.close();

    ctx = null;
    stream = null;
    node = null;
    resampler = null;

    return ring.drain();
  }

  return {
    start,
    stop,
    onBlock(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    stats: () => ({
      inputRate,
      outputRate: targetRate,
      samplesCaptured,
      dropped: ring.dropped,
      latencyMs: resampler?.latencyMs ?? 0,
    }),
  };
}
