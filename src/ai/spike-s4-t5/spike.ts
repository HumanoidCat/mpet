/**
 * Spike S4-T5 — validación en runtime de la síntesis de voz (SpeechT5). Dueño: Isaac.
 *
 * POR QUÉ EXISTE: S5-T5 (el worker de TTS) es la única tarea de la ruta crítica del
 * proyecto — sin audio de referencia no hay comparador de pronunciación (Fabrizio) ni
 * retroalimentación por palabra (José Pablo). Antes de escribir ese worker hay que
 * responder cuatro preguntas que ningún test unitario puede contestar:
 *
 *   1. ¿A qué frecuencia sale el audio? El contrato promete PCM a 16 kHz y
 *      `App.tsx` crea el AudioContext fijo a 16 kHz sin remuestrear: si el modelo
 *      sintetizara a otra frecuencia, la voz sonaría con el tono cambiado.
 *   2. ¿Cuánto pesa de verdad? SpeechT5 son tres piezas ONNX y en fp32 suman ~643 MB,
 *      sobre una app que ya descarga ~300 MB.
 *   3. ¿Cuánto tarda por frase? La síntesis es autorregresiva (genera el espectrograma
 *      paso a paso), así que la latencia crece con la longitud del texto.
 *   4. ¿Cómo suena cuantizado? La ficha oficial recomienda fp32 "porque es más
 *      preciso". Eso hay que oírlo, no deducirlo: la decisión D-05 (q4 descartado)
 *      se tomó sobre texto, y la calidad de un audio no se mide igual.
 *
 * MISMO CRITERIO QUE EL SPIKE S3-T3: se sirve con Vite e importa la versión real del
 * proyecto (3.8.1), las constantes reales de `tts/ttsProtocol.ts`, el vector de voz
 * real de `tts/speakerEmbedding.ts` y el agregador de progreso real de S2-T5. Lo que
 * se valida es el código que va a producción, no una copia parecida.
 *
 * POR QUÉ NO USA `pipeline('text-to-speech', ...)`: ese atajo carga el vocoder con
 * `dtype: 'fp32'` escrito a fuego y no acepta uno propio (ver `ttsProtocol.ts`).
 * Como una de las preguntas del spike es justamente si el vocoder se puede cuantizar,
 * hay que armar las piezas a mano — que es como las armará el worker.
 *
 * Es un spike: código desechable, no forma parte del pipeline.
 */

import {
  AutoProcessor,
  AutoTokenizer,
  SpeechT5ForTextToSpeech,
  SpeechT5HifiGan,
  Tensor,
} from '@huggingface/transformers';
import { SAMPLE_RATE } from '@shared/constants';
import { createProgressAggregator, type RawProgressEvent } from '../model-cache/progress';
import { loadSpeakerEmbedding } from '../tts/speakerEmbedding';
import {
  DEFAULT_TTS_MODEL,
  DEFAULT_TTS_VOCODER,
  TTS_CONFIGS,
  getTtsConfig,
  type TtsConfig,
  type TtsConfigId,
} from '../tts/ttsProtocol';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const log = (m: string) => {
  const el = $('log');
  el.textContent += m + '\n';
  el.scrollTop = 1e9;
};

// ── Estado de la corrida ─────────────────────────────────────────────────────

let model: SpeechT5ForTextToSpeech | null = null;
let vocoder: SpeechT5HifiGan | null = null;
let tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>> | null = null;
let speakerEmbeddings: Tensor | null = null;

let activeConfig: TtsConfig = TTS_CONFIGS[0];
let loadSeconds = 0;
let cacheDeltaMB = 0;
/** Frecuencia declarada por el procesador del modelo (la verdad, no la suposición). */
let modelSampleRate = 0;

/**
 * Tamaño de cada archivo ONNX que el descargador reporta.
 *
 * POR QUÉ ADEMÁS DE `storage.estimate()`: los navegadores redondean a propósito la
 * estimación de almacenamiento, y en S3-T3 la medida de q4 salió contaminada porque
 * q8 ya estaba en caché. Sumar los `total` que reporta transformers.js da el peso
 * exacto de la descarga y además deja constancia de QUÉ variante se usó
 * (`..._quantized.onnx` frente a `....onnx`), que es la evidencia de la decisión.
 */
const downloadedFiles = new Map<string, number>();

// ── Utilidades del spike ─────────────────────────────────────────────────────

/** Codifica PCM float a un WAV PCM de 16 bits, para poder adjuntarlo a la evidencia. */
function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // tamaño del bloque fmt
  view.setUint16(20, 1, true); // formato PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes por segundo
  view.setUint16(32, 2, true); // alineación de bloque
  view.setUint16(34, 16, true); // bits por muestra
  writeString(36, 'data');
  view.setUint32(40, pcm.length * 2, true);

  // Float [-1,1] → entero de 16 bits con saturación (evita el "clipping" que se
  // oiría como chasquido si el modelo devolviera algún valor fuera de rango).
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/** Valor máximo absoluto: sirve para detectar audio mudo o saturado. */
function peak(pcm: Float32Array): number {
  let max = 0;
  for (const v of pcm) max = Math.max(max, Math.abs(v));
  return max;
}

// ── Selector de configuración ────────────────────────────────────────────────

const configSelect = $('config') as HTMLSelectElement;
configSelect.innerHTML = TTS_CONFIGS.map(
  (c) => `<option value="${c.id}">${c.label} · ~${c.expectedMB} MB</option>`
).join('');

function refreshConfigInfo() {
  const cfg = getTtsConfig(configSelect.value as TtsConfigId);
  $('configInfo').textContent =
    `encoder=${cfg.encoder} · decoder=${cfg.decoder} · vocoder=${cfg.vocoder} — ${cfg.rationale}`;
}
configSelect.addEventListener('change', refreshConfigInfo);
refreshConfigInfo();

// ── 1) Cargar los modelos y medir ────────────────────────────────────────────

$('btnLoad').addEventListener('click', async () => {
  const btn = $('btnLoad') as HTMLButtonElement;
  activeConfig = getTtsConfig(configSelect.value as TtsConfigId);
  btn.disabled = true;
  downloadedFiles.clear();

  try {
    const before = (await navigator.storage.estimate()).usage ?? 0;
    log(`Cargando ${DEFAULT_TTS_MODEL} + ${DEFAULT_TTS_VOCODER} (${activeConfig.label})…`);

    // Un solo agregador para las dos descargas: para la UI el TTS es un modelo,
    // aunque por dentro sean dos repositorios. Es como lo reportará el worker.
    const aggregator = createProgressAggregator((p) => log(`  carga: ${(p * 100).toFixed(0)}%`));
    const progress_callback = (e: unknown) => {
      const ev = e as RawProgressEvent;
      if (ev.file && typeof ev.total === 'number' && ev.total > 0) {
        downloadedFiles.set(ev.file, ev.total);
      }
      aggregator.handle(ev);
    };

    const t0 = performance.now();

    // El tokenizador de SpeechT5 es de caracteres (`spm_char`): convierte la frase
    // en letras, no en palabras. Pesa unos pocos KB.
    tokenizer = await AutoTokenizer.from_pretrained(DEFAULT_TTS_MODEL, { progress_callback });

    // El procesador solo se carga para LEER de él la frecuencia de muestreo real
    // del modelo, en vez de darla por supuesta (pregunta 1 del spike).
    const processor = await AutoProcessor.from_pretrained(DEFAULT_TTS_MODEL, {
      progress_callback,
    });
    modelSampleRate =
      (processor as unknown as { feature_extractor?: { config?: { sampling_rate?: number } } })
        .feature_extractor?.config?.sampling_rate ?? 0;

    // Cuantización POR PIEZA: `encoder_model` y `decoder_model_merged` son los
    // nombres de las dos sesiones ONNX que usa SpeechT5 por dentro.
    // El `as` es necesario y está acotado: `from_pretrained` está tipado como que
    // devuelve la clase base `PreTrainedModel`, que no declara `generate_speech`.
    // Las OPCIONES siguen sin cast a propósito, para que TypeScript verifique de
    // verdad que `dtype` por pieza y `progress_callback` existen en la API v3.
    model = (await SpeechT5ForTextToSpeech.from_pretrained(DEFAULT_TTS_MODEL, {
      dtype: { encoder_model: activeConfig.encoder, decoder_model_merged: activeConfig.decoder },
      progress_callback,
    })) as SpeechT5ForTextToSpeech;

    // El vocoder es un repositorio aparte y se carga por separado: esa es justamente
    // la pieza que el atajo `pipeline()` no deja configurar.
    vocoder = await SpeechT5HifiGan.from_pretrained(DEFAULT_TTS_VOCODER, {
      dtype: activeConfig.vocoder,
      progress_callback,
    });

    loadSeconds = (performance.now() - t0) / 1000;
    aggregator.complete();

    // El vector de voz sale del código, NO de la red: es lo que hace que la síntesis
    // funcione sin conexión. `[1, 512]` es la forma que espera `generate_speech`.
    const vec = loadSpeakerEmbedding();
    speakerEmbeddings = new Tensor('float32', vec, [1, vec.length]);

    const after = (await navigator.storage.estimate()).usage ?? 0;
    cacheDeltaMB = Math.max(0, (after - before) / (1024 * 1024));

    const downloadedMB =
      [...downloadedFiles.values()].reduce((a, b) => a + b, 0) / (1024 * 1024);

    log(`✔ Cargado en ${loadSeconds.toFixed(2)} s`);
    log(`  Descarga sumada de archivos: ${downloadedMB.toFixed(1)} MB (esperado ~${activeConfig.expectedMB} MB)`);
    log(`  Almacenamiento Δ ≈ ${cacheDeltaMB.toFixed(1)} MB (aproximado: el navegador redondea)`);
    log(`  Frecuencia declarada por el modelo: ${modelSampleRate || 'desconocida'} Hz ` +
        `(el proyecto trabaja a ${SAMPLE_RATE} Hz)`);
    log('  (Recarga la página y vuelve a cargar para medir la carga cacheada.)');

    renderFiles();
    ($('btnRun') as HTMLButtonElement).disabled = false;
  } catch (err) {
    log('⚠ Error cargando: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    btn.disabled = false;
  }
});

function renderFiles() {
  const rows = [...downloadedFiles.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([file, total]) => `<tr><td><code>${file}</code></td><td>${(total / 1048576).toFixed(2)} MB</td></tr>`)
    .join('');
  const totalMB = [...downloadedFiles.values()].reduce((a, b) => a + b, 0) / 1048576;
  $('files').innerHTML =
    `<table><thead><tr><th>Archivo</th><th>Tamaño</th></tr></thead><tbody>${rows}` +
    `<tr><td><strong>Total</strong></td><td><strong>${totalMB.toFixed(2)} MB</strong></td></tr>` +
    `</tbody></table>`;
}

// ── 2) Sintetizar y medir ────────────────────────────────────────────────────

interface Measurement {
  text: string;
  ms: number;
  samples: number;
  seconds: number;
  /** Real Time Factor: cómputo ÷ duración del audio. <1 = más rápido que tiempo real. */
  rtf: number;
  peak: number;
  wav: Blob;
}

async function synthesize(text: string): Promise<Measurement> {
  const { input_ids } = tokenizer!(text);
  const t0 = performance.now();
  const { waveform } = await model!.generate_speech(input_ids, speakerEmbeddings!, {
    vocoder: vocoder!,
  });
  const ms = performance.now() - t0;

  // `generate_speech` devuelve el espectrograma en bruto cuando no se le pasa
  // vocoder, así que `waveform` está tipado como opcional. Si faltara aquí, el
  // vocoder no se habría enganchado: mejor fallar con un mensaje claro.
  if (!waveform) throw new Error('El vocoder no devolvió onda de audio.');

  const pcm = waveform.data as Float32Array;
  const rate = modelSampleRate || SAMPLE_RATE;
  const seconds = pcm.length / rate;

  return {
    text,
    ms,
    samples: pcm.length,
    seconds,
    rtf: ms / 1000 / (seconds || 1),
    peak: peak(pcm),
    wav: encodeWav(pcm, rate),
  };
}

$('btnRun').addEventListener('click', async () => {
  const btn = $('btnRun') as HTMLButtonElement;
  const sentences = ($('sentences') as HTMLTextAreaElement).value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  btn.disabled = true;
  const results: Measurement[] = [];

  try {
    for (const s of sentences) {
      log(`Sintetizando: "${s}"`);
      const m = await synthesize(s);
      results.push(m);
      log(`  ${m.ms.toFixed(0)} ms · ${m.seconds.toFixed(2)} s de audio · RTF ${m.rtf.toFixed(2)}`);
      if (m.peak < 0.01) log('  ⚠ audio prácticamente mudo: revisar el vector de voz');
    }

    renderResults(results);
    renderSummary(results);
    log('✔ Listo. Escucha las frases y descarga los WAV para la evidencia.');
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    btn.disabled = false;
  }
});

function renderResults(results: Measurement[]) {
  const table = document.createElement('table');
  table.innerHTML =
    '<thead><tr><th>Frase</th><th>ms</th><th>Audio (s)</th><th>RTF</th>' +
    '<th>Pico</th><th>Escuchar</th><th>WAV</th></tr></thead>';
  const tbody = document.createElement('tbody');

  results.forEach((m, i) => {
    const url = URL.createObjectURL(m.wav);
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${m.text}</td>` +
      `<td class="${m.ms <= 2000 ? 'ok' : 'bad'}">${m.ms.toFixed(0)}</td>` +
      `<td>${m.seconds.toFixed(2)}</td>` +
      `<td>${m.rtf.toFixed(2)}</td>` +
      `<td>${m.peak.toFixed(3)}</td>` +
      `<td><audio controls src="${url}"></audio></td>` +
      `<td><a href="${url}" download="s4-t5-${activeConfig.id}-${i + 1}.wav">descargar</a></td>`;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  $('results').replaceChildren(table);
}

function renderSummary(results: Measurement[]) {
  const times = results.map((r) => r.ms);
  const avg = times.reduce((a, b) => a + b, 0) / (times.length || 1);
  const downloadedMB = [...downloadedFiles.values()].reduce((a, b) => a + b, 0) / 1048576;
  const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;

  const rows: Array<[string, string]> = [
    ['Configuración', activeConfig.label],
    ['dtypes (encoder / decoder / vocoder)',
      `${activeConfig.encoder} / ${activeConfig.decoder} / ${activeConfig.vocoder}`],
    ['Descarga real (suma de archivos)', `${downloadedMB.toFixed(1)} MB`],
    ['Descarga esperada (Hub)', `${activeConfig.expectedMB} MB`],
    ['Almacenamiento Δ (aprox.)', `${cacheDeltaMB.toFixed(1)} MB`],
    ['Carga (s)', loadSeconds.toFixed(2)],
    ['Frecuencia del modelo (Hz)', String(modelSampleRate || 'desconocida')],
    ['¿Coincide con los 16 kHz del contrato?',
      modelSampleRate === SAMPLE_RATE ? 'Sí — no hace falta remuestrear' : '⚠ NO — hay que remuestrear'],
    ['Frases', String(results.length)],
    ['Latencia media (ms)', avg.toFixed(0)],
    ['Latencia máx (ms)', Math.max(...times).toFixed(0)],
    ['RTF medio', (results.reduce((a, r) => a + r.rtf, 0) / (results.length || 1)).toFixed(2)],
    ['Heap JS (MB)', heap ? (heap.usedJSHeapSize / 1048576).toFixed(0) : 'N/A'],
  ];

  $('summary').querySelector('tbody')!.innerHTML = rows
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
    .join('');
}

log('Listo. Paso 1: elige configuración y carga. Paso 2: sintetiza las frases.');
log(`Objetivo del proyecto: PCM a ${SAMPLE_RATE} Hz y latencia por debajo de 2 s.`);
