import type { Edit } from '@shared/contracts';

/**
 * Traduccion de `Edit.type` (S3-T4). Dueño: Monestel (UI).
 *
 * Un solo lugar para que Chat.tsx y Grammar.tsx no diverjan en como le
 * llaman al mismo tipo de correccion al usuario.
 */
export const TYPE_LABEL: Record<Edit['type'], string> = {
  grammar: 'Gramática',
  spelling: 'Ortografía',
  'word-choice': 'Elección de palabras',
};
