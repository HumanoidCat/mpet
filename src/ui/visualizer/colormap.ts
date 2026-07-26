/**
 * Colormap para el espectrograma (S5-T3). Dueño: Monestel (UI).
 * Función pura -> se puede probar en tests/ui/ sin necesitar un canvas.
 * Mapea dB (típicamente -80..0) a un color estilo "jet" (azul->verde->rojo),
 * igual al de referencia del diseño de Figma Make.
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

const DB_MIN = -80;
const DB_MAX = 0;

/** Normaliza dB a [0, 1], recortando fuera de rango. */
export function normalizeDb(db: number, min = DB_MIN, max = DB_MAX): number {
  const t = (db - min) / (max - min);
  return Math.min(1, Math.max(0, t));
}

/** Colormap tipo "jet": azul oscuro (silencio) -> cian -> verde -> amarillo -> rojo (fuerte). */
export function jetColormap(t: number): RGB {
  const v = Math.min(1, Math.max(0, t));
  const r = Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(4 * v - 3))));
  const g = Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(4 * v - 2))));
  const b = Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(4 * v - 1))));
  return { r, g, b };
}

/** Atajo: dB -> color CSS listo para usar en canvas. */
export function dbToColor(db: number, min = DB_MIN, max = DB_MAX): string {
  const { r, g, b } = jetColormap(normalizeDb(db, min, max));
  return `rgb(${r}, ${g}, ${b})`;
}
