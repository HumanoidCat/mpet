✅ Checklist — Jose Pablo Monestel · Ingeniero Frontend/Visualización (src/ui/)

> Marca `[x]` cuando completes cada tarea. **Solo tú editas este archivo.**
> Detalle de cada tarea (horas, dificultad, herramientas): `docs/04-plan-semanal.md`.
> Regla: trabaja solo en `src/ui/` y `tests/ui/`, en ramas `feat/ui-*`, PR a `dev`.
> ⚠️ **Nunca esperes a los demás**: desarrolla todo contra `mocks/` (mockAudioEngine te da frames con FFT/pitch/MFCC; mockAIPipeline te da transcripciones; mockScorer te da puntajes).

## Semana 1 (7–13 jul)
- [x] S1-T8 · Wireframes (chat + visualizadores) y sistema de diseño básico
- [x] S1-T9 · Marco teórico inicial (con Fabrizio)

## Semana 2
- [x] S2-T6 · Chat: burbujas usuario/app, botón mic con estados (idle/grabando/procesando)

## Semana 3
- [x] S3-T2 · Waveform en Canvas a ≥30 fps (consume `onFrame`)
- [x] S3-T4 · Highlights de gramática en chat (rojo error → verde corrección)
- [x] Mi sección del documento Avance 1 (interfaz) + deck S3-T7

## Semana 4 — 🎯 AVANCE 1 (mar 28 jul)
- [x] Presentar mi parte en la demo

## Semana 5
- [x] S5-T3 · Espectrograma en Canvas (STFT → colormap, scroll temporal)
- [x] S5-T4 · Overlay de contorno de pitch sobre espectrograma

## Semana 6
- [x] S6-T3 · Feedback de pronunciación: colores por palabra + panel de detalle

## Semana 7 — 🎯 AVANCE 2 (mar 11 ago)
- [x] S7-T3 · Pulir UX: estados de carga, errores de micrófono, reintentos
- [x] Mi sección del documento Avance 2 + deck S7-T6

## Semana 8
- [x] S8-T4 · Pruebas de UI y compatibilidad (Chrome/Edge; documentar límites Firefox/Safari)

## Semana 9
- [x] S9-T1 · Pantalla de progreso: evolución del puntaje por sesión (con Alejandro)
- [x] S9-T2 · (Opcional) Gamificación ligera: racha, frases dominadas
- [ ] S9-T7 · Grabar video demo de respaldo completo

## Semana 10 — 🎯 ENTREGA FINAL (mar 8 sep)
- [ ] S10-T3 · Armar presentación final con el equipo

---

## Estado final — PR #69 mergeado a dev (10 ago)

Todo lo marcado `[x]` arriba está implementado, probado y verificado en
navegador. Antes de cada commit: `npm run typecheck && npm test && npm run
build` en verde (455 pruebas, 49 del módulo UI). Subido por PR #69
(`feat/ui-puntaje-pronunciacion` → `dev`), aprobado y mergeado — historial
detallado abajo, correcciones posteriores en la sección del 17 de agosto.

**Fuera de mi alcance, señalado y no tocado** (regla: solo `src/ui/` y
`tests/ui/`):
- `src/ai/createAIPipeline.ts` — placeholder del tutor con código de tarea
  visible al usuario (`"...S7-T2"`). Chip de tarea creado para Isaac.
- `src/audio/features/yin.ts` — Pitch Tracking vacío con voz real, detalle
  abajo. Chip de tarea creado para Fabrizio.
- La precisión del reconocimiento de voz (Whisper-tiny a veces transcribe
  mal) es una decisión de modelo ya documentada, no un bug — no requiere
  chip, solo queda anotado.

**Sin hacer, y no es código:** S9-T7 (video de respaldo, grabación manual) y
S10-T3 (presentación final, recién en septiembre y con todo el equipo).

## Detalle del cierre — actualizado 10 ago

No queda ninguna tarea real pendiente (S9-T7 es grabación manual, no código).
Detalle de cada punto cerrado, con qué se cableó y qué se verificó:

- [x] **S6-T3 · Mostrar el puntaje** (RF-17). Color por palabra en el chat
      (`Chat.tsx`, solo cuando no hay corrección de gramática que mostrar) y la
      pantalla Pronunciation cableada a `ChatMessage.pronunciation` real. Umbrales y
      colores centralizados en `src/ui/feedback/pronunciationColor.ts` para que
      Chat y Pronunciation no diverjan. No se implementó `ipa_expected`/`ipa_user`
      del andamio de Figma, según la advertencia de abajo.
- [x] **Limpiar las pantallas que muestran datos falsos.** `Suggestions.tsx` ahora
      lee `ChatMessage.suggestions` real (vacío hasta que Isaac implemente S6-T4,
      que hoy siempre devuelve `[]`). `Models.tsx` lee el progreso real de
      `AIPipeline.init()` (mismo estado que `Splash.tsx`) en vez del catálogo con
      "Phoneme Analyzer, 124 MB" que no existe. `Progress.tsx` (pantalla Summary)
      muestra el resumen real de la sesión en curso con `resumirSesion()` de
      Alejandro.
- [x] **S7-T3 · Pulir UX.** Los estados de carga (idle/grabando/procesando,
      progreso de modelos) ya existían de S2-T6/S1-T8. Lo que faltaba: errores de
      micrófono distinguidos por causa real (`micErrorMessage.ts` — permiso
      denegado / sin dispositivo / en uso por otra app, no un mensaje genérico) y
      botones de reintentar/cerrar en el banner, tanto para el mic como para la
      reproducción de audio.
- [x] **S8-T4 · Compatibilidad.** Chrome verificado en ejecución; Edge se
      documenta como equivalente (mismo motor Blink). Firefox/Safari no se
      pudieron abrir en este entorno — auditoría de código contra el soporte
      documentado de cada motor en
      `docs/evidencias/s8/s8-t4-compatibilidad-navegadores.md`. Hallazgo más
      concreto: los tres workers de IA usan `{ type: 'module' }`, que Firefox
      soportó recién en la versión 114 (jun 2023) — pendiente confirmar en un
      Firefox real.
- [x] **S9-T1 · Progreso entre sesiones** (RF-23). `App.tsx` ahora lee
      `SessionStore.list()` (Alejandro, S5-T6) después de cada guardado y se lo
      pasa a `Progress.tsx`: lista de sesiones anteriores con fecha, turnos,
      palabras y puntaje, más la diferencia real contra la sesión previa. Sin
      gráfica todavía (la lista cubre el mismo dato); probado con estado vacío
      (primera sesión) — falta confirmar a mano con 3+ sesiones reales para el
      criterio de verificación de RF-23 en la matriz de trazabilidad.
- [ ] S9-T7 · Grabar el video de respaldo de la demo — **requiere grabación
      manual**, no es una tarea de código; queda para quien la vaya a grabar.

### Verificación manual antes de push (10 ago, tarde)

Con todo lo de arriba ya implementado, se probó la aplicación a mano (modo
real, no solo `?mock=1`) y aparecieron cosas que ninguna prueba automatizada
cubría. Todas corregidas y verificadas de nuevo con
`typecheck && test && build` en verde:

- **Puntaje de pronunciación con decimales ilegibles** (`17.283877803865757`):
  el comparador real no redondea: se corrige en las 4 pantallas donde se
  mostraba el número. El valor bajo en sí no es un bug — es el riesgo **R03**
  ya documentado por Fabrizio (el comparador no discrimina bien todavía con
  voz real).
- **Sugerencias reales que nunca aparecían en el chat**: el chip comprobaba
  `!isUser`, pero el orquestador las adjunta al mensaje del estudiante. Dato
  vivo desde el principio, condición invertida.
- **Datos falsos que sobrevivieron a la limpieza de S6-T3** en archivos que no
  son las pantallas principales: `Sidebar.tsx` tenía un badge de Suggestions
  fijo en "3" y una lista "Recent Sessions" con nombres inventados;
  `Footer.tsx` mostraba "Latency: 42ms" y "AI Engine: Ready" sin cablear a
  nada. Mismo patrón que Suggestions/Progress/Models, en componentes de shell
  en vez de pantallas.
- **"Nueva conversación" no vaciaba el chat**: solo navegaba a la pantalla,
  así que si ya estabas ahí no pasaba nada visible. `sessionId` salió del
  `useMemo` del orquestador hacia su propio estado para poder generarse de
  nuevo sin reconstruir motores caros.
- **Interfaz en inglés técnico mezclado con instrucciones en español**: para
  una plataforma de aprendizaje de inglés, jerga como "Synthesizing
  Speech..." en cada turno no ayuda a un estudiante principiante. Se tradujo
  y simplificó todo el texto de navegación/proceso (Header, Footer, Sidebar,
  Splash, títulos y etiquetas de las 5 pantallas de feedback), dejando en
  inglés solo el contenido que es material de aprendizaje real (lo que dice
  el estudiante, la respuesta del tutor, correcciones y sugerencias). Se
  agregó una línea de ánimo por nivel de puntaje (`TIER_ENCOURAGEMENT`) para
  que un puntaje bajo no se sienta como un fracaso.

**Fuera de alcance, señalado y no tocado:** el placeholder
`"Got it! (respuesta del tutor pendiente — S7-T2)"` en
`src/ai/createAIPipeline.ts` (Isaac) expone un código de tarea interno al
usuario final, mismo problema que `sinNotasDeEquipo.test.ts` vigila pero esa
prueba no cubre `src/ai/`. Queda como chip de tarea aparte, no se editó ese
archivo por estar fuera de `src/ui/`.

**Precisión del reconocimiento de voz** (a veces transcribe mal lo que se
dijo): es el modelo Whisper-tiny elegido por Isaac por tamaño/velocidad
(`docs/evidencias/s1/whisper-tiny-spike.md`), no un bug de UI. Fuera de
alcance.

### S9-T2 · Gamificación ligera (10 ago, a pedido)

Era opcional y quedaba pendiente; se implementó con datos 100% reales, sin
tocar `sessionStore.ts` (Alejandro, fuera de `src/ui/`):

- **Racha**: días consecutivos con al menos una sesión guardada, calculado
  en `src/ui/progress/gamification.ts` (`computeStreak`) a partir de
  `SessionStore.list()`, que ya traía S9-T1. Con período de gracia hasta
  medianoche: si hoy todavía no se practicó pero ayer sí, la racha sigue
  viva.
- **Frases dominadas**: turnos del estudiante con puntaje de pronunciación
  "good" (≥80, mismo umbral de siempre). La sesión actual se cuenta en vivo
  desde `messages`; las anteriores se agregan bajo demanda con
  `SessionStore.get()` (ya existía en el contrato) solo cuando se abre la
  pantalla Summary, no en cada turno del chat, para que siga siendo
  "ligera" como pide el plan.
- Sin racha récord, insignias ni niveles — no había con qué respaldarlos sin
  inventar datos.
- 10 pruebas nuevas en `tests/ui/gamification.test.ts`. Verificado en
  navegador: racha en 0/"practicá hoy" antes del primer turno, pasa a 1 tras
  guardar la primera sesión del día; frases dominadas en 0 con un puntaje de
  78 (no llega al umbral), como corresponde.

### Hallazgo fuera de alcance: Pitch Tracking vacío con voz real (10 ago)

Probando el Visualizador con voz real (no `?mock=1`), "Pitch Tracking" quedó
completamente vacío durante una grabación de 6+ segundos, mientras Waveform y
Espectrograma sí mostraban señal real. **No es un bug de `PitchTrace.tsx`**:
el componente hace exactamente lo que debe (hueco cuando `pitchHz` es `null`,
sin inventar un cero). La causa está en `src/audio/features/yin.ts`
(`YIN_THRESHOLD = 0.02`), fuera de `src/ui/` — Fabrizio ya documentó ese
mismo umbral como "demasiado estricto" para voz real en
`docs/evidencias/s9/s9-t3-calibracion-voz-real.md` (solo 27% de las tramas
habladas obtienen tono con ese valor), pero el arreglo que aplicó fue solo
para la detección de voz/silencio, no para el estimador de tono en sí.
Señalado como tarea aparte, **no se tocó `yin.ts`**.

### Cambio en el evento `message`

Ahora es alta **o** actualización según el `id`. El mismo mensaje se emite dos veces:
primero sin `pronunciation` y después con el puntaje, porque sintetizar la referencia
tarda varios segundos. Al consumirlo hay que **reemplazar por `id`, no agregar**. El
patrón está en `App.tsx`.

### Nota

El 4 de agosto Alejandro tocó `src/ui/visualizer/VisualizerScreen.tsx` para retirar
tres frases que eran notas para el equipo escritas dentro del JSX y que se mostraban
al usuario en producción. Hay una prueba nueva, `tests/ui/sinNotasDeEquipo.test.ts`,
que falla si vuelve a pasar.

---

## Feedback más amigable (17 ago, a pedido del team lead)

El team lead pidió revisar `¡Muy bien! / Vas bien / Sigue practicando`
(`TIER_LABEL` en `pronunciationColor.ts`) por sonar agresivo para una app de
aprendizaje. Antes de inventar palabras nuevas se revisó si ya había un
criterio de redacción amigable establecido en el resto del código —
**lo había**: `src/core/fraseObjetivo.ts` y `ComparacionObjetivo` en
`contracts.ts` (features nuevas del equipo, mergeadas después de mi PR #69)
declaran explícitamente, como regla "no negociable", que la interfaz nunca
debe decir "lo dijiste mal" y sí "no te entendí bien" — porque esa señal
tiene falsos positivos (4 de cada 10) y acusar a quien pronunció bien
desmotiva y es falso. El mismo razonamiento aplica al puntaje acústico
(R03: pesa más la voz que la pronunciación), así que:

- `TIER_LABEL`: `good: '¡Excelente!'`, `ok: '¡Bien hecho!'`,
  `bad: 'Vas mejorando'` — ningún nivel usa un verbo en imperativo
  dirigido al estudiante ("sigue practicando" es una orden).
- `TIER_ENCOURAGEMENT.bad` ahora aclara que el puntaje compara también el
  timbre de voz, no solo la pronunciación, para no dar a entender que un
  número bajo es siempre un error del estudiante.
- Sin cambios de color (RF-17 fija verde/amarillo/rojo) ni de umbrales — el
  pedido era de palabras, no de la escala.

Verificado en navegador (modo `?mock=1`, pantalla Pronunciation) y con
`npm run typecheck && npm test && npm run build` en verde (642 pruebas —
el número subió mucho desde el 10 de agosto porque en el ínterin el equipo
mergeó tutor bilingüe, modo práctica con frase objetivo, Kokoro TTS y más;
nada de eso lo tocó este cambio). Va en una rama nueva
(`feat/ui-feedback-amigable`) partiendo de `dev` actualizado, no sobre la
rama vieja de S6-T3 que ya se había mergeado por PR #69.

## Tips técnicos
Canvas 2D + `requestAnimationFrame`; el espectrograma es una imagen que se desplaza (`drawImage` de sí mismo). Contrato que consumes: `AudioEngine.onFrame(cb)` → `AudioFrame` ~30/seg. Colores: verde ≥80, amarillo 60–79, rojo <60 (`WordScore.score`).
