# Evidencia S7-T3 — Pulido de UX: estados de carga, errores de micrófono, reintentos

> Jose Pablo Monestel (UI)
> Reproducible con `npx vitest run tests/ui/micErrorMessage.test.ts`.

## Resumen

De los tres puntos de esta tarea, dos ya estaban resueltos por trabajo previo
y uno tenía una brecha concreta:

| Punto | Estado antes | Qué faltaba |
|---|---|---|
| Estados de carga | Botón de mic con idle/grabando/procesando (S2-T6); barra de progreso de descarga de modelos en el splash y aviso de carga diferida del sintetizador (S7-T4, Isaac) | Nada — ya cubierto |
| Errores de micrófono | Un solo mensaje genérico para cualquier fallo de `getUserMedia()` | Distinguir la causa real |
| Reintentos | Ninguno — el usuario tenía que volver a pulsar el botón de mic por su cuenta, sin que el banner de error se lo ofreciera | Botón explícito |

## 1. Errores de micrófono por causa real

`getUserMedia()` rechaza con un `DOMException` cuyo `.name` distingue la causa:
permiso denegado, sin dispositivo, o dispositivo en uso por otra aplicación. El
mensaje anterior no los distinguía, así que el usuario no sabía si tenía que
cambiar un permiso del navegador o cerrar otra aplicación.

`src/ui/shell/micErrorMessage.ts` es una función pura que mapea
`err.name` a un mensaje accionable:

| `DOMException.name` | Mensaje |
|---|---|
| `NotAllowedError` / `PermissionDeniedError` | Permiso denegado, habilitarlo en el navegador |
| `NotFoundError` / `DevicesNotFoundError` | No hay micrófono conectado |
| `NotReadableError` / `TrackStartError` | En uso por otra aplicación |
| `OverconstrainedError` | Configuración de audio no soportada |
| Cualquier otro | Mensaje genérico anterior, como respaldo |

## 2. Reintentar y cerrar

El banner de error en `App.tsx` (compartido entre errores de mic y de
reproducción) ahora incluye:

- Un botón **Reintentar** que vuelve a llamar `onMicClick()` (para errores de
  mic) o `onPlay()` con los últimos `{text, slow}` pedidos, guardados en un
  `ref` porque `onPlay` no los recibe de vuelta si falla.
- Un botón **Cerrar** que limpia ambos estados de error sin reintentar.

## 3. Verificación

- `tests/ui/micErrorMessage.test.ts` (4 pruebas): permiso denegado, sin
  dispositivo, en uso por otra app, y caso genérico — usando `DOMException`
  real, no un mock de la excepción.
- `npm run typecheck && npm test && npm run build` en verde.
- No se pudo forzar un error real de `getUserMedia()` en este entorno (el
  navegador de prueba no tiene micrófono ni diálogo de permisos real), así que
  el camino de error se verificó por prueba unitaria de la función de mensajes
  más inspección de la lógica en `App.tsx`, no con el banner en pantalla en
  vivo. Pendiente de una prueba manual con permiso de micrófono denegado a
  propósito en un navegador real.
