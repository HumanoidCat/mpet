import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encodeWav, nombreDeToma } from '../../src/core/wavExport';
import { readWav } from '../audio/fixtures/wav';
import { SAMPLE_RATE } from '../../src/shared/constants';

/**
 * El codificador se verifica contra el lector que ya usa la calibracion
 * (`tests/audio/fixtures/wav.ts`, de Fabrizio), no contra si mismo.
 *
 * Es lo unico que importa de verdad: que los archivos que exporte la aplicacion
 * los pueda leer la prueba que los va a consumir. Comprobar el codificador
 * contra su propia idea del formato no demostraria nada.
 */

const temporal = join(tmpdir(), `mpet-export-${process.pid}.wav`);

afterEach(() => {
  if (existsSync(temporal)) rmSync(temporal);
});

/** Escribe el WAV codificado y lo vuelve a leer con el lector del proyecto. */
function idaYVuelta(samples: Float32Array, sampleRate = SAMPLE_RATE) {
  writeFileSync(temporal, encodeWav(samples, sampleRate));
  return readWav(temporal);
}

function seno(freqHz: number, muestras: number, amplitud = 0.5): Float32Array {
  const out = new Float32Array(muestras);
  for (let n = 0; n < muestras; n++) {
    out[n] = amplitud * Math.sin((2 * Math.PI * freqHz * n) / SAMPLE_RATE);
  }
  return out;
}

describe('Exportacion a WAV de las tomas de calibracion', () => {
  it('el lector del proyecto entiende lo que escribimos', () => {
    const wav = idaYVuelta(seno(440, 8000));

    expect(wav.sampleRate).toBe(SAMPLE_RATE);
    expect(wav.channels).toBe(1);
    expect(wav.samples).toHaveLength(8000);
    expect(wav.durationSeconds).toBeCloseTo(0.5, 6);
  });

  it('las muestras sobreviven al viaje dentro del error de 16 bits', () => {
    const original = seno(440, 4000);
    const leido = idaYVuelta(original);

    // Un entero de 16 bits tiene un paso de 1/32768, asi que el error maximo
    // por muestra es medio paso. Se comprueba con margen holgado.
    let peor = 0;
    for (let i = 0; i < original.length; i++) {
      peor = Math.max(peor, Math.abs(original[i] - leido.samples[i]));
    }
    expect(peor).toBeLessThan(1 / 32768);
  });

  it('acota las muestras fuera de rango en vez de dar la vuelta', () => {
    // Sin el acotado, 1.5 desbordaria el entero y sonaria como un chasquido en
    // el sentido contrario, que es mucho peor que saturar.
    const leido = idaYVuelta(Float32Array.from([1.5, -1.5, 0]));

    expect(leido.samples[0]).toBeCloseTo(1, 3);
    expect(leido.samples[1]).toBeCloseTo(-1, 3);
    expect(leido.samples[2]).toBe(0);
  });

  it('conserva la frecuencia de muestreo que se le pase', () => {
    // Por si alguna vez se exporta antes de la decimacion.
    expect(idaYVuelta(seno(440, 1000), 48000).sampleRate).toBe(48000);
  });

  it('un buffer vacio produce un WAV valido de duracion cero', () => {
    const leido = idaYVuelta(new Float32Array(0));

    expect(leido.samples).toHaveLength(0);
    expect(leido.durationSeconds).toBe(0);
  });

  it('el nombre del archivo es estable y declara que el audio esta acondicionado', () => {
    // El sufijo evita que quien lo analice lo vuelva a preprocesar (D-09).
    expect(nombreDeToma('Fabrizio', 'ship sheep', 'ok')).toBe(
      'fabrizio-shipsheep-ok-acond.wav'
    );
    // El separador es el guion, asi que no puede aparecer dentro de un campo:
    // la prueba de calibracion parte el nombre por guiones.
    expect(nombreDeToma('Jose-Pablo', 'bad/bed', 'mal 2')).toBe(
      'josepablo-badbed-mal2-acond.wav'
    );
  });
});
