/**
 * D-18 · Peso real, latencia y repetición de Qwen2.5-0.5B-Instruct en producción.
 * Dueño: Isaac.
 *
 * DE DÓNDE SALE: D-18 aprobó el cambio de LaMini-Flan-T5 a Qwen2.5-0.5B-Instruct para
 * el tutor bilingüe, con tres preguntas explícitamente marcadas como pendientes en el
 * propio código (`suggestionsProtocol.ts`, comentario sobre `expectedMB: 500`):
 *
 *   1. El peso real de descarga — hoy es la ficha del Hub, nunca se midió una
 *      descarga propia. El proyecto ya se llevó un susto con esto en D-12: Kokoro se
 *      estimó en 325 MB y, medido, pesaba 88.
 *   2. La latencia del turno, para compararla contra el criterio de D-15.
 *   3. Si el muestreo (`temperature: 0.7`, `top_p: 0.9`) alcanza por sí solo para que
 *      las respuestas dejen de repetirse, o si además hace falta el chequeo de
 *      `cleanTutorReply` que ya existe por otra causa (I-09).
 *
 * POR QUÉ EL CLIENTE DE PRODUCCIÓN Y NO UNA LLAMADA SUELTA: `createSuggestionsClient`
 * es exactamente lo que usa `createAIPipeline`. Al hacerse esta medición, la
 * configuración por defecto era `'chat-qwen-05b'`, de modo que estos números son
 * los que veía un usuario real, no una aproximación.
 *
 * NOTA POSTERIOR (17-ago): estas mediciones, junto con las que se tomaron en la
 * aplicación desplegada, llevaron a devolver la configuración por defecto a
 * `'grande-248m'` y a resolver el bilingüismo en el reconocedor (D-21). El spike se
 * conserva porque es la evidencia de por qué esa decisión era la correcta.
 *
 * CÓMO SE MIDE EL PESO: el cliente solo reenvía el progreso 0–1, no los bytes por
 * archivo (eso vive dentro del worker). Se lee `caches.open('transformers-cache')`
 * después de cargar y se suman los archivos del modelo — el mismo método que ya dio
 * números exactos y verificables en los spikes de TTS, sugerencias y Kokoro.
 *
 * Es un spike de verificación: código desechable, no forma parte del pipeline.
 */

import { createSuggestionsClient } from '../suggestions/suggestionsClient';
import { DEFAULT_SUGGESTIONS_CONFIG, getSuggestionsConfig } from '../suggestions/suggestionsProtocol';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const log = (m: string) => {
  const el = $('log');
  el.textContent += m + '\n';
  el.scrollTop = 1e9;
};

const config = getSuggestionsConfig(DEFAULT_SUGGESTIONS_CONFIG);
const client = createSuggestionsClient(); // configuración por defecto = producción

let cargaSegundos = 0;
let descargaMB = 0;
let latencias: number[] = [];
let esVariado: boolean | null = null;
let respuestasRepeticion: string[] = [];

// ── 1) Cargar y medir el peso real ───────────────────────────────────────────

$('btnLoad').addEventListener('click', async () => {
  const btn = $('btnLoad') as HTMLButtonElement;
  btn.disabled = true;

  try {
    log(`Cargando ${config.model} (${config.dtype}) vía createSuggestionsClient…`);
    const t0 = performance.now();
    await client.init((model, p) => {
      if (p === 1) log(`  ✔ ${model}`);
    });
    cargaSegundos = (performance.now() - t0) / 1000;

    // El peso exacto se lee de la caché real del navegador, no se estima: es el
    // mismo método que ya dio números verificables (byte a byte) en spikes previos.
    const cache = await caches.open('transformers-cache');
    const keys = await cache.keys();
    const modeloPath = config.model.split('/').pop()!; // p.ej. "Qwen2.5-0.5B-Instruct"
    const propios = keys.filter((k) => k.url.includes(modeloPath));

    const archivos: Array<{ nombre: string; bytes: number }> = [];
    for (const k of propios) {
      const res = await cache.match(k);
      const blob = await res!.blob();
      archivos.push({ nombre: k.url.split('/').pop()!, bytes: blob.size });
    }
    archivos.sort((a, b) => b.bytes - a.bytes);
    descargaMB = archivos.reduce((a, f) => a + f.bytes, 0) / 1048576;

    log(`✔ Cargado en ${cargaSegundos.toFixed(2)} s`);
    log(`  Descarga real: ${descargaMB.toFixed(1)} MiB (ficha del Hub sin medir: ${config.expectedMB} MB)`);
    for (const f of archivos) log(`    ${f.nombre}: ${(f.bytes / 1048576).toFixed(2)} MiB`);

    $('peso').innerHTML =
      `<table><thead><tr><th>Archivo</th><th>Tamaño</th></tr></thead><tbody>` +
      archivos.map((f) => `<tr><td>${f.nombre}</td><td>${(f.bytes / 1048576).toFixed(2)} MiB</td></tr>`).join('') +
      `<tr><td><strong>Total</strong></td><td><strong>${descargaMB.toFixed(1)} MiB</strong></td></tr></tbody></table>` +
      `<p class="${descargaMB <= config.expectedMB ? 'ok' : 'bad'}">` +
      `Ficha del Hub sin medir: ${config.expectedMB} MB · real: ${descargaMB.toFixed(1)} MiB ` +
      `(${descargaMB <= config.expectedMB ? 'menos' : 'más'} de lo estimado)</p>`;

    ($('btnLatencia') as HTMLButtonElement).disabled = false;
    ($('btnRepeticion') as HTMLButtonElement).disabled = false;
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? `${err.name}: ${err.message}` : String(err)));
  } finally {
    btn.disabled = false;
  }
});

// ── 2) Latencia de tres turnos ───────────────────────────────────────────────

const TURNOS_LATENCIA = [
  'Hi! I want to practice my English conversation skills.',
  'I work as an engineer and I travel a lot for my job.',
  'What do you think I should study to improve faster?',
];

$('btnLatencia').addEventListener('click', async () => {
  const btn = $('btnLatencia') as HTMLButtonElement;
  btn.disabled = true;
  latencias = [];
  const historia: Array<{ role: 'user' | 'tutor'; text: string }> = [];

  try {
    for (const t of TURNOS_LATENCIA) {
      historia.push({ role: 'user', text: t });
      const t0 = performance.now();
      const r = await client.reply(historia, 'en');
      const ms = performance.now() - t0;
      latencias.push(ms);
      historia.push({ role: 'tutor', text: r });
      log(`  "${t}" (${ms.toFixed(0)} ms)\n    → "${r}"`);
    }

    const media = latencias.reduce((a, b) => a + b, 0) / latencias.length;
    const maxima = Math.max(...latencias);
    // D-15: el presupuesto de 2 s cubre la retroalimentación (transcripción +
    // gramática), no la respuesta del tutor — pero el spike anterior con LaMini dio
    // 1751/2285 ms de media/máxima como referencia de comparación.
    $('latencia').innerHTML =
      `<p>Media: <strong>${media.toFixed(0)} ms</strong> · Máxima: <strong>${maxima.toFixed(0)} ms</strong></p>` +
      `<p class="muted">Referencia anterior (LaMini-Flan-T5, spike S6-T4): 1751 ms media / 2285 ms máxima.</p>`;
    log(`✔ Media ${media.toFixed(0)} ms · máxima ${maxima.toFixed(0)} ms`);
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    btn.disabled = false;
    actualizarResumen();
  }
});

// ── 3) ¿El muestreo evita la repetición? ─────────────────────────────────────

$('btnRepeticion').addEventListener('click', async () => {
  const btn = $('btnRepeticion') as HTMLButtonElement;
  btn.disabled = true;
  respuestasRepeticion = [];

  try {
    // La MISMA frase, tres veces, cada una como conversación nueva de un solo turno
    // — así se aísla si el muestreo por sí solo varía la salida, sin que una
    // conversación distinta cada vez sea la explicación de la diferencia.
    const frase = 'I went to the beach yesterday with my family.';
    for (let i = 0; i < 3; i++) {
      const r = await client.reply([{ role: 'user', text: frase }], 'en');
      respuestasRepeticion.push(r);
      log(`  Intento ${i + 1}: "${r}"`);
    }

    const distintas = new Set(respuestasRepeticion).size;
    esVariado = distintas > 1;

    $('repeticion').innerHTML =
      `<table><thead><tr><th>#</th><th>Respuesta</th></tr></thead><tbody>` +
      respuestasRepeticion.map((r, i) => `<tr><td>${i + 1}</td><td>${r}</td></tr>`).join('') +
      `</tbody></table>` +
      `<p class="${esVariado ? 'ok' : 'bad'}">${distintas} respuesta(s) distinta(s) de 3. ` +
      `${esVariado ? 'El muestreo sí varía la salida.' : 'Sigue repitiéndose incluso con muestreo.'}</p>`;
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    btn.disabled = false;
    actualizarResumen();
  }
});

// ── Resumen ───────────────────────────────────────────────────────────────────

function actualizarResumen() {
  const media = latencias.length ? latencias.reduce((a, b) => a + b, 0) / latencias.length : null;
  const filas: Array<[string, string]> = [
    ['Modelo', config.model],
    ['Descarga real', `${descargaMB.toFixed(1)} MiB (ficha sin medir: ${config.expectedMB} MB)`],
    ['Carga', `${cargaSegundos.toFixed(2)} s`],
    ['Latencia media', media !== null ? `${media.toFixed(0)} ms` : 'sin medir'],
    ['Latencia máxima', latencias.length ? `${Math.max(...latencias).toFixed(0)} ms` : 'sin medir'],
    ['¿El muestreo varía la salida?', esVariado === null ? 'sin medir' : esVariado ? 'Sí' : 'No'],
  ];
  $('resumen').querySelector('tbody')!.innerHTML =
    filas.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');

  $('markdown').textContent = [
    '### D-18 · Peso, latencia y repetición de Qwen2.5-0.5B, medidos en producción',
    '',
    `- Fecha: ${new Date().toISOString().slice(0, 10)}`,
    `- Modelo: \`${config.model}\` (${config.dtype}), vía \`createSuggestionsClient\` real`,
    `- Descarga real: **${descargaMB.toFixed(1)} MiB** (la ficha del Hub sin medir decía ${config.expectedMB} MB)`,
    `- Carga: ${cargaSegundos.toFixed(2)} s`,
    media !== null ? `- Latencia media / máxima: **${media.toFixed(0)} ms / ${Math.max(...latencias).toFixed(0)} ms** (referencia LaMini: 1751 / 2285 ms)` : '- Latencia: sin medir',
    esVariado !== null
      ? `- Muestreo: **${new Set(respuestasRepeticion).size} de 3 respuestas distintas** ante la misma frase → ${esVariado ? 'el muestreo sí evita la repetición' : 'sigue repitiéndose'}`
      : '- Repetición: sin medir',
    '',
    '#### Limitaciones',
    '',
    '- Midieron 3 turnos de latencia y 3 repeticiones — muestra chica, suficiente para',
    '  descartar el caso peor (500 MB estimados, repetición total) pero no para un',
    '  percentil.',
    '- No mide el turno completo end-to-end (transcripción + gramática + tutor +',
    '  puntaje): solo `reply()`, que es la pieza de este módulo.',
  ].join('\n');
}

log('Listo. Paso 1: cargar y medir el peso real.');
