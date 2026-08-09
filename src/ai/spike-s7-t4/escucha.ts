/**
 * S7-T4 · Panel de escucha a ciegas del sintetizador. Dueño: Isaac.
 *
 * POR QUÉ EXISTE: la vía automática (TTS → ASR) quedó no concluyente — fallaron 2 de
 * 5 palabras de control, así que no se puede separar cuánto de los 8 fallos es del
 * sintetizador y cuánto es sordera del reconocedor. Alejandro pidió una segunda vía
 * de escucha como control, y es la que decide.
 *
 * TRES DECISIONES DE DISEÑO, TODAS PARA QUE EL DATO VALGA
 *
 * 1. **A ciegas sobre el objetivo.** Si al oyente se le enseña la palabra antes de
 *    escuchar, la sugestión se la hace oír aunque esté mal pronunciada. Aquí escucha
 *    primero y escribe lo que oyó; la comparación la hace la página después. Es la
 *    diferencia entre "¿reconocés esta palabra?" (pregunta cargada) y "¿qué oíste?".
 *
 * 2. **A ciegas sobre el tipo.** Las 14 palabras trampa y las 5 de control van
 *    mezcladas en orden aleatorio, así que el oyente no sabe cuáles deberían salir
 *    bien. Sin eso, saber que una palabra es "de control" predispone a aprobarla.
 *
 * 3. **Mismo audio para los dos oyentes.** El sintetizador es estocástico: cada
 *    corrida produce audio distinto. Si cada oyente escuchara su propia síntesis
 *    estarían juzgando cosas diferentes y sus desacuerdos no significarían nada. Por
 *    eso los audios se generan una vez y se pueden descargar para el segundo oyente.
 *
 * REGLA DE DESACUERDO (de Alejandro, fijada antes de medir): si los dos oyentes no
 * coinciden en que una palabra está mal, cuenta como NO fallo. Si no hay acuerdo, no
 * está lo bastante mal como para justificar 216 MB de descarga adicional.
 *
 * Es código de medición, desechable, no forma parte del pipeline.
 */

import { SAMPLE_RATE } from '@shared/constants';
import { createTtsClient } from '../tts/ttsClient';
import { DEFAULT_TTS_CONFIG } from '../tts/ttsProtocol';
import {
  CARRIER_PHRASE,
  CONTROL_WORDS,
  TARGET_WORDS,
  isHit,
  normalize,
  present,
  type TargetWord,
} from './palabras';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const log = (m: string) => {
  const el = $('log');
  el.textContent += m + '\n';
  el.scrollTop = 1e9;
};

/** `cacheSize: 1` no aplica aquí: cada frase se sintetiza una sola vez. */
const tts = createTtsClient();

interface Item {
  target: TargetWord;
  kind: 'objetivo' | 'control';
  pcm: Float32Array;
  url: string;
  /** Lo que el oyente escribió. */
  heard: string;
}

let items: Item[] = [];

// ── Utilidades ───────────────────────────────────────────────────────────────

/** Codifica PCM a WAV de 16 bits, para reproducir y para descargar. */
function encodeWav(pcm: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  w(8, 'WAVE');
  w(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  w(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Mezcla la lista (Fisher-Yates).
 *
 * Es parte del cegado: si las de control fueran siempre las últimas cinco, el
 * oyente sabría cuáles "deberían" salir bien.
 */
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ── 1) Preparar los audios ───────────────────────────────────────────────────

$('btnPrep').addEventListener('click', async () => {
  const btn = $('btnPrep') as HTMLButtonElement;
  btn.disabled = true;
  const bar = $('bar') as HTMLProgressElement;

  try {
    log(`Cargando el sintetizador (${DEFAULT_TTS_CONFIG})…`);
    await tts.init((_, p) => (bar.value = p * 0.5));

    const todos: Array<{ target: TargetWord; kind: Item['kind'] }> = [
      ...TARGET_WORDS.map((t) => ({ target: t, kind: 'objetivo' as const })),
      ...CONTROL_WORDS.map((t) => ({ target: t, kind: 'control' as const })),
    ];
    const mezclados = shuffle(todos);

    log(`Sintetizando ${mezclados.length} frases…`);
    items = [];
    for (let i = 0; i < mezclados.length; i++) {
      const { target, kind } = mezclados[i];
      const pcm = await tts.speak(present(target.word, 'portadora'));
      items.push({
        target,
        kind,
        pcm,
        url: URL.createObjectURL(encodeWav(pcm, SAMPLE_RATE)),
        heard: '',
      });
      bar.value = 0.5 + (0.5 * (i + 1)) / mezclados.length;
      log(`  ${i + 1}/${mezclados.length}`);
    }

    renderItems();
    ($('btnReveal') as HTMLButtonElement).disabled = false;
    ($('btnWavs') as HTMLButtonElement).disabled = false;
    log('✔ Listos. Escuchá y escribí lo que oigas. No hay prisa.');
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? err.message : String(err)));
    btn.disabled = false;
  }
});

function renderItems() {
  const rows = items
    .map(
      (it, i) =>
        `<tr><td>${i + 1}</td>` +
        `<td><audio controls src="${it.url}"></audio></td>` +
        `<td><input type="text" id="heard-${i}" placeholder="¿qué palabra oíste?" autocomplete="off" /></td></tr>`
    )
    .join('');
  $('items').innerHTML =
    `<table><thead><tr><th>#</th><th>Audio</th><th>Lo que oíste</th></tr></thead>` +
    `<tbody>${rows}</tbody></table>`;
}

// ── 2) Revelar y calcular ────────────────────────────────────────────────────

$('btnReveal').addEventListener('click', () => {
  items.forEach((it, i) => {
    it.heard = ($(`heard-${i}`) as HTMLInputElement).value.trim();
  });

  const sinResponder = items.filter((it) => it.heard === '').length;
  if (sinResponder > 0) {
    log(`Nota: ${sinResponder} sin respuesta. Se cuentan como no reconocidas, que es lo que significan.`);
  }

  const evaluado = items.map((it) => ({ ...it, acierto: isHit(it.target, it.heard) }));
  const objetivo = evaluado.filter((e) => e.kind === 'objetivo');
  const control = evaluado.filter((e) => e.kind === 'control');
  const fallosObjetivo = objetivo.filter((e) => !e.acierto).length;
  const fallosControl = control.filter((e) => !e.acierto).length;

  const fila = (e: (typeof evaluado)[number]) =>
    `<tr><td>${e.target.word}</td><td class="muted">${e.kind}</td>` +
    `<td>${e.heard || '<em>(nada)</em>'}</td>` +
    `<td class="${e.acierto ? 'ok' : 'bad'}">${e.acierto ? 'ok' : 'FALLA'}</td></tr>`;

  $('results').innerHTML =
    '<table><thead><tr><th>Palabra objetivo</th><th>Tipo</th><th>Lo que oíste</th>' +
    `<th>Veredicto</th></tr></thead><tbody>${evaluado.map(fila).join('')}</tbody></table>`;

  $('verdict').innerHTML =
    `<p><strong>${fallosObjetivo} fallos de ${objetivo.length}</strong> palabras trampa · ` +
    `<strong>${fallosControl} de ${control.length}</strong> palabras de control.</p>` +
    (fallosControl > 0
      ? `<p class="bad">Con ${fallosControl} fallo(s) en control, parte del problema es del ` +
        'sintetizador incluso en palabras fáciles: es un dato en sí mismo, no ruido.</p>'
      : '<p class="ok">Control limpio: el sintetizador dice bien lo fácil, así que los fallos de arriba son suyos y no del oído.</p>') +
    '<p class="muted">Este es el veredicto de UN oyente. Hace falta un segundo, por ' +
    'separado y con los mismos audios. Los desacuerdos cuentan como no fallo.</p>';

  $('markdown').textContent = buildMarkdown(evaluado, fallosObjetivo, fallosControl);
  log(`✔ ${fallosObjetivo} fallos de ${objetivo.length} objetivo · ${fallosControl} de ${control.length} control.`);
});

function buildMarkdown(
  evaluado: Array<Item & { acierto: boolean }>,
  fallosObjetivo: number,
  fallosControl: number
): string {
  const nombre = ($('nombre') as HTMLInputElement).value.trim() || '(sin nombre)';
  const objetivo = evaluado.filter((e) => e.kind === 'objetivo');
  const control = evaluado.filter((e) => e.kind === 'control');

  return [
    `### Vía de escucha — oyente: ${nombre}`,
    '',
    `- Fecha: ${new Date().toISOString().slice(0, 10)}`,
    `- Sintetizador: MMS-TTS (\`${DEFAULT_TTS_CONFIG}\`), frase portadora \`${CARRIER_PHRASE}\``,
    '- A ciegas: el oyente escribió lo que oyó **antes** de ver la palabra objetivo, y',
    '  las palabras trampa y de control iban mezcladas en orden aleatorio.',
    '- Sin respuesta cuenta como no reconocida.',
    '',
    '| # | Palabra objetivo | Tipo | Lo que oyó | Veredicto |',
    '|---|---|---|---|---|',
    ...evaluado.map(
      (e, i) =>
        `| ${i + 1} | ${e.target.word} | ${e.kind} | ${normalize(e.heard) || '(nada)'} | ${e.acierto ? 'ok' : '**FALLA**'} |`
    ),
    '',
    `**${fallosObjetivo} fallos de ${objetivo.length} palabras trampa · ${fallosControl} de ${control.length} de control.**`,
    '',
    fallosControl > 0
      ? 'Que fallen palabras de control en la escucha (no en el reconocedor) significa que ' +
        'el sintetizador también falla en palabras comunes. Es un dato sobre el modelo, no ruido de la medida.'
      : 'Control limpio: los fallos son atribuibles al sintetizador, no al oído ni al reconocedor.',
    '',
    '> Veredicto de un solo oyente. La decisión necesita un segundo oyente por separado,',
    '> escuchando **los mismos audios**. Los desacuerdos cuentan como no fallo.',
  ].join('\n');
}

// ── 3) Descargar los audios para el segundo oyente ───────────────────────────

$('btnWavs').addEventListener('click', () => {
  // Se descargan uno a uno con el índice delante para conservar el orden mezclado:
  // el segundo oyente tiene que escuchar lo mismo y en el mismo orden, sin que el
  // nombre del archivo le revele cuál es la palabra objetivo.
  items.forEach((it, i) => {
    const a = document.createElement('a');
    a.href = it.url;
    a.download = `s7-t4-escucha-${String(i + 1).padStart(2, '0')}.wav`;
    a.click();
  });
  log('Descargando los audios. El segundo oyente debe usar EXACTAMENTE estos.');
  log('La correspondencia número → palabra está en el markdown de abajo: no se la muestres antes de que escuche.');
});

log('Listo. Escribí tu nombre y preparás los audios.');
