/**
 * S7-T4 · Conteo automático de fallos de pronunciación del TTS. Dueño: Isaac.
 *
 * QUÉ MIDE Y POR QUÉ ASÍ
 * El spike S4-T5 detectó de oído que MMS-TTS pronuncia mal *vegetables*. Eso es una
 * observación, no una medición: no se puede defender ante el profesor ni sirve para
 * decidir si vale la pena pagar 216 MB extra por otro modelo. Alejandro pidió un
 * procedimiento, y este es la vía objetiva:
 *
 *     texto → TTS (MMS-TTS) → PCM 16 kHz → ASR (Whisper-tiny.en) → texto reconocido
 *
 * Si nuestro propio reconocedor no recupera la palabra que el sintetizador intentó
 * decir, la pronunciación es defectuosa. La ventaja sobre escuchar es que se puede
 * volver a correr cuando se quiera y no depende del oído de nadie.
 *
 * VENTAJA DE FONDO: este es exactamente el camino que recorre el comparador de
 * pronunciación de Fabrizio, así que el defecto se mide donde de verdad duele.
 *
 * LIMITACIÓN DECLARADA: el reconocedor tiene su propia tasa de error, así que un
 * fallo podría venir de él. Por eso se miden primero cinco palabras de control sin
 * trampas: si esas fallan, el conteo queda invalidado y hay que fiarse solo de la
 * escucha. Es la razón por la que esta vía no sustituye a la subjetiva, la controla.
 *
 * USA LOS CLIENTES REALES de producción (`ttsClient`, `asrClient`), no copias: lo que
 * se mide es lo que va a usar la aplicación.
 */

import { createAsrClient } from '../asr/asrClient';
import { createTtsClient } from '../tts/ttsClient';
import { DEFAULT_TTS_CONFIG } from '../tts/ttsProtocol';
import {
  CARRIER_PHRASE,
  CONTROL_WORDS,
  PADDING_SECONDS,
  RENDITIONS,
  REPETITION_RULE,
  TARGET_WORDS,
  isHit,
  normalize,
  present,
  type PresentationMode,
  type TargetWord,
} from './palabras';
import { SAMPLE_RATE } from '@shared/constants';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const log = (m: string) => {
  const el = $('log');
  el.textContent += m + '\n';
  el.scrollTop = 1e9;
};

/**
 * `cacheSize: 1` NO es un ahorro de memoria: es lo que hace válida la medición.
 *
 * El cliente de TTS guarda el audio por frase para que la referencia sea estable
 * (ver `pcmCache.ts`). Aquí necesitamos justo lo contrario: tres síntesis
 * INDEPENDIENTES de cada palabra, porque el modelo es estocástico y una sola podría
 * salir por casualidad buena o mala. Con capacidad 1, al recorrer la lista entera
 * antes de repetir, cada palabra ya fue desalojada y se sintetiza de nuevo de verdad.
 */
const tts = createTtsClient({ cacheSize: 1 });
const asr = createAsrClient();

interface WordResult {
  target: TargetWord;
  transcriptions: string[];
  hits: number;
  failed: boolean;
}

// ── 1) Cargar los dos modelos ────────────────────────────────────────────────

$('btnInit').addEventListener('click', async () => {
  const btn = $('btnInit') as HTMLButtonElement;
  btn.disabled = true;
  const bar = $('bar') as HTMLProgressElement;

  try {
    log(`Cargando TTS (${DEFAULT_TTS_CONFIG})…`);
    // Los dos modelos se cargan en secuencia, igual que en `createAIPipeline`: en
    // paralelo dispararían el pico de memoria.
    await tts.init((model, p) => {
      bar.value = p / 2;
      if (p === 1) log(`  ✔ ${model}`);
    });

    log('Cargando ASR (Whisper-tiny.en)…');
    await asr.init((model, p) => {
      bar.value = 0.5 + p / 2;
      if (p === 1) log(`  ✔ ${model}`);
    });

    log('✔ Los dos modelos listos.');
    ($('btnRun') as HTMLButtonElement).disabled = false;
  } catch (err) {
    log('⚠ Error cargando: ' + (err instanceof Error ? `${err.name}: ${err.message}` : String(err)));
    btn.disabled = false;
  }
});

// ── 2) El ciclo de medición ──────────────────────────────────────────────────

/**
 * Rodea el audio de silencio.
 *
 * Sin esto, Whisper devolvía `[blank_audio]` en los recortes más cortos: su detector
 * de voz descartaba el fragmento entero antes de intentar transcribirlo.
 */
function pad(pcm: Float32Array): Float32Array {
  const n = Math.round(PADDING_SECONDS * SAMPLE_RATE);
  const out = new Float32Array(n + pcm.length + n);
  out.set(pcm, n);
  return out;
}

/** Sintetiza una palabra y devuelve lo que el reconocedor entendió. */
async function roundTrip(word: string, mode: PresentationMode): Promise<string> {
  const pcm = await tts.speak(present(word, mode));
  const { text } = await asr.transcribe(pad(pcm));
  return text;
}

/**
 * Recorre la lista completa `RENDITIONS` veces en vez de repetir cada palabra
 * seguida. Es a propósito: así la caché de tamaño 1 ya desalojó la palabra cuando
 * le vuelve a tocar, y las tres síntesis son independientes.
 */
async function measure(
  words: readonly TargetWord[],
  label: string,
  mode: PresentationMode,
  passes: number = RENDITIONS
): Promise<WordResult[]> {
  const results: WordResult[] = words.map((target) => ({
    target,
    transcriptions: [],
    hits: 0,
    failed: false,
  }));

  for (let pass = 1; pass <= passes; pass++) {
    log(`— ${label}: repetición ${pass} de ${passes} —`);
    for (const r of results) {
      const heard = await roundTrip(r.target.word, mode);
      r.transcriptions.push(heard);
      const hit = isHit(r.target, heard);
      if (hit) r.hits++;
      log(`  "${r.target.word}" → "${normalize(heard)}" ${hit ? '✔' : '✘'}`);
    }
  }

  // La regla de veredicto se fijó antes de medir (ver `palabras.ts`).
  for (const r of results) r.failed = r.hits < Math.ceil(passes / 2);
  return results;
}

$('btnRun').addEventListener('click', async () => {
  const btn = $('btnRun') as HTMLButtonElement;
  btn.disabled = true;

  try {
    // PASO 1 — validar el método antes de usarlo. El protocolo original pedía
    // palabras aisladas; una corrida previa mostró que así falla hasta el control,
    // así que aquí se deja constancia de ambos modos en vez de cambiarlo en silencio.
    log('=== PASO 1: ¿sirve el método? Control con la palabra AISLADA ===');
    const controlAislada = await measure(CONTROL_WORDS, 'control aislada', 'aislada', 1);
    renderTable('controlIsolatedResults', controlAislada);
    const failsAislada = controlAislada.filter((r) => r.failed).length;
    log(`  → ${failsAislada} de ${controlAislada.length} palabras fáciles fallaron con la palabra sola.`);

    log(`=== PASO 2: control con frase portadora ("${CARRIER_PHRASE}") ===`);
    const control = await measure(CONTROL_WORDS, 'control portadora', 'portadora');
    renderTable('controlResults', control);

    const controlFails = control.filter((r) => r.failed).length;
    if (controlFails > 0) {
      log(`⚠ ${controlFails} de ${control.length} palabras de control fallaron también con portadora.`);
      log('  La medición automática NO es concluyente: manda la escucha.');
    } else {
      log('✔ Control limpio: el reconocedor recupera lo fácil, así que lo que falle abajo es del TTS.');
    }

    log('=== PASO 3: las 14 palabras objetivo ===');
    const targets = await measure(TARGET_WORDS, 'objetivo', 'portadora');
    renderTable('results', targets);

    renderVerdict(targets, control);
    $('markdown').textContent = buildMarkdown(targets, control, controlAislada);
    log('✔ Conteo terminado. El markdown de la evidencia está listo abajo.');
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? `${err.name}: ${err.message}` : String(err)));
  } finally {
    btn.disabled = false;
  }
});

// ── 3) Presentación ──────────────────────────────────────────────────────────

function renderTable(containerId: string, results: WordResult[]) {
  const rows = results
    .map(
      (r) =>
        `<tr><td><strong>${r.target.word}</strong></td>` +
        `<td class="muted">${r.target.trap}</td>` +
        `<td>${r.transcriptions.map((t) => `"${normalize(t)}"`).join('<br>')}</td>` +
        `<td>${r.hits}/${RENDITIONS}</td>` +
        `<td class="${r.failed ? 'bad' : 'ok'}">${r.failed ? 'FALLA' : 'ok'}</td></tr>`
    )
    .join('');
  $(containerId).innerHTML =
    '<table><thead><tr><th>Palabra</th><th>Qué prueba</th><th>Lo que entendió el ASR</th>' +
    `<th>Aciertos</th><th>Veredicto</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/** Traduce el conteo a la decisión que ya estaba pactada. */
function decisionFor(fails: number): string {
  if (fails <= 2) return 'Se queda MMS-TTS. Se documenta como limitación conocida.';
  if (fails <= 4)
    return 'No se cambia de modelo: se curan las frases de práctica para evitar las palabras que falla, y se documenta el criterio.';
  return 'Se abre el `shared-change` de Kokoro, y siempre junto con la carga bajo demanda del TTS.';
}

function renderVerdict(targets: WordResult[], control: WordResult[]) {
  const fails = targets.filter((r) => r.failed).length;
  const controlFails = control.filter((r) => r.failed).length;

  const invalid =
    controlFails > 0
      ? `<p class="bad">⚠ ${controlFails} de ${control.length} palabras de CONTROL fallaron. ` +
        'Parte de los fallos de abajo pueden ser del reconocedor y no del sintetizador: ' +
        'este conteo no es concluyente por sí solo y manda la escucha.</p>'
      : '<p class="ok">✔ Control limpio: el conteo es atribuible al sintetizador.</p>';

  $('verdict').innerHTML =
    invalid +
    `<p><strong>${fails} fallos de ${targets.length}</strong> palabras objetivo.</p>` +
    `<p>Según el umbral fijado antes de medir: <strong>${decisionFor(fails)}</strong></p>`;
}

/** Arma el documento de evidencia con los datos reales, no a mano después. */
function buildMarkdown(
  targets: WordResult[],
  control: WordResult[],
  controlAislada: WordResult[]
): string {
  const fails = targets.filter((r) => r.failed).length;
  const controlFails = control.filter((r) => r.failed).length;
  const failsAislada = controlAislada.filter((r) => r.failed).length;
  const row = (r: WordResult) =>
    `| ${r.target.word} | ${r.target.trap} | ${r.transcriptions.map((t) => `"${normalize(t)}"`).join(' · ')} | ${r.hits}/${r.transcriptions.length} | ${r.failed ? '**FALLA**' : 'ok' } |`;

  return [
    '### Vía objetiva: TTS → ASR (automática y reproducible)',
    '',
    `- Fecha de la corrida: ${new Date().toISOString().slice(0, 10)}`,
    `- Sintetizador: MMS-TTS (\`${DEFAULT_TTS_CONFIG}\`) · Reconocedor: Whisper-tiny.en q8`,
    `- Repeticiones por palabra: ${RENDITIONS}. ${REPETITION_RULE}`,
    `- Silencio añadido alrededor de cada audio: ${PADDING_SECONDS} s.`,
    '',
    '#### Corrección del método, con su evidencia',
    '',
    'El protocolo pedía medir con la **palabra aislada**, para que el reconocedor no',
    'pudiera apoyarse en el contexto. Al ejecutarlo, ese método resultó inválido:',
    '',
    '| Palabra de control | Qué prueba | Lo que entendió el ASR | Aciertos | Veredicto |',
    '|---|---|---|---|---|',
    ...controlAislada.map(row),
    '',
    `**${failsAislada} de ${controlAislada.length} palabras fáciles fallaron con la palabra sola.**`,
    'No es culpa del sintetizador: Whisper está entrenado con habla continua y un',
    'recorte de medio segundo no le da contexto acústico; en algunos casos ni siquiera',
    'lo considera voz y devuelve `[blank_audio]`.',
    '',
    `Se sustituye por una **frase portadora** fija: \`${CARRIER_PHRASE}\`. Es la técnica`,
    'estándar en fonética para este problema: da contexto acústico —duración,',
    'entonación, algo antes y después— sin que el contexto permita adivinar la palabra',
    'objetivo, porque en ese hueco cabe cualquiera.',
    '',
    '**Sesgo que introduce, declarado:** algo de contexto lingüístico queda, así que el',
    'reconocedor podría recuperar una palabra mal pronunciada y el conteo quedaría por',
    'debajo del real. El sesgo empuja hacia "no cambiar de modelo", que es la dirección',
    'conservadora: no sirve para justificar gastar 216 MB, sí para descartarlo.',
    '',
    '#### Control',
    '',
    '| Palabra | Qué prueba | Lo que entendió el ASR | Aciertos | Veredicto |',
    '|---|---|---|---|---|',
    ...control.map(row),
    '',
    controlFails === 0
      ? `Control limpio (${control.length}/${control.length}): los fallos de la tabla siguiente son atribuibles al sintetizador.`
      : `⚠ ${controlFails} de ${control.length} palabras de control fallaron: parte de los fallos podrían venir del reconocedor. El conteo no es concluyente por sí solo.`,
    '',
    '#### Palabras objetivo',
    '',
    '| Palabra | Qué prueba | Lo que entendió el ASR | Aciertos | Veredicto |',
    '|---|---|---|---|---|',
    ...targets.map(row),
    '',
    `**Resultado: ${fails} fallos de ${targets.length}.**`,
    '',
    `Decisión que dispara el umbral pactado de antemano: ${decisionFor(fails)}`,
    '',
    '#### Limitaciones de esta vía',
    '',
    '- El reconocedor tiene su propia tasa de error; por eso el control.',
    '- La frase portadora deja algo de contexto: el conteo puede quedar por debajo del real.',
    '- Whisper-tiny es el modelo más pequeño de la familia y falla con nombres propios',
    '  y palabras raras, según se midió en el spike S1-T7.',
    '- El sintetizador es estocástico: cada corrida produce audio distinto, así que el',
    '  conteo puede variar en ±1. Repetir la corrida es barato y conviene hacerlo.',
  ].join('\n');
}

log('Listo. Paso 1: cargar los modelos. Paso 2: ejecutar el conteo.');
log(`Regla de veredicto fijada de antemano: ${REPETITION_RULE}`);
