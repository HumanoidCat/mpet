import { describe, it, expect } from 'vitest';
import { createDspAudioEngine } from '../../src/core/audioEngineAdapter';
import { createPronunciationScorer } from '../../src/audio/comparator/scorer';
import { preprocess } from '../../src/audio/dsp/preprocess';
import { SAMPLE_RATE } from '../../src/shared/constants';

/**
 * Simetria de la cadena que alimenta al comparador de pronunciacion.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 * El puntaje es una distancia entre dos analisis. Si las dos senales no
 * recorrieron la misma cadena, la distancia mide la diferencia entre las rutas
 * y no la pronunciacion del estudiante.
 *
 * Al conectar el comparador al orquestador aparecio justo eso: el PCM del
 * usuario sale de `stop()` ya acondicionado (pasa-altas de 80 Hz y
 * normalizacion RMS de S2-T2) y el del sintetizador sale crudo de `speak()`.
 * El sesgo no era constante: dependia de que entregara el TTS, que no
 * controlamos y que puede cambiar de modelo.
 *
 * La prueba clave es la primera: la misma senal por las dos rutas tiene que dar
 * 100. Cualquier asimetria futura la baja.
 */

/** Vocal sintetica: fundamental con armonicos y formantes, con envolvente. */
function vocal(f0: number, formantes: number[], dur: number): Float32Array {
  const n = Math.round(dur * SAMPLE_RATE);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    let s = 0;
    for (let k = 1; k <= 30; k++) {
      const f = k * f0;
      if (f > SAMPLE_RATE / 2) break;
      let a = 1 / k;
      for (const F of formantes) a += 0.8 / (1 + Math.pow((f - F) / 100, 2));
      s += a * Math.sin(2 * Math.PI * f * t);
    }
    out[i] = 0.15 * s * Math.sin((Math.PI * i) / n);
  }
  return out;
}

const engine = createDspAudioEngine();
const scorer = createPronunciationScorer();

/**
 * Puntua igual que el orquestador: el audio del usuario se declara acondicionado
 * porque viene de `stop()`, y el de referencia no porque viene de `speak()`.
 */
async function puntuar(
  usuario: Float32Array,
  referencia: Float32Array,
  referenciaAcondicionada = false
): Promise<number> {
  const [fu, fr] = await Promise.all([
    engine.analyze(usuario, { conditioned: true }),
    engine.analyze(referencia, { conditioned: referenciaAcondicionada }),
  ]);
  const dur = usuario.length / SAMPLE_RATE;
  const r = await scorer.score(fu, fr, [{ word: 'aa', start: 0, end: dur }]);
  return r.overall;
}

describe('Simetria de la cadena del comparador', () => {
  const base = vocal(120, [700, 1220, 2600], 0.8);
  /** Lo que entrega `stop()`: ya acondicionado. */
  const usuario = preprocess(base, SAMPLE_RATE);

  it('la misma senal por las dos rutas del orquestador puntua 100', async () => {
    // `base` es lo que entregaria `speak()`: crudo. Al declararlo sin
    // acondicionar, `analyze` le aplica la misma cadena que ya recorrio el
    // usuario, asi que los dos analisis son identicos y la distancia es cero.
    expect(await puntuar(usuario, base)).toBeCloseTo(100, 6);
  });

  it('declarar mal el estado de la referencia baja el puntaje', async () => {
    // Esto es lo que hacia el codigo antes de S6: tratar el PCM crudo del
    // sintetizador como si ya estuviera acondicionado. Sin esta prueba, la
    // anterior podria pasar por casualidad.
    const malDeclarado = await puntuar(usuario, base, true);
    expect(malDeclarado).toBeLessThan(100);
  });

  it('una referencia con retumbe por debajo de la banda de voz ya no arrastra el puntaje', async () => {
    // Un sintetizador puede entregar continua o retumbe de baja frecuencia. Es
    // ruido, no pronunciacion, y el pasa-altas de 80 Hz existe para quitarlo.
    const conRetumbe = Float32Array.from(
      base,
      (v, i) => v + 0.05 * Math.sin((2 * Math.PI * 40 * i) / SAMPLE_RATE)
    );

    const acondicionada = await puntuar(usuario, conRetumbe);
    const cruda = await puntuar(usuario, conRetumbe, true);

    // El acondicionamiento no borra el retumbe del todo (a 40 Hz el pasa-altas
    // atenua, no elimina), pero recupera la mayor parte del puntaje perdido.
    expect(acondicionada).toBeGreaterThan(cruda);
    expect(acondicionada - cruda).toBeGreaterThan(5);
  });

  it('el volumen de la referencia no afecta al puntaje', async () => {
    // Lo cubren la normalizacion RMS, el descarte de c0 y la normalizacion
    // cepstral. Se prueba para que quede claro que el sesgo corregido venia del
    // filtro y no del nivel.
    // Tolerancia de 0.05 puntos y no exacta: al escalar por 0.05 y volver a
    // normalizar queda un residuo de redondeo de float32 en la señal de
    // entrada. Medido: las dos señales ya normalizadas difieren en 1.6e-7
    // relativo, y el logaritmo del banco mel amplifica esa diferencia hasta
    // unos 5e-5 relativos en el puntaje, o sea 0.006 puntos sobre 100.
    //
    // La tolerancia era de 1e-3 y se relajó al corregir RF-09. Antes, el
    // escalado de amplitud del espectro hundía 24 de las 26 bandas mel contra
    // el piso que evita log(0), y una banda fijada no responde a diferencias
    // mínimas de entrada: el recorte enmascaraba este residuo. Al dejar de
    // perder esa información, el residuo pasó a propagarse.
    //
    // La invariancia en sí no se degradó: con entrada exacta, escalar el
    // volumen cambia los coeficientes c1..c12 en 1.4e-6.
    const flojo = Float32Array.from(base, (v) => v * 0.05);
    expect(await puntuar(usuario, flojo)).toBeCloseTo(await puntuar(usuario, base), 1);
  });
});
