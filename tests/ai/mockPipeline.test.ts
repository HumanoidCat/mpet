import { describe, it, expect } from 'vitest';
import { createMockAIPipeline } from '../../mocks/mockAIPipeline';

describe('Mock AIPipeline (contrato)', () => {
  it('transcribe devuelve texto y palabras alineadas', async () => {
    const ai = createMockAIPipeline();
    const r = await ai.transcribe(new Float32Array(0));
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.words[0].start).toBeLessThan(r.words[0].end);
  });

  it('correctGrammar corrige "goed" → "went"', async () => {
    const ai = createMockAIPipeline();
    const r = await ai.correctGrammar('I goed home');
    expect(r.corrected).toContain('went');
    expect(r.edits[0].type).toBe('grammar');
  });
});
