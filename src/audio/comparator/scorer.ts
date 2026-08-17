/**
 * S6-T2 — Puntaje de pronunciación, global y por palabra.
 *
 * Implementa el contrato `PronunciationScorer`. Recibe el análisis del usuario,
 * el de la referencia sintetizada por el TTS, y los tiempos por palabra que
 * devuelve Whisper. Produce un puntaje de 0 a 100 para la frase y otro para cada
 * palabra.
 *
 * Cómo se arma:
 *
 *   1. Se alinean las dos secuencias de MFCC con DTW (S6-T1). El alineamiento
 *      absorbe la diferencia de velocidad al hablar.
 *   2. El costo medio del camino mide cuánto se parecen en conjunto.
 *   3. Para cada palabra, se toman las tramas del usuario que caen en su
 *      intervalo según Whisper y se promedia el costo local **solo de ese
 *      tramo** del camino. Así una palabra mal pronunciada no arrastra el
 *      puntaje de las demás.
 *   4. La distancia se convierte a puntaje con una curva exponencial.
 *
 * Dos decisiones que vienen de tareas anteriores y que aquí se cobran:
 *
 *   · Se ignora el coeficiente c₀ de los MFCC, que es el volumen (S5-T2). Si no,
 *     hablar más flojo que la referencia bajaría el puntaje.
 *   · La normalización RMS de S2-T2 ya dejó ambas señales al mismo nivel, así
 *     que lo que queda comparable es la forma del espectro, no su intensidad.
 */

import type {
  AudioFrame,
  PronunciationResult,
  PronunciationScorer,
  WordAlign,
  WordScore,
} from '@shared/contracts';
import { cepstralMeanNormalize } from '../features/mfcc';
import { dtw, segmentCost, type DtwOptions } from './dtw';

/**
 * Constante de la curva distancia → puntaje. Calibrada con distancias DTW
 * medidas sobre frases sintéticas de tres vocales, ya con CMN aplicada
 * (ver `docs/evidencias/s6/s6-t1-t2-comparador.md`):
 *
 * | Caso | Distancia | Puntaje |
 * |---|---:|---:|
 * | Idéntica, o solo distinto volumen | 0.00 | 100 |
 * | Mismo texto, otra voz (120→180 Hz) | 3.23 | 85 |
 * | Mismo texto, otra voz (120→220 Hz) | 6.45 | 72 |
 * | Texto distinto | 17.91 | 41 |
 * | Texto distinto y otra voz | 18.96 | 39 |
 *
 * La separación entre el peor caso bien pronunciado y el mejor mal pronunciado
 * es de **31 puntos**, por encima de los 20 que exige la métrica de RF-10.
 */
export const SCORE_SCALE = 20;

/**
 * Distancia que se descuenta antes de puntuar: el **suelo** de la cadena.
 *
 * POR QUÉ EXISTE. Un estudiante que pronuncia la frase **perfectamente** nunca
 * llega a distancia cero, porque su voz no es la del sintetizador. Ese resto no
 * depende de cómo pronuncie y no debería costarle puntos. Puntuar contra cero
 * hacía que una pronunciación correcta sacara 45 o 50, que es la queja de que
 * «califica muy heavy» — y es una queja acertada: el puntaje estaba midiendo el
 * timbre del estudiante, no su pronunciación.
 *
 * DE DÓNDE SALE EL NÚMERO. De la calibración con voz real de S9-T3: decir la
 * frase **bien pero con otra voz** cuesta **+7.08** de distancia respecto a la
 * referencia. Ese es el precio de no ser el sintetizador, medido sobre 40
 * grabaciones de dos hablantes.
 *
 * Es la vía 1 de las tres que propuso Isaac al cerrar R03: *«calibrar la escala
 * contra el suelo, no contra cero»*.
 *
 * LO QUE ESTO **NO** ARREGLA, y hay que decirlo. Descontar el suelo hace el
 * número legible, no discriminante. Pronunciar mal cuesta +1.20 sobre ese suelo,
 * así que tras el descuento una toma correcta y una incorrecta siguen quedando
 * cerca. **R03 sigue en pie**: la vía acústica detecta 6 de 10 y la señal
 * principal sigue siendo la comparación contra la frase objetivo. Lo que se
 * corrige aquí es que el puntaje dejara de castigar a quien lo hizo bien.
 */
export const SCORE_FLOOR = 7.08;

/** Radio de banda por defecto: 15 % de la secuencia más larga, mínimo 10 tramas. */
export function defaultBandRadius(n: number, m: number): number {
  return Math.max(10, Math.round(0.15 * Math.max(n, m)));
}

export interface ScorerOptions extends DtwOptions {
  /** Constante de la curva de puntaje. Menor = más exigente. */
  scale?: number;
  /**
   * Distancia que se descuenta antes de puntuar (ver `SCORE_FLOOR`). Por defecto
   * el suelo medido de «voz humana contra referencia sintetizada».
   *
   * Ponerlo en `0` compara contra cero absoluto, que es lo correcto cuando las
   * dos señales vienen de la misma voz —dos grabaciones del mismo estudiante— y
   * no hay diferencia de timbre que descontar.
   */
  floor?: number;
  /**
   * Normalización cepstral por media, activada por defecto. Es lo que permite
   * comparar la voz del usuario contra la del TTS: sin ella las clases "bien
   * pronunciado" y "mal pronunciado" se solapan (ver `cepstralMeanNormalize`).
   * Se puede desactivar para comparar dos grabaciones de la misma voz.
   */
  cepstralMeanNormalization?: boolean;
}

/**
 * Convierte una distancia en un puntaje de 0 a 100:
 *
 *   puntaje = 100 · e^(−(d − suelo) / escala)
 *
 * Se eligió una exponencial y no una recta por dos razones. Está acotada por
 * construcción —nunca da negativo ni pasa de 100, sin recortes artificiales— y
 * su pendiente es mayor cerca de cero, que es donde conviene distinguir: la
 * diferencia entre una pronunciación muy buena y una buena importa más que
 * entre una mala y una peor.
 *
 * `floor` VALE CERO POR DEFECTO A PROPÓSITO: esta función es la curva pura, y el
 * suelo no es una propiedad de la curva sino del caso concreto «voz humana contra
 * referencia sintetizada». Quien lo aplica es `createPronunciationScorer`, que sí
 * sabe que está comparando esas dos cosas. Así las pruebas de la curva siguen
 * midiendo la curva, y comparar dos grabaciones de la misma voz —donde no hay
 * suelo que descontar— sigue funcionando sin pasar nada.
 */
export function distanceToScore(
  distance: number,
  scale: number = SCORE_SCALE,
  floor = 0
): number {
  if (!Number.isFinite(distance)) return 0;
  const efectiva = Math.max(0, distance - Math.max(0, floor));
  return 100 * Math.exp(-efectiva / scale);
}

/**
 * Extrae la secuencia de MFCC de los frames y, si corresponde, le aplica la
 * normalización cepstral. Cada secuencia se normaliza **por separado**: la media
 * que se resta a la del usuario es la suya, no la de la referencia, que es
 * precisamente lo que elimina la diferencia entre las dos voces.
 */
function secuenciaMfcc(frames: AudioFrame[], conCmn: boolean): Float32Array[] {
  const secuencia = frames.map((f) => Float32Array.from(f.mfcc));
  return conCmn ? cepstralMeanNormalize(secuencia) : secuencia;
}

/**
 * Índices de las tramas cuyo instante cae dentro del intervalo de una palabra.
 * Devuelve un rango `[desde, hasta)`; si la palabra no cubre ninguna trama, el
 * rango sale vacío.
 */
export function frameRangeForWord(
  frames: AudioFrame[],
  word: WordAlign
): { from: number; to: number } {
  let from = frames.length;
  let to = 0;

  for (let i = 0; i < frames.length; i++) {
    const t = frames[i].t;
    if (t >= word.start && t < word.end) {
      if (i < from) from = i;
      if (i + 1 > to) to = i + 1;
    }
  }
  return from <= to ? { from, to } : { from: 0, to: 0 };
}

/**
 * Crea el evaluador de pronunciación.
 *
 * Las tres entradas vienen de módulos distintos: `user` del motor de audio,
 * `reference` del análisis del audio del TTS, y `words` del reconocedor. El
 * contrato es asíncrono porque así lo define `PronunciationScorer`, aunque el
 * cálculo sea síncrono: mantiene la puerta abierta a moverlo a un worker si la
 * latencia lo pidiera.
 */
export function createPronunciationScorer(options: ScorerOptions = {}): PronunciationScorer {
  const scale = options.scale ?? SCORE_SCALE;
  // Cero por defecto, y la aplicación pasa `SCORE_FLOOR` al componer (`App.tsx`).
  // El suelo depende de QUÉ se está comparando —voz humana contra referencia
  // sintetizada— y esa información la tiene quien arma la cadena, no el
  // comparador. Con el valor por defecto aquí, las pruebas que miden la
  // capacidad de discriminar sobre vocales sintéticas seguirían midiendo otra
  // cosa sin que nadie lo pidiera.
  const floor = options.floor ?? 0;
  const conCmn = options.cepstralMeanNormalization !== false;

  return {
    async score(
      user: AudioFrame[],
      reference: AudioFrame[],
      words: WordAlign[]
    ): Promise<PronunciationResult> {
      if (user.length === 0 || reference.length === 0) {
        // Sin audio que comparar no se inventa un puntaje.
        return { overall: 0, words: words.map((w) => ({ ...w, score: 0 })), dtwDistance: 0 };
      }

      const secuenciaUsuario = secuenciaMfcc(user, conCmn);
      const secuenciaReferencia = secuenciaMfcc(reference, conCmn);

      const dtwOptions: DtwOptions = {
        ignoreFirstCoeff: options.ignoreFirstCoeff,
        bandRadius:
          options.bandRadius ?? defaultBandRadius(user.length, reference.length),
      };

      const alineamiento = dtw(secuenciaUsuario, secuenciaReferencia, dtwOptions);

      const puntajePorPalabra: WordScore[] = words.map((w) => {
        const { from, to } = frameRangeForWord(user, w);
        if (to <= from) {
          // La palabra no cubre ninguna trama: se le da el puntaje global en vez
          // de un cero, que sería castigar al usuario por un timestamp raro.
          return { ...w, score: distanceToScore(alineamiento.normalizedDistance, scale, floor) };
        }

        const costo = segmentCost(
          alineamiento.path,
          secuenciaUsuario,
          secuenciaReferencia,
          from,
          to,
          dtwOptions
        );
        return { ...w, score: distanceToScore(costo, scale, floor) };
      });

      return {
        overall: distanceToScore(alineamiento.normalizedDistance, scale, floor),
        words: puntajePorPalabra,
        dtwDistance: alineamiento.distance,
      };
    },
  };
}
