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
 * Limpia la respuesta conversacional del tutor.
 *
 * Además de las comillas, junta los saltos de línea: el chat muestra el mensaje en un
 * solo bloque y un salto suelto se ve como un hueco raro en medio de la burbuja.
 */
export function cleanTutorReply(text: string): string {
  return stripWrappingQuotes(text).replace(/\s*\n\s*/g, ' ').trim();
}
