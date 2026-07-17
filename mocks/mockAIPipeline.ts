import type { AIPipeline, ChatMessage } from '@shared/contracts';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mock del pipeline de IA (dueño real: Isaac).
 * Respuestas fijas con latencia simulada para desarrollar UI y orquestador.
 */
export function createMockAIPipeline(): AIPipeline {
  return {
    async init(onProgress) {
      for (let p = 0; p <= 1; p += 0.25) {
        onProgress?.('whisper-tiny (mock)', p);
        await delay(150);
      }
    },
    async transcribe() {
      await delay(400);
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
    async reply(history: ChatMessage[]) {
      await delay(400);
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
