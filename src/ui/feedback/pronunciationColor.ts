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

/**
 * Ningun nivel usa un verbo en imperativo dirigido al estudiante (evitar
 * "sigue practicando", "repeti", etc. como etiqueta corta): la misma razon
 * por la que `fraseObjetivo.ts` prohibe decir "lo dijiste mal" y exige "no
 * te entendi bien" — es una senal con falsos positivos (el puntaje acustico
 * pesa mas la voz que la pronunciacion, R03 en s9-t3-calibracion-voz-real.md),
 * asi que una etiqueta que suene a orden o a reprobacion puede estar
 * regañando a alguien que en realidad pronuncio bien.
 */
export const TIER_LABEL: Record<ScoreTier, string> = {
  good: '¡Excelente!',
  ok: '¡Bien hecho!',
  bad: 'Vas mejorando',
};

/**
 * Una linea de animo por nivel, para no dejar un puntaje bajo solo con una
 * etiqueta roja: es una app de aprendizaje, y un estudiante que recien
 * empieza necesita saber que un puntaje bajo es parte de practicar, no un
 * fracaso.
 */
export const TIER_ENCOURAGEMENT: Record<ScoreTier, string> = {
  good: 'Tu pronunciación de esta frase es muy clara.',
  ok: 'Vas por buen camino. Repetí la frase una vez más para afinar los detalles.',
  bad: 'Este puntaje compara también el timbre de tu voz contra el de la referencia, no solo la pronunciación — un número bajo no siempre significa que lo dijiste mal. Escuchá la frase de referencia y repetila las veces que necesites.',
};

export function scoreColor(score: number): string {
  return TIER_COLOR[scoreTier(score)];
}
