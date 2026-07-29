import { describe, it, expect } from 'vitest';
import { computeGrammarStats } from '../../src/ui/feedback/grammarStats';
import type { ChatMessage } from '../../src/shared/contracts';

function userMsg(text: string, edits: ChatMessage['correction']): ChatMessage {
  return { id: text, role: 'user', text, correction: edits, ts: 0 };
}

describe('computeGrammarStats (Grammar screen, S3-T4 shell)', () => {
  it('sin mensajes: score null, todo en cero', () => {
    const stats = computeGrammarStats([]);
    expect(stats.score).toBeNull();
    expect(stats.totalEdits).toBe(0);
    expect(stats.corrected).toHaveLength(0);
  });

  it('mensajes sin correcciones: score 100%', () => {
    const messages: ChatMessage[] = [
      userMsg('I went home', undefined),
      { id: 't1', role: 'tutor', text: 'Nice!', ts: 0 },
    ];
    const stats = computeGrammarStats(messages);
    expect(stats.totalUserMsgs).toBe(1);
    expect(stats.cleanMsgs).toBe(1);
    expect(stats.score).toBe(100);
  });

  it('cuenta correcciones reales y calcula el score sobre mensajes de usuario', () => {
    const messages: ChatMessage[] = [
      userMsg('I goed home', {
        corrected: 'I went home',
        edits: [{ index: 1, original: 'goed', corrected: 'went', type: 'grammar' }],
      }),
      userMsg('I went home', undefined),
    ];
    const stats = computeGrammarStats(messages);
    expect(stats.totalUserMsgs).toBe(2);
    expect(stats.corrected).toHaveLength(1);
    expect(stats.totalEdits).toBe(1);
    expect(stats.cleanMsgs).toBe(1);
    expect(stats.score).toBe(50);
  });
});
