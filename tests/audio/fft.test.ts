/**
 * S3-T1 — Validación de la FFT.
 *
 * La referencia es la **DFT directa**, implementada aquí a partir de su
 * definición. Es la validación más fuerte posible: no se compara contra otra
 * librería que también podría estar mal, sino contra la fórmula del curso.
 *
 *   X[k] = Σ x[n] · e^{-j2πkn/N}
 *
 * Se comprueban además las propiedades que caracterizan a la transformada
 * (linealidad, Parseval, inversa), que son independientes de la implementación.
 */

import { describe, it, expect } from 'vitest';
import {
  Fft,
  isPowerOfTwo,
  nextPowerOfTwo,
  spectrumLength,
  binFrequency,
  binWidth,
  spectrumOf,
  peakBin,
  toDb,
  SPECTRUM_FLOOR_DB,
} from '../../src/audio/dsp/fft';
import { hann, coherentGain, applyWindow, rectangular } from '../../src/audio/dsp/window';

/** DFT directa, O(N²), tal cual la definición. Es la fuente de verdad. */
function dftDirecta(x: Float64Array): { re: Float64Array; im: Float64Array } {
  const n = x.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);

  for (let k = 0; k < n; k++) {
    let sumaRe = 0;
    let sumaIm = 0;
    for (let m = 0; m < n; m++) {
      const angulo = (-2 * Math.PI * k * m) / n;
      sumaRe += x[m] * Math.cos(angulo);
      sumaIm += x[m] * Math.sin(angulo);
    }
    re[k] = sumaRe;
    im[k] = sumaIm;
  }
  return { re, im };
}

/** Señal pseudoaleatoria determinista. */
function senalAleatoria(n: number, semilla = 42): Float64Array {
  const out = new Float64Array(n);
  let s = semilla;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (s / 0x7fffffff) * 2 - 1;
  }
  return out;
}

function seno(freqHz: number, n: number, rate: number, amp = 1): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / rate);
  return out;
}

/** Mayor diferencia absoluta entre dos espectros complejos. */
function errorMaximo(
  a: { re: Float64Array; im: Float64Array },
  b: { re: Float64Array; im: Float64Array }
): number {
  let max = 0;
  for (let k = 0; k < a.re.length; k++) {
    max = Math.max(max, Math.hypot(a.re[k] - b.re[k], a.im[k] - b.im[k]));
  }
  return max;
}

describe('Utilidades de tamaño (S3-T1)', () => {
  it('reconoce las potencias de dos', () => {
    expect([1, 2, 4, 512, 1024].every(isPowerOfTwo)).toBe(true);
    expect([0, 3, 100, 513, -4, 2.5].some(isPowerOfTwo)).toBe(false);
  });

  it('redondea hacia arriba a la siguiente potencia de dos', () => {
    expect(nextPowerOfTwo(500)).toBe(512);
    expect(nextPowerOfTwo(512)).toBe(512);
    expect(nextPowerOfTwo(513)).toBe(1024);
  });

  it('rechaza tamaños que no son potencia de dos', () => {
    expect(() => new Fft(500)).toThrow(RangeError);
    expect(() => new Fft(0)).toThrow(RangeError);
  });

  it('una señal real ocupa N/2+1 bins únicos', () => {
    expect(spectrumLength(512)).toBe(257);
    expect(binWidth(512, 16000)).toBe(31.25);
    expect(binFrequency(10, 512, 16000)).toBe(312.5);
  });
});

describe('FFT contra la DFT directa (S3-T1)', () => {
  // Tabla de error: la evidencia central de la tarea.
  for (const n of [8, 32, 128, 512, 1024]) {
    it(`N = ${n}: coincide con la definición`, () => {
      const x = senalAleatoria(n);

      const re = Float64Array.from(x);
      const im = new Float64Array(n);
      new Fft(n).forward(re, im);

      const error = errorMaximo({ re, im }, dftDirecta(x));

      // El error es solo acumulación de redondeo en punto flotante, y crece
      // muy despacio con N porque los twiddles se precalculan en vez de
      // acumularse multiplicando.
      expect(error).toBeLessThan(1e-9);
    });
  }

  it('también coincide en señales de voz sintética', () => {
    const n = 512;
    // Suma de F0 y dos formantes: se parece a una vocal.
    const x = new Float64Array(n);
    const componentes = [
      [150, 1],
      [700, 0.5],
      [1200, 0.3],
    ];
    for (const [f, a] of componentes) {
      const c = seno(f, n, 16000, a);
      for (let i = 0; i < n; i++) x[i] += c[i];
    }

    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    new Fft(n).forward(re, im);

    expect(errorMaximo({ re, im }, dftDirecta(x))).toBeLessThan(1e-9);
  });
});

describe('Propiedades de la transformada (S3-T1)', () => {
  it('es lineal: F(a·x + b·y) = a·F(x) + b·F(y)', () => {
    const n = 128;
    const fft = new Fft(n);
    const x = senalAleatoria(n, 1);
    const y = senalAleatoria(n, 2);

    const suma = new Float64Array(n);
    for (let i = 0; i < n; i++) suma[i] = 3 * x[i] + 2 * y[i];

    const transformar = (s: Float64Array) => {
      const re = Float64Array.from(s);
      const im = new Float64Array(n);
      fft.forward(re, im);
      return { re, im };
    };

    const fSuma = transformar(suma);
    const fx = transformar(x);
    const fy = transformar(y);

    for (let k = 0; k < n; k++) {
      expect(fSuma.re[k]).toBeCloseTo(3 * fx.re[k] + 2 * fy.re[k], 9);
      expect(fSuma.im[k]).toBeCloseTo(3 * fx.im[k] + 2 * fy.im[k], 9);
    }
  });

  it('conserva la energía (teorema de Parseval)', () => {
    const n = 256;
    const x = senalAleatoria(n);

    let energiaTiempo = 0;
    for (let i = 0; i < n; i++) energiaTiempo += x[i] * x[i];

    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    new Fft(n).forward(re, im);

    let energiaFrecuencia = 0;
    for (let k = 0; k < n; k++) energiaFrecuencia += re[k] * re[k] + im[k] * im[k];

    // Σ|x[n]|² = (1/N)·Σ|X[k]|²
    expect(energiaFrecuencia / n).toBeCloseTo(energiaTiempo, 6);
  });

  it('la inversa deshace la directa', () => {
    const n = 256;
    const fft = new Fft(n);
    const x = senalAleatoria(n);

    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    fft.forward(re, im);
    fft.inverse(re, im);

    for (let i = 0; i < n; i++) {
      expect(re[i]).toBeCloseTo(x[i], 9);
      expect(im[i]).toBeCloseTo(0, 9); // la señal era real
    }
  });

  it('el espectro de una señal real es simétrico conjugado', () => {
    const n = 64;
    const re = Float64Array.from(senalAleatoria(n));
    const im = new Float64Array(n);
    new Fft(n).forward(re, im);

    // X[N−k] = conj(X[k]): por eso basta con quedarse con la mitad.
    for (let k = 1; k < n / 2; k++) {
      expect(re[n - k]).toBeCloseTo(re[k], 9);
      expect(im[n - k]).toBeCloseTo(-im[k], 9);
    }
  });
});

describe('Casos analíticos con solución conocida (S3-T1)', () => {
  /** Transforma una señal real y devuelve las magnitudes |X[k]| sin normalizar. */
  function magnitudesCrudas(x: Float64Array): Float64Array {
    const n = x.length;
    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    new Fft(n).forward(re, im);

    const out = new Float64Array(n);
    for (let k = 0; k < n; k++) out[k] = Math.hypot(re[k], im[k]);
    return out;
  }

  it('un seno centrado en un bin da magnitud exactamente N/2', () => {
    const n = 512;
    const k0 = 32; // 1000 Hz a 16 kHz: centro exacto de bin

    const x = new Float64Array(n);
    for (let i = 0; i < n; i++) x[i] = Math.sin((2 * Math.PI * k0 * i) / n);

    const mag = magnitudesCrudas(x);

    // Toda la energía en su bin (y en el espejo N−k0), nada en el resto.
    expect(mag[k0]).toBeCloseTo(n / 2, 6);
    expect(mag[n - k0]).toBeCloseTo(n / 2, 6);
    for (let k = 0; k < n; k++) {
      if (k !== k0 && k !== n - k0) expect(mag[k]).toBeLessThan(1e-9);
    }
  });

  it('una delta en n=0 da espectro plano', () => {
    // δ[n] contiene todas las frecuencias por igual: X[k] = 1 para todo k.
    const n = 128;
    const x = new Float64Array(n);
    x[0] = 1;

    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    new Fft(n).forward(re, im);

    for (let k = 0; k < n; k++) {
      expect(re[k]).toBeCloseTo(1, 9);
      expect(im[k]).toBeCloseTo(0, 9); // fase nula: la delta está en el origen
    }
  });

  it('una delta desplazada conserva la magnitud y gira la fase (teorema del desplazamiento)', () => {
    const n = 128;
    const n0 = 5;
    const x = new Float64Array(n);
    x[n0] = 1;

    const re = Float64Array.from(x);
    const im = new Float64Array(n);
    new Fft(n).forward(re, im);

    for (let k = 0; k < n; k++) {
      // |X[k]| sigue siendo 1: desplazar en el tiempo no cambia el módulo…
      expect(Math.hypot(re[k], im[k])).toBeCloseTo(1, 9);
      // …solo introduce una fase lineal e^{-j2πk·n₀/N}.
      const faseEsperada = (-2 * Math.PI * k * n0) / n;
      expect(re[k]).toBeCloseTo(Math.cos(faseEsperada), 9);
      expect(im[k]).toBeCloseTo(Math.sin(faseEsperada), 9);
    }
  });

  it('una señal constante concentra todo en el bin 0', () => {
    // El caso dual de la delta: constante en el tiempo ⇒ delta en frecuencia.
    const n = 256;
    const c = 0.75;
    const mag = magnitudesCrudas(new Float64Array(n).fill(c));

    expect(mag[0]).toBeCloseTo(n * c, 6);
    for (let k = 1; k < n; k++) expect(mag[k]).toBeLessThan(1e-9);
  });

  it('un coseno reparte la energía en parte real, un seno en la imaginaria', () => {
    const n = 256;
    const k0 = 8;

    const coseno = new Float64Array(n);
    const seno_ = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      coseno[i] = Math.cos((2 * Math.PI * k0 * i) / n);
      seno_[i] = Math.sin((2 * Math.PI * k0 * i) / n);
    }

    const transformar = (x: Float64Array) => {
      const re = Float64Array.from(x);
      const im = new Float64Array(n);
      new Fft(n).forward(re, im);
      return { re, im };
    };

    // cos → +N/2 real, 0 imaginario.  sin → 0 real, −N/2 imaginario.
    const fc = transformar(coseno);
    expect(fc.re[k0]).toBeCloseTo(n / 2, 6);
    expect(fc.im[k0]).toBeCloseTo(0, 6);

    const fs = transformar(seno_);
    expect(fs.re[k0]).toBeCloseTo(0, 6);
    expect(fs.im[k0]).toBeCloseTo(-n / 2, 6);
  });
});

describe('Espectro de amplitud (S3-T1)', () => {
  it('un seno centrado en un bin devuelve su amplitud exacta', () => {
    const n = 512;
    const rate = 16000;
    // 1000 Hz con bins de 31.25 Hz cae justo en el bin 32.
    const espectro = spectrumOf(Float32Array.from(seno(1000, n, rate, 0.7)), new Fft(n));

    expect(peakBin(espectro)).toBe(32);
    expect(binFrequency(32, n, rate)).toBe(1000);
    expect(espectro[32]).toBeCloseTo(0.7, 2);
  });

  it('la continua queda en el bin 0 sin duplicarse', () => {
    const n = 64;
    // El bin 0 no tiene espejo en la mitad negativa: no lleva el factor 2.
    const espectro = spectrumOf(new Float32Array(n).fill(0.5), new Fft(n));

    expect(espectro[0]).toBeCloseTo(0.5, 6);
    expect(espectro[1]).toBeCloseTo(0, 6);
  });

  it('separa dos tonos distintos', () => {
    const n = 512;
    const rate = 16000;
    const x = new Float32Array(n);
    const a = seno(500, n, rate, 0.5); // bin 16
    const b = seno(2000, n, rate, 0.25); // bin 64
    for (let i = 0; i < n; i++) x[i] = a[i] + b[i];

    const espectro = spectrumOf(x, new Fft(n));
    expect(espectro[16]).toBeCloseTo(0.5, 2);
    expect(espectro[64]).toBeCloseTo(0.25, 2);
  });

  it('la conversión a dB tiene suelo, no −Infinity', () => {
    const db = toDb(Float32Array.from([1, 0.1, 0]));
    expect(db[0]).toBeCloseTo(0, 6);
    expect(db[1]).toBeCloseTo(-20, 6);
    expect(db[2]).toBe(SPECTRUM_FLOOR_DB);
  });

  it('rellena con ceros si el frame es más corto que la FFT', () => {
    // 256 muestras en una FFT de 512: el espectro sale interpolado, no inventado.
    const espectro = spectrumOf(Float32Array.from(seno(1000, 256, 16000)), new Fft(512));
    expect(espectro.length).toBe(spectrumLength(512));
    expect(peakBin(espectro)).toBe(32);
  });
});

describe('Ventanas y fuga espectral (S3-T1)', () => {
  it('la ventana de Hann vale cero en el borde y uno en el centro', () => {
    const w = hann(512);
    expect(w[0]).toBeCloseTo(0, 6);
    expect(w[256]).toBeCloseTo(1, 6);
    // La variante periódica NO es simétrica: por eso empalma consigo misma.
    expect(coherentGain(w)).toBeCloseTo(0.5, 6);
  });

  it('la ganancia coherente compensa la atenuación de la ventana', () => {
    const n = 512;
    const w = hann(n);
    const x = Float32Array.from(seno(1000, n, 16000, 0.6));

    // Sin corregir, el pico sale a la mitad; corrigiendo, da la amplitud real.
    const sinCorregir = spectrumOf(applyWindow(x, w), new Fft(n));
    const corregido = spectrumOf(applyWindow(x, w), new Fft(n), coherentGain(w));

    expect(sinCorregir[32]).toBeCloseTo(0.3, 2);
    expect(corregido[32]).toBeCloseTo(0.6, 2);
  });

  it('Hann reduce drásticamente la fuga de un tono descentrado', () => {
    const n = 512;
    const rate = 16000;
    // 1015.6 Hz cae justo entre dos bins: el caso peor para la fuga.
    const x = Float32Array.from(seno(1015.625, n, rate, 1));

    const conRect = spectrumOf(applyWindow(x, rectangular(n)), new Fft(n), 1);
    const conHann = spectrumOf(applyWindow(x, hann(n)), new Fft(n), coherentGain(hann(n)));

    // Se mide la energía que se escapó lejos del pico (más de 5 bins).
    const fuga = (espectro: Float32Array) => {
      let max = 0;
      for (let k = 0; k < espectro.length; k++) {
        if (Math.abs(k - 32) > 5) max = Math.max(max, espectro[k]);
      }
      return max;
    };

    // La ventana rectangular deja lóbulos enormes; Hann los hunde.
    expect(fuga(conHann)).toBeLessThan(fuga(conRect) / 20);
  });
});
