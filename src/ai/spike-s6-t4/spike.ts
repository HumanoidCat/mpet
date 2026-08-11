/**
 * Spike S6-T4 / S7-T2 — elegir el modelo del tutor. Dueño: Isaac.
 *
 * QUÉ DECIDE: con qué modelo se construyen `suggest()` (sugerencias de mejora) y
 * `reply()` (respuesta conversacional del tutor). Los dos salen del mismo T5 con
 * instrucciones distintas, así que se elige una sola vez.
 *
 * LA PREGUNTA ES PESO CONTRA CALIDAD, y por eso no se puede responder leyendo fichas:
 *   - `LaMini-Flan-T5-248M` q8 → +278 MB sobre los ~303 MiB que ya descarga la app.
 *   - `LaMini-Flan-T5-77M`  q8 → +98 MB, casi tres veces menos.
 * Con 77M de parámetros las respuestas pueden salir genéricas, repetir la frase de
 * entrada sin cambiarla, o directamente no tener sentido. Eso solo se ve ejecutando.
 *
 * MISMO CRITERIO QUE LOS SPIKES ANTERIORES: se sirve con Vite, importa la versión
 * real de transformers.js (3.8.1) y las constantes y prompts reales del protocolo, no
 * copias. Lo que se mide es lo que va a producción.
 *
 * Es un spike: código desechable, no forma parte del pipeline.
 */

import { pipeline } from '@huggingface/transformers';
import { createProgressAggregator, type RawProgressEvent } from '../model-cache/progress';
import {
  SUGGESTIONS_CONFIGS,
  SUGGESTION_PROMPTS,
  buildSuggestionPrompt,
  buildTutorPrompt,
  getSuggestionsConfig,
  type SuggestionsConfig,
  type SuggestionsConfigId,
} from '../suggestions/suggestionsProtocol';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const log = (m: string) => {
  const el = $('log');
  el.textContent += m + '\n';
  el.scrollTop = 1e9;
};

type Generator = (
  input: string,
  options?: Record<string, unknown>
) => Promise<Array<{ generated_text: string }>>;

let generator: Generator | null = null;
let activeConfig: SuggestionsConfig = SUGGESTIONS_CONFIGS[0];
let loadSeconds = 0;
const downloadedFiles = new Map<string, number>();

// ── Selector ─────────────────────────────────────────────────────────────────

const configSelect = $('config') as HTMLSelectElement;
configSelect.innerHTML = SUGGESTIONS_CONFIGS.map(
  (c) => `<option value="${c.id}">${c.label} · ~${c.expectedMB} MB</option>`
).join('');

function refreshInfo() {
  const cfg = getSuggestionsConfig(configSelect.value as SuggestionsConfigId);
  $('configInfo').textContent = cfg.rationale;
}
configSelect.addEventListener('change', refreshInfo);
refreshInfo();

// ── 1) Cargar ────────────────────────────────────────────────────────────────

$('btnLoad').addEventListener('click', async () => {
  const btn = $('btnLoad') as HTMLButtonElement;
  activeConfig = getSuggestionsConfig(configSelect.value as SuggestionsConfigId);
  btn.disabled = true;
  downloadedFiles.clear();
  const bar = $('bar') as HTMLProgressElement;

  try {
    log(`Cargando ${activeConfig.model} (${activeConfig.dtype})…`);
    const aggregator = createProgressAggregator((p) => {
      bar.value = p;
      log(`  carga: ${(p * 100).toFixed(0)}%`);
    });

    const t0 = performance.now();
    const loaded = await pipeline('text2text-generation', activeConfig.model, {
      dtype: activeConfig.dtype,
      progress_callback: (e) => {
        const ev = e as RawProgressEvent;
        // El peso real se suma de los eventos, que es exacto, en vez de fiarse de
        // `storage.estimate()`, que el navegador redondea (lección del spike S4-T5).
        if (ev.file && typeof ev.total === 'number' && ev.total > 0) {
          downloadedFiles.set(ev.file, ev.total);
        }
        aggregator.handle(ev);
      },
    });
    loadSeconds = (performance.now() - t0) / 1000;
    aggregator.complete();
    generator = loaded as unknown as Generator;

    const mb = [...downloadedFiles.values()].reduce((a, b) => a + b, 0) / 1048576;
    log(`✔ Cargado en ${loadSeconds.toFixed(2)} s · descarga real ${mb.toFixed(1)} MiB`);
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
    .map(([f, t]) => `<tr><td><code>${f}</code></td><td>${(t / 1048576).toFixed(2)} MiB</td></tr>`)
    .join('');
  const total = [...downloadedFiles.values()].reduce((a, b) => a + b, 0) / 1048576;
  $('files').innerHTML =
    `<table><thead><tr><th>Archivo</th><th>Tamaño</th></tr></thead><tbody>${rows}` +
    `<tr><td><strong>Total</strong></td><td><strong>${total.toFixed(2)} MiB</strong></td></tr></tbody></table>`;
}

// ── 2) Generar ───────────────────────────────────────────────────────────────

/**
 * Una generación con las MISMAS opciones que usará el worker.
 *
 * `do_sample: false` (decodificación voraz) igual que en el corrector de gramática:
 * con muestreo aleatorio, la misma frase daría sugerencias distintas cada vez y el
 * estudiante no entendería por qué cambia. Reproducible es mejor que variado.
 */
async function generate(prompt: string, maxTokens: number): Promise<{ text: string; ms: number }> {
  const t0 = performance.now();
  const out = await generator!(prompt, { do_sample: false, max_new_tokens: maxTokens });
  return { text: (out?.[0]?.generated_text ?? '').trim(), ms: performance.now() - t0 };
}

interface Row {
  frase: string;
  sugerencias: Array<{ label: string; text: string; ms: number }>;
  tutor: { text: string; ms: number };
}

$('btnRun').addEventListener('click', async () => {
  const btn = $('btnRun') as HTMLButtonElement;
  const frases = ($('frases') as HTMLTextAreaElement).value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  btn.disabled = true;
  const rows: Row[] = [];

  try {
    for (const frase of frases) {
      log(`— "${frase}"`);
      const sugerencias: Row['sugerencias'] = [];
      for (const p of SUGGESTION_PROMPTS) {
        const r = await generate(buildSuggestionPrompt(p, frase), 64);
        sugerencias.push({ label: p.label, text: r.text, ms: r.ms });
        log(`   ${p.label}: "${r.text}" (${r.ms.toFixed(0)} ms)`);
      }

      // Para la respuesta del tutor se simula un historial mínimo: el turno del
      // estudiante. En la app real llegan hasta cuatro turnos.
      const tutorPrompt = buildTutorPrompt([{ role: 'user', text: frase }]);
      const tutor = await generate(tutorPrompt, 48);
      log(`   Tutor: "${tutor.text}" (${tutor.ms.toFixed(0)} ms)`);

      rows.push({ frase, sugerencias, tutor });
    }

    render(rows);
    log('✔ Listo. Juzgá las salidas: ¿mejoran la frase? ¿la respuesta tiene sentido?');
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    btn.disabled = false;
  }
});

/** ¿La sugerencia devolvió la frase igual? Es el modo de fallo típico de un T5 pequeño. */
const sinCambios = (original: string, salida: string) =>
  original.trim().toLowerCase().replace(/[.?!]$/, '') ===
  salida.trim().toLowerCase().replace(/[.?!]$/, '');

/** ¿La respuesta del tutor termina en pregunta, como pide la instrucción? */
const terminaEnPregunta = (t: string) => t.trim().endsWith('?');

function render(rows: Row[]) {
  const cuerpo = rows
    .map(
      (r) =>
        `<tr><td>${r.frase}</td>` +
        `<td>${r.sugerencias
          .map(
            (s) =>
              `<div><strong>${s.label}:</strong> ${s.text || '<em>(vacío)</em>'}` +
              (sinCambios(r.frase, s.text) ? ' <span class="bad">(sin cambios)</span>' : '') +
              `</div>`
          )
          .join('')}</td>` +
        `<td>${r.tutor.text || '<em>(vacío)</em>'}` +
        (terminaEnPregunta(r.tutor.text)
          ? ' <span class="ok">(pregunta ✓)</span>'
          : ' <span class="bad">(sin pregunta)</span>') +
        `</td></tr>`
    )
    .join('');

  $('results').innerHTML =
    '<table><thead><tr><th>Frase del estudiante</th><th>Sugerencias</th>' +
    `<th>Respuesta del tutor</th></tr></thead><tbody>${cuerpo}</tbody></table>`;

  const todas = rows.flatMap((r) => [...r.sugerencias.map((s) => s.ms), r.tutor.ms]);
  const media = todas.reduce((a, b) => a + b, 0) / (todas.length || 1);
  const iguales = rows.reduce(
    (n, r) => n + r.sugerencias.filter((s) => sinCambios(r.frase, s.text)).length,
    0
  );
  const conPregunta = rows.filter((r) => terminaEnPregunta(r.tutor.text)).length;
  const totalSug = rows.length * SUGGESTION_PROMPTS.length;
  const mb = [...downloadedFiles.values()].reduce((a, b) => a + b, 0) / 1048576;
  const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;

  const filas: Array<[string, string]> = [
    ['Configuración', activeConfig.label],
    ['Descarga real', `${mb.toFixed(1)} MiB (esperado ~${activeConfig.expectedMB} MB)`],
    ['Carga (s)', loadSeconds.toFixed(2)],
    ['Generaciones', String(todas.length)],
    ['Latencia media (ms)', media.toFixed(0)],
    ['Latencia máx (ms)', Math.max(...todas).toFixed(0)],
    ['Sugerencias que no cambiaron nada', `${iguales} de ${totalSug}`],
    ['Respuestas que terminan en pregunta', `${conPregunta} de ${rows.length}`],
    ['Heap JS (MB)', heap ? (heap.usedJSHeapSize / 1048576).toFixed(0) : 'N/A'],
  ];
  $('summary').querySelector('tbody')!.innerHTML = filas
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
    .join('');

  $('markdown').textContent = [
    `### ${activeConfig.label}`,
    '',
    `- Descarga real: **${mb.toFixed(1)} MiB** · carga ${loadSeconds.toFixed(2)} s`,
    `- Latencia media ${media.toFixed(0)} ms, máxima ${Math.max(...todas).toFixed(0)} ms`,
    `- Sugerencias que devolvieron la frase sin cambios: **${iguales} de ${totalSug}**`,
    `- Respuestas del tutor que terminan en pregunta: **${conPregunta} de ${rows.length}**`,
    '',
    '| Frase | Sugerencias | Respuesta del tutor |',
    '|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.frase} | ${r.sugerencias
          .map((s) => `**${s.label}:** ${s.text || '(vacío)'}`)
          .join('<br>')} | ${r.tutor.text || '(vacío)'} |`
    ),
  ].join('\n');
}

log('Listo. Paso 1: elegí modelo y cargá. Paso 2: generá.');
log('Ojo: corré cada modelo por separado para que la medida de descarga sea limpia.');
