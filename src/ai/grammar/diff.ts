/**
 * S3-T3 · Diff palabra a palabra entre el texto original y el corregido.
 * Dueño: Isaac.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO
 * El modelo T5 devuelve la frase corregida entera ("I went to the store"), pero el
 * contrato `Edit` de `contracts.ts` pide algo más fino: QUÉ palabra cambió, en qué
 * posición del texto original, y de qué tipo es el cambio. Eso es lo que la UI de
 * Monestel necesita para pintar el rojo→verde encima de cada palabra concreta.
 *
 * CÓMO: alineamos ambas frases con LCS (Longest Common Subsequence), la misma idea
 * que usa `git diff`, pero sobre palabras en vez de líneas. De la alineación salen
 * las sustituciones, inserciones y eliminaciones.
 *
 * Es lógica pura (sin modelo ni navegador), así que se testea con vitest.
 */

import type { Edit } from '@shared/contracts';

export interface Token {
  word: string;
  /** Índice de la palabra dentro del texto original. */
  index: number;
}

/** Separa por espacios en blanco, conservando la palabra tal cual se escribió. */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const matches = text.match(/\S+/g) ?? [];
  matches.forEach((word, index) => tokens.push({ word, index }));
  return tokens;
}

/**
 * Forma canónica para COMPARAR (no para mostrar): minúsculas y sin signos de
 * puntuación pegados a los extremos.
 *
 * DECISIÓN A REVISAR CON EL EQUIPO: al ignorar mayúsculas y puntuación, un cambio
 * como "hello" → "Hello." no genera un `Edit`. Se hizo así para que la UI no se
 * llene de marcas triviales en cada frase. Si el equipo decide que la capitalización
 * sí debe corregirse visiblemente, se quita esta normalización.
 */
export function normalize(word: string): string {
  return word.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
}

/** Distancia de edición clásica. Se usa para distinguir un typo de otra palabra. */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

/** 1 = idénticas, 0 = nada que ver. */
function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

/**
 * Clasifica el tipo de cambio.
 *
 * Heurística deliberadamente simple: si las dos palabras se parecen mucho, casi
 * siempre es un error de escritura ("recieve" → "receive"); si no se parecen, es un
 * cambio gramatical ("goed" → "went", "have" → "has").
 *
 * No emitimos `'word-choice'`: distinguir "una palabra más natural" de "una
 * corrección gramatical" requiere análisis semántico que este diff no hace, y
 * preferimos no adivinar. El tipo existe en el contrato para las sugerencias (S6-T4).
 */
export function classifyEdit(original: string, corrected: string): Edit['type'] {
  if (!original || !corrected) return 'grammar'; // inserción o eliminación
  return similarity(normalize(original), normalize(corrected)) >= 0.7
    ? 'spelling'
    : 'grammar';
}

type Op =
  | { kind: 'equal' }
  | { kind: 'del'; aIndex: number; word: string }
  | { kind: 'ins'; aIndex: number; word: string };

/** Alinea ambas secuencias por LCS y devuelve la lista de operaciones en orden. */
function align(a: Token[], b: Token[]): Op[] {
  const na = a.map((t) => normalize(t.word));
  const nb = b.map((t) => normalize(t.word));

  // dp[i][j] = longitud de la subsecuencia común más larga entre a[i..] y b[j..]
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] =
        na[i] === nb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (na[i] === nb[j]) {
      ops.push({ kind: 'equal' });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ kind: 'del', aIndex: i, word: a[i].word });
      i++;
    } else {
      ops.push({ kind: 'ins', aIndex: i, word: b[j].word });
      j++;
    }
  }
  while (i < a.length) ops.push({ kind: 'del', aIndex: i, word: a[i++].word });
  while (j < b.length) ops.push({ kind: 'ins', aIndex: a.length, word: b[j++].word });

  return ops;
}

/**
 * Produce la lista de `Edit` que consume la UI.
 *
 * Las operaciones contiguas de borrado/inserción se agrupan y se emparejan: así
 * "goed" borrado + "went" insertado en el mismo punto se reporta como UNA
 * sustitución, que es lo que el usuario percibe, en vez de dos cambios sueltos.
 */
export function diffWords(original: string, corrected: string): Edit[] {
  const a = tokenize(original);
  const b = tokenize(corrected);
  const ops = align(a, b);

  const edits: Edit[] = [];
  let k = 0;

  while (k < ops.length) {
    if (ops[k].kind === 'equal') {
      k++;
      continue;
    }

    // Recogemos el bloque completo de cambios contiguos.
    const dels: Op[] = [];
    const ins: Op[] = [];
    while (k < ops.length && ops[k].kind !== 'equal') {
      if (ops[k].kind === 'del') dels.push(ops[k]);
      else ins.push(ops[k]);
      k++;
    }

    const pairs = Math.max(dels.length, ins.length);
    for (let p = 0; p < pairs; p++) {
      const del = dels[p] as Extract<Op, { kind: 'del' }> | undefined;
      const add = ins[p] as Extract<Op, { kind: 'ins' }> | undefined;
      const originalWord = del?.word ?? '';
      const correctedWord = add?.word ?? '';

      edits.push({
        // Para una inserción pura no hay palabra original: usamos el punto del
        // texto original donde se insertaría.
        index: del?.aIndex ?? add?.aIndex ?? 0,
        original: originalWord,
        corrected: correctedWord,
        type: classifyEdit(originalWord, correctedWord),
      });
    }
  }

  return edits;
}
