/**
 * S6-T4 / S7-T2 · Verificación en ejecución del worker del tutor. Dueño: Isaac.
 *
 * POR QUÉ EXISTE: en este módulo ya pasó dos veces que el código compilaba, pasaba
 * los tests y aun así estaba roto — el diff de gramática clasificaba mal, y la barra
 * de progreso se quedaba clavada en el 100 %. Los dos aparecieron solo al ejecutar.
 *
 * QUÉ VALIDA, que los tests unitarios no pueden:
 *   1. Que el worker arranca y que Vite lo empaqueta bien como módulo aparte.
 *   2. Que la carga bajo demanda funciona: se llama sin `init()` previo.
 *   3. Que `suggest()` y `reply()` viajan por el mismo canal **sin cruzarse**. Es el
 *      riesgo propio de este worker, que atiende dos tipos de petición: si se
 *      confundieran, el chat mostraría una lista donde espera una frase.
 *   4. Que la limpieza (comillas, sugerencias que repiten la frase) hace algo con
 *      salidas reales del modelo, no con las inventadas de los tests.
 *
 * Es código de verificación, desechable, no forma parte del pipeline.
 */

import { createAIPipeline } from '../createAIPipeline';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const log = (m: string) => {
  const el = $('log');
  el.textContent += m + '\n';
  el.scrollTop = 1e9;
};

// A propósito no se llama a `init()`: el modelo del tutor tiene que cargarse solo en
// la primera petición. El progreso de esa descarga no llega a ningún sitio porque el
// callback se entrega en `init()` — es una limitación conocida y aquí se ve.
const pipeline = createAIPipeline();
const frase = () => ($('frase') as HTMLInputElement).value;

async function medir<T>(etiqueta: string, fn: () => Promise<T>): Promise<T> {
  const t0 = performance.now();
  const out = await fn();
  log(`  ${etiqueta}: ${((performance.now() - t0) / 1000).toFixed(2)} s`);
  return out;
}

$('btnSuggest').addEventListener('click', async () => {
  const btn = $('btnSuggest') as HTMLButtonElement;
  btn.disabled = true;
  try {
    log(`suggest("${frase()}")`);
    const out = await medir('tiempo', () => pipeline.suggest(frase()));

    log(`  devolvió ${out.length} sugerencia(s):`);
    for (const s of out) log(`    · ${s}`);
    if (out.length === 0) {
      log('    (lista vacía: el modelo no encontró nada que mejorar, o todas repetían la frase)');
    }
    // El contrato promete string[]. Si el worker cruzara respuestas, aquí llegaría
    // una cadena suelta y esto lo delataría.
    log(Array.isArray(out) ? '  ✔ tipo correcto (lista)' : '  ⚠ NO es una lista');
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? `${err.name}: ${err.message}` : String(err)));
  } finally {
    btn.disabled = false;
  }
});

$('btnReply').addEventListener('click', async () => {
  const btn = $('btnReply') as HTMLButtonElement;
  btn.disabled = true;
  try {
    log(`reply(historial con "${frase()}")`);
    const out = await medir('tiempo', () =>
      pipeline.reply([
        { id: '1', role: 'user', text: frase(), ts: Date.now() },
      ])
    );

    log(`  tutor: "${out}"`);
    log(typeof out === 'string' ? '  ✔ tipo correcto (cadena)' : '  ⚠ NO es una cadena');
    log(out.includes('"') ? '  ⚠ quedaron comillas dentro' : '  ✔ sin comillas envolventes');
    log(out.trim().endsWith('?') ? '  ✔ termina en pregunta' : '  · no termina en pregunta');
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? `${err.name}: ${err.message}` : String(err)));
  } finally {
    btn.disabled = false;
  }
});

$('btnAmbos').addEventListener('click', async () => {
  const btn = $('btnAmbos') as HTMLButtonElement;
  btn.disabled = true;
  try {
    // La prueba que de verdad importa de este worker: las dos peticiones salen a la
    // vez por el mismo canal. Si el registro de pendientes no distinguiera el tipo,
    // una podría resolver la promesa de la otra.
    log('suggest() y reply() lanzadas a la vez…');
    const [sugerencias, respuesta] = await Promise.all([
      pipeline.suggest(frase()),
      pipeline.reply([{ id: '1', role: 'user', text: frase(), ts: Date.now() }]),
    ]);

    const ok = Array.isArray(sugerencias) && typeof respuesta === 'string';
    log(`  sugerencias: ${JSON.stringify(sugerencias)}`);
    log(`  respuesta: "${respuesta}"`);
    log(ok ? '  ✔ no se cruzaron' : '  ⚠ SE CRUZARON: cada una recibió el tipo de la otra');
  } catch (err) {
    log('⚠ Error: ' + (err instanceof Error ? `${err.name}: ${err.message}` : String(err)));
  } finally {
    btn.disabled = false;
  }
});

log('Listo. La primera llamada descarga el modelo (265 MiB): va a tardar.');
