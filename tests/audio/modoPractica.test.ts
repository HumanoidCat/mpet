/**
 * S9-T3 (continuación) — ¿Detecta mejor un modo práctica con frase objetivo?
 *
 * La calibración cerró con RF-10 no alcanzado: comparando contra una referencia
 * de otra voz —que es lo que la aplicación hace, porque la sintetiza el TTS— el
 * puntaje acústico detecta el error en **6 de 10** frases.
 *
 * La alternativa que quedó abierta no compara espectros sino **texto**. Si la
 * aplicación muestra una frase y pide repetirla, el error se detecta comparando
 * la transcripción contra esa frase. El reconocedor está entrenado con miles de
 * hablantes, así que esa señal **no depende de la voz**, que es exactamente lo
 * que hunde a la vía acústica.
 *
 * Esta prueba mide si efectivamente detecta mejor, y a qué costo.
 *
 * Las transcripciones vienen de un fixture versionado y no de ejecutar el
 * reconocedor: cargar el modelo tarda y depende de red la primera vez. Es el
 * mismo criterio acordado para el fixture de librosa (**D-07**). Por eso esta
 * prueba **sí corre en integración continua**, a diferencia de las de
 * calibración, que necesitan las grabaciones.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Fixture {
  frases: Record<string, { objetivo: string; par: string }>;
  transcripciones: Record<string, string>;
}

const fixture: Fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'transcripciones-whisper.json'), 'utf8')
);

/** `fabrizio-1-ok` → sus tres partes. */
function partes(clave: string) {
  const [hablante, frase, version] = clave.split('-');
  return { hablante, frase, version };
}

/**
 * La regla del modo práctica: se marca error cuando lo transcrito no coincide
 * con la frase que se pidió repetir. Deliberadamente simple — no hay umbral que
 * calibrar, y eso es parte de su atractivo frente a la vía acústica.
 */
const hayError = (transcrito: string, objetivo: string) => transcrito !== objetivo;

const claves = Object.keys(fixture.transcripciones).sort();

describe('Modo práctica: detección por texto contra frase objetivo', () => {
  it('el fixture cubre las 40 tomas de los dos hablantes', () => {
    expect(claves).toHaveLength(40);
    expect(new Set(claves.map((c) => partes(c).hablante)).size).toBe(2);
    expect(new Set(claves.map((c) => partes(c).frase)).size).toBe(5);
  });

  it('mide detección y falsas alarmas', () => {
    let detectados = 0;
    let conError = 0;
    let falsasAlarmas = 0;
    let correctas = 0;
    const fallos: string[] = [];
    const alarmas: string[] = [];

    for (const clave of claves) {
      const { frase, version } = partes(clave);
      const objetivo = fixture.frases[frase].objetivo;
      const transcrito = fixture.transcripciones[clave];
      const marcado = hayError(transcrito, objetivo);

      if (version === 'mal') {
        conError++;
        if (marcado) detectados++;
        else fallos.push(`${clave}: "${transcrito}"`);
      } else {
        correctas++;
        if (marcado) {
          falsasAlarmas++;
          alarmas.push(`${clave}: "${transcrito}"`);
        }
      }
    }

    console.log('\n== Modo práctica contra frase objetivo ==');
    console.log(`  Errores detectados        : ${detectados} de ${conError}`);
    console.log(`  Tomas correctas marcadas  : ${falsasAlarmas} de ${correctas}`);
    console.log('\n  Errores que se le escaparon:');
    for (const f of fallos) console.log(`    ${f}`);
    console.log('\n  Tomas correctas que marcó:');
    for (const a of alarmas) console.log(`    ${a}`);

    console.log('\n  Comparación con la vía acústica, mismo material:');
    console.log('    acústica, referencia de otra voz : 6 de 10');
    console.log(`    texto contra frase objetivo      : ${detectados} de ${conError}`);

    expect(conError).toBe(10);
    expect(correctas).toBe(30);
  });

  /**
   * La frase 4 se mide aparte porque **no sirve como caso de prueba**: el
   * reconocedor oyó *leave* en las cuatro tomas de los dos hablantes, la
   * correcta incluida. Un modelo entrenado con miles de voces oyendo la misma
   * palabra en las dos versiones indica que el contraste no llegó a producirse.
   * Contarla como acierto o como fallo distorsiona el resultado en ambos
   * sentidos.
   */
  it('separa las frases donde el contraste sí se produjo', () => {
    const filas: { frase: string; detecta: string; alarmas: string; degenerada: boolean }[] = [];

    for (const frase of Object.keys(fixture.frases).sort()) {
      const objetivo = fixture.frases[frase].objetivo;
      const de = (v: string) =>
        claves.filter((c) => partes(c).frase === frase && partes(c).version === v);

      const detecta = de('mal').filter((c) => hayError(fixture.transcripciones[c], objetivo)).length;
      const correctas = [...de('ok'), ...de('ok2'), ...de('rapido')];
      const alarmas = correctas.filter((c) => hayError(fixture.transcripciones[c], objetivo)).length;

      // Degenerada: ninguna toma correcta se transcribe como el objetivo. No es
      // que el sistema falle, es que nadie dijo la frase que se pedía.
      const degenerada = alarmas === correctas.length;
      filas.push({
        frase: `${frase} ${fixture.frases[frase].par}`,
        detecta: `${detecta}/${de('mal').length}`,
        alarmas: `${alarmas}/${correctas.length}`,
        degenerada,
      });
    }

    console.log('\n== Por frase ==');
    console.log('  frase            detecta  marca correctas');
    for (const f of filas)
      console.log(
        `  ${f.frase.padEnd(15)} ${f.detecta.padStart(7)}  ${f.alarmas.padStart(15)}` +
          (f.degenerada ? '   <- nadie dijo la frase objetivo' : '')
      );

    const utiles = filas.filter((f) => !f.degenerada);
    console.log(`\n  Frases utilizables: ${utiles.length} de ${filas.length}`);

    expect(filas).toHaveLength(5);
  });

  /**
   * A velocidad normal el reconocedor es mucho más fiable. Importa porque el
   * modo práctica puede pedir que se hable a ritmo normal, mientras que la
   * conversación libre no controla nada.
   */
  it('mide cuánto empeora al hablar deprisa', () => {
    const tasa = (versiones: string[]) => {
      const cs = claves.filter((c) => versiones.includes(partes(c).version));
      const marcadas = cs.filter((c) =>
        hayError(fixture.transcripciones[c], fixture.frases[partes(c).frase].objetivo)
      ).length;
      return { marcadas, total: cs.length };
    };

    const normal = tasa(['ok', 'ok2']);
    const rapido = tasa(['rapido']);

    console.log('\n== Falsas alarmas según la velocidad ==');
    console.log(`  A velocidad normal : ${normal.marcadas} de ${normal.total}`);
    console.log(`  Hablando deprisa   : ${rapido.marcadas} de ${rapido.total}`);

    expect(normal.total).toBe(20);
    expect(rapido.total).toBe(10);
  });
});
