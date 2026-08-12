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
 * Palabras que no cuentan como "contenido" al comparar dos frases: aparecen en
 * cualquiera y no dicen nada sobre el tema.
 */
const PALABRAS_VACIAS = new Set([
  'a', 'an', 'the', 'is', 'are', 'am', 'was', 'were', 'be', 'do', 'does', 'did',
  'you', 'your', 'yours', 'i', 'my', 'me', 'we', 'our', 'it', 'its', 'this', 'that',
  'of', 'in', 'on', 'at', 'to', 'for', 'and', 'or', 'but', 'with', 'what', 'where',
  'when', 'who', 'how', 'why', 'can', 'could', 'would', 'like', 'about', 'tell',
  'more', 'think', 'some', 'very', 'yes', 'no', 'please', 'so', 'well', 'just',
]);

const palabrasConContenido = (texto: string): string[] =>
  normalizeSentence(texto)
    .split(/[\s,;:"'-]+/)
    .filter((palabra) => palabra.length > 0 && !PALABRAS_VACIAS.has(palabra));

/**
 * ¿La respuesta del tutor solo repite, en forma de pregunta, lo que el estudiante
 * acaba de decir?
 *
 * ESTE ES EL DEFECTO QUE HACE QUE NO SE PUEDA CONVERSAR, y no lo arregla ningún ajuste
 * de prompt: es lo único que sabe hacer un T5 de instrucciones de este tamaño, que fue
 * entrenado para parafrasear, no para dialogar. Medido con una conversación simulada
 * de diez turnos:
 *
 *   "Hi! My name is Ana."                    → "What is your name?"
 *   "My favorite beach is Manuel Antonio."   → "What is your favorite beach?"
 *   "Do you like the beach?"                 → "Do you like the beach?"  (la repite tal cual)
 *
 * Se probaron dos formulaciones de prompt que se lo prohíben explícitamente
 * ("Do not ask for information the student already gave") y el modelo las ignoró: no
 * es un problema de instrucciones, es el límite del modelo. Por eso el filtro va aquí,
 * después de generar, y no en el prompt — y por eso sirve **sin importar qué modelo
 * se use** para `reply()`: si el modelo cambia y sí conversa de verdad, esta función
 * simplemente no encuentra nada que sustituir.
 *
 * El criterio: si todas las palabras con contenido de la pregunta ya estaban en la
 * frase del estudiante, la pregunta no añade nada. "What is your name?" contra
 * "My name is Ana" comparte `name` y no aporta ninguna palabra nueva → eco.
 * "What is your profession?" contra "I work as a nurse" aporta `profession` → no es eco.
 */
export function esEco(preguntaDelTutor: string, fraseDelEstudiante: string): boolean {
  const dichas = new Set(palabrasConContenido(fraseDelEstudiante));
  const preguntadas = palabrasConContenido(preguntaDelTutor);
  if (preguntadas.length === 0) return true; // solo palabras vacías: no pregunta nada
  return preguntadas.every((palabra) => dichas.has(palabra));
}

/**
 * Preguntas de reserva para cuando la respuesta del tutor no sirve.
 *
 * Un conjunto y no una sola frase, y elegida por turno en vez de al azar: sustituir
 * siempre por el mismo texto reintroduce el defecto que se está corrigiendo (la
 * respuesta que no cambia). `RESPUESTA_DE_RESERVA` (I-09) se mantiene aparte porque
 * sus pruebas ya comprueban ese valor exacto; estas cubren los casos nuevos.
 */
export const PREGUNTAS_DE_SEGUIMIENTO = [
  'Interesting! Can you tell me more about that?',
  'Nice, why do you think that is?',
  'I see. How do you feel about it?',
  'Good to know. What happened next?',
] as const;

function preguntaDeSeguimiento(turno: number): string {
  const i = Math.abs(Math.trunc(turno)) % PREGUNTAS_DE_SEGUIMIENTO.length;
  return PREGUNTAS_DE_SEGUIMIENTO[i];
}

/**
 * Limpia la respuesta conversacional del tutor, y la sustituye cuando no sirve.
 *
 * Además de las comillas, junta los saltos de línea: el chat muestra el mensaje en un
 * solo bloque y un salto suelto se ve como un hueco raro en medio de la burbuja.
 *
 * Cuatro motivos para sustituir el texto del modelo, comprobados en este orden:
 *   1. viene vacío,
 *   2. es una negativa memorizada (I-09, `esRechazoMemorizado`),
 *   3. es idéntica a la respuesta anterior — I-10 lo diagnosticó como una copia
 *      literal de una línea `Tutor:` que quedaba en el prompt; al quitar esas líneas
 *      del prompt (ver `buildTutorPrompt`) la causa desaparece, pero el chequeo se
 *      conserva como red de seguridad, porque no cuesta nada y cubre una repetición
 *      que viniera de cualquier otra causa,
 *   4. **es un eco de la frase del estudiante** (`esEco`) — el defecto que de verdad
 *      impedía conversar, y el único de los cuatro que no depende de este modelo en
 *      particular.
 *
 * `studentUtterance` y `previousReply` son opcionales para no romper el uso existente
 * (incluidas las pruebas de I-09, que llaman con un solo argumento): sin ellos, los
 * chequeos 3 y 4 simplemente no se aplican.
 */
export function cleanTutorReply(
  text: string,
  context: { studentUtterance?: string; previousReply?: string; turno?: number } = {}
): string {
  const limpio = stripWrappingQuotes(text).replace(/\s*\n\s*/g, ' ').trim();
  const turno = context.turno ?? 0;

  if (limpio.length === 0 || esRechazoMemorizado(limpio)) {
    return RESPUESTA_DE_RESERVA;
  }
  if (context.previousReply && isSameSentence(limpio, context.previousReply)) {
    return preguntaDeSeguimiento(turno);
  }
  if (context.studentUtterance && esEco(limpio, context.studentUtterance)) {
    return preguntaDeSeguimiento(turno);
  }

  return limpio;
}
