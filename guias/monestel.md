# ⚠️ REASIGNADO — El integrante no se incorporó al proyecto (semana 3)

> Las tareas de este módulo pasaron a Alejandro (ver `guias/alejandro.md`).
> Se conserva este archivo como evidencia de la planificación original.

# Checklist original — Frontend/Visualización (`src/ui/`)

> Marca `[x]` cuando completes cada tarea. **Solo tú editas este archivo.**
> Detalle de cada tarea (horas, dificultad, herramientas): `docs/04-plan-semanal.md`.
> Regla: trabaja solo en `src/ui/` y `tests/ui/`, en ramas `feat/ui-*`, PR a `dev`.
> ⚠️ **Nunca esperes a los demás**: desarrolla todo contra `mocks/` (mockAudioEngine te da frames con FFT/pitch/MFCC; mockAIPipeline te da transcripciones; mockScorer te da puntajes).

## Semana 1 (14–21 jul)
- [ ] S1-T8 · Wireframes (chat + visualizadores) y sistema de diseño básico
- [ ] S1-T9 · Marco teórico inicial (con Fabrizio)

## Semana 2
- [ ] S2-T6 · Chat: burbujas usuario/app, botón mic con estados (idle/grabando/procesando)

## Semana 3
- [ ] S3-T2 · Waveform en Canvas a ≥30 fps (consume `onFrame`)
- [ ] S3-T4 · Highlights de gramática en chat (rojo error → verde corrección)
- [ ] Mi sección del documento Avance 1 (interfaz) + deck S3-T7

## Semana 4 — 🎯 AVANCE 1 (mar 4 ago)
- [ ] Presentar mi parte en la demo

## Semana 5
- [ ] S5-T3 · Espectrograma en Canvas (STFT → colormap, scroll temporal)
- [ ] S5-T4 · Overlay de contorno de pitch sobre espectrograma

## Semana 6
- [ ] S6-T3 · Feedback de pronunciación: colores por palabra + panel de detalle

## Semana 7 — 🎯 AVANCE 2 (mar 25 ago)
- [ ] S7-T3 · Pulir UX: estados de carga, errores de micrófono, reintentos
- [ ] Mi sección del documento Avance 2 + deck S7-T6

## Semana 8
- [ ] S8-T4 · Pruebas de UI y compatibilidad (Chrome/Edge; documentar límites Firefox/Safari)

## Semana 9
- [ ] S9-T1 · Pantalla de progreso: evolución del puntaje por sesión (con Alejandro)
- [ ] S9-T2 · (Opcional) Gamificación ligera: racha, frases dominadas
- [ ] S9-T7 · Grabar video demo de respaldo completo

## Semana 10 — 🎯 ENTREGA FINAL (mar 15 sep)
- [ ] S10-T3 · Armar presentación final con el equipo

## Tips técnicos
Canvas 2D + `requestAnimationFrame`; el espectrograma es una imagen que se desplaza (`drawImage` de sí mismo). Contrato que consumes: `AudioEngine.onFrame(cb)` → `AudioFrame` ~30/seg. Colores: verde ≥80, amarillo 60–79, rojo <60 (`WordScore.score`).
