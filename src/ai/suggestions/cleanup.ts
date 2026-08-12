/**
 * S6-T4 / S7-T2 · Limpieza de las salidas del modelo del tutor. Dueño: Isaac.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO: el spike S6-T4 ejecutó el modelo real y encontró dos
 * defectos que no se ven leyendo la ficha del modelo y que llegarían tal cual a la
 * pantalla del estudiante:
 *
 *   1. **La salida viene envuelta en comillas.** Dos de las cuatro respuestas del
 *      tutor llegaron como `"What do you want to achieve with your English?"`, con
 *      las comillas dentro del texto. En el chat se verían como parte del mensaje.
 *   2. **Muchas sugerencias devuelven la frase sin tocar** (5 de 8 en el spike). No es
 *      un fallo del modelo —si la frase ya está bien, no hay nada que sugerir— pero
 *      mostrar como "sugerencia" una copia literal de lo que el estudiante acaba de
 *      escribir es ruido que le hace desconfiar del resto.
 *
 * Es lógica pura (sin modelo ni navegador) a propósito: así se puede testear.
 */

/**
 * Quita las comillas que envuelven un texto, si las hay.
 *
 * Solo quita el par exterior y solo si abre y cierra: si el estudiante o el modelo
 * usan comillas *dentro* de la frase —`He said "hello" to me`— se conservan, porque
 * ahí sí forman parte del contenido.
 */
export function stripWrappingQuotes(text: string): string {
  let out = text.trim();

  // En bucle porque el modelo a veces anida: «"'texto'"».
  // Se incluyen las comillas tipográficas porque el modelo las produce a veces.
  const pairs: Array<[string, string]> = [
    ['"', '"'],
    ["'", "'"],
    ['“', '”'], // “ ”
    ['‘', '’'], // ‘ ’
  ];

  let changed = true;
  while (changed && out.length >= 2) {
    changed = false;
    for (const [open, close] of pairs) {
      if (out.startsWith(open) && out.endsWith(close)) {
        out = out.slice(open.length, out.length - close.length).trim();
        changed = true;
        break;
      }
    }
  }

  return out;
}

/**
 * Normaliza una frase para compararla con otra.
 *
 * Ignora mayúsculas, espacios repetidos y la puntuación final, que es donde el modelo
 * introduce diferencias que no cambian nada: devolver "I went to the beach." cuando
 * el estudiante escribió "I went to the beach" no es una sugerencia.
 */
function normalizeSentence(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/, '');
}

/** ¿Son la misma frase, a efectos de "esto no aporta nada"? */
export function isSameSentence(a: string, b: string): boolean {
  return normalizeSentence(a) === normalizeSentence(b);
}

/**
 * Deja solo las sugerencias que aportan algo.
 *
 * Descarta, en este orden: las vacías, las que repiten la frase original y las
 * repetidas entre sí (los dos prompts pueden coincidir en la misma reescritura).
 * Devolver una lista vacía es un resultado válido y honesto: significa que el modelo
 * no encontró nada que mejorar.
 */
export function cleanSuggestions(original: string, raw: readonly string[]): string[] {
  const out: string[] = [];

  for (const item of raw) {
    const clean = stripWrappingQuotes(item);
    if (clean.length === 0) continue;
    if (isSameSentence(clean, original)) continue;
    if (out.some((existing) => isSameSentence(existing, clean))) continue;
    out.push(clean);
  }

  return out;
}

/**
 * Huellas de que el modelo está repitiendo material de entrenamiento en vez de
 * responder.
 *
 * POR QUE EXISTE: LaMini-Flan-T5 se destilo a partir de salidas de GPT-3.5, asi que su
 * corpus de entrenamiento contiene las negativas de ese sistema. Ante una entrada que
 * no sabe continuar, el modelo devuelve una de esas negativas memorizadas — incluida
 * la mencion literal a la politica de uso de otra empresa. Es texto memorizado, no una
 * decision del modelo ni un fallo del prompt.
 *
 * Se detecto con la entrada mas trivial posible: "Hi, how are you?".
 *
 * El criterio es deliberadamente amplio. Equivocarse hacia el lado de filtrar cuesta
 * una respuesta generica pero valida; equivocarse hacia el otro pone en pantalla del
 * estudiante una negativa que habla de una empresa que no tiene nada que ver con esta
 * aplicacion. Ninguna respuesta legitima de un tutor de ingles contiene estas frases.
 */
const HUELLAS_DE_RECHAZO: readonly RegExp[] = [
  /\bopen\s?ai\b/i,
  /\bchat\s?gpt\b/i,
  /use case polic/i,
  /content polic/i,
  /as an ai(\s+language)?\s+model/i,
  /\bi (can ?not|cannot|can't|am unable to|am not able to) (respond|answer|reply|generate|provide|comply|assist)/i,
  /i'?m sorry,? but i (can ?not|cannot|can't)/i,
  /(inappropriate|offensive) content/i,
  /(goes |it )?against .{0,40}\bpolic/i,
];

/**
 * Respuesta con la que se sustituye una negativa memorizada.
 *
 * Cumple el mismo contrato que le pide `TUTOR_INSTRUCTION` al modelo —una frase corta
 * que termina en pregunta— para que la conversacion no se muera. Devolver cadena
 * vacia no serviria: el chat mostraria una burbuja en blanco, que para el estudiante
 * es igual de roto.
 */
export const RESPUESTA_DE_RESERVA =
  "Sorry, I didn't quite follow that. Could you tell me a bit more?";

/** ¿La salida es una negativa memorizada en vez de una respuesta? */
export function esRechazoMemorizado(text: string): boolean {
  return HUELLAS_DE_RECHAZO.some((huella) => huella.test(text));
}

/**
 * Limpia la respuesta conversacional del tutor.
 *
 * Además de las comillas, junta los saltos de línea: el chat muestra el mensaje en un
 * solo bloque y un salto suelto se ve como un hueco raro en medio de la burbuja.
 *
 * Y descarta las negativas memorizadas (ver `HUELLAS_DE_RECHAZO`), que es el unico
 * caso en que esta funcion sustituye el texto del modelo en lugar de solo limpiarlo.
 */
export function cleanTutorReply(text: string): string {
  const limpio = stripWrappingQuotes(text).replace(/\s*\n\s*/g, ' ').trim();
  if (limpio.length === 0 || esRechazoMemorizado(limpio)) return RESPUESTA_DE_RESERVA;
  return limpio;
}
