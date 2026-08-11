/**
 * Traduce errores de `getUserMedia()` (S7-T3) a mensajes accionables.
 * Dueño: Monestel (UI).
 *
 * `getUserMedia()` rechaza con un `DOMException` cuyo `.name` distingue la
 * causa real: permiso denegado, sin micrófono conectado, o dispositivo en
 * uso por otra aplicación. El mensaje genérico anterior no distinguía estos
 * casos, así que el usuario no sabía si tenía que cambiar un permiso del
 * navegador o cerrar otra aplicación.
 */
export function micErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : undefined;
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Permiso de micrófono denegado. Habilítalo en la configuración del navegador y vuelve a intentar.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No se encontró ningún micrófono conectado.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'El micrófono está en uso por otra aplicación. Ciérrala y vuelve a intentar.';
    case 'OverconstrainedError':
      return 'El micrófono no soporta la configuración de audio requerida.';
    default:
      return 'No se pudo acceder al micrófono. Revisa los permisos del navegador.';
  }
}
