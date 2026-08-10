/**
 * Color por palabra segun el puntaje de pronunciacion (S6-T3). Dueño: Monestel (UI).
 *
 * Umbrales fijados en docs/04-plan-semanal.md: verde >=80, amarillo 60-79, rojo <60.
 * Un solo lugar para el mapeo asi Chat.tsx y la pantalla Pronunciation no pueden
 * divergir en los colores que le muestran al mismo dato.
 */

export type ScoreTier = 'good' | 'ok' | 'bad';

export function scoreTier(score: number): ScoreTier {
  if (score >= 80) return 'good';
  if (score >= 60) return 'ok';
  return 'bad';
}

export const TIER_COLOR: Record<ScoreTier, string> = {
  good: '#16A34A',
  ok: '#D97706',
  bad: '#DC2626',
};

export const TIER_LABEL: Record<ScoreTier, string> = {
  good: 'Good',
  ok: 'Needs Work',
  bad: 'Keep Practicing',
};

export function scoreColor(score: number): string {
  return TIER_COLOR[scoreTier(score)];
}
