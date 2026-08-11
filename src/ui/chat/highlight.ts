import type { Edit, WordScore } from '@shared/contracts';

/**
 * Segmentacion de un texto corregido para resaltado en el chat (S3-T4).
 * Duenio actual: Alejandro (modulo UI asumido por baja del integrante).
 *
 * Dado el texto original y los edits del corrector gramatical, produce una
 * lista de segmentos renderizables: palabras normales, palabras con error
 * (se muestran tachadas) y su correccion (se muestra resaltada).
 */

export interface Segment {
  kind: 'plain' | 'error' | 'fix';
  text: string;
}

export function buildSegments(originalText: string, edits: Edit[]): Segment[] {
  const words = originalText.split(/\s+/).filter((w) => w.length > 0);
  const byIndex = new Map<number, Edit>();
  for (const e of edits) byIndex.set(e.index, e);

  const segments: Segment[] = [];
  words.forEach((word, i) => {
    const edit = byIndex.get(i);
    if (edit) {
      segments.push({ kind: 'error', text: edit.original });
      segments.push({ kind: 'fix', text: edit.corrected });
    } else {
      segments.push({ kind: 'plain', text: word });
    }
  });
  return segments;
}

export interface PronunciationSegment {
  text: string;
  /** null si el comparador no puntuo esta palabra (arreglos de distinto largo). */
  score: number | null;
}

/**
 * Empareja el texto transcrito con el puntaje por palabra (S6-T3).
 *
 * `words` viene de `transcription.words` (ver `src/core/orchestrator.ts`), que es
 * la misma tokenizacion que usa `buildSegments` para los indices de `Edit`. Por
 * eso empareja por posicion en vez de por texto: dos palabras iguales en la misma
 * frase no serian distinguibles por texto, pero si por su indice.
 */
export function buildPronunciationSegments(
  originalText: string,
  words: WordScore[]
): PronunciationSegment[] {
  const tokens = originalText.split(/\s+/).filter((w) => w.length > 0);
  return tokens.map((text, i) => ({ text, score: words[i]?.score ?? null }));
}
