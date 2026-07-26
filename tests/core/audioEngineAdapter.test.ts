import { describe, it, expect } from 'vitest';
import { createDspAudioEngine } from '../../src/core/audioEngineAdapter';
import { SAMPLE_RATE, FFT_SIZE, N_MFCC } from '../../src/shared/constants';
import { binFrequency, spectrumLength } from '../../src/audio/dsp/fft';

/**
 * Pruebas del adaptador entre el modulo DSP y el contrato `AudioEngine` (S3-T5).
 *
 * No se prueba la captura de microfono (requiere navegador y permisos): eso se
 * verifica manualmente. Aqui se prueba `analyze()`, que recorre la misma cadena
 * de analisis sobre un buffer conocido, de modo que el espectro es comprobable.
 */

function sine(freqHz: number, samples: number, amplitude = 0.5): Float32Array {
  const out = new Float32Array(samples);
  for (let n = 0; n < samples; n++) {
    out[n] = amplitude * Math.sin((2 * Math.PI * freqHz * n) / SAMPLE_RATE);
  }
  return out;
}

describe('Adaptador DSP -> AudioEngine (S3-T5)', () => {
  it('analyze devuelve un frame por bloque completo de FFT', async () => {
    const engine = createDspAudioEngine();
    const frames = await engine.analyze(sine(440, FFT_SIZE * 4));
    expect(frames).toHaveLength(4);
  });

  it('cada frame respeta la forma del contrato AudioFrame', async () => {
    const engine = createDspAudioEngine();
    const [frame] = await engine.analyze(sine(440, FFT_SIZE * 2));

    expect(frame.pcm.length).toBe(FFT_SIZE);
    expect(frame.fftDb.length).toBe(spectrumLength(FFT_SIZE));
    expect(frame.mfcc).toHaveLength(N_MFCC);
    expect(frame.energy).toBeGreaterThan(0);
    expect(frame.t).toBeGreaterThan(0);
  });

  it('el espectro localiza el tono de entrada en el bin correcto', async () => {
    // Frecuencia centrada exactamente en un bin, para que no haya fuga.
    const bin = 32;
    const freq = binFrequency(bin, FFT_SIZE, SAMPLE_RATE);
    const engine = createDspAudioEngine();
    const [frame] = await engine.analyze(sine(freq, FFT_SIZE * 2));

    let peak = 0;
    for (let k = 1; k < frame.fftDb.length; k++) {
      if (frame.fftDb[k] > frame.fftDb[peak]) peak = k;
    }
    // Tolerancia de un bin: el pasa-banda introduce un desfase minimo.
    expect(Math.abs(peak - bin)).toBeLessThanOrEqual(1);
  });

  it('el tiempo del frame avanza de forma monotona', async () => {
    const engine = createDspAudioEngine();
    const frames = await engine.analyze(sine(440, FFT_SIZE * 3));
    expect(frames[1].t).toBeGreaterThan(frames[0].t);
    expect(frames[2].t).toBeGreaterThan(frames[1].t);
  });

  it('el silencio da energia practicamente nula', async () => {
    const engine = createDspAudioEngine();
    const [frame] = await engine.analyze(new Float32Array(FFT_SIZE * 2));
    expect(frame.energy).toBeLessThan(1e-6);
  });

  it('pitch y MFCC quedan declarados como pendientes, no inventados', async () => {
    const engine = createDspAudioEngine();
    const [frame] = await engine.analyze(sine(200, FFT_SIZE * 2));
    // S5-T1 y S5-T2 todavia no existen: el contrato se cumple con valores
    // neutros explicitos en lugar de datos falsos.
    expect(frame.pitchHz).toBeNull();
    expect(frame.mfcc.every((c) => c === 0)).toBe(true);
  });

  it('stats es null antes de iniciar la captura', () => {
    const engine = createDspAudioEngine();
    expect(engine.stats()).toBeNull();
  });
});
