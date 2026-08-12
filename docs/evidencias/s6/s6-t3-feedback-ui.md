# Evidencia S6-T3 — Feedback de pronunciación en la interfaz y limpieza de datos falsos

> Jose Pablo Monestel (UI) · RF-17
> Reproducible con `npx vitest run tests/ui`.

## Resumen

Dos cosas quedaban pendientes desde que el comparador acústico (Fabrizio,
S6-T1/T2) empezó a dejar `PronunciationResult` real en `ChatMessage.pronunciation`:
nadie lo mostraba, y tres pantallas del prototipo portado de Figma Make
(`Suggestions`, `Progress`/Summary, `Models`) seguían mostrando contenido
escrito a mano, desconectado de cualquier contrato real, incluyendo un modelo
de IA que nunca existió ("Phoneme Analyzer, 124 MB"). Ambas cosas se resolvieron
juntas porque son la misma causa raíz: pantallas que nacieron como andamio antes
de que el resto del equipo terminara sus contratos, y que quedaron sin
actualizar después.

## 1. Puntaje de pronunciación por palabra (RF-17)

### Qué se construyó

- `src/ui/feedback/pronunciationColor.ts` — un único mapeo puntaje→color/umbral
  (verde ≥80, amarillo 60–79, rojo <60, según `docs/04-plan-semanal.md`), para
  que el chat y la pantalla Pronunciation no puedan divergir en qué color le
  muestran al mismo dato.
- `src/ui/chat/highlight.ts` (`buildPronunciationSegments`) — empareja el texto
  transcrito con `WordScore[]` **por posición**, no por texto: dos palabras
  iguales en la misma frase no serían distinguibles por texto, pero sí por su
  índice. Es el mismo criterio que ya usaba `buildSegments` (S3-T4) para los
  `Edit` del corrector.
- `Chat.tsx` — subraya cada palabra con el color de su puntaje, **solo cuando no
  hay corrección de gramática que mostrar en esa burbuja**. Decisión de diseño:
  los segmentos de corrección pueden reemplazar palabras (largo distinto al
  original), y mezclar los dos esquemas de color en la misma burbuja confunde
  más de lo que informa.
- `Pronunciation.tsx` — pantalla standalone cableada a
  `ChatMessage.pronunciation` real, con selector de frase, medidor circular del
  puntaje global y detalle por palabra (marcas de tiempo, duración).

### Lo que a propósito no se hizo

El andamio de Figma incluía campos `ipa_expected` / `ipa_user` que no existen en
el contrato: el comparador mide **distancia acústica entre MFCC con DTW**, no
reconoce fonemas. Inventar esos campos habría mostrado una transcripción
fonética falsa. Solo se muestra lo que el contrato realmente entrega: un
puntaje 0–100 por palabra y sus tiempos.

### Verificación

- `tests/ui/pronunciationColor.test.ts` (3) y `tests/ui/highlight.test.ts` (7,
  4 nuevas para `buildPronunciationSegments`).
- Manual, en navegador, modo `?mock=1`: turno completo → chat muestra la
  corrección de gramática (el puntaje queda suprimido en esa burbuja, según la
  regla de arriba) → pantalla Pronunciation muestra 78/100 con detalle por
  palabra, dato real de punta a punta.

## 2. Limpieza de las pantallas con datos falsos

| Pantalla | Antes | Ahora |
|---|---|---|
| `Suggestions.tsx` | 6 sugerencias con categoría/prioridad/ejemplos escritos a mano | Lee `ChatMessage.suggestions` real (`AIPipeline.suggest()`); vacío hasta que se implemente S6-T4, que hoy siempre devuelve `[]` — no es un error, es honesto |
| `Models.tsx` | Catálogo de 7 modelos con tamaño/versión inventados, incluido un "Phoneme Analyzer, 124 MB" inexistente | Lee el progreso real de `AIPipeline.init()` (mismo evento `model-progress` que ya consume `Splash.tsx`) |
| `Progress.tsx` (Summary) | Duración/fecha/título inventados; "Grammar/Fluency/Vocabulary %" que no existen como métricas reales; errores más comunes, línea de tiempo y recomendaciones de IA sin ningún dato detrás | Resumen real de la sesión con `resumirSesion()` (Alejandro, S5-T6); ver además `s9-t1-progreso-entre-sesiones.md` para el historial entre sesiones, añadido después |

Ningún dato se "aproxima" o se rellena con un valor plausible: donde el
contrato real no entrega una métrica (fluidez, vocabulario), la métrica se
retira de la pantalla en vez de simularse.

### Verificación

`npm run typecheck && npm test && npm run build` en verde tras cada cambio;
prueba manual en navegador de las tres pantallas con datos generados por el
modo `?mock=1` (sugerencias reales del mock, progreso de carga real, resumen
de sesión con los números de la conversación efectivamente sostenida).
