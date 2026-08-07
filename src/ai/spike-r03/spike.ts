/**
 * R03 · ¿Discrimina el comparador cuando el contenido está garantizado? Dueño: Isaac.
 *
 * DE DÓNDE SALE ESTE EXPERIMENTO
 * La calibración con voz real (S9-T3, Fabrizio) midió una separación de 1.05 donde
 * RF-10 exige 20, y descartó que el comparador esté roto: una toma contra sí misma da
 * 0.00 y desfasada 10 ms da 8.71. Quedó una hipótesis sin verificar — que los tramos
 * comparados **no contienen el mismo contenido**, porque cada archivo tiene varias
 * tomas y el detector de habla las parte por pausas. No se pudo comprobar porque hacía
 * falta escuchar las grabaciones.
 *
 * QUÉ APORTA ESTO QUE LA CALIBRACIÓN NO PODÍA
 * Audio sintetizado en vez de grabado: emisiones completas, sin pausas intermedias, y
 * con el contenido exacto conocido de antemano. Eso saca la segmentación de la
 * ecuación. Si el comparador tampoco discrimina en estas condiciones, el problema no
 * es cómo se parten las grabaciones.
 *
 * ADEMÁS MIDE ALGO QUE SOLO SE VE DESDE MI MÓDULO: el sintetizador es estocástico, así
 * que dos síntesis del mismo texto no son idénticas. Ese "suelo" es el mínimo que
 * cualquier comparación va a arrastrar cuando la referencia venga del TTS, y hasta hoy
 * nadie lo había cuantificado.
 *
 * IMPORTA: este spike **lee** código de otros módulos (el motor DSP de Alejandro y el
 * comparador de Fabrizio) para medir el camino real de la aplicación. No los modifica.
 * Es código de medición, desechable.
 */

import { createDspAudioEngine } from '@core/audioEngineAdapter';
import { createPronunciationScorer } from '@audio/comparator/scorer';
import type { AudioFrame, WordAlign } from '@shared/contracts';
import { createTtsClient } from '../tts/ttsClient';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const log = (m: string) => {
  const el = $('log');
  el.textContent += m + '\n';
  el.scrollTop = 1e9;
};

/**
 * `cacheSize: 1` es lo que permite medir el suelo.
 *
 * El cliente guarda el audio por frase para que la referencia sea estable dentro de
 * una sesión. Aquí se necesita lo contrario: dos síntesis INDEPENDIENTES del mismo
 * texto. Con capacidad 1, pedir otra frase en medio desaloja la anterior.
 */
const tts = createTtsClient({ cacheSize: 1 });
const engine = createDspAudioEngine();
const scorer = createPronunciationScorer();

const FRASE = 'I need a new ship';
const PAR_MINIMO = 'I need a new sheep';
const DISTINTA = 'The weather is nice today';

interface Medicion {
  etiqueta: string;
  papel: string;
  distancia: number;
  puntaje: number;
}

/**
 * Analiza el PCM con la MISMA cadena que usa la aplicación.
 *
 * Sin `conditioned: true` a propósito: el acondicionamiento (filtro de voz,
 * normalización) forma parte del camino real, y el comparador exige que las dos
 * señales hayan recorrido la misma cadena.
 */
const analizar = (pcm: Float32Array): Promise<AudioFrame[]> => engine.analyze(pcm);

/**
 * Puntúa dos audios como lo hace la aplicación.
 *
 * `words` cubre la emisión entera en vez de palabra por palabra: aquí interesa la
 * distancia global, que es la magnitud que la calibración de Fabrizio comparó.
 */
async function comparar(
  etiqueta: string,
  papel: string,
  usuario: Float32Array,
  referencia: Float32Array
): Promise<Medicion> {
  const [framesUsuario, framesReferencia] = await Promise.all([
    analizar(usuario),
    analizar(referencia),
  ]);

  const duracion = usuario.length / 16000;
  const words: WordAlign[] = [{ word: 'todo', start: 0, end: duracion }];
  const r = await scorer.score(framesUsuario, framesReferencia, words);

  log(`  ${etiqueta}: distancia ${r.dtwDistance.toFixed(2)} · puntaje ${r.overall.toFixed(1)}`);
  return { etiqueta, papel, distancia: r.dtwDistance, puntaje: r.overall };
}

$('btnRun').addEventListener('click', async () => {
  const btn = $('btnRun') as HTMLButtonElement;
  btn.disabled = true;

  try {
    log('Cargando el sintetizador…');
    await tts.init((_, p) => {
      if (p === 1) log('  ✔ listo');
    });

    // El orden importa: la caché tiene capacidad 1, así que pedir PAR_MINIMO en medio
    // garantiza que la segunda síntesis de FRASE se genere de nuevo y no salga de la
    // caché. Si saliera de caché, el "suelo" mediría 0 y no diría nada.
    log('Sintetizando…');
    const fraseA = await tts.speak(FRASE);
    const parMinimo = await tts.speak(PAR_MINIMO);
    const distinta = await tts.speak(DISTINTA);
    const fraseB = await tts.speak(FRASE); // segunda rendición, independiente

    log(`  "${FRASE}" toma A: ${fraseA.length} muestras`);
    log(`  "${FRASE}" toma B: ${fraseB.length} muestras`);
    if (fraseA.length === fraseB.length) {
      log('  ⚠ misma longitud: puede que la caché no se haya desalojado');
    }

    log('Comparando…');
    const mediciones: Medicion[] = [
      await comparar('Toma A contra sí misma', 'control de cordura', fraseA, fraseA),
      await comparar('Mismo texto, dos síntesis', 'suelo', fraseA, fraseB),
      await comparar('ship contra sheep', 'lo que hay que detectar', fraseA, parMinimo),
      await comparar('Frase completamente distinta', 'techo', fraseA, distinta),
    ];

    render(mediciones);
    log('✔ Listo.');
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? `${err.name}: ${err.message}` : String(err)));
  } finally {
    btn.disabled = false;
  }
});

function render(m: Medicion[]) {
  const [control, suelo, parMinimo, techo] = m;

  $('results').innerHTML =
    '<table><thead><tr><th>Comparación</th><th>Papel</th><th>Distancia DTW</th>' +
    '<th>Puntaje</th></tr></thead><tbody>' +
    m
      .map(
        (x) =>
          `<tr><td>${x.etiqueta}</td><td class="muted">${x.papel}</td>` +
          `<td>${x.distancia.toFixed(2)}</td><td>${x.puntaje.toFixed(1)}</td></tr>`
      )
      .join('') +
    '</tbody></table>';

  // La pregunta del experimento: ¿el par mínimo queda más lejos que el suelo, y
  // cuánto? Si el margen es estrecho, el comparador no puede distinguir un error de
  // pronunciación de la variación normal entre dos emisiones del mismo texto.
  const margen = parMinimo.distancia - suelo.distancia;
  const factor = suelo.distancia > 0 ? parMinimo.distancia / suelo.distancia : Infinity;
  const separacionPuntaje = suelo.puntaje - parMinimo.puntaje;

  const discrimina = separacionPuntaje >= 20;

  $('verdict').innerHTML =
    `<p>Suelo (mismo texto, dos síntesis): <strong>${suelo.distancia.toFixed(2)}</strong> · ` +
    `Par mínimo: <strong>${parMinimo.distancia.toFixed(2)}</strong> · ` +
    `Margen: <strong>${margen.toFixed(2)}</strong> (factor ${factor.toFixed(2)}×)</p>` +
    `<p>En puntaje, la diferencia entre pronunciar bien y cambiar un fonema es de ` +
    `<strong>${separacionPuntaje.toFixed(1)} puntos</strong>. RF-10 exige 20.</p>` +
    (discrimina
      ? '<p class="ok">✔ El comparador SÍ discrimina con contenido controlado. ' +
        'Entonces el problema de la calibración está en el material o en la segmentación, ' +
        'no en el comparador — y acotar por los timestamps del reconocedor debería arreglarlo.</p>'
      : '<p class="bad">✘ El comparador NO discrimina ni siquiera con contenido controlado, ' +
        'emisiones completas y sin segmentación de por medio. El problema no es cómo se ' +
        'parten las grabaciones: está en las características o en la distancia.</p>') +
    `<p class="muted">Control de cordura (toma contra sí misma): ${control.distancia.toFixed(2)}, ` +
    `debería ser 0. Techo (frase distinta): ${techo.distancia.toFixed(2)}.</p>`;

  $('markdown').textContent = [
    '### R03 · El comparador con contenido garantizado',
    '',
    `- Fecha: ${new Date().toISOString().slice(0, 10)}`,
    '- Audio **sintetizado** con MMS-TTS: emisiones completas, sin pausas intermedias,',
    '  contenido conocido. Sin detector de habla de por medio.',
    '- Analizado con `createDspAudioEngine().analyze()` y puntuado con',
    '  `createPronunciationScorer()`, los reales de la aplicación.',
    '',
    '| Comparación | Papel | Distancia DTW | Puntaje |',
    '|---|---|---|---|',
    ...m.map((x) => `| ${x.etiqueta} | ${x.papel} | ${x.distancia.toFixed(2)} | ${x.puntaje.toFixed(1)} |`),
    '',
    `**Margen entre el suelo y el par mínimo: ${margen.toFixed(2)} (factor ${factor.toFixed(2)}×).**`,
    `**Separación en puntaje: ${separacionPuntaje.toFixed(1)} puntos, contra los 20 que exige RF-10.**`,
    '',
    discrimina
      ? 'El comparador discrimina con contenido controlado: el problema de la calibración está en el material o en la segmentación.'
      : 'El comparador no discrimina ni con contenido controlado y emisiones completas: el problema no es la segmentación.',
    '',
    '#### Limitaciones',
    '',
    '- Es voz sintética contra voz sintética: mide el comparador, no el caso real de un',
    '  humano contra la referencia. El caso real solo puede ser peor, porque añade la',
    '  diferencia de tracto vocal que R03 anticipaba.',
    '- Un solo par mínimo y una sola frase.',
    '- El "suelo" depende de que las dos síntesis sean independientes: se fuerza con una',
    '  caché de capacidad 1, y el registro imprime las dos longitudes para comprobarlo.',
  ].join('\n');
}

log('Listo. Pulsá ejecutar: sintetiza cuatro audios y los compara.');
