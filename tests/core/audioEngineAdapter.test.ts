import { describe, it, expect } from 'vitest';
import { createDspAudioEngine, FrameAccumulator } from '../../src/core/audioEngineAdapter';
import {
  SAMPLE_RATE,
  FRAME_SIZE,
  HOP_SIZE,
  FFT_SIZE,
  N_MFCC,
} from '../../src/shared/constants';
import { binFrequency, spectrumLength, toDb } from '../../src/audio/dsp/fft';
import { StreamingStft } from '../../src/audio/dsp/stft';

/**
 * Pruebas del adaptador entre el modulo DSP y el contrato `AudioEngine` (S3-T5).
 *
 * No se prueba la captura de microfono (requiere navegador y permisos): eso se
 * verifica manualmente. Aqui se prueba `analyze()`, que recorre la misma cadena
 * de analisis sobre un buffer conocido, de modo que el espectro es comprobable.
 *
 * Las pruebas de amplitud y de conteo de tramas existen por la incidencia I-03:
 * el adaptador rellenaba con ceros un tercio de cada trama y el espectro salia
 * un 20 % bajo, sin que ninguna prueba lo detectara.
 */

function seno(freqHz: number, muestras: number, amplitud = 1): Float32Array {
  const out = new Float32Array(muestras);
  for (let n = 0; n < muestras; n++) {
    out[n] = amplitud * Math.sin((2 * Math.PI * freqHz * n) / SAMPLE_RATE);
  }
  return out;
}

/** Numero de tramas que salen de `muestras` con el solape configurado. */
function tramasEsperadas(muestras: number): number {
  return muestras < FRAME_SIZE ? 0 : Math.floor((muestras - FRAME_SIZE) / HOP_SIZE) + 1;
}

describe('FrameAccumulator (I-03)', () => {
  it('el numero de tramas no depende del tamano de bloque de entrada', () => {
    const total = FRAME_SIZE * 8;
    const senal = seno(440, total);

    const contar = (tamBloque: number) => {
      const acc = new FrameAccumulator();
      let n = 0;
      for (let i = 0; i < senal.length; i += tamBloque) {
        n += acc.push(senal.subarray(i, Math.min(i + tamBloque, senal.length))).length;
      }
      return n;
    };

    // 341 es justo lo que entrega el worklet tras la decimacion x3, y es el
    // caso que rompia: no divide al tamano de trama.
    expect(contar(341)).toBe(tramasEsperadas(total));
    expect(contar(128)).toBe(tramasEsperadas(total));
    expect(contar(1024)).toBe(tramasEsperadas(total));
    expect(contar(total)).toBe(tramasEsperadas(total));
  });

  it('conserva el sobrante entre llamadas en vez de rellenar con ceros', () => {
    const BLOQUE = 341; // lo que entrega el worklet tras la decimacion x3
    const acc = new FrameAccumulator();

    // Un solo bloque no alcanza para una trama de 512: no debe emitir nada.
    // La version anterior rellenaba con 171 ceros y emitia una trama igual.
    expect(acc.push(seno(440, BLOQUE))).toHaveLength(0);

    // A partir de ahi el total emitido sigue exactamente al numero de tramas
    // completas que caben en las muestras acumuladas.
    let emitidas = 0;
    for (let bloques = 2; bloques <= 6; bloques++) {
      emitidas += acc.push(seno(440, BLOQUE)).length;
      expect(emitidas).toBe(tramasEsperadas(bloques * BLOQUE));
    }
  });

  it('el tiempo avanza un salto por trama emitida', () => {
    const acc = new FrameAccumulator();
    expect(acc.nextFrameTime).toBe(0);
    acc.push(seno(440, FRAME_SIZE));
    expect(acc.nextFrameTime).toBeCloseTo(HOP_SIZE / SAMPLE_RATE, 9);
  });
});

describe('Adaptador DSP -> AudioEngine (S3-T5)', () => {
  it('analyze emite una trama por salto, no una por bloque', async () => {
    const muestras = FRAME_SIZE * 4;
    const frames = await createDspAudioEngine().analyze(seno(440, muestras), { conditioned: true });
    expect(frames).toHaveLength(tramasEsperadas(muestras));
  });

  it('cada frame respeta la forma del contrato AudioFrame', async () => {
    const [frame] = await createDspAudioEngine().analyze(seno(440, FRAME_SIZE * 2), { conditioned: true });

    expect(frame.pcm.length).toBe(FRAME_SIZE);
    expect(frame.fftDb.length).toBe(spectrumLength(FFT_SIZE));
    expect(frame.mfcc).toHaveLength(N_MFCC);
    expect(frame.energy).toBeGreaterThan(0);
    expect(frame.t).toBe(0);
  });

  it('un tono de amplitud unitaria da 0 dB en su bin, sin perdida por relleno', async () => {
    // Frecuencia centrada exactamente en un bin, para que no haya fuga.
    const bin = 32;
    const freq = binFrequency(bin, FFT_SIZE, SAMPLE_RATE);
    const [frame] = await createDspAudioEngine().analyze(seno(freq, FRAME_SIZE * 2, 1), { conditioned: true });

    // Amplitud 1.0 -> 0 dB. Antes de I-03 salia en torno a -1.9 dB (0.8021).
    expect(frame.fftDb[bin]).toBeCloseTo(0, 1);
  });

  it('el espectro coincide con StreamingStft muestra a muestra', async () => {
    // Bloquea la divergencia entre las dos rutas de analisis del proyecto.
    const senal = seno(1000, FRAME_SIZE * 4, 0.7);

    const frames = await createDspAudioEngine().analyze(senal, { conditioned: true });
    const stft = new StreamingStft({
      sampleRate: SAMPLE_RATE,
      frameSize: FRAME_SIZE,
      fftSize: FFT_SIZE,
      hopSize: HOP_SIZE,
    });
    const espectros = stft.process(senal).map(toDb);

    expect(frames).toHaveLength(espectros.length);
    frames.forEach((frame, i) => {
      for (let k = 0; k < frame.fftDb.length; k++) {
        expect(frame.fftDb[k]).toBeCloseTo(espectros[i][k], 4);
      }
    });
  });

  it('el espectro localiza el tono de entrada en el bin correcto', async () => {
    const bin = 32;
    const freq = binFrequency(bin, FFT_SIZE, SAMPLE_RATE);
    const [frame] = await createDspAudioEngine().analyze(seno(freq, FRAME_SIZE * 2), { conditioned: true });

    let pico = 0;
    for (let k = 1; k < frame.fftDb.length; k++) {
      if (frame.fftDb[k] > frame.fftDb[pico]) pico = k;
    }
    expect(pico).toBe(bin);
  });

  it('el tono fundamental sale del detector real, no de un valor fijo', async () => {
    // 200 Hz cae dentro del rango de voz configurado (60-400 Hz).
    const [frame] = await createDspAudioEngine().analyze(seno(200, FRAME_SIZE * 2), { conditioned: true });
    expect(frame.pitchHz).not.toBeNull();
    expect(frame.pitchHz!).toBeCloseTo(200, 0);
  });

  it('los MFCC salen del extractor real y no son todos cero', async () => {
    const [frame] = await createDspAudioEngine().analyze(seno(300, FRAME_SIZE * 2), { conditioned: true });
    expect(frame.mfcc).toHaveLength(N_MFCC);
    expect(frame.mfcc.some((c) => c !== 0)).toBe(true);
    expect(frame.mfcc.every((c) => Number.isFinite(c))).toBe(true);
  });

  it('el tiempo de las tramas avanza un salto y es monotono', async () => {
    const frames = await createDspAudioEngine().analyze(seno(440, FRAME_SIZE * 3), { conditioned: true });
    const salto = HOP_SIZE / SAMPLE_RATE;

    frames.forEach((frame, i) => expect(frame.t).toBeCloseTo(i * salto, 9));
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].t).toBeGreaterThan(frames[i - 1].t);
    }
  });

  it('el silencio da energia practicamente nula y sin tono', async () => {
    const [frame] = await createDspAudioEngine().analyze(new Float32Array(FRAME_SIZE * 2), { conditioned: true });
    expect(frame.energy).toBeLessThan(1e-6);
    expect(frame.pitchHz).toBeNull();
  });

  it('stats es null antes de iniciar la captura', () => {
    expect(createDspAudioEngine().stats()).toBeNull();
  });
});
