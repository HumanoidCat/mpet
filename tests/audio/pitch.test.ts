/**
 * S4-T4 — Pruebas del spike de pitch por autocorrelación.
 *
 * Además de comprobar que funciona, estas pruebas **documentan dónde falla**.
 * Ese es el objetivo del spike: fijar la referencia contra la que se medirá YIN
 * en S5-T1, y dejar por escrito qué problemas concretos tiene que resolver.
 */

import { describe, it, expect } from 'vitest';
import {
  autocorrelation,
  autocorrelationFft,
  normalizedAutocorrelation,
  parabolicOffset,
} from '../../src/audio/features/autocorrelation';
import { detectPitch, pitchContour } from '../../src/audio/features/pitch';

const RATE = 16000;

function seno(freqHz: number, n: number, amp = 1, fase = 0): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / RATE + fase);
  return out;
}

/** Señal con armónicos, que es como suena realmente una voz. */
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

describe('Autocorrelación (S4-T4)', () => {
  it('r[0] es la energía de la señal', () => {
    const x = seno(200, 512);
    let energia = 0;
    for (let i = 0; i < x.length; i++) energia += x[i] * x[i];

    expect(autocorrelation(x, 10)[0]).toBeCloseTo(energia, 3);
  });

  it('el camino por FFT coincide con la definición directa', () => {
    // Wiener–Khinchin validado contra la suma literal, igual que la FFT
    // se validó contra la DFT en S3-T1.
    for (const senal of [seno(200, 512), vozSintetica(150, 512, [1, 0.5, 0.3]), ruido(512)]) {
      const directa = autocorrelation(senal, 300);
      const porFft = autocorrelationFft(senal, 300);

      for (let tau = 0; tau <= 300; tau++) {
        expect(porFft[tau]).toBeCloseTo(directa[tau], 6);
      }
    }
  });

  it('presenta un máximo en el periodo de la señal', () => {
    // 200 Hz a 16 kHz son 80 muestras de periodo.
    const rho = normalizedAutocorrelation(seno(200, 1024), autocorrelationFft(seno(200, 1024), 300));

    expect(rho[80]).toBeCloseTo(1, 1);
    expect(rho[160]).toBeCloseTo(1, 1); // y también en los múltiplos
    // A medio periodo la señal está en oposición de fase.
    expect(rho[40]).toBeCloseTo(-1, 1);
  });

  it('la normalización corrige el sesgo del solapamiento decreciente', () => {
    const x = seno(200, 1024);
    const r = autocorrelationFft(x, 400);
    const rho = normalizedAutocorrelation(x, r);

    // Sin normalizar, r decae al crecer τ porque se solapan menos muestras…
    expect(r[320]).toBeLessThan(r[80] * 0.9);
    // …mientras que la normalizada se mantiene: la señal sigue siendo igual
    // de periódica en 320 que en 80.
    expect(rho[320]).toBeCloseTo(rho[80], 1);
  });

  it('la interpolación parabólica ubica el vértice entre muestras', () => {
    // Parábola simétrica: el vértice cae en el centro.
    expect(parabolicOffset(0, 1, 0)).toBeCloseTo(0, 6);
    // Desplazada hacia la derecha.
    expect(parabolicOffset(0, 1, 0.5)).toBeGreaterThan(0);
    expect(parabolicOffset(0.5, 1, 0)).toBeLessThan(0);
    // Sin curvatura no hay vértice que estimar.
    expect(parabolicOffset(1, 1, 1)).toBe(0);
  });
});

describe('Detección de tono en tonos puros (S4-T4)', () => {
  // Tabla de exactitud: la evidencia central del spike. El objetivo que YIN
  // debe batir en S5-T1 es 3 Hz; aquí el error queda tres órdenes por debajo.
  for (const f0 of [70, 80, 100, 110, 137, 150, 175, 200, 220, 250, 300, 350, 390]) {
    it(`estima ${f0} Hz con error menor a 0.05 Hz`, () => {
      const r = detectPitch(seno(f0, 1024), { sampleRate: RATE });

      expect(r).not.toBeNull();
      expect(Math.abs(r!.hz - f0)).toBeLessThan(0.05);
      expect(r!.confidence).toBeGreaterThan(0.95);
    });
  }

  it('la interpolación parabólica es lo que da esa exactitud', () => {
    // 137 Hz da un periodo de 116.79 muestras: no cae en un entero.
    const f0 = 137;
    const r = detectPitch(seno(f0, 1024), { sampleRate: RATE })!;

    // Sin interpolar, el mejor desfase entero (117) daría 136.75 Hz: un error
    // de 0.25 Hz, treinta veces mayor que el que se obtiene interpolando.
    const sinInterpolar = RATE / Math.round(RATE / f0);
    expect(Math.abs(sinInterpolar - f0)).toBeGreaterThan(0.2);
    expect(Math.abs(r.hz - f0)).toBeLessThan(0.01);
    expect(r.periodSamples).not.toBe(Math.round(r.periodSamples));
  });

  it('funciona con voz sintética con armónicos', () => {
    // Fundamental más dos armónicos decrecientes: caso normal de voz.
    const r = detectPitch(vozSintetica(120, 1024, [1, 0.5, 0.25]), { sampleRate: RATE });

    expect(r).not.toBeNull();
    expect(Math.abs(r!.hz - 120)).toBeLessThan(1);
  });

  it('recupera la fundamental aunque no esté presente en el espectro', () => {
    // Fenómeno de la "fundamental ausente": solo hay armónicos 2 y 3, sin
    // energía en 100 Hz. El espectro no tiene nada en la fundamental, pero la
    // señal SIGUE siendo periódica con periodo T, y la autocorrelación lo ve.
    // Es la ventaja del dominio temporal sobre buscar el pico espectral.
    const r = detectPitch(vozSintetica(100, 2048, [0, 1, 0.6]), { sampleRate: RATE })!;

    expect(r.hz).toBeCloseTo(100, 0);
  });

  it('no depende de la fase ni del volumen', () => {
    const base = detectPitch(seno(200, 1024), { sampleRate: RATE })!;
    const desfasada = detectPitch(seno(200, 1024, 1, Math.PI / 3), { sampleRate: RATE })!;
    const floja = detectPitch(seno(200, 1024, 0.01), { sampleRate: RATE })!;

    expect(desfasada.hz).toBeCloseTo(base.hz, 1);
    expect(floja.hz).toBeCloseTo(base.hz, 1);
  });
});

describe('Decisión sonoro/sordo (S4-T4)', () => {
  it('el ruido no produce un tono', () => {
    expect(detectPitch(ruido(1024), { sampleRate: RATE })).toBeNull();
  });

  it('el silencio no produce un tono', () => {
    expect(detectPitch(new Float32Array(1024), { sampleRate: RATE })).toBeNull();
  });

  it('la salida siempre cae dentro del rango pedido', () => {
    const r = detectPitch(seno(200, 1024), { sampleRate: RATE, minHz: 150, maxHz: 300 })!;

    expect(r.hz).toBeGreaterThanOrEqual(150);
    expect(r.hz).toBeLessThanOrEqual(300);
  });

  it('DOCUMENTADO: restringir el rango no evita caer en un múltiplo', () => {
    // Buscando solo graves (60–120 Hz), un tono de 200 Hz no desaparece:
    // su periodo de 80 muestras tiene un múltiplo en 160, que sí entra en el
    // rango de desfases. El detector reporta 100 Hz con total confianza.
    const r = detectPitch(seno(200, 1024), { sampleRate: RATE, minHz: 60, maxHz: 120 })!;

    expect(r.hz).toBeCloseTo(100, 0);
    expect(r.confidence).toBeGreaterThan(0.99);
    // Acotar el rango al de la voz esperada ayuda, pero no es una garantía.
  });

  it('rechaza frames que no cubren dos periodos del tono más agudo', () => {
    // Con maxHz = 400 el periodo más corto son 40 muestras: hacen falta 80.
    expect(detectPitch(seno(200, 64), { sampleRate: RATE })).toBeNull();
    // Con 128 ya alcanza para 200 Hz (periodo de 80 muestras).
    expect(detectPitch(seno(200, 128), { sampleRate: RATE })).not.toBeNull();
  });

  it('el umbral controla la sensibilidad', () => {
    // Tono enterrado en ruido: periódico, pero poco.
    const sucio = seno(200, 1024, 0.3);
    const r = ruido(1024, 0.7);
    for (let i = 0; i < sucio.length; i++) sucio[i] += r[i];

    expect(detectPitch(sucio, { sampleRate: RATE, threshold: 0.95 })).toBeNull();
    expect(detectPitch(sucio, { sampleRate: RATE, threshold: 0.1 })).not.toBeNull();
  });
});

describe('Contorno de tono (S4-T4)', () => {
  it('deja huecos en los tramos sordos', () => {
    // Voz, silencio, voz: el contorno no debe inventar tono en el medio.
    const senal = new Float32Array(RATE);
    senal.set(seno(150, 5000), 0);
    senal.set(seno(150, 5000), 11000);

    const contorno = pitchContour(senal, 1024, 512, { sampleRate: RATE });

    expect(contorno[0]).not.toBeNull();
    expect(contorno[Math.floor(contorno.length / 2)]).toBeNull();
    expect(contorno.some((p) => p === null)).toBe(true);
  });

  it('sigue un tono que cambia', () => {
    const senal = new Float32Array(RATE);
    senal.set(seno(120, RATE / 2), 0);
    senal.set(seno(240, RATE / 2), RATE / 2);

    const contorno = pitchContour(senal, 1024, 512, { sampleRate: RATE });
    const primero = contorno.find((p) => p !== null)!;
    const ultimo = [...contorno].reverse().find((p) => p !== null)!;

    expect(primero.hz).toBeCloseTo(120, 0);
    expect(ultimo.hz).toBeCloseTo(240, 0);
  });
});

describe('Limitaciones que motivan YIN (S5-T1) — S4-T4', () => {
  it('DOCUMENTADO: falla con el primer armónico dominante (error de octava)', () => {
    // Caso patológico real: la fundamental es débil frente a su armónico.
    // La autocorrelación tiene máximos en TODOS los múltiplos del periodo, y
    // aquí el de 2T gana. El detector devuelve el doble de la frecuencia.
    const f0 = 100;
    const senal = vozSintetica(f0, 2048, [0.15, 1]); // 2º armónico 6.7× más fuerte

    const r = detectPitch(senal, { sampleRate: RATE });

    expect(r).not.toBeNull();
    // Se equivoca en una octava: reporta ~200 Hz donde la fundamental es 100.
    expect(Math.abs(r!.hz - 2 * f0)).toBeLessThan(5);
    expect(Math.abs(r!.hz - f0)).toBeGreaterThan(50);

    // Es exactamente lo que YIN corrige con su función de diferencia
    // acumulada normalizada y el umbral absoluto (S5-T1). Es el ÚNICO fallo
    // que sobrevive en este spike, y por eso justifica la tarea.
  });

  it('DOCUMENTADO: la confianza no distingue el acierto del error de octava', () => {
    // Lo grave del error anterior es que el detector está SEGURO: el pico de
    // 2T es tan alto como lo sería el correcto, así que la confianza no sirve
    // para detectar el fallo.
    const correcto = detectPitch(seno(200, 2048), { sampleRate: RATE })!;
    const equivocado = detectPitch(vozSintetica(100, 2048, [0.15, 1]), { sampleRate: RATE })!;

    expect(equivocado.confidence).toBeGreaterThan(0.9);
    expect(Math.abs(equivocado.confidence - correcto.confidence)).toBeLessThan(0.1);
  });

  it('MEDIDO: la exactitud NO mejora con frames más largos', () => {
    // Contradice la intuición inicial. El error no lo domina el largo del
    // frame sino la interpolación del vértice, así que cuadruplicar el frame
    // no aporta exactitud — solo cuesta cómputo y resolución temporal.
    const errores = [256, 512, 1024, 2048].map((n) => {
      const r = detectPitch(seno(150, n), { sampleRate: RATE })!;
      return Math.abs(r.hz - 150);
    });

    for (const error of errores) expect(error).toBeLessThan(0.01);
    // Conclusión para S5: conviene el frame corto, mejor resolución temporal.
  });

  it('MEDIDO: el sub-armónico está resuelto (regresión del bug de τ máximo)', () => {
    // Quedarse con el máximo global de ρ reportaba 66.7 Hz para un tono de
    // 200 Hz, porque ρ[80] = ρ[160] = ρ[240] = 1.0000 y decidía el ruido de
    // punto flotante. Tomar el primer máximo local lo corrige.
    for (const f0 of [200, 300, 350]) {
      const r = detectPitch(seno(f0, 1024), { sampleRate: RATE })!;
      expect(r.hz).toBeCloseTo(f0, 1);
    }
  });
});
