/**
 * S2-T3 — Pruebas del VAD.
 *
 * Las señales se arman por tramos con duración conocida (silencio con ruido de
 * fondo + tono), así que se puede comprobar no solo que detecta habla sino que
 * los bordes caen donde deben, con tolerancia de un par de frames.
 */

import { describe, it, expect } from 'vitest';
import {
  frameEnergyDb,
  frameEnergies,
  estimateNoiseFloorDb,
  computeThresholds,
  detectSpeech,
  trimToSpeech,
  StreamingVad,
  SILENCE_DB,
} from '../../src/audio/dsp/vad';

const RATE = 16000;

/** Ruido blanco determinista: mismas muestras en cada corrida. */
function ruido(n: number, amp: number, semilla = 12345): Float32Array {
  const out = new Float32Array(n);
  let s = semilla;
  for (let i = 0; i < n; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out[i] = ((s / 0x7fffffff) * 2 - 1) * amp;
  }
  return out;
}

/** Tono de voz sobre el ruido de fondo del cuarto. */
function tono(ms: number, amp = 0.2, fondo = 0.001): Float32Array {
  const n = Math.round((ms / 1000) * RATE);
  const out = ruido(n, fondo, 999);
  for (let i = 0; i < n; i++) out[i] += amp * Math.sin((2 * Math.PI * 300 * i) / RATE);
  return out;
}

/** Silencio: solo ruido de fondo. */
function silencio(ms: number, fondo = 0.001): Float32Array {
  return ruido(Math.round((ms / 1000) * RATE), fondo);
}

function concatenar(...partes: Float32Array[]): Float32Array {
  const total = partes.reduce((n, p) => n + p.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of partes) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const ms = (muestras: number) => (muestras / RATE) * 1000;

describe('Energía por frame (S2-T3)', () => {
  it('un frame en silencio absoluto no da -Infinity', () => {
    expect(frameEnergyDb(new Float32Array(512))).toBe(SILENCE_DB);
  });

  it('la energía en dB sigue a la amplitud', () => {
    const fuerte = frameEnergyDb(tono(32, 0.5).subarray(0, 512));
    const flojo = frameEnergyDb(tono(32, 0.05).subarray(0, 512));

    // Una décima parte de amplitud son 20 dB menos.
    expect(fuerte - flojo).toBeCloseTo(20, 0);
  });

  it('trocea la señal con el solape acordado', () => {
    // 1 s a 16 kHz con frames de 512 y salto de 256.
    expect(frameEnergies(new Float32Array(RATE)).length).toBe(
      Math.floor((RATE - 512) / 256) + 1
    );
    // Señal más corta que un frame: no hay nada que medir.
    expect(frameEnergies(new Float32Array(100)).length).toBe(0);
  });
});

describe('Estimación del ruido de fondo (S2-T3)', () => {
  it('se apoya en los frames más silenciosos, no en el promedio', () => {
    const senal = concatenar(silencio(500), tono(1000), silencio(500));
    const piso = estimateNoiseFloorDb(frameEnergies(senal));

    // El piso queda cerca del silencio (~-60 dB), no del promedio con la voz.
    expect(piso).toBeLessThan(-40);
  });

  it('el umbral de entrada queda por encima del de salida (histéresis)', () => {
    const senal = concatenar(silencio(500), tono(500), silencio(500));
    const t = computeThresholds(frameEnergies(senal), { sampleRate: RATE });

    expect(t.startDb).toBeGreaterThan(t.endDb);
    expect(t.startDb).toBeGreaterThan(t.noiseFloorDb);
  });

  it('una grabación que es casi toda habla igual se detecta', () => {
    // Sin el tope de -25 dB bajo el máximo, el percentil 10 caería dentro de
    // la voz y el umbral quedaría tan alto que no se detectaría nada.
    const casiTodoHabla = concatenar(tono(2000), silencio(50));
    expect(detectSpeech(casiTodoHabla, { sampleRate: RATE }).length).toBe(1);
  });
});

describe('Detección de habla offline (S2-T3)', () => {
  it('encuentra un tramo de habla entre dos silencios', () => {
    const senal = concatenar(silencio(500), tono(800), silencio(500));
    const segmentos = detectSpeech(senal, { sampleRate: RATE });

    expect(segmentos).toHaveLength(1);
    // Bordes dentro de ~50 ms de donde se construyeron.
    expect(ms(segmentos[0].startSample)).toBeCloseTo(500, -2);
    expect(ms(segmentos[0].endSample)).toBeCloseTo(1300, -2);
    expect(segmentos[0].startTime).toBeCloseTo(0.5, 1);
  });

  it('el silencio puro no produce segmentos', () => {
    expect(detectSpeech(silencio(2000), { sampleRate: RATE })).toHaveLength(0);
    expect(detectSpeech(new Float32Array(RATE), { sampleRate: RATE })).toHaveLength(0);
  });

  it('un clic corto no abre un segmento', () => {
    // 10 ms de golpe: por debajo de la confirmación de inicio.
    const senal = concatenar(silencio(500), tono(10, 0.5), silencio(500));
    expect(detectSpeech(senal, { sampleRate: RATE })).toHaveLength(0);
  });

  it('no corta la frase en una oclusiva (hangover)', () => {
    // Pausa de 80 ms en medio, como el cierre de una /p/ o /t/.
    const senal = concatenar(silencio(400), tono(400), silencio(80), tono(400), silencio(400));
    const segmentos = detectSpeech(senal, { sampleRate: RATE });

    expect(segmentos).toHaveLength(1);
    expect(ms(segmentos[0].endSample - segmentos[0].startSample)).toBeGreaterThan(800);
  });

  it('no incluye el silencio final aunque sea más corto que el hangover', () => {
    // El caso lo destapó la calibración con voz real (S9-T3): las grabaciones
    // terminan con poco silencio, y el segmento llegaba hasta el final del
    // archivo arrastrándolo. La causa era que los dos caminos de cierre de
    // `segmentar` no coincidían: el normal descuenta las tramas que ya estaban
    // bajo umbral y el de fin de grabación no descontaba ninguna.
    //
    // 120 ms de cola, por debajo del hangover de 200 ms, así que el segmento
    // se cierra por fin de buffer y no por hangover cumplido.
    const senal = concatenar(silencio(400), tono(600), silencio(120));
    const segmentos = detectSpeech(senal, { sampleRate: RATE });

    expect(segmentos).toHaveLength(1);
    // El final no puede caer dentro de la cola de silencio. Se deja un margen
    // de 40 ms para el redondeo del salto de análisis.
    expect(ms(segmentos[0].endSample)).toBeLessThan(400 + 600 + 40);
  });

  it('sí separa dos frases con una pausa larga', () => {
    const senal = concatenar(silencio(400), tono(500), silencio(700), tono(500), silencio(400));
    expect(detectSpeech(senal, { sampleRate: RATE })).toHaveLength(2);
  });

  it('se adapta a un cuarto más ruidoso', () => {
    // Mismo tono, ruido de fondo 20x más alto: un umbral fijo fallaría.
    const ruidoso = concatenar(silencio(500, 0.02), tono(800, 0.2, 0.02), silencio(500, 0.02));
    const segmentos = detectSpeech(ruidoso, { sampleRate: RATE });

    expect(segmentos).toHaveLength(1);
    expect(ms(segmentos[0].startSample)).toBeCloseTo(500, -2);
  });

  it('descarta segmentos por debajo de la duración mínima', () => {
    const senal = concatenar(silencio(400), tono(800), silencio(400));

    expect(detectSpeech(senal, { sampleRate: RATE, minSpeechMs: 100 })).toHaveLength(1);
    expect(detectSpeech(senal, { sampleRate: RATE, minSpeechMs: 2000 })).toHaveLength(0);
  });
});

describe('Recorte al habla (S2-T3)', () => {
  it('quita el silencio de los extremos', () => {
    const senal = concatenar(silencio(600), tono(800), silencio(600));
    const recortada = trimToSpeech(senal, { sampleRate: RATE });

    expect(ms(recortada.length)).toBeCloseTo(800, -2);
    // Menos muestras al ASR = menos latencia.
    expect(recortada.length).toBeLessThan(senal.length);
  });

  it('si no detecta habla devuelve el audio intacto, sin perder nada', () => {
    const senal = silencio(500);
    expect(trimToSpeech(senal, { sampleRate: RATE }).length).toBe(senal.length);
  });
});

describe('VAD en vivo (S2-T3)', () => {
  /** Alimenta la señal en bloques y acumula los eventos emitidos. */
  function correr(vad: StreamingVad, senal: Float32Array, bloque = 1024) {
    const eventos = [];
    for (let i = 0; i < senal.length; i += bloque) {
      eventos.push(...vad.process(senal.subarray(i, i + bloque)));
    }
    return eventos;
  }

  it('emite inicio y fin de habla', () => {
    const vad = new StreamingVad({ sampleRate: RATE });
    const eventos = correr(vad, concatenar(silencio(600), tono(800), silencio(700)));

    expect(eventos.map((e) => e.type)).toEqual(['speech-start', 'speech-end']);
    expect(eventos[0].time).toBeCloseTo(0.6, 1);
    expect(vad.isSpeaking).toBe(false);
  });

  it('calibra el ruido de fondo antes de decidir', () => {
    const vad = new StreamingVad({ sampleRate: RATE });

    // Aún sin calibrar tras un bloque corto.
    vad.process(silencio(100));
    expect(vad.noiseFloor).toBeNull();

    // Superado el tramo de calibración, ya hay estimación.
    vad.process(silencio(400));
    expect(vad.noiseFloor).not.toBeNull();
    expect(vad.noiseFloor!).toBeLessThan(-40);
  });

  it('el resultado no depende del tamaño de bloque', () => {
    const senal = concatenar(silencio(600), tono(800), silencio(700));

    const con1024 = correr(new StreamingVad({ sampleRate: RATE }), senal, 1024);
    const con128 = correr(new StreamingVad({ sampleRate: RATE }), senal, 128);

    expect(con128.map((e) => e.type)).toEqual(con1024.map((e) => e.type));
    for (let i = 0; i < con128.length; i++) {
      expect(con128[i].sample).toBe(con1024[i].sample);
    }
  });

  it('sigue marcando habla mientras el usuario habla', () => {
    const vad = new StreamingVad({ sampleRate: RATE });
    vad.process(concatenar(silencio(600), tono(800)));
    expect(vad.isSpeaking).toBe(true);
  });

  it('reset deja el detector como recién creado', () => {
    const vad = new StreamingVad({ sampleRate: RATE });
    const senal = concatenar(silencio(600), tono(800), silencio(700));

    const primera = correr(vad, senal);
    vad.reset();
    expect(vad.noiseFloor).toBeNull();
    expect(vad.isSpeaking).toBe(false);

    const segunda = correr(vad, senal);
    expect(segunda).toEqual(primera);
  });
});
