/**
 * S3-T1 — Pruebas del STFT.
 *
 * La prueba que resume la tarea es la del chirp: una señal cuya frecuencia sube
 * con el tiempo. Una FFT sola no puede describirla; el espectrograma sí, y se
 * verifica que el pico se desplaza hacia arriba frame a frame.
 */

import { describe, it, expect } from 'vitest';
import { stft, spectrogramDb, StreamingStft } from '../../src/audio/dsp/stft';
import { peakBin, binFrequency, spectrumLength } from '../../src/audio/dsp/fft';

const RATE = 16000;

function seno(freqHz: number, n: number, amp = 1): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / RATE);
  return out;
}

/** Barrido lineal de frecuencia entre f0 y f1. */
function chirp(f0: number, f1: number, n: number): Float32Array {
  const out = new Float32Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const f = f0 + ((f1 - f0) * i) / n;
    fase += (2 * Math.PI * f) / RATE;
    out[i] = Math.sin(fase);
  }
  return out;
}

describe('Troceado del STFT (S3-T1)', () => {
  it('el nº de frames sale del solape', () => {
    // 1 s a 16 kHz, frames de 512 con salto de 256.
    const a = stft(new Float32Array(RATE), { sampleRate: RATE });
    expect(a.frames.length).toBe(Math.floor((RATE - 512) / 256) + 1);
    expect(a.binCount).toBe(spectrumLength(512));
  });

  it('resolución en frecuencia y en tiempo según lo acordado', () => {
    const a = stft(new Float32Array(RATE), { sampleRate: RATE });

    expect(a.binHz).toBe(31.25); // 16000 / 512
    expect(a.hopSeconds).toBeCloseTo(0.016, 4); // 256 / 16000
  });

  it('descarta el frame incompleto del final', () => {
    // 700 muestras: solo entra el frame que empieza en 0 (cubre 0–512). El
    // siguiente arrancaría en 256 y necesitaría hasta la 768, que no existe.
    expect(stft(new Float32Array(700), { sampleRate: RATE }).frames).toHaveLength(1);
    // Con 768 ya caben dos: 0–512 y 256–768.
    expect(stft(new Float32Array(768), { sampleRate: RATE }).frames).toHaveLength(2);
    // Señal más corta que un frame: no hay nada que analizar.
    expect(stft(new Float32Array(300), { sampleRate: RATE }).frames).toHaveLength(0);
  });

  it('cada frame se fecha en su punto medio', () => {
    const a = stft(new Float32Array(RATE), { sampleRate: RATE });

    expect(a.times[0]).toBeCloseTo(256 / RATE, 5);
    expect(a.times[1] - a.times[0]).toBeCloseTo(a.hopSeconds, 5);
  });
});

describe('Contenido espectral (S3-T1)', () => {
  it('un tono constante da el mismo pico en todos los frames', () => {
    const a = stft(seno(1000, RATE), { sampleRate: RATE });

    for (const frame of a.frames) {
      expect(binFrequency(peakBin(frame), 512, RATE)).toBeCloseTo(1000, 0);
    }
  });

  it('recupera la amplitud del tono pese al enventanado', () => {
    const a = stft(seno(1000, RATE, 0.6), { sampleRate: RATE });
    const medio = a.frames[Math.floor(a.frames.length / 2)];

    // La corrección por ganancia coherente ya está aplicada dentro del STFT.
    expect(medio[peakBin(medio)]).toBeCloseTo(0.6, 1);
  });

  it('el espectrograma de un chirp sigue la frecuencia instantánea', () => {
    // Justo lo que una FFT única no puede describir.
    const F0 = 500;
    const F1 = 4000;
    const DURACION_S = 1; // RATE muestras a RATE Hz
    const a = stft(chirp(F0, F1, RATE), { sampleRate: RATE });

    const picos = a.frames.map((f) => binFrequency(peakBin(f), 512, RATE));

    // Cada frame abarca 512 muestras, durante las cuales la frecuencia ya
    // cambió ~112 Hz. El pico no vale F0 en el primer frame: refleja la
    // frecuencia en el punto MEDIO del frame, que es lo que `times` fecha.
    for (let i = 0; i < picos.length; i++) {
      const instantanea = F0 + (F1 - F0) * (a.times[i] / DURACION_S);
      // Tolerancia de 2 bins: la resolución del análisis es 31.25 Hz.
      expect(Math.abs(picos[i] - instantanea)).toBeLessThan(2 * 31.25);
    }

    // Y sube de forma monótona a lo largo de todo el espectrograma.
    for (let i = 1; i < picos.length; i++) {
      expect(picos[i]).toBeGreaterThanOrEqual(picos[i - 1]);
    }
    expect(picos[picos.length - 1] - picos[0]).toBeGreaterThan(3000);
  });

  it('distingue dos sonidos consecutivos: "grave-agudo" vs "agudo-grave"', () => {
    // El espectro global de ambas es idéntico; solo el orden cambia.
    const mitad = RATE / 2;
    const graveAgudo = new Float32Array(RATE);
    graveAgudo.set(seno(400, mitad), 0);
    graveAgudo.set(seno(3000, mitad), mitad);

    const a = stft(graveAgudo, { sampleRate: RATE });
    const primero = binFrequency(peakBin(a.frames[10]), 512, RATE);
    const ultimo = binFrequency(peakBin(a.frames[a.frames.length - 10]), 512, RATE);

    expect(primero).toBeCloseTo(400, -2);
    expect(ultimo).toBeCloseTo(3000, -2);
  });

  it('el espectrograma en dB tiene la misma forma', () => {
    const a = stft(seno(1000, RATE), { sampleRate: RATE });
    const db = spectrogramDb(a);

    expect(db).toHaveLength(a.frames.length);
    expect(db[0]).toHaveLength(a.binCount);
    // El pico en dB coincide con el pico en amplitud.
    expect(peakBin(db[0])).toBe(peakBin(a.frames[0]));
  });
});

describe('STFT en vivo (S3-T1)', () => {
  it('el resultado no depende del tamaño de bloque', () => {
    const senal = seno(1000, 8192);

    const deUnaVez = new StreamingStft({ sampleRate: RATE }).process(senal);

    const porBloques = new StreamingStft({ sampleRate: RATE });
    const partes: Float32Array[] = [];
    for (let i = 0; i < senal.length; i += 128) {
      partes.push(...porBloques.process(senal.subarray(i, i + 128)));
    }

    // Los frames no coinciden con los límites de bloque del AudioWorklet, así
    // que el sobrante tiene que guardarse entre llamadas.
    expect(partes.length).toBe(deUnaVez.length);
    for (let f = 0; f < partes.length; f++) {
      for (let k = 0; k < partes[f].length; k++) {
        expect(partes[f][k]).toBeCloseTo(deUnaVez[f][k], 6);
      }
    }
  });

  it('coincide con el análisis offline de la misma señal', () => {
    const senal = seno(1000, 8192);

    const enVivo = new StreamingStft({ sampleRate: RATE }).process(senal);
    const offline = stft(senal, { sampleRate: RATE });

    expect(enVivo.length).toBe(offline.frames.length);
    for (let k = 0; k < enVivo[0].length; k++) {
      expect(enVivo[0][k]).toBeCloseTo(offline.frames[0][k], 6);
    }
  });

  it('avanza el reloj conforme consume audio', () => {
    const s = new StreamingStft({ sampleRate: RATE });
    expect(s.currentTime).toBe(0);

    s.process(seno(1000, 4096));
    expect(s.currentTime).toBeGreaterThan(0.2);
  });

  it('reset deja el analizador como recién creado', () => {
    const s = new StreamingStft({ sampleRate: RATE });
    const senal = seno(1000, 4096);

    const primera = s.process(senal);
    s.reset();
    expect(s.currentTime).toBe(0);

    const segunda = s.process(senal);
    expect(segunda.length).toBe(primera.length);
    expect(Array.from(segunda[0])).toEqual(Array.from(primera[0]));
  });
});
