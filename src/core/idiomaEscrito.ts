/**
 * Detección de idioma para el turno escrito. Dueño: Alejandro (núcleo).
 *
 * POR QUÉ NO SE REUTILIZA LA DEL AUDIO: la del audio la hace Whisper, que ya está
 * cargado y escuchando la señal. En un turno escrito no hay audio, y cargar un
 * modelo de detección de idioma para decidir entre dos sería absurdo — pesaría más
 * que la funcionalidad entera.
 *
 * QUÉ SE HACE EN SU LUGAR: contar indicios. Entre español e inglés hay señales
 * ortográficas que no aparecen en el otro idioma casi nunca (`ñ`, tildes, signos de
 * apertura) y listas cortas de palabras muy frecuentes que no se comparten. Con solo
 * dos idiomas candidatos, eso basta: no se está identificando un idioma entre cien,
 * se está eligiendo entre dos.
 *
 * SESGO DELIBERADO HACIA EL INGLÉS. Ante la duda se responde `'en'`, y eso no es
 * pereza sino la dirección barata de equivocarse:
 *
 * - Marcar inglés como español apaga la corrección gramatical y las sugerencias en
 *   un turno donde sí servían. El estudiante pierde la ayuda sin saber por qué.
 * - Marcar español como inglés hace que el corrector reciba una frase en español y
 *   devuelva algo raro, que es visible y no engaña a nadie.
 *
 * La primera falla en silencio; la segunda se nota. Se prefiere la que se nota.
 */

import type { SupportedLanguage } from '@shared/contracts';

/**
 * Caracteres que en un texto en inglés no aparecen prácticamente nunca.
 *
 * `ñ` y los signos de apertura son inequívocos. Las vocales acentuadas aparecen en
 * inglés solo en préstamos (`café`, `naïve`), demasiado raros para preocupar.
 */
const CARACTERES_ES = /[ñáéíóúü¿¡]/i;

/**
 * Palabras muy frecuentes en español que no existen en inglés.
 *
 * Se eligen por frecuencia y por no colisionar: se descartaron a propósito `no`
 * (existe en inglés), `a` y `e` (existen o son una letra suelta), y `son` (es una
 * palabra inglesa corriente). Una colisión aquí produciría exactamente el falso
 * positivo que este archivo intenta evitar.
 */
const PALABRAS_ES = new Set([
  'que', 'de', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'por', 'para', 'con', 'sin', 'sobre', 'como', 'pero', 'porque', 'cuando',
  'donde', 'quiero', 'quiere', 'tengo', 'tiene', 'hacer', 'puedo', 'puede',
  'estoy', 'esta', 'este', 'esto', 'eso', 'muy', 'mas', 'más', 'también',
  'tambien', 'ahora', 'siempre', 'nunca', 'mi', 'mis', 'tu', 'tus', 'su', 'sus',
  'yo', 'él', 'ella', 'nosotros', 'ustedes', 'ellos', 'soy', 'eres', 'somos',
  'hola', 'gracias', 'perdón', 'perdon', 'ayuda', 'ayudar', 'decir', 'hablar',
]);

/**
 * Palabras muy frecuentes en inglés que no existen en español.
 *
 * Sirven de contrapeso: sin ellas, una frase en inglés que contenga un nombre propio
 * español —«I live in La Paz»— sumaría indicios de español sin nada que la defienda.
 */
const PALABRAS_EN = new Set([
  'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'and', 'or', 'but',
  'of', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'about', 'because',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'my', 'your', 'his', 'her',
  'this', 'that', 'these', 'those', 'what', 'when', 'where', 'who', 'how', 'why',
  'want', 'need', 'have', 'has', 'had', 'do', 'does', 'did', 'can', 'could',
  'would', 'should', 'will', 'go', 'going', 'get', 'make', 'know', 'think',
  'hello', 'thanks', 'please', 'sorry', 'help', 'very', 'much', 'many',
]);

/** Parte el texto en palabras comparables, sin puntuación ni mayúsculas. */
function palabras(texto: string): string[] {
  return texto
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((p) => p.length > 0);
}

/**
 * ¿En qué idioma está escrito este texto?
 *
 * Devuelve `'es'` solo cuando hay evidencia clara. En cualquier otro caso `'en'`,
 * por la razón explicada en la cabecera del archivo.
 */
export function detectarIdiomaEscrito(texto: string): SupportedLanguage {
  // Un carácter exclusivo del español decide por sí solo: no hay forma razonable
  // de que aparezca una `ñ` o un `¿` en una frase en inglés.
  if (CARACTERES_ES.test(texto)) return 'es';

  const tokens = palabras(texto);
  if (tokens.length === 0) return 'en';

  let es = 0;
  let en = 0;
  for (const palabra of tokens) {
    if (PALABRAS_ES.has(palabra)) es++;
    if (PALABRAS_EN.has(palabra)) en++;
  }

  // Estrictamente mayor, no mayor o igual: un empate es duda, y la duda va al
  // inglés. Un empate ocurre de verdad en frases mixtas cortas, que es justo el
  // caso donde equivocarse hacia el español apagaría la corrección sin motivo.
  return es > en ? 'es' : 'en';
}
