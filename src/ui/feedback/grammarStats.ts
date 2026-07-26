import type { ChatMessage } from '@shared/contracts';

/**
 * Estadísticas de gramática de la sesión (S3-T4 shell). Dueño: Monestel (UI).
 * Función pura, calculada SOLO de datos reales del historial de chat —
 * ningún número aquí es inventado.
 */

export interface GrammarStats {
  corrected: ChatMessage[];
  totalEdits: number;
  totalUserMsgs: number;
  cleanMsgs: number;
  /** Porcentaje de frases sin correcciones, o null si aún no hay frases. */
  score: number | null;
}

export function computeGrammarStats(messages: ChatMessage[]): GrammarStats {
  const corrected = messages.filter(
    (m) => m.role === 'user' && !!m.correction && m.correction.edits.length > 0
  );
  const totalEdits = corrected.reduce((sum, m) => sum + m.correction!.edits.length, 0);
  const totalUserMsgs = messages.filter((m) => m.role === 'user').length;
  const cleanMsgs = totalUserMsgs - corrected.length;
  const score = totalUserMsgs > 0 ? Math.round((cleanMsgs / totalUserMsgs) * 100) : null;

  return { corrected, totalEdits, totalUserMsgs, cleanMsgs, score };
}
