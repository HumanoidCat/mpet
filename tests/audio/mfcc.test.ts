/**
 * S5-T2 — Pruebas de MFCC.
 *
 * La propiedad que hay que demostrar es la que justifica usar MFCC: **c₁…c₁₂ no
 * cambian con el volumen**. Es lo que hace que el comparador de la Semana 6 mida
 * pronunciación y no intensidad.
 *
 * Cada etapa se valida contra su definición, igual que se hizo con la FFT en
 * S3-T1 y con YIN en S5-T1.
 */

import { describe, it, expect } from 'vitest';
import { hzToMel, melToHz, melFilterbank, applyMelFilterbank } from '../../src/audio/features/mel';
import {
  dct2,
  logMelEnergies,
  mfcc,
  mfccSequence,
  MfccExtractor,
  MEL_FLOOR,
} from '../../src/audio/features/mfcc';

const RATE = 16000;
const FFT = 512;

function seno(freqHz: number, n: number, amp = 1): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amp * Math.sin((2 * Math.PI * freqHz * i) / RATE);
  return out;
}

/**
 * Vocal sintética: fundamental con formantes en las frecuencias dadas.
 *
 * Los armónicos llegan hasta el Nyquist a propósito. Con una serie truncada
 * —por ejemplo solo 20 armónicos de 120 Hz, que se quedan en 2.4 kHz— las
 * bandas mel superiores reciben energía nula, quedan fijadas en `MEL_FLOOR` y
 * dejan de desplazarse al cambiar el volumen. Eso rompe la invariancia y no por
 * culpa del MFCC, sino de la señal de prueba.
 */
function vocal(f0: number, formantes: number[], n: number, amp = 1): Float32Array {
  const out = new Float32Array(n);
  for (let k = 1; k * f0 < RATE / 2; k++) {
    const f = f0 * k;
    // Ganancia mayor cerca de un formante: aproxima la envolvente de una vocal.
    let g = 0.05;
    for (const F of formantes) g += 1 / (1 + Math.pow((f - F) / 100, 2));
    const h = seno(f, n, amp * g);
    for (let i = 0; i < n; i++) out[i] += h[i];
  }
  return out;
}

function ruido(n: number, amp = 1, semilla = 3): Float32Array {
  const out = new Float32Array(n);
  let s = semilla;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = ((s / 0x7fffffff) * 2 - 1) * amp;
  }
  return out;
}

/** Distancia euclídea entre dos vectores de coeficientes. */
function distancia(a: Float32Array, b: Float32Array, desde = 0): number {
  let suma = 0;
  for (let i = desde; i < a.length; i++) suma += (a[i] - b[i]) ** 2;
  return Math.sqrt(suma);
}

describe('Escala mel (S5-T2)', () => {
  it('hzToMel y melToHz son inversas exactas', () => {
    for (const hz of [0, 100, 700, 1000, 4000, 8000]) {
      expect(melToHz(hzToMel(hz))).toBeCloseTo(hz, 4);
    }
  });

  it('coincide con la fórmula de HTK en puntos conocidos', () => {
    expect(hzToMel(0)).toBeCloseTo(0, 6);
    // 700 Hz es el punto donde el argumento del logaritmo vale 2.
    expect(hzToMel(700)).toBeCloseTo(2595 * Math.log10(2), 4);
    expect(hzToMel(1000)).toBeCloseTo(999.99, 0);
  });

  it('es casi lineal abajo y comprime arriba', () => {
    // 100 Hz de diferencia pesan mucho más en graves que en agudos: es la razón
    // de ser de la escala.
    const abajo = hzToMel(300) - hzToMel(200);
    const arriba = hzToMel(5100) - hzToMel(5000);

    expect(abajo).toBeGreaterThan(arriba * 4);
  });
});

describe('Banco de filtros mel (S5-T2)', () => {
  const bank = melFilterbank(26, FFT, RATE);

  it('crea el número pedido de filtros con un bin por posición del espectro', () => {
    expect(bank.filters).toHaveLength(26);
    expect(bank.binCount).toBe(FFT / 2 + 1);
    expect(bank.filters[0]).toHaveLength(FFT / 2 + 1);
  });

  it('los centros suben y están equiespaciados en mel', () => {
    for (let m = 1; m < bank.centersHz.length; m++) {
      expect(bank.centersHz[m]).toBeGreaterThan(bank.centersHz[m - 1]);
    }

    // Constante en mel, aunque en Hz los saltos crezcan.
    const saltos: number[] = [];
    for (let m = 1; m < bank.centersHz.length; m++) {
      saltos.push(hzToMel(bank.centersHz[m]) - hzToMel(bank.centersHz[m - 1]));
    }
    for (const salto of saltos) expect(salto).toBeCloseTo(saltos[0], 2);
  });

  it('cada filtro es un triángulo con pesos en [0, 1]', () => {
    for (const filtro of bank.filters) {
      let maximo = 0;
      for (const w of filtro) {
        expect(w).toBeGreaterThanOrEqual(0);
        expect(w).toBeLessThanOrEqual(1.0001);
        maximo = Math.max(maximo, w);
      }
      // El vértice del triángulo casi nunca cae sobre un bin exacto —los
      // centros se calculan en mel y los bins están cada 31.25 Hz—, así que
      // ningún peso llega a valer 1. Se comprueba que el filtro tenga cuerpo.
      expect(maximo).toBeGreaterThan(0.6);
    }
  });

  it('los filtros se solapan y cubren la banda de voz sin huecos', () => {
    const cobertura = new Float32Array(bank.binCount);
    for (const filtro of bank.filters) {
      for (let k = 0; k < filtro.length; k++) cobertura[k] += filtro[k];
    }

    // Entre el primer y el último centro no debe quedar ningún bin a cero.
    const desde = Math.ceil((bank.centersHz[0] * FFT) / RATE);
    const hasta = Math.floor((bank.centersHz[25] * FFT) / RATE);
    for (let k = desde; k <= hasta; k++) expect(cobertura[k]).toBeGreaterThan(0.5);
  });

  it('un tono cae en la banda que le corresponde', () => {
    const extractor = new MfccExtractor({ sampleRate: RATE, fftSize: FFT });
    const energias = extractor.melSpectrum(seno(1000, FFT));

    let mayor = 0;
    for (let m = 1; m < energias.length; m++) if (energias[m] > energias[mayor]) mayor = m;

    // El centro de la banda ganadora tiene que estar cerca de 1000 Hz.
    expect(Math.abs(bank.centersHz[mayor] - 1000)).toBeLessThan(200);
  });

  it('rechaza parámetros imposibles', () => {
    expect(() => melFilterbank(0, FFT, RATE)).toThrow(RangeError);
    expect(() => melFilterbank(26, FFT, RATE, 0, 9000)).toThrow(RangeError); // sobre Nyquist
    expect(() => melFilterbank(26, FFT, RATE, 4000, 1000)).toThrow(RangeError); // invertido
  });

  it('aplicar el banco suma la potencia ponderada de cada banda', () => {
    // Verificación contra la definición: Σ_k w[k]·P[k]
    const potencia = Float32Array.from({ length: bank.binCount }, (_, k) => k);
    const energias = applyMelFilterbank(potencia, bank);

    for (let m = 0; m < 26; m++) {
      let esperado = 0;
      for (let k = 0; k < bank.binCount; k++) esperado += bank.filters[m][k] * potencia[k];
      expect(energias[m]).toBeCloseTo(esperado, 3);
    }
  });
});

describe('DCT-II ortonormal (S5-T2)', () => {
  it('coincide con su definición', () => {
    const x = Float32Array.from({ length: 26 }, (_, i) => Math.sin(i) + 0.5 * i);
    const y = dct2(x, 13);

    for (let k = 0; k < 13; k++) {
      let suma = 0;
      for (let n = 0; n < 26; n++) {
        suma += x[n] * Math.cos((Math.PI * k * (2 * n + 1)) / (2 * 26));
      }
      const escala = k === 0 ? Math.sqrt(1 / 26) : Math.sqrt(2 / 26);
      expect(y[k]).toBeCloseTo(suma * escala, 5);
    }
  });

  it('una señal constante solo activa el coeficiente cero', () => {
    // Propiedad clave: por eso el volumen queda encerrado en c₀.
    const N = 26;
    const c = 3.5;
    const y = dct2(new Float32Array(N).fill(c), 13);

    expect(y[0]).toBeCloseTo(c * Math.sqrt(N), 5);
    for (let k = 1; k < 13; k++) expect(y[k]).toBeCloseTo(0, 5);
  });

  it('es lineal', () => {
    const a = Float32Array.from({ length: 26 }, (_, i) => Math.cos(i));
    const b = Float32Array.from({ length: 26 }, (_, i) => Math.sin(2 * i));
    const suma = Float32Array.from({ length: 26 }, (_, i) => 3 * a[i] + 2 * b[i]);

    const ya = dct2(a, 13);
    const yb = dct2(b, 13);
    const ys = dct2(suma, 13);

    for (let k = 0; k < 13; k++) expect(ys[k]).toBeCloseTo(3 * ya[k] + 2 * yb[k], 5);
  });

  it('la normalización ortonormal conserva la energía', () => {
    // Necesario para que la distancia entre vectores MFCC signifique lo mismo
    // que en el dominio original: sin eso, la DTW de S6 no tendría sentido.
    const x = Float32Array.from({ length: 26 }, (_, i) => Math.sin(i * 1.7));
    const y = dct2(x, 26); // todos los coeficientes

    let energiaX = 0;
    let energiaY = 0;
    for (let i = 0; i < 26; i++) energiaX += x[i] * x[i];
    for (let k = 0; k < 26; k++) energiaY += y[k] * y[k];

    expect(energiaY).toBeCloseTo(energiaX, 4);
  });
});

describe('Logaritmo de las energías (S5-T2)', () => {
  it('convierte potencia a decibelios', () => {
    const log = logMelEnergies(Float32Array.from([1, 10, 100]));

    expect(log[0]).toBeCloseTo(0, 6);
    expect(log[1]).toBeCloseTo(10, 6);
    expect(log[2]).toBeCloseTo(20, 6);
  });

  it('tiene piso: el silencio no da -Infinity', () => {
    const log = logMelEnergies(Float32Array.from([0]));
    expect(Number.isFinite(log[0])).toBe(true);
    expect(log[0]).toBeCloseTo(10 * Math.log10(MEL_FLOOR), 6);
  });
});

describe('🎯 Invariancia al volumen: lo que justifica usar MFCC', () => {
  const señal = vocal(120, [700, 1200, 2600], FFT);

  it('c₁…c₁₂ no cambian al subir el volumen', () => {
    // La misma vocal dicha flojo y fuerte. Un factor de 20× en amplitud.
    const flojo = mfcc(señal, { sampleRate: RATE, fftSize: FFT });

    const fuerteSignal = Float32Array.from(señal, (v) => v * 20);
    const fuerte = mfcc(fuerteSignal, { sampleRate: RATE, fftSize: FFT });

    // Los coeficientes 1 en adelante son idénticos: el volumen no los toca.
    for (let k = 1; k < 13; k++) {
      expect(fuerte[k]).toBeCloseTo(flojo[k], 3);
    }
  });

  it('el volumen queda encerrado en c₀', () => {
    const flojo = mfcc(señal, { sampleRate: RATE, fftSize: FFT });
    const fuerte = mfcc(
      Float32Array.from(señal, (v) => v * 20),
      { sampleRate: RATE, fftSize: FFT }
    );

    // c₀ sí cambia, y en la cantidad exacta que predice la teoría: multiplicar
    // la señal por g multiplica la potencia por g², lo que suma 20·log₁₀(g) dB
    // a todas las bandas por igual, y la DCT manda una constante a c₀.
    const esperado = 20 * Math.log10(20) * Math.sqrt(26);
    expect(fuerte[0] - flojo[0]).toBeCloseTo(esperado, 1);
  });

  it('DOCUMENTADO: la invariancia se rompe si alguna banda toca el piso', () => {
    // Límite real del método, encontrado al escribir estas pruebas. El piso
    // `MEL_FLOOR` evita log(0), pero una banda fijada en el piso NO se desplaza
    // al cambiar el volumen, mientras que las demás sí. El desplazamiento deja
    // de ser uniforme y se filtra a c₁…c₁₂.
    //
    // Ocurre con señales de banda limitada o muy flojas: aquí un tono puro, que
    // deja casi todas las bandas sin energía.
    const tono = seno(1000, FFT, 1e-4);
    const opts = { sampleRate: RATE, fftSize: FFT };

    const flojo = mfcc(tono, opts);
    const fuerte = mfcc(Float32Array.from(tono, (v) => v * 100), opts);

    let mayorDiferencia = 0;
    for (let k = 1; k < 13; k++) {
      mayorDiferencia = Math.max(mayorDiferencia, Math.abs(fuerte[k] - flojo[k]));
    }
    expect(mayorDiferencia).toBeGreaterThan(1);

    // En voz real no es un problema: el habla tiene energía repartida por toda
    // la banda y la normalización RMS de S2-T2 la sitúa muy por encima del piso.
    // Queda anotado para S8-T2 (casos límite) por si aparece con voz muy floja.
  });

  it('la distancia entre vocales distintas sobrevive al cambio de volumen', () => {
    // Es la prueba práctica: el comparador debe ver dos vocales como distintas
    // aunque una se diga mucho más fuerte que la otra.
    const a = vocal(120, [700, 1200, 2600], FFT); // ~/a/
    const i = vocal(120, [300, 2300, 3000], FFT); // ~/i/

    const opts = { sampleRate: RATE, fftSize: FFT };
    const mfccA = mfcc(a, opts);
    const mfccI = mfcc(i, opts);
    const mfccIFuerte = mfcc(Float32Array.from(i, (v) => v * 15), opts);

    // Ignorando c₀, la /i/ fuerte está a distancia ~0 de la /i/ floja…
    expect(distancia(mfccI, mfccIFuerte, 1)).toBeLessThan(0.01);
    // …y bien lejos de la /a/.
    expect(distancia(mfccA, mfccI, 1)).toBeGreaterThan(1);
  });
});

describe('Discriminación de sonidos (S5-T2)', () => {
  const opts = { sampleRate: RATE, fftSize: FFT };

  it('distingue vocales con formantes distintos', () => {
    const a = mfcc(vocal(120, [700, 1200, 2600], FFT), opts);
    const i = mfcc(vocal(120, [300, 2300, 3000], FFT), opts);
    const u = mfcc(vocal(120, [350, 800, 2400], FFT), opts);

    expect(distancia(a, i, 1)).toBeGreaterThan(1);
    expect(distancia(a, u, 1)).toBeGreaterThan(1);
    expect(distancia(i, u, 1)).toBeGreaterThan(1);
  });

  it('la misma vocal con distinto tono se mantiene parecida', () => {
    // Justo lo que hace útil al banco mel: borra los armónicos, que dependen
    // del tono, y conserva la envolvente, que define el fonema.
    const grave = mfcc(vocal(100, [700, 1200, 2600], FFT), opts);
    const agudo = mfcc(vocal(180, [700, 1200, 2600], FFT), opts);

    const mismaVocalOtroTono = distancia(grave, agudo, 1);
    const otraVocal = distancia(grave, mfcc(vocal(100, [300, 2300, 3000], FFT), opts), 1);

    expect(mismaVocalOtroTono).toBeLessThan(otraVocal);
  });

  it('el ruido y un tono dan coeficientes bien distintos', () => {
    expect(distancia(mfcc(ruido(FFT), opts), mfcc(seno(1000, FFT), opts), 1)).toBeGreaterThan(1);
  });

  it('el silencio da coeficientes finitos', () => {
    const c = mfcc(new Float32Array(FFT), opts);
    for (const v of c) expect(Number.isFinite(v)).toBe(true);
  });
});

describe('Secuencia de MFCC (S5-T2)', () => {
  it('produce una trama por salto y 13 coeficientes cada una', () => {
    const secuencia = mfccSequence(seno(1000, RATE), 512, 256, { sampleRate: RATE });

    expect(secuencia.length).toBe(Math.floor((RATE - 512) / 256) + 1);
    expect(secuencia[0]).toHaveLength(13);
  });

  it('un sonido estacionario da coeficientes estables', () => {
    const secuencia = mfccSequence(seno(1000, 8192), 512, 256, { sampleRate: RATE });

    for (let i = 1; i < secuencia.length; i++) {
      expect(distancia(secuencia[0], secuencia[i], 1)).toBeLessThan(0.5);
    }
  });

  it('sigue un cambio de sonido a lo largo del tiempo', () => {
    const señal = new Float32Array(RATE);
    señal.set(vocal(120, [700, 1200, 2600], RATE / 2), 0);
    señal.set(vocal(120, [300, 2300, 3000], RATE / 2), RATE / 2);

    const secuencia = mfccSequence(señal, 512, 256, { sampleRate: RATE });
    const inicio = secuencia[5];
    const fin = secuencia[secuencia.length - 5];

    expect(distancia(inicio, fin, 1)).toBeGreaterThan(1);
  });

  it('permite configurar el nº de filtros y de coeficientes', () => {
    const c = mfcc(seno(1000, FFT), { sampleRate: RATE, fftSize: FFT, nFilters: 40, nCoeffs: 20 });
    expect(c).toHaveLength(20);
  });
});
