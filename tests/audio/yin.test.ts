/**
 * S5-T1 — Pruebas de YIN.
 *
 * El criterio del plan es error menor a 3 Hz en tonos sintéticos. Pero la
 * prueba que de verdad justifica esta tarea es la del error de octava: el caso
 * que el spike de S4-T4 documentó como fallo de la autocorrelación simple y que
 * YIN tiene que resolver. Hay una comparación lado a lado de ambos métodos.
 */

import { describe, it, expect } from 'vitest';
import {
  detectPitchYin,
  yinContour,
  differenceFunction,
  cumulativeMeanNormalizedDifference,
  absoluteThreshold,
  YIN_THRESHOLD,
  YIN_PAPER_THRESHOLD,
} from '../../src/audio/features/yin';
import { detectPitch } from '../../src/audio/features/pitch';

const RATE = 16000;

function seno(freqHz: number, n: number, amp = 1, fase = 0): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / RATE + fase);
  return out;
}

/** Voz sintética: fundamental más armónicos con las amplitudes dadas. */
function vozSintetica(f0: number, n: number, amplitudes: number[]): Float32Array {
  const out = new Float32Array(n);
  amplitudes.forEach((amp, k) => {
    const armonico = seno(f0 * (k + 1), n, amp);
    for (let i = 0; i < n; i++) out[i] += armonico[i];
  });
  return out;
}

function ruido(n: number, amp = 1, semilla = 7): Float32Array {
  const out = new Float32Array(n);
  let s = semilla;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = ((s / 0x7fffffff) * 2 - 1) * amp;
  }
  return out;
}

/** Función de diferencia por fuerza bruta: la definición literal. */
function diferenciaDirecta(x: Float32Array, maxLag: number, windowSize: number): Float64Array {
  const d = new Float64Array(maxLag + 1);
  for (let tau = 0; tau <= maxLag; tau++) {
    let suma = 0;
    for (let j = 0; j < windowSize; j++) {
      const delta = x[j] - x[j + tau];
      suma += delta * delta;
    }
    d[tau] = suma;
  }
  return d;
}

describe('Función de diferencia (S5-T1)', () => {
  it('la versión por FFT coincide con la definición literal', () => {
    // Misma estrategia que con la FFT y la autocorrelación: el camino rápido
    // se valida contra la fórmula, no contra otra implementación.
    for (const senal of [seno(200, 1024), vozSintetica(150, 1024, [1, 0.5, 0.3]), ruido(1024)]) {
      const rapida = differenceFunction(senal, 267, 757);
      const directa = diferenciaDirecta(senal, 267, 757);

      for (let tau = 0; tau <= 267; tau++) {
        // Error relativo, porque los valores absolutos son grandes.
        const escala = Math.max(1, Math.abs(directa[tau]));
        expect(Math.abs(rapida[tau] - directa[tau]) / escala).toBeLessThan(1e-9);
      }
    }
  });

  it('vale cero en el desfase nulo y tiene mínimos en el periodo', () => {
    // 200 Hz a 16 kHz son 80 muestras de periodo.
    const d = differenceFunction(seno(200, 1024), 267, 757);

    expect(d[0]).toBeCloseTo(0, 6);
    // En el periodo la señal coincide consigo misma: diferencia mínima.
    expect(d[80]).toBeLessThan(d[60]);
    expect(d[80]).toBeLessThan(d[100]);
  });

  it('nunca devuelve valores negativos', () => {
    const d = differenceFunction(ruido(1024), 267, 757);
    for (let tau = 0; tau <= 267; tau++) expect(d[tau]).toBeGreaterThanOrEqual(0);
  });
});

describe('Normalización por media acumulada (S5-T1)', () => {
  it('el desfase cero vale 1 por convención', () => {
    // Así el τ=0, donde la señal es trivialmente idéntica a sí misma, nunca
    // resulta candidato a periodo.
    const dPrime = cumulativeMeanNormalizedDifference(differenceFunction(seno(200, 1024), 267, 757));
    expect(dPrime[0]).toBe(1);
  });

  it('hunde el periodo verdadero por debajo de sus múltiplos', () => {
    // ESTA es la razón de ser de la normalización. En la autocorrelación
    // normalizada, ρ[80] = ρ[160] = ρ[240] = 1.0000 exactamente y decidía el
    // ruido de punto flotante (ver evidencia S4-T4).
    const dPrime = cumulativeMeanNormalizedDifference(differenceFunction(seno(200, 1024), 267, 757));

    expect(dPrime[80]).toBeLessThan(dPrime[160]);
    expect(dPrime[80]).toBeLessThan(dPrime[240]);
    expect(dPrime[80]).toBeLessThan(YIN_THRESHOLD);
  });
});

describe('Umbral absoluto (S5-T1)', () => {
  it('toma el primer mínimo bajo el umbral, no el más profundo', () => {
    const dPrime = new Float64Array(300).fill(1);
    dPrime[80] = 0.05; // periodo verdadero
    dPrime[160] = 0.01; // múltiplo, MÁS profundo

    // Tomar el mínimo global daría 160 y erraría una octava hacia abajo.
    expect(absoluteThreshold(dPrime, 40, 267, 0.1).lag).toBe(80);
  });

  it('desciende hasta el fondo del valle', () => {
    // El primer punto que cruza el umbral no suele ser el más bajo.
    const dPrime = new Float64Array(300).fill(1);
    dPrime[78] = 0.09;
    dPrime[79] = 0.05;
    dPrime[80] = 0.02;
    dPrime[81] = 0.06;

    expect(absoluteThreshold(dPrime, 40, 267, 0.1).lag).toBe(80);
  });

  it('avisa cuando ningún desfase baja del umbral', () => {
    const dPrime = new Float64Array(300).fill(0.8);
    dPrime[120] = 0.5;

    const r = absoluteThreshold(dPrime, 40, 267, 0.1);
    expect(r.belowThreshold).toBe(false);
    expect(r.lag).toBe(120); // devuelve el mejor que encontró
  });
});

describe('Exactitud en tonos puros (S5-T1)', () => {
  // Criterio del plan: error < 3 Hz. Se verifica con holgura.
  for (const f0 of [70, 80, 100, 110, 137, 150, 175, 200, 220, 250, 300, 350]) {
    it(`estima ${f0} Hz con error menor a 3 Hz`, () => {
      const r = detectPitchYin(seno(f0, 2048), { sampleRate: RATE });

      expect(r).not.toBeNull();
      expect(Math.abs(r!.hz - f0)).toBeLessThan(3);
      expect(r!.confidence).toBeGreaterThan(0.9);
    });
  }

  it('mantiene la exactitud con el tamaño de trama que usa la integración', () => {
    // El adaptador de `src/core/` llama a YIN con tramas de FRAME_SIZE = 512,
    // no de 2048 como el resto de estas pruebas. Con 512 la ventana útil queda
    // en 512 − 267 = 245 muestras, que es menos de un periodo del tono más
    // grave del rango. Conviene fijar que aun así cumple, porque es el tamaño
    // que corre en producción.
    for (const f0 of [70, 100, 150, 200, 300, 390]) {
      const r = detectPitchYin(seno(f0, 512), { sampleRate: RATE });

      expect(r).not.toBeNull();
      expect(Math.abs(r!.hz - f0)).toBeLessThan(3);
    }
  });

  it('no depende de la fase ni del volumen', () => {
    const base = detectPitchYin(seno(200, 2048), { sampleRate: RATE })!;
    const desfasada = detectPitchYin(seno(200, 2048, 1, Math.PI / 3), { sampleRate: RATE })!;
    const floja = detectPitchYin(seno(200, 2048, 0.01), { sampleRate: RATE })!;

    expect(desfasada.hz).toBeCloseTo(base.hz, 1);
    expect(floja.hz).toBeCloseTo(base.hz, 1);
  });
});

describe('Voz sintética con armónicos (S5-T1)', () => {
  it('caso normal: fundamental dominante', () => {
    const r = detectPitchYin(vozSintetica(120, 2048, [1, 0.5, 0.25]), { sampleRate: RATE })!;
    expect(Math.abs(r.hz - 120)).toBeLessThan(3);
  });

  it('muchos armónicos', () => {
    const r = detectPitchYin(vozSintetica(150, 2048, [1, 0.8, 0.6, 0.4, 0.2]), {
      sampleRate: RATE,
    })!;
    expect(Math.abs(r.hz - 150)).toBeLessThan(3);
  });

  it('recupera la fundamental aunque no esté en el espectro', () => {
    // Solo armónicos 2 y 3, sin energía en 100 Hz. La señal sigue siendo
    // periódica con periodo T y YIN lo ve, igual que la autocorrelación.
    const r = detectPitchYin(vozSintetica(100, 2048, [0, 1, 0.6]), { sampleRate: RATE })!;
    expect(Math.abs(r.hz - 100)).toBeLessThan(3);
  });
});

describe('🎯 El error de octava: lo que justifica S5-T1', () => {
  // Caso patológico documentado en docs/evidencias/s4/s4-t4-pitch-autocorrelacion.md
  const F0 = 100;
  const senal = vozSintetica(F0, 2048, [0.15, 1]); // 2º armónico 6.7× más fuerte

  it('la autocorrelación simple SE EQUIVOCA en una octava', () => {
    const r = detectPitch(senal, { sampleRate: RATE })!;

    expect(Math.abs(r.hz - 2 * F0)).toBeLessThan(5); // responde ~200 Hz
    // Y lo peor: lo hace con confianza alta, así que el error no se detecta.
    expect(r.confidence).toBeGreaterThan(0.9);
  });

  it('YIN ACIERTA en el mismo caso', () => {
    const r = detectPitchYin(senal, { sampleRate: RATE })!;

    expect(Math.abs(r.hz - F0)).toBeLessThan(3);
  });

  it('lo consigue la normalización, pero hace falta bajar el umbral', () => {
    // Matiz importante y medido: la normalización por media acumulada separa
    // bien los dos valles (d'[160] = 0.00000 contra d'[80] = 0.04369), pero
    // con el umbral 0.1 del artículo el valle FALSO también califica, y la
    // regla de "tomar el primero" se queda con él.
    const conUmbralDelArticulo = detectPitchYin(senal, {
      sampleRate: RATE,
      threshold: YIN_PAPER_THRESHOLD,
    })!;
    expect(Math.abs(conUmbralDelArticulo.hz - 2 * F0)).toBeLessThan(5); // sigue fallando

    // Con el umbral calibrado del proyecto, el valle falso queda descartado.
    const conUmbralDelProyecto = detectPitchYin(senal, { sampleRate: RATE })!;
    expect(Math.abs(conUmbralDelProyecto.hz - F0)).toBeLessThan(3);
  });

  it('la mejora es de una octava completa', () => {
    const conAutocorrelacion = detectPitch(senal, { sampleRate: RATE })!;
    const conYin = detectPitchYin(senal, { sampleRate: RATE })!;

    expect(conAutocorrelacion.hz / conYin.hz).toBeCloseTo(2, 1);
  });
});

describe('Decisión sonoro/sordo (S5-T1)', () => {
  it('el ruido no produce un tono', () => {
    expect(detectPitchYin(ruido(2048), { sampleRate: RATE })).toBeNull();
  });

  it('el silencio no produce un tono', () => {
    expect(detectPitchYin(new Float32Array(2048), { sampleRate: RATE })).toBeNull();
  });

  it('la confianza baja cuando la señal se ensucia', () => {
    // A diferencia de la autocorrelación, la confianza de YIN mide
    // aperiodicidad, así que refleja de verdad la calidad de la estimación.
    const limpia = detectPitchYin(seno(200, 2048), { sampleRate: RATE })!;

    const sucia = seno(200, 2048, 1);
    const r = ruido(2048, 0.1);
    for (let i = 0; i < sucia.length; i++) sucia[i] += r[i];
    const conRuido = detectPitchYin(sucia, { sampleRate: RATE })!;

    expect(conRuido.confidence).toBeLessThan(limpia.confidence);
    expect(conRuido.confidence).toBeGreaterThan(0.9); // sigue siendo buena
  });

  it('MEDIDO: el umbral bajo se paga con tolerancia al ruido', () => {
    // Es el costo del umbral calibrado, y conviene tenerlo por escrito.
    const conRuido = (nivel: number) => {
      const x = seno(200, 2048, 1);
      const r = ruido(2048, nivel);
      for (let i = 0; i < x.length; i++) x[i] += r[i];
      return x;
    };

    // Hasta ruido 0.15 los dos umbrales detectan.
    expect(detectPitchYin(conRuido(0.15), { sampleRate: RATE })).not.toBeNull();

    // En 0.20 el umbral del proyecto ya lo descarta; el del artículo aún no.
    expect(detectPitchYin(conRuido(0.2), { sampleRate: RATE })).toBeNull();
    expect(
      detectPitchYin(conRuido(0.2), { sampleRate: RATE, threshold: YIN_PAPER_THRESHOLD })
    ).not.toBeNull();

    // El intercambio es deliberado: se prefiere declarar sordo un frame ruidoso
    // antes que devolver una octava equivocada con confianza alta.
  });

  it('rechaza frames que no cubren dos periodos del tono más grave', () => {
    // Con minHz = 60 el periodo son 267 muestras: en 300 no cabe ventana útil.
    expect(detectPitchYin(seno(200, 300), { sampleRate: RATE })).toBeNull();
  });

  it('respeta el rango de búsqueda', () => {
    const r = detectPitchYin(seno(200, 2048), { sampleRate: RATE, minHz: 150, maxHz: 300 })!;
    expect(r.hz).toBeGreaterThanOrEqual(150);
    expect(r.hz).toBeLessThanOrEqual(300);
  });
});

describe('Contorno de tono con YIN (S5-T1)', () => {
  it('deja huecos en los tramos sordos', () => {
    const senal = new Float32Array(RATE);
    senal.set(seno(150, 6000), 0);
    senal.set(seno(150, 6000), 10000);

    const contorno = yinContour(senal, 2048, 512, { sampleRate: RATE });

    expect(contorno[0]).not.toBeNull();
    expect(contorno.some((p) => p === null)).toBe(true);
  });

  it('sigue un tono que cambia', () => {
    const senal = new Float32Array(RATE);
    senal.set(seno(120, RATE / 2), 0);
    senal.set(seno(240, RATE / 2), RATE / 2);

    const contorno = yinContour(senal, 2048, 512, { sampleRate: RATE });
    const primero = contorno.find((p) => p !== null)!;
    const ultimo = [...contorno].reverse().find((p) => p !== null)!;

    expect(Math.abs(primero.hz - 120)).toBeLessThan(3);
    expect(Math.abs(ultimo.hz - 240)).toBeLessThan(3);
  });
});
