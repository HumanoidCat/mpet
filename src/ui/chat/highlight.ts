import type { Edit } from '@shared/contracts';

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
