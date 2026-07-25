/**
 * Spike S3-T3 — validación en runtime del worker de gramática. Dueño: Isaac.
 *
 * POR QUÉ EXISTE: S3-T3 quedó escrita y con tests, pero el modelo T5 nunca se había
 * ejecutado. Este spike responde tres preguntas antes del Avance 1:
 *   1. ¿El modelo corrige de verdad frases con errores típicos de hispanohablantes?
 *   2. ¿Cuánto tarda (carga y por frase)?
 *   3. ¿El prefijo "grammar: " cambia el resultado? (la ficha de Xenova lo omite,
 *      pero el modelo base de vennify se entrenó con él)
 *
 * DIFERENCIA CON EL SPIKE S1-T7: aquel cargaba la librería por CDN porque la
 * dependencia aún no estaba aprobada. Ahora sí está en package.json, así que este
 * spike importa la MISMA versión que usa el proyecto (3.8.1) y el `diff.ts` REAL.
 * Así lo que se valida es el código que va a producción, no una copia parecida.
 *
 * Es un spike: código desechable, no forma parte del pipeline.
 */

import { pipeline } from '@huggingface/transformers';
import { diffWords } from '../grammar/diff';
import { GRAMMAR_PREFIX, DEFAULT_GRAMMAR_MODEL } from '../grammar/grammarProtocol';
import { createProgressAggregator, type RawProgressEvent } from '../model-cache/progress';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const log = (m: string) => {
  const el = $('log');
  el.textContent += m + '\n';
  el.scrollTop = 1e9;
};

type Corrector = (
  input: string,
  options?: Record<string, unknown>
) => Promise<Array<{ generated_text: string }>>;

let corrector: Corrector | null = null;
let loadSeconds = 0;
let cacheDeltaMB = 0;

// ── 1) Cargar el modelo y medir ───────────────────────────────────────────────
$('btnLoad').addEventListener('click', async () => {
  const btn = $('btnLoad') as HTMLButtonElement;
  const dtype = ($('dtype') as HTMLSelectElement).value;
  btn.disabled = true;

  try {
    // Igual que en S1-T7: la diferencia de almacenamiento antes/después aproxima
    // cuánto ocupó el modelo en caché.
    const before = (await navigator.storage.estimate()).usage ?? 0;
    log(`Cargando ${DEFAULT_GRAMMAR_MODEL} (dtype=${dtype})…`);

    // Reutilizamos el agregador real de S2-T5: un solo 0–1 en vez de cientos de
    // eventos por archivo. De paso, lo valida contra un modelo distinto al ASR.
    const aggregator = createProgressAggregator((p) =>
      log(`  carga: ${(p * 100).toFixed(0)}%`)
    );

    const t0 = performance.now();
    const loaded = await pipeline('text2text-generation', DEFAULT_GRAMMAR_MODEL, {
      dtype: dtype as 'q8' | 'q4' | 'fp32',
      progress_callback: (e) => aggregator.handle(e as RawProgressEvent),
    });
    loadSeconds = (performance.now() - t0) / 1000;
    aggregator.complete();

    corrector = loaded as unknown as Corrector;
    const after = (await navigator.storage.estimate()).usage ?? 0;
    cacheDeltaMB = Math.max(0, (after - before) / (1024 * 1024));

    log(`✔ Modelo cargado en ${loadSeconds.toFixed(2)} s · caché Δ ≈ ${cacheDeltaMB.toFixed(1)} MB`);
    log('  (Recarga la página y vuelve a cargar para medir la carga cacheada.)');
    ($('btnRun') as HTMLButtonElement).disabled = false;
  } catch (err) {
    log('⚠ Error cargando: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    btn.disabled = false;
  }
});

/** Ejecuta el modelo con las mismas opciones que usa el worker de producción. */
async function correct(text: string, usePrefix: boolean): Promise<{ out: string; ms: number }> {
  const input = usePrefix ? GRAMMAR_PREFIX + text : text;
  const t0 = performance.now();
  const res = await corrector!(input, { do_sample: false, max_new_tokens: 128 });
  return { out: (res?.[0]?.generated_text ?? '').trim(), ms: performance.now() - t0 };
}

/** Pinta el diff real (el de `diff.ts`) como rojo tachado → verde. */
function renderEdits(original: string, corrected: string): string {
  const edits = diffWords(original, corrected);
  if (edits.length === 0) return '<em class="muted">sin cambios</em>';
  return edits
    .map(
      (e) =>
        `<div>[${e.index}] ` +
        (e.original ? `<span class="bad">${e.original}</span> → ` : '<em>(insertar)</em> ') +
        (e.corrected ? `<span class="add">${e.corrected}</span>` : '<em>(eliminar)</em>') +
        ` <span class="muted">(${e.type})</span></div>`
    )
    .join('');
}

// ── 2) Corregir todas las frases y medir ──────────────────────────────────────
$('btnRun').addEventListener('click', async () => {
  const btn = $('btnRun') as HTMLButtonElement;
  const comparePrefix = ($('comparePrefix') as HTMLInputElement).checked;
  const sentences = ($('sentences') as HTMLTextAreaElement).value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

  btn.disabled = true;
  const times: number[] = [];
  let differing = 0;

  let html =
    '<table><thead><tr><th>Original</th><th>Con prefijo</th>' +
    (comparePrefix ? '<th>Sin prefijo</th>' : '') +
    '<th>Edits (diff real)</th><th>ms</th></tr></thead><tbody>';

  try {
    for (const s of sentences) {
      log(`Corrigiendo: "${s}"`);
      const withP = await correct(s, true);
      times.push(withP.ms);

      let withoutCell = '';
      if (comparePrefix) {
        const withoutP = await correct(s, false);
        const same = withoutP.out === withP.out;
        if (!same) differing++;
        withoutCell = `<td>${withoutP.out}${same ? ' <span class="muted">(igual)</span>' : ' <strong>(distinto)</strong>'}</td>`;
      }

      html +=
        `<tr><td>${s}</td><td class="ok">${withP.out}</td>${withoutCell}` +
        `<td>${renderEdits(s, withP.out)}</td><td>${withP.ms.toFixed(0)}</td></tr>`;
    }
    html += '</tbody></table>';
    $('results').innerHTML = html;

    const avg = times.reduce((a, b) => a + b, 0) / (times.length || 1);
    const rows: Array<[string, string]> = [
      ['Modelo', DEFAULT_GRAMMAR_MODEL],
      ['Cuantización', ($('dtype') as HTMLSelectElement).value],
      ['Carga (s)', loadSeconds.toFixed(2)],
      ['Caché Δ (MB)', cacheDeltaMB.toFixed(1)],
      ['Frases', String(sentences.length)],
      ['Latencia media por frase (ms)', avg.toFixed(0)],
      ['Latencia máx (ms)', Math.max(...times).toFixed(0)],
    ];
    if (comparePrefix) {
      rows.push([
        'Frases donde el prefijo cambió el resultado',
        `${differing} de ${sentences.length}`,
      ]);
    }
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    rows.push(['Heap JS (MB)', heap ? (heap.usedJSHeapSize / 1048576).toFixed(0) : 'N/A']);

    $('summary').querySelector('tbody')!.innerHTML = rows
      .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
      .join('');

    log(`✔ Listo. Latencia media ${avg.toFixed(0)} ms/frase.`);
    if (comparePrefix) {
      log(`  El prefijo cambió el resultado en ${differing} de ${sentences.length} frases.`);
    }
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    btn.disabled = false;
  }
});

log('Listo. Paso 1: carga el modelo. Paso 2: corrige las frases.');
