/**
 * S6-T1 — DTW: alineamiento temporal dinámico.
 *
 * Dos personas que dicen la misma frase nunca la dicen a la misma velocidad. Una
 * alarga las vocales, otra corta las consonantes finales, y las pausas caen en
 * sitios distintos. Comparar las dos secuencias de MFCC trama a trama daría una
 * distancia enorme aunque la pronunciación fuera idéntica: estaríamos midiendo
 * quién habla más rápido.
 *
 * DTW resuelve eso buscando la **correspondencia óptima** entre ambas líneas de
 * tiempo. Construye la matriz de costo acumulado
 *
 *   D[i][j] = d(i, j) + min( D[i-1][j], D[i][j-1], D[i-1][j-1] )
 *
 * donde d(i, j) es la distancia entre la trama i del usuario y la j de la
 * referencia. Los tres términos del mínimo son los tres movimientos permitidos:
 * avanzar solo en el usuario (alargó), solo en la referencia (acortó), o en
 * ambos (van al mismo ritmo). El camino de menor costo total desde (0,0) hasta
 * el final es el alineamiento, y su costo medio es la medida de parecido.
 *
 * Tres propiedades del camino, que salen de la propia recurrencia:
 *
 *   · Empieza en (0,0) y termina en (n-1, m-1) — se comparan las frases enteras.
 *   · Es monótono — el tiempo no retrocede.
 *   · Es continuo — no se salta tramas.
 */

/** Un par de índices del camino: la trama `i` del usuario alinea con la `j`. */
export interface DtwPair {
  i: number;
  j: number;
}

export interface DtwOptions {
  /**
   * Ignorar el primer coeficiente de cada vector. Por defecto **true**, y es
   * importante: en los MFCC el c₀ es el volumen (ver S5-T2). Incluirlo haría que
   * el puntaje bajara por hablar más flojo que la referencia, que es justo lo
   * que el proyecto quiere evitar.
   */
  ignoreFirstCoeff?: boolean;
  /**
   * Radio de la banda de Sakoe–Chiba, en tramas. Limita cuánto puede desviarse
   * el alineamiento de la diagonal: sin límite, DTW puede aparear el principio
   * de una frase con el final de la otra si eso baja el costo, lo que produce
   * alineamientos degenerados. `undefined` deja la búsqueda sin restricción.
   */
  bandRadius?: number;
}

export interface DtwResult {
  /** Costo acumulado del camino óptimo. */
  distance: number;
  /** Costo medio por par alineado: comparable entre frases de distinto largo. */
  normalizedDistance: number;
  /** El alineamiento, de (0,0) al final. */
  path: DtwPair[];
}

/** Distancia euclídea entre dos vectores, opcionalmente saltando el primero. */
export function euclidean(a: Float32Array | number[], b: Float32Array | number[], from = 0): number {
  const n = Math.min(a.length, b.length);
  let suma = 0;
  for (let k = from; k < n; k++) {
    const d = a[k] - b[k];
    suma += d * d;
  }
  return Math.sqrt(suma);
}

const INFINITO = Number.POSITIVE_INFINITY;

/**
 * Alinea dos secuencias de vectores de características y devuelve el camino
 * óptimo junto con su costo.
 *
 * La matriz se guarda plana en un `Float64Array` de (n+1)·(m+1): con frases de
 * 3 segundos son ~190 tramas por lado, o sea unas 36 000 celdas. Cabe de sobra
 * y evita el costo de crear un arreglo de arreglos por cada comparación.
 */
export function dtw(
  user: (Float32Array | number[])[],
  reference: (Float32Array | number[])[],
  options: DtwOptions = {}
): DtwResult {
  const n = user.length;
  const m = reference.length;

  if (n === 0 || m === 0) {
    return { distance: 0, normalizedDistance: 0, path: [] };
  }

  const desde = options.ignoreFirstCoeff === false ? 0 : 1;
  const radio = options.bandRadius;

  // Se usa un borde extra de infinitos para no tener que tratar aparte la
  // primera fila y la primera columna.
  const ancho = m + 1;
  const D = new Float64Array((n + 1) * ancho).fill(INFINITO);
  D[0] = 0;

  for (let i = 1; i <= n; i++) {
    // Con banda, solo se calculan las columnas cercanas a la diagonal.
    let desdeJ = 1;
    let hastaJ = m;
    if (radio !== undefined) {
      const centro = ((i - 1) * m) / n;
      desdeJ = Math.max(1, Math.floor(centro - radio) + 1);
      hastaJ = Math.min(m, Math.ceil(centro + radio) + 1);
    }

    for (let j = desdeJ; j <= hastaJ; j++) {
      const costo = euclidean(user[i - 1], reference[j - 1], desde);

      const arriba = D[(i - 1) * ancho + j];
      const izquierda = D[i * ancho + (j - 1)];
      const diagonal = D[(i - 1) * ancho + (j - 1)];

      const mejor = Math.min(arriba, izquierda, diagonal);
      D[i * ancho + j] = mejor === INFINITO ? INFINITO : costo + mejor;
    }
  }

  const distance = D[n * ancho + m];
  if (!Number.isFinite(distance)) {
    // La banda era tan estrecha que no dejó ningún camino completo.
    return { distance: INFINITO, normalizedDistance: INFINITO, path: [] };
  }

  // Reconstrucción del camino, del final hacia el principio.
  const path: DtwPair[] = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    path.push({ i: i - 1, j: j - 1 });

    const arriba = D[(i - 1) * ancho + j];
    const izquierda = D[i * ancho + (j - 1)];
    const diagonal = D[(i - 1) * ancho + (j - 1)];
    const mejor = Math.min(arriba, izquierda, diagonal);

    // Se prefiere la diagonal ante empates: es el movimiento que no distorsiona
    // el tiempo, así que ante costos iguales conviene el alineamiento más recto.
    if (mejor === diagonal) {
      i--;
      j--;
    } else if (mejor === arriba) {
      i--;
    } else {
      j--;
    }
  }
  path.reverse();

  return {
    distance,
    // Normalizar por el largo del camino hace comparables frases de distinta
    // duración: sin esto, una frase larga siempre puntuaría peor.
    normalizedDistance: distance / path.length,
    path,
  };
}

/**
 * Costo local medio de un tramo del camino. Es lo que permite puntuar una
 * palabra suelta en vez de la frase entera (S6-T2).
 */
export function segmentCost(
  path: DtwPair[],
  user: (Float32Array | number[])[],
  reference: (Float32Array | number[])[],
  fromFrame: number,
  toFrame: number,
  options: DtwOptions = {}
): number {
  const desde = options.ignoreFirstCoeff === false ? 0 : 1;

  let suma = 0;
  let cuenta = 0;
  for (const { i, j } of path) {
    if (i >= fromFrame && i < toFrame) {
      suma += euclidean(user[i], reference[j], desde);
      cuenta++;
    }
  }
  return cuenta > 0 ? suma / cuenta : 0;
}
