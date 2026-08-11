import type { ChatMessage } from '@shared/contracts';
import type { SessionSummary } from '@core/sessionStore';
import { scoreTier } from '@ui/feedback/pronunciationColor';

/**
 * Gamificacion ligera (S9-T2, opcional). Dueño: Monestel (UI).
 *
 * Dos metricas, las dos derivadas de datos que ya existen — nada inventado:
 * - Racha: dias consecutivos con al menos una sesion guardada
 *   (`SessionStore.list()`, ya cableado por S9-T1).
 * - Frases dominadas: turnos del estudiante con puntaje de pronunciacion en
 *   el nivel "good" (>=80, mismo umbral que colorea todo el resto de la UI).
 *
 * No hay racha record, insignias ni niveles: el plan semanal pide "ligera",
 * y estas dos son las que tienen un dato real detras sin agregar nada al
 * contrato de `sessionStore.ts` (Alejandro, fuera de `src/ui/`).
 */

function inicioDelDia(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

const UN_DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Dias consecutivos con sesion, contando hacia atras desde hoy.
 *
 * Si hoy todavia no se practico pero ayer si, la racha sigue contando desde
 * ayer: se rompe recien a medianoche, no apenas cambia el dia. Es el mismo
 * criterio que usan apps de racha diaria conocidas, y evita castigar a
 * alguien que todavia no abrio la app hoy.
 */
export function computeStreak(sessions: SessionSummary[], ahora: number = Date.now()): number {
  if (sessions.length === 0) return 0;

  const dias = new Set(sessions.map((s) => inicioDelDia(s.startedAt)));
  let cursor = inicioDelDia(ahora);
  if (!dias.has(cursor)) cursor -= UN_DIA_MS;

  let racha = 0;
  while (dias.has(cursor)) {
    racha++;
    cursor -= UN_DIA_MS;
  }
  return racha;
}

/**
 * Turnos del estudiante con puntaje de pronunciacion "good" (>=80).
 * Cuenta frases, no palabras: una frase de seis palabras bien pronunciada
 * cuenta una vez, igual que una de dos.
 */
export function countMasteredPhrases(messages: ChatMessage[]): number {
  return messages.filter(
    (m) => m.role === 'user' && !!m.pronunciation && scoreTier(m.pronunciation.overall) === 'good'
  ).length;
}
