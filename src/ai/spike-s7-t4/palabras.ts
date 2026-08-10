/**
 * S7-T4 · Banco de palabras para medir la pronunciación del TTS. Dueño: Isaac.
 *
 * DE DÓNDE SALE: la escucha del spike S4-T5 detectó que MMS-TTS pronuncia mal
 * *vegetables* ("veyitables"). Una observación suelta no es una medición, así que
 * Alejandro cerró un protocolo y un umbral **antes** de medir, para que el resultado
 * no se interprete a conveniencia:
 *
 *   | Fallos sobre 14 | Decisión                                             |
 *   |-----------------|------------------------------------------------------|
 *   | 1 o 2           | Se queda MMS-TTS, limitación documentada             |
 *   | 3 o 4           | Se curan las frases de práctica evitando esas palabras|
 *   | 5 o más         | Se abre el `shared-change` de Kokoro, con carga bajo demanda |
 *
 * POR QUÉ PALABRAS AISLADAS Y NO FRASES: Whisper usa el contexto lingüístico para
 * decidir qué oyó. En una frase puede "corregir" una palabra mal pronunciada porque
 * el resto la hace predecible, y entonces el defecto quedaría oculto. Aislada, el
 * reconocedor no tiene de dónde agarrarse.
 */

export interface TargetWord {
  /** La palabra que el sintetizador debe decir. */
  word: string;
  /**
   * Otras transcripciones que cuentan como acierto.
   *
   * No es manga ancha: cubre casos donde el reconocedor escribe correctamente lo
   * que oyó pero con otra forma (números en cifra o en letra, por ejemplo). Si la
   * lista tapara errores de pronunciación, la medición no valdría nada, así que se
   * mantiene mínima y explicada.
   */
  alternatives?: string[];
  /** Qué trampa de la escritura inglesa pone a prueba. */
  trap: string;
}

/**
 * Las 14 palabras objetivo, una por cada frase del banco del spike S4-T5, para que
 * la vía objetiva (esta) y la vía de escucha midan exactamente lo mismo.
 */
export const TARGET_WORDS: readonly TargetWord[] = [
  { word: 'vegetables', trap: 'sílabas que se comprimen (el caso que originó todo)' },
  { word: 'temperature', trap: 'sílabas que se comprimen' },
  {
    word: 'favorite',
    // Falso positivo detectado en la corrida del 4-ago: el reconocedor escribió la
    // grafía británica. Es ortografía suya, no una pronunciación defectuosa.
    alternatives: ['favourite'],
    trap: 'sílabas que se comprimen',
  },
  { word: 'Wednesday', trap: 'letra muda en mitad de palabra' },
  { word: 'ginger', trap: 'ge/gi suave, se lee /dʒ/' },
  { word: 'engine', trap: 'ge/gi suave' },
  { word: 'knife', trap: 'k muda inicial' },
  { word: 'island', trap: 's muda' },
  { word: 'salmon', trap: 'l muda' },
  { word: 'nature', trap: 'terminación -ture' },
  { word: 'pleasure', trap: 'terminación -sure' },
  { word: 'chef', trap: '"ch" que suena /ʃ/, no /tʃ/' },
  { word: 'through', trap: 'familia "ough"' },
  {
    word: '$25',
    alternatives: ['25', 'twenty five', 'twenty-five', '$25.00', '25 dollars', 'twenty five dollars'],
    trap: 'cifras y símbolos: el tokenizador tiene que deletrearlos',
  },
] as const;

/**
 * Palabras de control: fáciles, frecuentes y sin trampas de escritura.
 *
 * PARA QUÉ SIRVEN — esta es la parte que hace defendible la medición. El
 * reconocedor tiene su propia tasa de error, así que un fallo podría venir de él y
 * no del sintetizador. Si estas palabras también fallan, el problema es del ASR y
 * el conteo entero queda invalidado. Es el control que Alejandro pidió declarar.
 */
export const CONTROL_WORDS: readonly TargetWord[] = [
  { word: 'water', trap: 'control: palabra común, escritura regular' },
  { word: 'green', trap: 'control' },
  { word: 'book', trap: 'control' },
  { word: 'morning', trap: 'control' },
  { word: 'teacher', trap: 'control' },
] as const;

/** Cuántas veces se sintetiza cada palabra. Ver `REPETITION_RULE`. */
export const RENDITIONS = 3;

/**
 * Cómo se le presenta la palabra al sintetizador.
 *
 * `aislada` era el método que pedía el protocolo original. **Medido y descartado:**
 * con la palabra sola, el reconocedor falló hasta en las palabras de control más
 * fáciles ("water" → "wake here", "book" → "[blank_audio]"). El problema no es la
 * pronunciación del sintetizador sino que Whisper está entrenado con habla continua
 * y un recorte de medio segundo no le da de dónde agarrarse; en algunos casos ni
 * siquiera lo considera voz.
 *
 * `portadora` mete la palabra en una **frase portadora** fija y neutra. Es una
 * técnica estándar en fonética justo para esto: da contexto acústico —duración,
 * entonación, algo antes y después— sin que el contexto permita adivinar cuál es la
 * palabra objetivo, porque en ese hueco cabe cualquiera.
 */
export type PresentationMode = 'aislada' | 'portadora';

/** La frase portadora. El hueco `___` se sustituye por la palabra objetivo. */
export const CARRIER_PHRASE = 'Say ___ again, please.';

export function present(word: string, mode: PresentationMode): string {
  return mode === 'aislada' ? word : CARRIER_PHRASE.replace('___', word);
}

/**
 * Silencio que se añade antes y después del audio, en segundos.
 *
 * POR QUÉ: Whisper devolvía `[blank_audio]` con los recortes más cortos. Un poco de
 * silencio alrededor evita que el detector de voz descarte el fragmento entero.
 */
export const PADDING_SECONDS = 0.25;

/**
 * Palabras de la frase portadora, que hay que descontar al comparar.
 *
 * Si la palabra objetivo fuera una de estas, la portadora la regalaría: el
 * reconocedor la devolvería aunque el sintetizador la hubiera pronunciado mal.
 * Ninguna de las 14 objetivo ni de las 5 de control está en la lista, y este test
 * lo comprueba para que nadie añada una por descuido.
 */
export const CARRIER_WORDS = ['say', 'again', 'please'] as const;

/**
 * REGLA DE VEREDICTO, fijada antes de medir.
 *
 * POR QUÉ SE REPITE CADA PALABRA: MMS-TTS es estocástico —muestrea ruido para variar
 * la prosodia—, así que una sola síntesis puede salir inusualmente buena o mala. Se
 * sintetiza tres veces y **la palabra cuenta como fallada si el reconocedor no la
 * devuelve en la mayoría de las repeticiones** (2 de 3 o peor).
 *
 * Es el mismo criterio de prudencia que puso Alejandro para la escucha: si el
 * resultado no es consistente, no está lo bastante mal como para justificar 216 MB
 * adicionales de descarga.
 */
export const REPETITION_RULE =
  'Falla si el reconocedor no devuelve la palabra en al menos 2 de 3 repeticiones.';

/**
 * Normaliza una transcripción para poder compararla.
 *
 * Quita puntuación y mayúsculas, que el reconocedor añade por su cuenta y no dicen
 * nada sobre la pronunciación. NO toca las letras: si el ASR oyó otra cosa, tiene
 * que verse.
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * ¿La transcripción contiene la palabra objetivo?
 *
 * Se busca por inclusión y no por igualdad exacta porque Whisper a veces añade
 * relleno ("the vegetables", "uh, water"). Lo que se está midiendo es si la palabra
 * llegó reconocible, no si el reconocedor devolvió una cadena idéntica.
 */
export function isHit(target: TargetWord, transcription: string): boolean {
  const got = normalize(transcription);
  const candidates = [target.word, ...(target.alternatives ?? [])].map(normalize);
  return candidates.some((c) => c.length > 0 && got.includes(c));
}
