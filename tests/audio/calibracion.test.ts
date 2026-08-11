/**
 * S9-T3 — Afinado del comparador con voz real.
 *
 * Todo el módulo está calibrado con señales sintéticas. Sirvió para verificar
 * que la matemática es correcta, pero dos constantes se eligieron midiendo
 * sobre esas señales y con voz real pueden cambiar:
 *
 *   · La escala de la puntuación (`SCORE_SCALE`, hoy 20)
 *   · El umbral de YIN (`YIN_THRESHOLD`, hoy 0.02)
 *
 * Esta prueba consume las grabaciones de `tests/audio/fixtures/` y produce las
 * distribuciones de distancia que permiten recalibrarlas. **Si no hay
 * grabaciones se salta**, de modo que la suite siga corriendo en integración
 * continua sin depender de archivos de audio.
 *
 * El procedimiento de grabación está en `tests/audio/fixtures/README.md`.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readWav } from './fixtures/wav';
import { resample } from '../../src/audio/dsp/resampler';
import { preprocess } from '../../src/audio/dsp/preprocess';
import { trimToVoicedSpeech } from '../../src/audio/features/voiceDetection';
import { mfccSequence, cepstralMeanNormalize } from '../../src/audio/features/mfcc';
import { detectPitchYin } from '../../src/audio/features/yin';
import { dtw, euclidean } from '../../src/audio/comparator/dtw';
import { defaultBandRadius, distanceToScore, SCORE_SCALE } from '../../src/audio/comparator/scorer';
import { SAMPLE_RATE, FRAME_SIZE, HOP_SIZE } from '../../src/shared/constants';

const CARPETA = join(__dirname, 'fixtures');

interface Toma {
  archivo: string;
  hablante: string;
  frase: string;
  version: string;
}

/** Lee los WAV disponibles y les extrae hablante, frase y versión del nombre. */
function tomasDisponibles(): Toma[] {
  if (!existsSync(CARPETA)) return [];

  return readdirSync(CARPETA)
    .filter((f) => f.toLowerCase().endsWith('.wav'))
    .map((archivo) => {
      const [hablante, frase, version] = archivo.replace(/\.wav$/i, '').split('-');
      return { archivo, hablante, frase, version };
    })
    .filter((t) => t.hablante && t.frase && t.version);
}

/**
 * Cadena completa: cargar, remuestrear si hace falta, preprocesar y —según se
 * pida— recortar al habla.
 *
 * El recorte es opcional **porque resultó ser una variable del experimento**.
 * Las grabaciones del protocolo ya vienen recortadas con medio segundo parejo a
 * cada lado, así que aplicarles encima el recorte por voz no quita silencio:
 * lo que hace es quitar cantidades distintas en cada archivo. Medido en la
 * frase 1, donde el efecto se ve entero:
 *
 * | Archivo | Dura | Tras el recorte |
 * |---|---:|---:|
 * | `ok`   | 2.05 s | 2.02 s — no recortó nada |
 * | `ok2`  | 2.56 s | 1.74 s |
 * | `mal`  | 2.82 s | 1.70 s |
 *
 * Dos tomas de la misma frase quedan con contenidos distintos, y esa diferencia
 * es mayor que la de la vocal que se quiere detectar. Por eso la medición se
 * hace sin recortar y el recorte se reporta aparte, como lo que es: un defecto
 * del detector sobre voz real, no una propiedad del comparador.
 */
function analizar(archivo: string, recortar = false): Float32Array[] {
  const wav = readWav(join(CARPETA, archivo));

  const a16k =
    wav.sampleRate === SAMPLE_RATE ? wav.samples : resample(wav.samples, wav.sampleRate, SAMPLE_RATE);

  const limpio = preprocess(a16k, SAMPLE_RATE);
  const señal = recortar ? trimToVoicedSpeech(limpio, { sampleRate: SAMPLE_RATE }) : limpio;

  return cepstralMeanNormalize(
    mfccSequence(señal, FRAME_SIZE, HOP_SIZE, { sampleRate: SAMPLE_RATE })
  );
}

function distancia(a: Float32Array[], b: Float32Array[]): number {
  return dtw(a, b, { bandRadius: defaultBandRadius(a.length, b.length) }).normalizedDistance;
}

const estadisticas = (xs: number[]) => {
  const ordenados = [...xs].sort((p, q) => p - q);
  return {
    n: xs.length,
    min: ordenados[0],
    mediana: ordenados[Math.floor(xs.length / 2)],
    max: ordenados[xs.length - 1],
    media: xs.reduce((s, x) => s + x, 0) / xs.length,
  };
};

const tomas = tomasDisponibles();

describe.skipIf(tomas.length === 0)('S9-T3 · Calibración con voz real', () => {
  it('informa qué grabaciones se encontraron', () => {
    const hablantes = [...new Set(tomas.map((t) => t.hablante))];
    const frases = [...new Set(tomas.map((t) => t.frase))];

    console.log(`\n  ${tomas.length} grabaciones`);
    console.log(`  Hablantes: ${hablantes.join(', ')}`);
    console.log(`  Frases: ${frases.join(', ')}`);

    expect(tomas.length).toBeGreaterThan(0);
  });

  /**
   * La comparación se mide **dentro de cada frase**, que es como se usa: la
   * aplicación siempre enfrenta lo que dijo el usuario contra la referencia de
   * esa misma frase, nunca contra otra.
   *
   * Juntar las cinco frases en una sola distribución —como hacía la versión
   * anterior de esta prueba— fabrica un solapamiento que no existe en uso real.
   * Cada frase tiene su propio nivel de distancia base, porque depende de
   * cuántos fonemas tiene y de cuáles: la frase 1 da 12.9 entre dos tomas
   * buenas y la frase 4 da 12.6, pero sus umbrales de error caen en 13.8 y
   * 16.6. Un único corte global no puede servir para las dos, y no hace falta
   * que sirva.
   */
  it('mide la separación dentro de cada frase', () => {
    const cache = new Map<string, Float32Array[]>();
    const mfcc = (t: Toma) => {
      if (!cache.has(t.archivo)) cache.set(t.archivo, analizar(t.archivo));
      return cache.get(t.archivo)!;
    };
    const buscar = (hablante: string, frase: string, version: string) =>
      tomas.find((t) => t.hablante === hablante && t.frase === frase && t.version === version);

    const grupos = [...new Set(tomas.map((t) => `${t.hablante}|${t.frase}`))].sort();
    const margenes: { grupo: string; margen: number; delta: number }[] = [];

    console.log('\n== Distancia dentro de cada frase ==');
    console.log('  frase           repetir  rápido |  el error (mal contra cada buena)  | margen');

    for (const g of grupos) {
      const [hablante, frase] = g.split('|');
      const ok = buscar(hablante, frase, 'ok');
      const mal = buscar(hablante, frase, 'mal');
      if (!ok || !mal) continue;

      const buenas = tomas.filter(
        (t) => t.hablante === hablante && t.frase === frase && t.version !== 'mal'
      );
      const ok2 = buscar(hablante, frase, 'ok2');
      const rapido = buscar(hablante, frase, 'rapido');

      // "Bien" son los pares entre versiones correctas; "mal", cada correcta
      // contra la mal pronunciada.
      const dBien: number[] = [];
      for (const a of buenas)
        for (const b of buenas)
          if (a.archivo < b.archivo) dBien.push(distancia(mfcc(a), mfcc(b)));
      const dMal = buenas.map((b) => distancia(mfcc(b), mfcc(mal)));

      const peorBien = Math.max(...dBien);
      const mejorMal = Math.min(...dMal);
      const margen = mejorMal - peorBien;
      const delta = distanceToScore(peorBien) - distanceToScore(mejorMal);
      margenes.push({ grupo: g, margen, delta });

      const rep = ok2 ? distancia(mfcc(ok), mfcc(ok2)) : NaN;
      const rap = rapido ? distancia(mfcc(ok), mfcc(rapido)) : NaN;
      console.log(
        `  ${g.padEnd(15)} ${rep.toFixed(1).padStart(6)} ${rap.toFixed(1).padStart(7)} | ` +
          dMal.map((d) => d.toFixed(1).padStart(6)).join(' ').padEnd(34) +
          ` | ${margen > 0 ? '+' : ''}${margen.toFixed(1)}`
      );
    }

    const separan = margenes.filter((m) => m.margen > 0).length;
    console.log(`\n  Frases donde el error queda más lejos que cualquier toma buena: ${separan} de ${margenes.length}`);
    console.log(`  Δ de puntaje (escala ${SCORE_SCALE}), peor frase: ${Math.min(...margenes.map((m) => m.delta)).toFixed(1)} puntos`);
    console.log(`  RF-10 exige 20.`);

    expect(margenes.length).toBeGreaterThan(0);
  });

  /**
   * La versión `rapido` se mide aparte porque **es la que marca el límite**, no
   * la mal pronunciada. Hablar deprisa no solo comprime el tiempo —eso lo
   * absorbe el alineamiento— sino que reduce las vocales y cambia el espectro,
   * y esa parte el alineamiento no la puede deshacer.
   */
  it('separa velocidad de pronunciación', () => {
    const cache = new Map<string, Float32Array[]>();
    const mfcc = (t: Toma) => {
      if (!cache.has(t.archivo)) cache.set(t.archivo, analizar(t.archivo));
      return cache.get(t.archivo)!;
    };
    const buscar = (h: string, f: string, v: string) =>
      tomas.find((t) => t.hablante === h && t.frase === f && t.version === v);

    const grupos = [...new Set(tomas.map((t) => `${t.hablante}|${t.frase}`))].sort();
    let separanSinRapido = 0;
    let conRapido = 0;
    let n = 0;
    const deltas: number[] = [];

    console.log('\n== A velocidad normal, sin la toma rápida ==');
    console.log('  frase           repetir   error  margen   Δ puntaje');

    for (const g of grupos) {
      const [h, f] = g.split('|');
      const ok = buscar(h, f, 'ok');
      const ok2 = buscar(h, f, 'ok2');
      const mal = buscar(h, f, 'mal');
      const rapido = buscar(h, f, 'rapido');
      if (!ok || !ok2 || !mal) continue;
      n++;

      const rep = distancia(mfcc(ok), mfcc(ok2));
      const err = Math.min(distancia(mfcc(ok), mfcc(mal)), distancia(mfcc(ok2), mfcc(mal)));
      const delta = distanceToScore(rep) - distanceToScore(err);
      if (err > rep) separanSinRapido++;
      deltas.push(delta);

      if (rapido) {
        const rap = Math.max(distancia(mfcc(ok), mfcc(rapido)), distancia(mfcc(ok2), mfcc(rapido)));
        if (Math.min(err, distancia(mfcc(rapido), mfcc(mal))) > Math.max(rep, rap)) conRapido++;
      }

      console.log(
        `  ${g.padEnd(15)} ${rep.toFixed(1).padStart(6)} ${err.toFixed(1).padStart(7)} ` +
          `${(err - rep > 0 ? '+' : '') + (err - rep).toFixed(1)}`.padStart(8) +
          `${delta.toFixed(1)}`.padStart(11)
      );
    }

    console.log(`\n  Separan a velocidad normal : ${separanSinRapido} de ${n}`);
    console.log(`  Separan incluyendo la rápida: ${conRapido} de ${n}`);
    console.log(`  Δ de puntaje: peor ${Math.min(...deltas).toFixed(1)}, mediana ${estadisticas(deltas).mediana.toFixed(1)}, mejor ${Math.max(...deltas).toFixed(1)}`);

    expect(n).toBeGreaterThan(0);
  });

  /**
   * El puntaje de la frase **diluye un error de un solo fonema por
   * construcción**: promedia el costo de todo el camino, y en una frase de
   * cinco palabras la vocal equivocada son unas pocas tramas de un centenar.
   *
   * Por eso RF-10 no pide solo un puntaje global sino también **uno por
   * palabra**, con las marcas de tiempo del reconocedor (S6-T2, ya
   * implementado en `frameRangeForWord` y `segmentCost`). Aquí no hay marcas
   * —vendrían del módulo de Isaac—, así que se aproxima con el tramo del
   * camino donde el costo es mayor: si el único error introducido es la vocal
   * del par mínimo, ese tramo debería caer sobre ella.
   *
   * La ventana es de 10 tramas. Con un salto de 10 ms son 100 ms, la duración
   * típica de una vocal acentuada.
   */
  it('mide la vía por palabra, aproximada con la peor ventana', () => {
    const cache = new Map<string, Float32Array[]>();
    const mfcc = (t: Toma) => {
      if (!cache.has(t.archivo)) cache.set(t.archivo, analizar(t.archivo));
      return cache.get(t.archivo)!;
    };
    const buscar = (h: string, f: string, v: string) =>
      tomas.find((t) => t.hablante === h && t.frase === f && t.version === v);

    /** Costo medio de la peor ventana contigua de `w` pares del alineamiento. */
    const peorVentana = (a: Toma, b: Toma, w = 10): number => {
      const A = mfcc(a);
      const B = mfcc(b);
      const { path } = dtw(A, B, { bandRadius: defaultBandRadius(A.length, B.length) });
      const costos = path.map(({ i, j }) => euclidean(A[i], B[j], 1));
      if (costos.length <= w) return costos.reduce((s, x) => s + x, 0) / costos.length;

      let suma = 0;
      for (let k = 0; k < w; k++) suma += costos[k];
      let mejor = suma;
      for (let k = w; k < costos.length; k++) {
        suma += costos[k] - costos[k - w];
        if (suma > mejor) mejor = suma;
      }
      return mejor / w;
    };

    const grupos = [...new Set(tomas.map((t) => `${t.hablante}|${t.frase}`))].sort();
    const pares: { rep: number; err: number }[] = [];

    console.log('\n== Peor ventana de 100 ms, a velocidad normal ==');
    console.log('  frase           repetir   error  margen');
    for (const g of grupos) {
      const [h, f] = g.split('|');
      const ok = buscar(h, f, 'ok');
      const ok2 = buscar(h, f, 'ok2');
      const mal = buscar(h, f, 'mal');
      if (!ok || !ok2 || !mal) continue;

      const rep = peorVentana(ok, ok2);
      const err = Math.min(peorVentana(ok, mal), peorVentana(ok2, mal));
      pares.push({ rep, err });
      console.log(
        `  ${g.padEnd(15)} ${rep.toFixed(1).padStart(6)} ${err.toFixed(1).padStart(7)} ` +
          `${(err - rep > 0 ? '+' : '') + (err - rep).toFixed(1)}`.padStart(8)
      );
    }

    console.log(`\n  Separan: ${pares.filter((p) => p.err > p.rep).length} de ${pares.length}`);
    console.log('\n  escala   Δ peor   Δ mediana   cumple RF-10');
    for (const escala of [10, 15, 20, 25, 30, 40, 60]) {
      const ds = pares.map((p) => distanceToScore(p.rep, escala) - distanceToScore(p.err, escala));
      const peor = Math.min(...ds);
      const marca = escala === SCORE_SCALE ? ' <- actual' : '';
      console.log(
        `  ${String(escala).padStart(6)} ${peor.toFixed(1).padStart(8)} ${estadisticas(ds).mediana.toFixed(1).padStart(11)}      ${peor > 20 ? 'sí' : 'no'}${marca}`
      );
    }

    expect(pares.length).toBeGreaterThan(0);
  });

  /**
   * Comprueba el efecto del recorte por voz sobre material ya recortado. Está
   * como prueba y no como nota porque es un defecto medible del detector, y si
   * alguna vez se corrige conviene que la cifra se actualice sola.
   */
  it('mide cuánto estorba el recorte por voz en material ya recortado', () => {
    const grupos = [...new Set(tomas.map((t) => `${t.hablante}|${t.frase}`))].sort();
    const filas: { modo: string; separan: number; total: number }[] = [];

    for (const recorta of [false, true]) {
      const cache = new Map<string, Float32Array[]>();
      const mfcc = (t: Toma) => {
        if (!cache.has(t.archivo)) cache.set(t.archivo, analizar(t.archivo, recorta));
        return cache.get(t.archivo)!;
      };
      let separan = 0;
      let total = 0;

      for (const g of grupos) {
        const [h, f] = g.split('|');
        const ok = tomas.find((t) => t.hablante === h && t.frase === f && t.version === 'ok');
        const ok2 = tomas.find((t) => t.hablante === h && t.frase === f && t.version === 'ok2');
        const mal = tomas.find((t) => t.hablante === h && t.frase === f && t.version === 'mal');
        if (!ok || !ok2 || !mal) continue;
        total++;
        const rep = distancia(mfcc(ok), mfcc(ok2));
        const err = Math.min(distancia(mfcc(ok), mfcc(mal)), distancia(mfcc(ok2), mfcc(mal)));
        if (err > rep) separan++;
      }
      filas.push({ modo: recorta ? 'con recorte por voz' : 'sin recortar', separan, total });
    }

    console.log('\n== Efecto del recorte sobre grabaciones ya recortadas ==');
    for (const f of filas) console.log(`  ${f.modo.padEnd(22)} separan ${f.separan} de ${f.total}`);

    expect(filas.length).toBe(2);
  });

  it('mide el rango de tono real y la tasa de tramas sonoras', () => {
    // Sirve para revisar PITCH_MIN_HZ / PITCH_MAX_HZ y el umbral de YIN, que
    // hoy están puestos con señales sintéticas.
    const tonos: number[] = [];
    let sonoras = 0;
    let total = 0;

    for (const t of tomas) {
      const wav = readWav(join(CARPETA, t.archivo));
      const a16k =
        wav.sampleRate === SAMPLE_RATE
          ? wav.samples
          : resample(wav.samples, wav.sampleRate, SAMPLE_RATE);
      const limpio = preprocess(a16k, SAMPLE_RATE);

      for (let i = 0; i + FRAME_SIZE <= limpio.length; i += HOP_SIZE) {
        total++;
        const r = detectPitchYin(limpio.subarray(i, i + FRAME_SIZE), { sampleRate: SAMPLE_RATE });
        if (r) {
          sonoras++;
          tonos.push(r.hz);
        }
      }
    }

    console.log('\n== Tono medido en voz real ==');
    if (tonos.length > 0) {
      const e = estadisticas(tonos);
      console.log(`  Rango: ${e.min.toFixed(0)} – ${e.max.toFixed(0)} Hz (mediana ${e.mediana.toFixed(0)})`);
      console.log(`  Configurado: PITCH_MIN_HZ=60, PITCH_MAX_HZ=400`);
    }
    console.log(`  Tramas sonoras: ${((100 * sonoras) / total).toFixed(0)} % (sintético dio 49 %)`);

    expect(total).toBeGreaterThan(0);
  });
});

describe('Lector de WAV (S9-T3)', () => {
  /** Arma un WAV PCM de 16 bits en memoria, para verificar el lector. */
  function escribirWav(muestras: Float32Array, sampleRate: number, canales = 1): Buffer {
    const bytes = muestras.length * 2;
    const buf = Buffer.alloc(44 + bytes);

    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + bytes, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16); // tamaño del trozo fmt
    buf.writeUInt16LE(1, 20); // PCM
    buf.writeUInt16LE(canales, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * canales * 2, 28);
    buf.writeUInt16LE(canales * 2, 32);
    buf.writeUInt16LE(16, 34); // bits por muestra
    buf.write('data', 36);
    buf.writeUInt32LE(bytes, 40);

    for (let i = 0; i < muestras.length; i++) {
      buf.writeInt16LE(Math.round(muestras[i] * 32767), 44 + i * 2);
    }
    return buf;
  }

  const temporal = join(tmpdir(), `mpet-wav-${process.pid}.wav`);
  afterEach(() => {
    if (existsSync(temporal)) unlinkSync(temporal);
  });

  it('recupera las muestras que se escribieron', () => {
    const original = new Float32Array(1000);
    for (let i = 0; i < original.length; i++) {
      original[i] = Math.sin((2 * Math.PI * 440 * i) / 16000) * 0.8;
    }

    writeFileSync(temporal, escribirWav(original, 16000));
    const leido = readWav(temporal);

    expect(leido.sampleRate).toBe(16000);
    expect(leido.channels).toBe(1);
    expect(leido.samples).toHaveLength(1000);
    expect(leido.durationSeconds).toBeCloseTo(1000 / 16000, 6);

    // 16 bits dan una resolución de 1/32768: el error no puede superarla.
    for (let i = 0; i < original.length; i++) {
      expect(leido.samples[i]).toBeCloseTo(original[i], 4);
    }
  });

  it('mezcla a mono un archivo estéreo', () => {
    // Dos canales con signo opuesto: el promedio tiene que dar cero.
    const estereo = new Float32Array(200);
    for (let i = 0; i < 100; i++) {
      estereo[i * 2] = 0.5;
      estereo[i * 2 + 1] = -0.5;
    }

    writeFileSync(temporal, escribirWav(estereo, 16000, 2));
    const leido = readWav(temporal);

    expect(leido.channels).toBe(2);
    expect(leido.samples).toHaveLength(100);
    for (const v of leido.samples) expect(v).toBeCloseTo(0, 4);
  });

  it('encuentra los datos aunque haya metadatos por delante', () => {
    // Los editores insertan trozos entre la cabecera y los datos. Dar por
    // hecho que 'data' empieza en el byte 44 falla con esos archivos.
    const base = escribirWav(Float32Array.from([0.5, -0.5]), 16000);
    const extra = Buffer.alloc(8 + 10);
    extra.write('LIST', 0);
    extra.writeUInt32LE(10, 4);

    const conMetadatos = Buffer.concat([
      base.subarray(0, 36), // RIFF + fmt
      extra,
      base.subarray(36), // data
    ]);
    conMetadatos.writeUInt32LE(conMetadatos.length - 8, 4);

    writeFileSync(temporal, conMetadatos);
    const leido = readWav(temporal);

    expect(leido.samples).toHaveLength(2);
    expect(leido.samples[0]).toBeCloseTo(0.5, 4);
  });

  it('rechaza un archivo que no es WAV', () => {
    writeFileSync(temporal, Buffer.from('esto no es audio'));
    expect(() => readWav(temporal)).toThrow(/no es un archivo WAV/);
  });
});
