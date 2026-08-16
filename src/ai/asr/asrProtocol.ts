/**
 * Protocolo de mensajes entre el hilo principal y el Web Worker de ASR.
 * Dueño: Isaac (S2-T4).
 *
 * POR QUÉ un archivo aparte: el worker y su cliente viven en hilos distintos y
 * no pueden compartir objetos, solo mensajes serializados. Tener los tipos en un
 * único sitio evita que se desincronicen (un typo aquí = un bug mudo en runtime).
 */

import type { SupportedLanguage, Transcription } from '@shared/contracts';

/**
 * Modelos ASR admitidos.
 *
 * Las variantes `.en` son **solo inglés**: no reconocen español ni mal, sencillamente
 * no lo tienen dentro. Las variantes sin sufijo son las multilingües del mismo tamaño
 * y arquitectura — mismo peso de descarga, 99 idiomas.
 *
 * `tiny.en` fue el validado en el spike S1-T7 (RTF ≈ 0.3) y sigue siendo la referencia
 * de rendimiento; `tiny` multilingüe es lo que hace falta para el tutor bilingüe.
 */
export type AsrModelId =
  | 'Xenova/whisper-tiny.en'
  | 'Xenova/whisper-base.en'
  | 'Xenova/whisper-tiny'
  | 'Xenova/whisper-base';

/** Nivel de cuantización. q8 fue el medido en S1-T7: 41 MB, buena precisión. */
export type AsrDType = 'q8' | 'q4' | 'fp32';

/**
 * ¿El modelo entiende más de un idioma?
 *
 * No es cosmético: a un modelo `.en` no se le puede pasar la opción `language`, y
 * pasársela hace que transformers.js falle en vez de ignorarla. El worker consulta
 * esto antes de armar las opciones de inferencia.
 */
export function esMultilingue(model: AsrModelId): boolean {
  return !model.endsWith('.en');
}

/**
 * Idiomas que se le permiten detectar al reconocedor.
 *
 * Whisper multilingüe reconoce 99 idiomas, pero aquí solo interesan dos. Restringirlo
 * no es una limitación arbitraria: si el estudiante dice algo corto o ruidoso, un
 * detector libre puede devolver portugués o italiano —vecinos acústicos del español—
 * y la cadena de abajo no sabría qué hacer con eso. Acotar a los dos idiomas del
 * proyecto convierte un fallo silencioso en una elección entre dos opciones válidas.
 */
export const IDIOMAS: readonly SupportedLanguage[] = ['en', 'es'] as const;

/** Mensajes que el hilo principal envía AL worker. */
export type AsrRequest =
  | { type: 'init'; model: AsrModelId; dtype: AsrDType }
  | {
      type: 'transcribe';
      id: number;
      pcm: Float32Array;
      /**
       * Idioma forzado, o ausente para que el modelo lo detecte solo.
       *
       * El modo práctica lo fija en `'en'`: ahí se sabe qué frase se pidió repetir, y
       * dejar que el detector dude sobre una palabra suelta mal pronunciada solo
       * añade una forma de fallar. En conversación libre se deja detectar.
       */
      language?: SupportedLanguage;
    };

/** Mensajes que el worker devuelve al hilo principal. */
export type AsrResponse =
  | { type: 'progress'; model: string; progress: number }
  | { type: 'ready'; model: string }
  | { type: 'result'; id: number; result: Transcription }
  | { type: 'error'; id?: number; message: string };

/**
 * Config por defecto.
 *
 * **Multilingüe desde el arranque.** El coste es el mismo peso de descarga que la
 * variante inglesa, y sin esto el estudiante que no consigue armar la frase en inglés
 * no tiene cómo seguir la conversación. Lo que se pierde es algo de precisión en
 * inglés frente a `tiny.en`, que está afinado para un solo idioma: si al medir el WER
 * (S8-T1) la diferencia resulta grande, la alternativa es `Xenova/whisper-base`, que
 * recupera precisión a cambio de peso.
 */
export const DEFAULT_ASR_MODEL: AsrModelId = 'Xenova/whisper-tiny';
export const DEFAULT_ASR_DTYPE: AsrDType = 'q8';

/**
 * Normaliza lo que Whisper informa como idioma a los dos que la aplicación trata.
 *
 * Whisper devuelve el idioma de formas distintas según la versión y la opción usada:
 * `'en'`, `'english'`, o a veces con el formato de testigo `'<|en|>'`. Y puede devolver
 * un idioma que no es ninguno de los dos, porque internamente reconoce 99.
 *
 * Cualquier cosa que no sea reconociblemente español se trata como inglés. Es la
 * dirección conservadora: equivocarse hacia el inglés deja la aplicación funcionando
 * como lo hacía antes del bilingüe (corrige gramática, conversa en inglés);
 * equivocarse hacia el español apagaría la corrección gramatical sin motivo.
 */
export function normalizarIdioma(crudo: unknown): SupportedLanguage {
  if (typeof crudo !== 'string') return 'en';
  const limpio = crudo.toLowerCase().replace(/[<|>]/g, '').trim();
  return limpio === 'es' || limpio === 'spanish' || limpio === 'castilian' ? 'es' : 'en';
}
