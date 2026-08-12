/**
 * Spike · ¿Un modelo de chat real reemplaza a LaMini-Flan-T5 en el tutor? Dueño: Isaac.
 *
 * DE DÓNDE SALE: tras arreglar I-09 (negativa memorizada), I-10 (repetición literal) y
 * el eco (`esEco` en cleanup.ts), el tutor dejó de romperse pero el usuario señaló —
 * correctamente— que sigue sin conversar de verdad. Con LaMini eso no tiene arreglo de
 * prompt: es un T5 de instrucciones, entrenado para reescribir, no para dialogar, y el
 * prompt solo le pasa la última frase del estudiante porque pasarle más (formato
 * `Student:`/`Tutor:`) fue justo lo que causó I-10.
 *
 * QUÉ CAMBIA CON UN MODELO DE CHAT DE VERDAD: `@huggingface/transformers` 3.8.1 (ya
 * instalada, sin dependencia nueva) soporta nativamente `pipeline('text-generation',
 * modelo)` con un array de mensajes `{role, content}` y plantilla de chat aplicada por
 * el propio tokenizador (`apply_chat_template`, verificado en el código fuente
 * instalado). Eso permite pasarle el historial real, no una frase suelta, y estos
 * modelos SÍ se entrenaron para usarlo.
 *
 * CANDIDATOS: SmolLM2-135M-Instruct (137 MB cuantizado — MENOS que los 265 MB de
 * LaMini) y SmolLM2-360M-Instruct (365 MB), los dos con soporte de chat y, según su
 * ficha, entrenados también para "text rewriting" — candidatos a cubrir `suggest()`
 * y `reply()` con un solo modelo (D-14), como LaMini.
 *
 * LA PRUEBA QUE DECIDE: memoria conversacional. Se le da un dato en el turno 1 y se le
 * pregunta por él en el turno 3. LaMini no podía pasar esto ni en principio, porque su
 * prompt nunca llevaba turnos anteriores. Un modelo de chat con historial real debería.
 *
 * Es un spike: código desechable, no forma parte del pipeline.
 */

import { pipeline } from '@huggingface/transformers';
import { createProgressAggregator, type RawProgressEvent } from '../model-cache/progress';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const log = (m: string) => {
  const el = $('log');
  el.textContent += m + '\n';
  el.scrollTop = 1e9;
};

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

type ChatGenerator = (
  messages: ChatMessage[],
  options?: Record<string, unknown>
) => Promise<Array<{ generated_text: ChatMessage[] }>>;

let generator: ChatGenerator | null = null;
let modeloActivo = '';
let cargaSegundos = 0;
let descargaMB = 0;

const SYSTEM = 'You are a friendly English conversation tutor. Keep replies to one or two short sentences.';

async function chat(messages: ChatMessage[], maxTokens = 60): Promise<{ text: string; ms: number }> {
  const t0 = performance.now();
  const out = await generator!(messages, { max_new_tokens: maxTokens, do_sample: false });
  const ms = performance.now() - t0;
  const ultimo = out[0].generated_text.at(-1);
  return { text: (ultimo?.content ?? '').trim(), ms };
}

// ── 1) Cargar ────────────────────────────────────────────────────────────────

$('btnLoad').addEventListener('click', async () => {
  const btn = $('btnLoad') as HTMLButtonElement;
  const select = $('modelo') as HTMLSelectElement;
  modeloActivo = select.value;
  btn.disabled = true;

  try {
    log(`Cargando ${modeloActivo}…`);
    const downloaded = new Map<string, number>();
    const aggregator = createProgressAggregator((p) => log(`  carga: ${(p * 100).toFixed(0)}%`));

    const t0 = performance.now();
    const loaded = await pipeline('text-generation', modeloActivo, {
      dtype: 'q8',
      progress_callback: (e) => {
        const ev = e as RawProgressEvent;
        if (ev.file && typeof ev.total === 'number' && ev.total > 0) downloaded.set(ev.file, ev.total);
        aggregator.handle(ev);
      },
    });
    cargaSegundos = (performance.now() - t0) / 1000;
    aggregator.complete();
    generator = loaded as unknown as ChatGenerator;

    descargaMB = [...downloaded.values()].reduce((a, b) => a + b, 0) / 1048576;
    log(`✔ Cargado en ${cargaSegundos.toFixed(2)} s · descarga real ${descargaMB.toFixed(1)} MiB`);
    $('info').textContent = `${modeloActivo} · ${descargaMB.toFixed(1)} MiB · carga ${cargaSegundos.toFixed(2)} s`;

    for (const id of ['btnMemoria', 'btnPreguntas', 'btnAdversarial', 'btnSugerencias']) {
      ($(id) as HTMLButtonElement).disabled = false;
    }
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? `${err.name}: ${err.message}` : String(err)));
  } finally {
    btn.disabled = false;
  }
});

// ── 2) Memoria conversacional ────────────────────────────────────────────────

$('btnMemoria').addEventListener('click', async () => {
  const btn = $('btnMemoria') as HTMLButtonElement;
  btn.disabled = true;
  try {
    const historia: ChatMessage[] = [{ role: 'system', content: SYSTEM }];

    log('— Turno 1: dar un dato —');
    historia.push({ role: 'user', content: 'Hi! My name is Ana and I work as a nurse.' });
    const r1 = await chat(historia);
    historia.push({ role: 'assistant', content: r1.text });
    log(`  Tutor: ${r1.text}`);

    log('— Turno 2: relleno, sin repetir el dato —');
    historia.push({ role: 'user', content: 'The weather today is really nice.' });
    const r2 = await chat(historia);
    historia.push({ role: 'assistant', content: r2.text });
    log(`  Tutor: ${r2.text}`);

    log('— Turno 3: pedirle el dato de vuelta —');
    historia.push({ role: 'user', content: 'By the way, what is my name, and what do I do for work?' });
    const r3 = await chat(historia);
    log(`  Tutor: ${r3.text}`);

    const recordoNombre = /\bana\b/i.test(r3.text);
    const recordoTrabajo = /\bnurse\b/i.test(r3.text);

    $('memoria').innerHTML =
      `<table><thead><tr><th>Turno</th><th>Tutor</th></tr></thead><tbody>` +
      `<tr><td>1 (da el dato)</td><td>${r1.text}</td></tr>` +
      `<tr><td>2 (relleno)</td><td>${r2.text}</td></tr>` +
      `<tr><td>3 (pide el dato)</td><td>${r3.text}</td></tr></tbody></table>` +
      `<p>Recordó el nombre: <strong class="${recordoNombre ? 'ok' : 'bad'}">${recordoNombre}</strong> · ` +
      `Recordó la profesión: <strong class="${recordoTrabajo ? 'ok' : 'bad'}">${recordoTrabajo}</strong></p>`;

    (window as unknown as Record<string, unknown>).__memoria = { recordoNombre, recordoTrabajo, r1, r2, r3 };
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    btn.disabled = false;
  }
});

// ── 3) Preguntas directas ────────────────────────────────────────────────────

const PREGUNTAS = [
  'What is the capital of France?',
  'Can you help me practice English?',
  'Do you think it is hard to learn a new language?',
];

$('btnPreguntas').addEventListener('click', async () => {
  const btn = $('btnPreguntas') as HTMLButtonElement;
  btn.disabled = true;
  const filas: string[] = [];
  try {
    for (const p of PREGUNTAS) {
      const r = await chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: p }]);
      filas.push(`<tr><td>${p}</td><td>${r.text}</td><td>${(r.ms).toFixed(0)} ms</td></tr>`);
      log(`  "${p}" → "${r.text}"`);
    }
    $('preguntas').innerHTML =
      '<table><thead><tr><th>Pregunta del estudiante</th><th>Tutor</th><th>ms</th></tr></thead><tbody>' +
      filas.join('') + '</tbody></table>';
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    btn.disabled = false;
  }
});

// ── 4) Entradas adversariales ────────────────────────────────────────────────

const ADVERSARIALES = ['I hate my job.', 'My friend is stupid.', 'Hi, how are you?'];
const HUELLAS_NEGATIVA = /openai|as an ai|language model|i cannot|i can.t|use case polic/i;

$('btnAdversarial').addEventListener('click', async () => {
  const btn = $('btnAdversarial') as HTMLButtonElement;
  btn.disabled = true;
  const filas: string[] = [];
  let negativas = 0;
  try {
    for (const p of ADVERSARIALES) {
      const r = await chat([{ role: 'system', content: SYSTEM }, { role: 'user', content: p }]);
      const neg = HUELLAS_NEGATIVA.test(r.text);
      if (neg) negativas++;
      filas.push(
        `<tr><td>${p}</td><td>${r.text}</td><td class="${neg ? 'bad' : 'ok'}">${neg ? 'NEGATIVA' : 'ok'}</td></tr>`
      );
      log(`  "${p}" → "${r.text}"${neg ? '  [NEGATIVA]' : ''}`);
    }
    $('adversarial').innerHTML =
      '<table><thead><tr><th>Entrada</th><th>Tutor</th><th>—</th></tr></thead><tbody>' +
      filas.join('') + `</tbody></table><p>${negativas} negativas de ${ADVERSARIALES.length}</p>`;
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    btn.disabled = false;
  }
});

// ── 5) Sugerencias (D-14: un solo modelo para las dos tareas) ───────────────

$('btnSugerencias').addEventListener('click', async () => {
  const btn = $('btnSugerencias') as HTMLButtonElement;
  btn.disabled = true;
  try {
    const frase = 'I go to school every day and I like it very much.';
    const r = await chat([
      { role: 'system', content: 'Rewrite the sentence the way a native English speaker would say it. Reply with only the rewritten sentence, nothing else.' },
      { role: 'user', content: frase },
    ]);
    log(`  "${frase}" → "${r.text}"`);
    $('sugerencias').innerHTML = `<table><tbody><tr><td>${frase}</td><td>${r.text}</td></tr></tbody></table>`;
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    btn.disabled = false;
    renderResumenYMarkdown();
  }
});

function renderResumenYMarkdown() {
  const mem = (window as unknown as Record<string, { recordoNombre: boolean; recordoTrabajo: boolean }>).__memoria;
  const filas: Array<[string, string]> = [
    ['Modelo', modeloActivo],
    ['Descarga real', `${descargaMB.toFixed(1)} MiB`],
    ['Carga', `${cargaSegundos.toFixed(2)} s`],
    ['Recordó el nombre (turno 3)', mem ? String(mem.recordoNombre) : 'sin medir'],
    ['Recordó la profesión (turno 3)', mem ? String(mem.recordoTrabajo) : 'sin medir'],
  ];
  $('resumen').querySelector('tbody')!.innerHTML =
    filas.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');

  $('markdown').textContent = [
    `### ${modeloActivo}`,
    '',
    `- Descarga real: **${descargaMB.toFixed(1)} MiB** · carga ${cargaSegundos.toFixed(2)} s`,
    `- Memoria conversacional (turno 3, tras dos turnos de por medio): nombre ${mem?.recordoNombre ? 'SÍ' : 'NO'}, profesión ${mem?.recordoTrabajo ? 'SÍ' : 'NO'}`,
  ].join('\n');
}

log('Listo. Paso 1: cargar. Pasos 2-5: correr las pruebas en orden.');
