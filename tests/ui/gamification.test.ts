import { describe, it, expect } from 'vitest';
import { computeStreak, countMasteredPhrases } from '../../src/ui/progress/gamification';
import type { SessionSummary } from '../../src/core/sessionStore';
import type { ChatMessage } from '../../src/shared/contracts';

const DIA = 24 * 60 * 60 * 1000;
const HOY = new Date(2026, 7, 10, 15, 0, 0).getTime(); // 10 ago 2026, 15:00 local

function sesion(startedAt: number): SessionSummary {
  return {
    id: `s-${startedAt}`,
    startedAt,
    endedAt: startedAt,
    userTurns: 1,
    words: 3,
    correctedTurns: 0,
    pronunciationAvg: null,
    pronunciationBest: null,
    pronunciationWorst: null,
  };
}

describe('computeStreak (S9-T2, racha)', () => {
  it('sin sesiones la racha es cero', () => {
    expect(computeStreak([], HOY)).toBe(0);
  });

  it('una sesion hoy cuenta como racha de 1', () => {
    expect(computeStreak([sesion(HOY)], HOY)).toBe(1);
  });

  it('hoy + ayer + antier es una racha de 3', () => {
    const sesiones = [sesion(HOY), sesion(HOY - DIA), sesion(HOY - 2 * DIA)];
    expect(computeStreak(sesiones, HOY)).toBe(3);
  });

  it('varias sesiones el mismo dia cuentan una sola vez', () => {
    const sesiones = [sesion(HOY), sesion(HOY - 1000), sesion(HOY - 2000)];
    expect(computeStreak(sesiones, HOY)).toBe(1);
  });

  it('si todavia no se practico hoy pero si ayer, la racha sigue viva', () => {
    expect(computeStreak([sesion(HOY - DIA)], HOY)).toBe(1);
  });

  it('sin sesion hoy ni ayer, la racha esta rota', () => {
    expect(computeStreak([sesion(HOY - 2 * DIA)], HOY)).toBe(0);
  });
});

describe('countMasteredPhrases (S9-T2, frases dominadas)', () => {
  function mensaje(over: Partial<ChatMessage>): ChatMessage {
    return { id: 'm', role: 'user', text: 'hi', ts: 0, ...over };
  }

  it('sin mensajes no hay frases dominadas', () => {
    expect(countMasteredPhrases([])).toBe(0);
  });

  it('cuenta solo los turnos del estudiante con puntaje >= 80', () => {
    const msgs = [
      mensaje({ pronunciation: { overall: 85, words: [], dtwDistance: 0 } }),
      mensaje({ pronunciation: { overall: 79, words: [], dtwDistance: 0 } }),
      mensaje({ pronunciation: { overall: 92, words: [], dtwDistance: 0 } }),
    ];
    expect(countMasteredPhrases(msgs)).toBe(2);
  });

  it('no cuenta mensajes del tutor aunque traigan pronunciation', () => {
    const msgs = [
      mensaje({ role: 'tutor', pronunciation: { overall: 95, words: [], dtwDistance: 0 } }),
    ];
    expect(countMasteredPhrases(msgs)).toBe(0);
  });

  it('no cuenta turnos sin puntaje de pronunciacion', () => {
    expect(countMasteredPhrases([mensaje({})])).toBe(0);
  });
});
