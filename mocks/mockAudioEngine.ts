import type { AudioEngine, AudioFrame } from '@shared/contracts';
import { SAMPLE_RATE, FRAME_SIZE, N_MFCC } from '@shared/constants';

/**
 * Mock del motor de audio (dueño real: Fabrizio).
 * Genera un tono de 220 Hz con vibrato para que la UI pueda
 * desarrollar waveform/espectrograma/pitch sin el DSP real.
 */
export function createMockAudioEngine(): AudioEngine {
  let timer: ReturnType<typeof setInterval> | null = null;
  let t = 0;
  const subs = new Set<(f: AudioFrame) => void>();

  const makeFrame = (time: number): AudioFrame => {
    const pcm = new Float32Array(FRAME_SIZE);
    const f0 = 220 + 30 * Math.sin(2 * Math.PI * 0.5 * time); // vibrato
    for (let i = 0; i < FRAME_SIZE; i++) {
      pcm[i] = 0.6 * Math.sin(2 * Math.PI * f0 * (time + i / SAMPLE_RATE));
    }
    const fftDb = new Float32Array(FRAME_SIZE / 2).fill(-80);
    const bin = Math.round((f0 * FRAME_SIZE) / SAMPLE_RATE);
    if (bin < fftDb.length) fftDb[bin] = -6;
    return {
      pcm,
      fftDb,
      pitchHz: f0,
      energy: 0.4,
      mfcc: Array.from({ length: N_MFCC }, (_, k) => Math.cos(k) * 0.5),
      t: time,
    };
  };

  return {
    async start() {
      timer = setInterval(() => {
        t += FRAME_SIZE / SAMPLE_RATE;
        const frame = makeFrame(t);
        subs.forEach((cb) => cb(frame));
      }, 33);
    },
    async stop() {
      if (timer) clearInterval(timer);
      return new Float32Array(SAMPLE_RATE * 2); // 2 s de silencio
    },
    onFrame(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    async analyze(pcm) {
      const n = Math.floor(pcm.length / FRAME_SIZE);
      return Array.from({ length: n }, (_, i) => makeFrame(i * (FRAME_SIZE / SAMPLE_RATE)));
    },
  };
}
