/**
 * S1-T6 — Utilidades de muestreo (parte pura, testeable sin navegador).
 *
 * El navegador NO garantiza que podamos abrir el micrófono a 16 kHz: el
 * AudioContext suele quedar fijado al sample rate del dispositivo (44.1 o
 * 48 kHz). Por eso capturamos al rate nativo y remuestreamos nosotros.
 * Estas funciones deciden CÓMO remuestrear y qué se pierde al hacerlo.
 */

import { SAMPLE_RATE } from '@shared/constants';

/** Frecuencia máxima representable sin aliasing (fs / 2). */
export function nyquistHz(sampleRate: number): number {
  return sampleRate / 2;
}

/**
 * ¿Una componente de `freqHz` sobrevive al muestreo a `sampleRate`?
 * Si no, se pliega (aliasing) y contamina la banda útil.
 */
export function isAliased(freqHz: number, sampleRate: number): boolean {
  return freqHz >= nyquistHz(sampleRate);
}

/**
 * Frecuencia aparente tras el plegamiento espectral.
 * Ej: 9 kHz muestreado a 16 kHz aparece en 7 kHz.
 */
export function aliasFrequency(freqHz: number, sampleRate: number): number {
  const folded = Math.abs(((freqHz + nyquistHz(sampleRate)) % sampleRate) - nyquistHz(sampleRate));
  return folded;
}

/** Nº de muestras que produce el remuestreo de `inputLength` muestras. */
export function resampledLength(inputLength: number, fromRate: number, toRate: number): number {
  return Math.floor((inputLength * toRate) / fromRate);
}

export type ResampleStrategy =
  | { kind: 'none'; factor: 1 }
  /** fromRate es múltiplo entero de toRate → basta filtrar y quedarse con 1 de cada `factor`. */
  | { kind: 'decimate'; factor: number }
  /** Relación no entera (44100 → 16000) → interpolación + filtro anti-aliasing. */
  | { kind: 'interpolate'; factor: number };

/**
 * Elige la estrategia de remuestreo hacia `toRate` (por defecto 16 kHz, requisito
 * de Whisper). 48000 → 16000 es decimación exacta (÷3); 44100 → 16000 no lo es
 * (÷2.75625) y obliga a interpolar.
 */
export function chooseResampleStrategy(fromRate: number, toRate: number = SAMPLE_RATE): ResampleStrategy {
  if (fromRate === toRate) return { kind: 'none', factor: 1 };

  const factor = fromRate / toRate;
  if (Number.isInteger(factor)) return { kind: 'decimate', factor };
  return { kind: 'interpolate', factor };
}

/**
 * Corte del filtro anti-aliasing antes de decimar: algo por debajo del Nyquist
 * destino, para dejar margen a la caída del filtro (no es ideal).
 */
export function antiAliasCutoffHz(toRate: number = SAMPLE_RATE, margin = 0.9): number {
  return nyquistHz(toRate) * margin;
}
