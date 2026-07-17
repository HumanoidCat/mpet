/** Parámetros DSP acordados (justificación en docs/01-arquitectura.md) */
export const SAMPLE_RATE = 16000;      // Hz — requisito Whisper; Nyquist: voz ≤ 8 kHz
export const FRAME_SIZE = 512;         // muestras (32 ms @ 16 kHz)
export const HOP_SIZE = 256;           // 50% solapamiento
export const FFT_SIZE = 512;
export const N_MFCC = 13;
export const N_MEL_FILTERS = 26;
export const PITCH_MIN_HZ = 60;
export const PITCH_MAX_HZ = 400;
