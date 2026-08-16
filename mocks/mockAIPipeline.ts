import type { AIPipeline, ChatMessage, SupportedLanguage } from '@shared/contracts';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface MockAIPipelineOptions {
  /**
   * Idioma que devuelve `transcribe`, para ejercitar el camino bilingüe.
   *
   * Existe porque el turno en español cambia tres cosas en el orquestador —salta la
   * corrección gramatical, salta las sugerencias y cambia la instrucción del tutor— y
   * sin poder simularlo esas tres ramas no se pueden probar sin descargar modelos.
   */
  language?: SupportedLanguage;
}

/**
 * Mock del pipeline de IA (dueño real: Isaac).
 * Respuestas fijas con latencia simulada para desarrollar UI y orquestador.
 */
export function createMockAIPipeline(options: MockAIPipelineOptions = {}): AIPipeline {
  return {
    async init(onProgress) {
      for (let p = 0; p <= 1; p += 0.25) {
        onProgress?.('whisper-tiny (mock)', p);
        await delay(150);
      }
    },
    async transcribe(_pcm, language) {
      await delay(400);
      // El idioma forzado gana sobre el simulado: es el comportamiento real del
      // worker, donde `language` fija el idioma en vez de detectarlo.
      const idioma = language ?? options.language ?? 'en';
      if (idioma === 'es') {
        return {
          text: 'Quiero hablar sobre mi trabajo',
          words: [
            { word: 'Quiero', start: 0.0, end: 0.4 },
            { word: 'hablar', start: 0.4, end: 0.8 },
            { word: 'sobre', start: 0.8, end: 1.1 },
            { word: 'mi', start: 1.1, end: 1.25 },
            { word: 'trabajo', start: 1.25, end: 1.8 },
          ],
          language: 'es' as const,
        };
      }
      return {
        text: 'I goed to the store yesterday',
        words: [
          { word: 'I', start: 0.0, end: 0.2 },
          { word: 'goed', start: 0.2, end: 0.6 },
          { word: 'to', start: 0.6, end: 0.75 },
          { word: 'the', start: 0.75, end: 0.9 },
          { word: 'store', start: 0.9, end: 1.3 },
          { word: 'yesterday', start: 1.3, end: 2.0 },
        ],
        language: 'en' as const,
      };
    },
    async correctGrammar(text) {
      await delay(300);
      return {
        corrected: text.replace('goed', 'went'),
        edits: [{ index: 1, original: 'goed', corrected: 'went', type: 'grammar' }],
      };
    },
    async suggest() {
      await delay(300);
      return ['Try: "I went shopping yesterday" — more natural', 'Add detail: what did you buy?'];
    },
    async reply(history: ChatMessage[], language?: SupportedLanguage) {
      await delay(400);
      // En español el tutor cambia de tarea: primero da la frase en inglés que el
      // estudiante no supo armar, después sigue conversando.
      if (language === 'es') {
        return 'In English: I want to talk about my job. What do you do for work?';
      }
      return history.length
        ? 'Nice! What did you buy at the store?'
        : "Hi! I'm your English tutor. Tell me about your day.";
    },
    async speak() {
      await delay(300);
      return new Float32Array(16000); // 1 s de silencio como referencia
    },
  };
}
