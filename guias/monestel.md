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
- [ ] Mi sección del documento Avance 2 + deck S7-T6

## Semana 8
- [x] S8-T4 · Pruebas de UI y compatibilidad (Chrome/Edge; documentar límites Firefox/Safari)

## Semana 9
- [x] S9-T1 · Pantalla de progreso: evolución del puntaje por sesión (con Alejandro)
- [ ] S9-T2 · (Opcional) Gamificación ligera: racha, frases dominadas
- [ ] S9-T7 · Grabar video demo de respaldo completo

## Semana 10 — 🎯 ENTREGA FINAL (mar 8 sep)
- [ ] S10-T3 · Armar presentación final con el equipo

---

## Lo que falta — actualizado 10 ago

Queda **1 tarea real** (S9-T2 es opcional). El resto de la interfaz ya corre
sobre datos reales, verificado con `npm run typecheck && npm test && npm run
build` en verde y probado a mano en el navegador (modo `?mock=1`).

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

## Tips técnicos
Canvas 2D + `requestAnimationFrame`; el espectrograma es una imagen que se desplaza (`drawImage` de sí mismo). Contrato que consumes: `AudioEngine.onFrame(cb)` → `AudioFrame` ~30/seg. Colores: verde ≥80, amarillo 60–79, rojo <60 (`WordScore.score`).
