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
import { dtw } from '../../src/audio/comparator/dtw';
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

/** Cadena completa: cargar, remuestrear si hace falta, preprocesar y recortar. */
function analizar(archivo: string): Float32Array[] {
  const wav = readWav(join(CARPETA, archivo));

  const a16k =
    wav.sampleRate === SAMPLE_RATE ? wav.samples : resample(wav.samples, wav.sampleRate, SAMPLE_RATE);

  const limpio = preprocess(a16k, SAMPLE_RATE);
  const soloVoz = trimToVoicedSpeech(limpio, { sampleRate: SAMPLE_RATE });

  return cepstralMeanNormalize(
    mfccSequence(soloVoz, FRAME_SIZE, HOP_SIZE, { sampleRate: SAMPLE_RATE })
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

  it('mide las distribuciones de distancia y propone la escala', () => {
    const cache = new Map<string, Float32Array[]>();
    const mfcc = (t: Toma) => {
      if (!cache.has(t.archivo)) cache.set(t.archivo, analizar(t.archivo));
      return cache.get(t.archivo)!;
    };

    const correctos: number[] = [];
    const incorrectos: number[] = [];
    const entreHablantes: number[] = [];

    for (const a of tomas) {
      for (const b of tomas) {
        if (a.archivo >= b.archivo) continue; // cada par una sola vez
        if (a.frase !== b.frase) continue; // solo la misma frase es comparable

        const d = distancia(mfcc(a), mfcc(b));
        const algunoMal = a.version === 'mal' || b.version === 'mal';

        if (algunoMal && a.version !== b.version) {
          incorrectos.push(d);
        } else if (!algunoMal) {
          correctos.push(d);
          if (a.hablante !== b.hablante) entreHablantes.push(d);
        }
      }
    }

    console.log('\n== Distancias medidas con voz real ==');
    for (const [nombre, xs] of [
      ['Pares CORRECTOS', correctos],
      ['   de los cuales, entre hablantes distintos', entreHablantes],
      ['Pares INCORRECTOS (uno mal pronunciado)', incorrectos],
    ] as [string, number[]][]) {
      if (xs.length === 0) {
        console.log(`  ${nombre.padEnd(44)} sin datos`);
        continue;
      }
      const e = estadisticas(xs);
      console.log(
        `  ${nombre.padEnd(44)} n=${String(e.n).padStart(3)}  min ${e.min.toFixed(2)}  mediana ${e.mediana.toFixed(2)}  max ${e.max.toFixed(2)}`
      );
    }

    if (correctos.length === 0 || incorrectos.length === 0) {
      console.log('\n  Faltan versiones para comparar. Ver fixtures/README.md.');
      return;
    }

    const peorCorrecto = Math.max(...correctos);
    const mejorIncorrecto = Math.min(...incorrectos);

    console.log('\n== Separación entre clases ==');
    console.log(`  Peor caso bien pronunciado : ${peorCorrecto.toFixed(2)}`);
    console.log(`  Mejor caso mal pronunciado : ${mejorIncorrecto.toFixed(2)}`);
    console.log(
      mejorIncorrecto > peorCorrecto
        ? `  Separadas por un factor de ${(mejorIncorrecto / peorCorrecto).toFixed(2)}`
        : `  ⚠️ LAS CLASES SE SOLAPAN — el comparador no discrimina con estas señales`
    );

    console.log('\n== Puntaje con distintas escalas (RF-10 exige Δ > 20 puntos) ==');
    console.log('  escala   bien   mal   Δ');
    for (const escala of [10, 15, 20, 25, 30, 40, 60]) {
      const bien = distanceToScore(peorCorrecto, escala);
      const mal = distanceToScore(mejorIncorrecto, escala);
      const delta = bien - mal;
      const marca = escala === SCORE_SCALE ? ' <- actual' : '';
      console.log(
        `  ${String(escala).padStart(6)}  ${bien.toFixed(1).padStart(5)}  ${mal.toFixed(1).padStart(5)}  ${delta.toFixed(1).padStart(5)}${delta > 20 ? ' OK' : ' no cumple'}${marca}`
      );
    }

    expect(correctos.length).toBeGreaterThan(0);
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
