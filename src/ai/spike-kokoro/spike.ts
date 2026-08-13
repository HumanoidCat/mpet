/**
 * D-12 · Evaluar Kokoro con el mismo banco. Dueño: Isaac.
 *
 * QUÉ DECIDE: si vale la pena pedir el `shared-change` que Alejandro dejó diferido.
 * Su condición fue explícita — evaluar Kokoro **con el mismo banco** que se usó para
 * medir MMS-TTS, para que los dos números signifiquen lo mismo. Por eso este spike
 * importa las palabras, la frase portadora y el criterio de acierto de
 * `spike-s7-t4/palabras.ts` en vez de definir los suyos.
 *
 * POR QUÉ NO TOCA `package.json`
 * `kokoro-js` se carga desde un CDN, exactamente como se hizo con transformers.js en
 * el spike S1-T7 cuando esa dependencia todavía no estaba aprobada. Medir primero,
 * pedir después: si el resultado no justifica los megabytes, no se pide nada.
 *
 * DOS DIFERENCIAS CON MMS-TTS QUE HAY QUE MANEJAR
 *   1. **Sale a 24 kHz**, no a 16. Hay que remuestrear antes de dárselo al
 *      reconocedor. No se escribe remuestreo nuevo: se usa `resample()` del módulo de
 *      audio, que ya lo resuelve con filtro antisolapamiento y tiene sus pruebas.
 *      (Alejandro lo señaló al revisar la propuesta y tenía razón.)
 *   2. **Puede ser determinista.** MMS-TTS muestrea ruido, y eso costaba la mitad de
 *      la escala del puntaje de pronunciación (el suelo de 49.5 medido en R03). Si
 *      Kokoro devuelve siempre el mismo audio, ese suelo desaparece — así que se
 *      comprueba aquí, porque es media decisión por sí solo.
 *
 * LIMITACIÓN DEL MONTAJE: el paquete del CDN trae su propia copia de
 * transformers.js, así que en esta página conviven dos. Gasta memoria y no representa
 * lo que pasaría en producción, donde npm las unificaría. No afecta a lo que se mide
 * —calidad de pronunciación y determinismo— pero sí invalida cualquier medida de
 * memoria total.
 *
 * Es un spike: código desechable.
 */

import { resample } from '@audio/dsp/resampler';
import { SAMPLE_RATE } from '@shared/constants';
import { createAsrClient } from '../asr/asrClient';
import {
  CONTROL_WORDS,
  PADDING_SECONDS,
  TARGET_WORDS,
  isHit,
  normalize,
  present,
  type TargetWord,
} from '../spike-s7-t4/palabras';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const log = (m: string) => {
  const el = $('log');
  el.textContent += m + '\n';
  el.scrollTop = 1e9;
};

const MODELO = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const CDN = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';

/** Lo que devuelve `tts.generate()`: audio y su frecuencia. */
interface AudioKokoro {
  audio: Float32Array;
  sampling_rate: number;
}

interface Kokoro {
  generate(texto: string, opciones: { voice: string }): Promise<AudioKokoro>;
  list_voices?: () => unknown;
}

let tts: Kokoro | null = null;
let cacheMB = 0;
let cargaSegundos = 0;
const asr = createAsrClient();

// Voces americanas: el proyecto enseña inglés estadounidense y el reconocedor es
// `whisper-tiny.en`. Mezclar acentos metería una variable que no queremos medir.
const VOCES = ['af_heart', 'af_bella', 'am_michael', 'am_adam'];
const voiceSelect = $('voice') as HTMLSelectElement;
voiceSelect.innerHTML = VOCES.map((v) => `<option value="${v}">${v}</option>`).join('');

/** Rodea de silencio, igual que en el conteo de MMS-TTS, para que Whisper no lo descarte. */
function pad(pcm: Float32Array): Float32Array {
  const n = Math.round(PADDING_SECONDS * SAMPLE_RATE);
  const out = new Float32Array(n + pcm.length + n);
  out.set(pcm, n);
  return out;
}

/**
 * Sintetiza y devuelve PCM a 16 kHz, listo para el reconocedor.
 *
 * El remuestreo es la única diferencia de tratamiento respecto a MMS-TTS, y es
 * obligatoria: Kokoro sale a 24 kHz y todo el proyecto trabaja a 16.
 */
async function sintetizar(texto: string): Promise<Float32Array> {
  const salida = await tts!.generate(texto, { voice: voiceSelect.value });
  const pcm = salida.audio;
  return salida.sampling_rate === SAMPLE_RATE
    ? pcm
    : resample(pcm, salida.sampling_rate, SAMPLE_RATE);
}

// ── 1) Cargar ────────────────────────────────────────────────────────────────

$('btnLoad').addEventListener('click', async () => {
  const btn = $('btnLoad') as HTMLButtonElement;
  btn.disabled = true;

  try {
    const dtype = ($('dtype') as HTMLSelectElement).value;
    const antes = (await navigator.storage.estimate()).usage ?? 0;

    log(`Cargando kokoro-js desde CDN…`);
    // `@vite-ignore` porque la URL es externa y Vite no debe intentar resolverla.
    const mod = (await import(/* @vite-ignore */ CDN)) as {
      KokoroTTS: {
        from_pretrained(id: string, opts: { dtype: string }): Promise<Kokoro>;
      };
    };

    log(`Cargando ${MODELO} (${dtype})…`);
    const t0 = performance.now();
    tts = await mod.KokoroTTS.from_pretrained(MODELO, { dtype });
    cargaSegundos = (performance.now() - t0) / 1000;

    const despues = (await navigator.storage.estimate()).usage ?? 0;
    cacheMB = Math.max(0, (despues - antes) / 1048576);

    log(`✔ Kokoro cargado en ${cargaSegundos.toFixed(2)} s · almacenamiento Δ ≈ ${cacheMB.toFixed(1)} MiB`);

    log('Cargando el reconocedor…');
    await asr.init();
    log('✔ Listo.');

    ($('btnDeterminismo') as HTMLButtonElement).disabled = false;
    ($('btnBanco') as HTMLButtonElement).disabled = false;
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? `${err.name}: ${err.message}` : String(err)));
    btn.disabled = false;
  }
});

// ── 2) Determinismo ──────────────────────────────────────────────────────────

let esDeterminista: boolean | null = null;

$('btnDeterminismo').addEventListener('click', async () => {
  const btn = $('btnDeterminismo') as HTMLButtonElement;
  btn.disabled = true;
  try {
    const frase = 'I need a new ship';
    log(`Sintetizando "${frase}" dos veces…`);
    const a = await sintetizar(frase);
    const b = await sintetizar(frase);

    let maxDif = 0;
    const mismaLongitud = a.length === b.length;
    if (mismaLongitud) {
      for (let i = 0; i < a.length; i++) maxDif = Math.max(maxDif, Math.abs(a[i] - b[i]));
    }
    esDeterminista = mismaLongitud && maxDif === 0;

    $('determinismo').innerHTML = esDeterminista
      ? `<p class="ok">✔ Determinista: ${a.length} muestras las dos veces, idénticas. ` +
        'El suelo de 49.5 que MMS-TTS impone al puntaje de pronunciación desaparece.</p>'
      : `<p class="bad">✘ No determinista: ${a.length} contra ${b.length} muestras` +
        (mismaLongitud ? `, diferencia máxima ${maxDif.toExponential(2)}` : '') +
        '. Arrastra el mismo problema que MMS-TTS.</p>';

    log(esDeterminista ? '  ✔ determinista' : '  ✘ no determinista');
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    btn.disabled = false;
  }
});

// ── 3) El banco ──────────────────────────────────────────────────────────────

interface Fila {
  target: TargetWord;
  tipo: 'objetivo' | 'control';
  oido: string;
  acierto: boolean;
}

let filas: Fila[] = [];

$('btnBanco').addEventListener('click', async () => {
  const btn = $('btnBanco') as HTMLButtonElement;
  btn.disabled = true;
  filas = [];

  try {
    const lista: Array<{ t: TargetWord; tipo: Fila['tipo'] }> = [
      ...CONTROL_WORDS.map((t) => ({ t, tipo: 'control' as const })),
      ...TARGET_WORDS.map((t) => ({ t, tipo: 'objetivo' as const })),
    ];

    for (const { t, tipo } of lista) {
      const pcm = await sintetizar(present(t.word, 'portadora'));
      const { text } = await asr.transcribe(pad(pcm));
      const acierto = isHit(t, text);
      filas.push({ target: t, tipo, oido: text, acierto });
      log(`  ${t.word} → "${normalize(text)}" ${acierto ? '✔' : '✘'}`);
    }

    render();
    log('✔ Banco completo.');
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? err.message : String(err)));
  } finally {
    btn.disabled = false;
  }
});

function render() {
  const objetivo = filas.filter((f) => f.tipo === 'objetivo');
  const control = filas.filter((f) => f.tipo === 'control');
  const fallosObjetivo = objetivo.filter((f) => !f.acierto).length;
  const fallosControl = control.filter((f) => !f.acierto).length;

  $('resultados').innerHTML =
    '<table><thead><tr><th>Palabra</th><th>Tipo</th><th>Lo que entendió el ASR</th>' +
    '<th>Veredicto</th></tr></thead><tbody>' +
    filas
      .map(
        (f) =>
          `<tr><td>${f.target.word}</td><td class="muted">${f.tipo}</td>` +
          `<td>${normalize(f.oido) || '<em>(nada)</em>'}</td>` +
          `<td class="${f.acierto ? 'ok' : 'bad'}">${f.acierto ? 'ok' : 'FALLA'}</td></tr>`
      )
      .join('') +
    '</tbody></table>';

  // La comparación que decide. Los números de MMS-TTS salen de
  // docs/evidencias/s7/s7-t4-pronunciacion-tts.md, con este mismo banco y método.
  const MMS_FALLOS_OBJETIVO = 8; // vía automática, una repetición equivalente
  const MMS_FALLOS_CONTROL = 2;

  $('verdict').innerHTML =
    `<p><strong>Kokoro: ${fallosObjetivo} fallos de ${objetivo.length}</strong> palabras trampa · ` +
    `<strong>${fallosControl} de ${control.length}</strong> de control.</p>` +
    `<p class="muted">MMS-TTS en el mismo banco: ${MMS_FALLOS_OBJETIVO} de 14 y ` +
    `${MMS_FALLOS_CONTROL} de 5.</p>` +
    (fallosControl === 0
      ? '<p class="ok">✔ Control limpio: dice bien las palabras comunes, que es donde ' +
        'MMS-TTS fallaba (<em>water</em>, <em>book</em>) y por lo que curar las frases ' +
        'de práctica dejó de ser una salida.</p>'
      : `<p class="bad">✘ Falla ${fallosControl} palabra(s) de control: arrastra el mismo ` +
        'problema de fondo que MMS-TTS.</p>') +
    (esDeterminista === null
      ? '<p class="muted">Falta la prueba de determinismo.</p>'
      : esDeterminista
        ? '<p class="ok">✔ Y es determinista: resuelve además el suelo del puntaje (R03).</p>'
        : '<p class="bad">✘ No es determinista: no resuelve el suelo del puntaje (R03).</p>');

  $('markdown').textContent = [
    '### D-12 · Kokoro con el mismo banco',
    '',
    `- Fecha: ${new Date().toISOString().slice(0, 10)}`,
    `- Modelo: \`${MODELO}\` (${($('dtype') as HTMLSelectElement).value}), voz ${voiceSelect.value}`,
    `- Cargado desde CDN, sin tocar \`package.json\`. Carga ${cargaSegundos.toFixed(2)} s · almacenamiento Δ ≈ ${cacheMB.toFixed(1)} MiB`,
    '- Mismo banco, misma frase portadora y mismo criterio de acierto que el conteo de',
    '  MMS-TTS. Remuestreado de 24 kHz a 16 kHz con `resample()` del módulo de audio.',
    '',
    '| Palabra | Tipo | Lo que entendió el ASR | Veredicto |',
    '|---|---|---|---|',
    ...filas.map(
      (f) =>
        `| ${f.target.word} | ${f.tipo} | ${normalize(f.oido) || '(nada)'} | ${f.acierto ? 'ok' : '**FALLA**'} |`
    ),
    '',
    `**Kokoro: ${fallosObjetivo} de ${objetivo.length} trampa · ${fallosControl} de ${control.length} control.**`,
    `**MMS-TTS en el mismo banco: ${MMS_FALLOS_OBJETIVO} de 14 · ${MMS_FALLOS_CONTROL} de 5.**`,
    '',
    esDeterminista === null
      ? 'Determinismo: sin medir.'
      : esDeterminista
        ? 'Determinista: dos síntesis del mismo texto son idénticas muestra a muestra, así que el suelo de 49.5 que MMS-TTS impone al puntaje (R03) desaparece.'
        : 'No determinista: arrastra el mismo suelo que MMS-TTS en el puntaje de pronunciación.',
    '',
    '#### Limitaciones',
    '',
    '- Una sola repetición por palabra, frente a las tres del conteo de MMS-TTS. Si el',
    '  modelo es determinista, repetir no aporta; si no lo es, hay que repetir.',
    '- El paquete del CDN trae su propia copia de transformers.js, así que cualquier',
    '  medida de memoria de esta página no representa producción.',
    '- El almacenamiento se mide con `navigator.storage.estimate()`, que el navegador',
    '  redondea a propósito.',
  ].join('\n');
}

log('Listo. Paso 1: cargar. Paso 2: determinismo. Paso 3: el banco.');
