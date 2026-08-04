/**
 * S5-T5 · Verificación en ejecución del worker de TTS real. Dueño: Isaac.
 *
 * POR QUÉ EXISTE: los workers de ASR y de gramática se escribieron, compilaron y
 * pasaron sus tests **sin haberse ejecutado nunca**, y eso quedó anotado como
 * limitación en sus evidencias. El spike de gramática demostró lo que cuesta esa
 * diferencia: al correrlo de verdad apareció un bug de clasificación que ningún test
 * veía. Esta página evita repetir el patrón con el TTS.
 *
 * QUÉ VALIDA, que los tests unitarios no pueden:
 *   1. Que el worker arranca de verdad (Vite lo empaqueta como módulo aparte).
 *   2. Que el protocolo de mensajes correlaciona peticiones y respuestas.
 *   3. Que la barra de progreso avanza de forma gradual — el fallo que destapó el
 *      spike, donde llegaba al 100% con el tokenizador y se quedaba clavada.
 *   4. Que el PCM llega a 16 kHz, con muestras audibles, y se puede reproducir.
 *   5. Que dos llamadas seguidas con el mismo texto dan el mismo audio (la duda que
 *      quedó abierta en la evidencia y que afecta al comparador de Fabrizio).
 *
 * Es código de verificación, desechable, no forma parte del pipeline.
 */

import { SAMPLE_RATE } from '@shared/constants';
import { createTtsClient } from '../tts/ttsClient';
import { DEFAULT_TTS_CONFIG } from '../tts/ttsProtocol';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const log = (m: string) => {
  const el = $('log');
  el.textContent += m + '\n';
  el.scrollTop = 1e9;
};

const client = createTtsClient();
let lastPcm: Float32Array | null = null;

/** Reproduce el PCM tal como lo hace `App.tsx`: AudioContext fijo a 16 kHz. */
function play(pcm: Float32Array) {
  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  const buffer = ctx.createBuffer(1, pcm.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(pcm);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.onended = () => void ctx.close();
  source.start();
}

$('btnInit').addEventListener('click', async () => {
  const btn = $('btnInit') as HTMLButtonElement;
  btn.disabled = true;
  const bar = $('bar') as HTMLProgressElement;

  // Cuántos valores distintos de progreso llegan: si fuera 1, la barra estaría
  // saltando directamente al final, que es justo el fallo que se corrigió.
  const seen: number[] = [];

  try {
    log(`Configuración: ${DEFAULT_TTS_CONFIG}`);
    log('init() — arrancando worker…');
    const t0 = performance.now();

    await client.init((model, progress) => {
      seen.push(progress);
      bar.value = progress;
      log(`  ${model}: ${(progress * 100).toFixed(1)}%`);
    });

    log(`✔ init() completado en ${((performance.now() - t0) / 1000).toFixed(2)} s`);
    log(`  Reportes de progreso distintos: ${seen.length}`);
    log(seen.length > 3
      ? '  ✔ La barra avanzó de forma gradual.'
      : '  ⚠ Muy pocos reportes: revisar el reparto de tramos.');

    ($('btnSpeak') as HTMLButtonElement).disabled = false;
    ($('btnSpeakTwice') as HTMLButtonElement).disabled = false;
    ($('btnDispose') as HTMLButtonElement).disabled = false;
  } catch (err) {
    log('⚠ Error en init(): ' + (err instanceof Error ? `${err.name}: ${err.message}` : String(err)));
    btn.disabled = false;
  }
});

async function speakOnce(text: string): Promise<Float32Array> {
  const t0 = performance.now();
  const pcm = await client.speak(text);
  const ms = performance.now() - t0;

  let peak = 0;
  for (const v of pcm) peak = Math.max(peak, Math.abs(v));

  log(`  ${ms.toFixed(0)} ms · ${pcm.length} muestras · ` +
      `${(pcm.length / SAMPLE_RATE).toFixed(2)} s de audio · pico ${peak.toFixed(3)}`);
  if (peak < 0.01) log('  ⚠ audio prácticamente mudo');
  return pcm;
}

$('btnSpeak').addEventListener('click', async () => {
  const btn = $('btnSpeak') as HTMLButtonElement;
  btn.disabled = true;
  try {
    const text = ($('text') as HTMLInputElement).value;
    log(`speak("${text}")`);
    lastPcm = await speakOnce(text);
    play(lastPcm);
    log('  ✔ reproducido a 16 kHz');
  } catch (err) {
    log('⚠ Error en speak(): ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    btn.disabled = false;
  }
});

$('btnSpeakTwice').addEventListener('click', async () => {
  const btn = $('btnSpeakTwice') as HTMLButtonElement;
  btn.disabled = true;
  try {
    const text = ($('text') as HTMLInputElement).value;
    log('Dos síntesis del mismo texto, para comprobar si el audio es reproducible:');
    const a = await speakOnce(text);
    const b = await speakOnce(text);

    if (a.length !== b.length) {
      log(`  ⚠ Distinta longitud: ${a.length} contra ${b.length} muestras. ` +
          'El audio de referencia NO es reproducible entre llamadas.');
      return;
    }
    // Diferencia máxima muestra a muestra: si es 0, el modelo es determinista.
    let maxDiff = 0;
    for (let i = 0; i < a.length; i++) maxDiff = Math.max(maxDiff, Math.abs(a[i] - b[i]));
    log(maxDiff === 0
      ? '  ✔ Idénticas muestra a muestra: el audio de referencia es reproducible.'
      : `  ⚠ Difieren: diferencia máxima ${maxDiff.toExponential(2)}.`);
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    btn.disabled = false;
  }
});

$('btnDispose').addEventListener('click', () => {
  client.dispose();
  log('dispose() — worker terminado y memoria del modelo liberada.');
  ($('btnSpeak') as HTMLButtonElement).disabled = true;
  ($('btnSpeakTwice') as HTMLButtonElement).disabled = true;
  ($('btnDispose') as HTMLButtonElement).disabled = true;
});

log('Listo. Pulsa "Iniciar worker" para cargar el modelo real.');
