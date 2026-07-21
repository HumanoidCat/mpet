/**
 * S1-T6 — Spike de captura: ¿qué sample rates nos da realmente el navegador?
 *
 * Pregunta a responder antes de la Semana 2 (S2-T1): ¿podemos pedir 16 kHz
 * directo, o hay que capturar al rate nativo y remuestrear a mano?
 *
 * Uso desde la consola del navegador (con `npm run dev` corriendo):
 *   import('@audio/capture/probeAudioDevice').then(m => m.probeAudioDevice().then(console.log))
 * o bien `m.probeAudioDevice().then(r => console.log(m.formatProbeReport(r)))`
 */

import { SAMPLE_RATE } from '@shared/constants';
import { chooseResampleStrategy, nyquistHz, type ResampleStrategy } from '../dsp/sampling';

export interface AudioDeviceProbe {
  /** Sample rate por defecto del AudioContext (el del hardware). */
  defaultContextRate: number;
  /** ¿El navegador aceptó `new AudioContext({ sampleRate: 16000 })`? */
  canForce16k: boolean;
  /** Rate real que entregó el AudioContext al pedirle 16 kHz. */
  forcedContextRate: number | null;
  /** Rate del track de micrófono según getSettings(). */
  micTrackRate: number | null;
  /** Rango de sample rates que declara el dispositivo, si lo expone. */
  micSupportedRates: { min: number; max: number } | null;
  /** Estrategia de remuestreo que tocará implementar en S2-T1. */
  strategy: ResampleStrategy;
  /** Nyquist del rate destino: techo de lo que podremos analizar. */
  targetNyquistHz: number;
  /** Procesamiento del navegador que hay que apagar para no ensuciar el DSP. */
  constraintsApplied: Record<string, unknown>;
  errors: string[];
}

/**
 * Pide permiso de micrófono y mide qué nos concede el navegador.
 * Desactiva echoCancellation/noiseSuppression/autoGainControl: son filtros
 * no documentados que alterarían el espectro y el RMS antes de nuestro análisis.
 */
export async function probeAudioDevice(): Promise<AudioDeviceProbe> {
  const errors: string[] = [];

  const probeCtx = new AudioContext();
  const defaultContextRate = probeCtx.sampleRate;
  await probeCtx.close();

  // ¿Nos deja fijar 16 kHz directamente? (Chrome sí, Safari históricamente no.)
  let forcedContextRate: number | null = null;
  try {
    const forced = new AudioContext({ sampleRate: SAMPLE_RATE });
    forcedContextRate = forced.sampleRate;
    await forced.close();
  } catch (e) {
    errors.push(`AudioContext a ${SAMPLE_RATE} Hz rechazado: ${String(e)}`);
  }

  const constraints: MediaTrackConstraints = {
    channelCount: 1,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  };

  let micTrackRate: number | null = null;
  let micSupportedRates: { min: number; max: number } | null = null;
  let constraintsApplied: Record<string, unknown> = {};

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
    const track = stream.getAudioTracks()[0];

    const settings = track.getSettings();
    micTrackRate = settings.sampleRate ?? null;
    constraintsApplied = settings as Record<string, unknown>;

    const caps = track.getCapabilities?.();
    if (caps?.sampleRate?.min !== undefined && caps.sampleRate.max !== undefined) {
      micSupportedRates = { min: caps.sampleRate.min, max: caps.sampleRate.max };
    }

    // Soltamos el micrófono: el spike solo mide, no graba.
    stream.getTracks().forEach((t) => t.stop());
  } catch (e) {
    errors.push(`getUserMedia falló: ${String(e)}`);
  }

  // El rate que realmente vamos a recibir en el AudioWorklet.
  const effectiveRate = forcedContextRate ?? defaultContextRate;

  return {
    defaultContextRate,
    canForce16k: forcedContextRate === SAMPLE_RATE,
    forcedContextRate,
    micTrackRate,
    micSupportedRates,
    strategy: chooseResampleStrategy(effectiveRate),
    targetNyquistHz: nyquistHz(SAMPLE_RATE),
    constraintsApplied,
    errors,
  };
}

/** Reporte legible para pegar como evidencia en el documento del Avance 1. */
export function formatProbeReport(p: AudioDeviceProbe): string {
  const lines = [
    '── Spike de captura (S1-T6) ──',
    `AudioContext por defecto : ${p.defaultContextRate} Hz`,
    `¿Fuerza 16 kHz?          : ${p.canForce16k ? 'sí' : `no (dio ${p.forcedContextRate ?? 'error'} Hz)`}`,
    `Track de micrófono       : ${p.micTrackRate ?? 'no reportado'} Hz`,
    `Rates soportados         : ${p.micSupportedRates ? `${p.micSupportedRates.min}–${p.micSupportedRates.max} Hz` : 'no expuesto'}`,
    `Estrategia S2-T1         : ${p.strategy.kind} (factor ${p.strategy.factor})`,
    `Nyquist destino          : ${p.targetNyquistHz} Hz`,
  ];
  if (p.errors.length) lines.push(`Errores: ${p.errors.join(' | ')}`);
  return lines.join('\n');
}
