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
- [ ] S6-T3 · Feedback de pronunciación: colores por palabra + panel de detalle

## Semana 7 — 🎯 AVANCE 2 (mar 11 ago)
- [ ] S7-T3 · Pulir UX: estados de carga, errores de micrófono, reintentos
- [ ] Mi sección del documento Avance 2 + deck S7-T6

## Semana 8
- [ ] S8-T4 · Pruebas de UI y compatibilidad (Chrome/Edge; documentar límites Firefox/Safari)

## Semana 9
- [ ] S9-T1 · Pantalla de progreso: evolución del puntaje por sesión (con Alejandro)
- [ ] S9-T2 · (Opcional) Gamificación ligera: racha, frases dominadas
- [ ] S9-T7 · Grabar video demo de respaldo completo

## Semana 10 — 🎯 ENTREGA FINAL (mar 8 sep)
- [ ] S10-T3 · Armar presentación final con el equipo

---

## Lo que falta — actualizado 4 ago

Quedan **6 tareas**, y ahora mismo la interfaz es la mayor carencia visible del
producto: el motor calcula el puntaje y nadie lo ve.

- [ ] **S6-T3 · Mostrar el puntaje** (RF-17). Ya está desbloqueada:
      `ChatMessage.pronunciation` llega con datos reales. Color por palabra en el chat
      y cablear la pantalla Pronunciation.
      ⚠️ **No implementes `ipa_expected` ni `ipa_user` del andamio de Figma**: el
      comparador mide distancia acústica con DTW, no reconoce fonemas, así que ese
      dato no existe y no lo podemos inventar
- [ ] **Limpiar las pantallas que muestran datos falsos.** Suggestions, Progress y
      Models se renderizan sin props, con contenido escrito a mano. `Models` lista un
      "Phoneme Analyzer, 124 MB" que no existe. Cablear o retirar de la navegación
- [ ] S7-T3 · Pulir UX: estados de carga, errores de micrófono, reintentos
- [ ] S8-T4 · Compatibilidad Chrome/Edge y límites de Firefox/Safari documentados
- [ ] S9-T1 · Pantalla de progreso con datos reales (necesita el IndexedDB de Alejandro)
- [ ] S9-T7 · Grabar el video de respaldo de la demo

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
