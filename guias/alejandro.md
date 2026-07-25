# ✅ Checklist — Alejandro Zamora · PM + Core/PWA/Integración (`src/core/`)

> Marca `[x]` cuando completes cada tarea. **Solo tú editas este archivo.**
> Detalle de cada tarea (horas, dificultad, herramientas): `docs/04-plan-semanal.md`.
> Regla: trabaja solo en `src/core/` y `tests/core/`, en ramas `feat/core-*`, PR a `dev`.

## Semana 1 (7–13 jul)
- [ ] S1-T2 · Repo GitHub, protección de ramas, plantilla PR
- [ ] S1-T3 · Scaffold Vite+React+PWA con estructura modular
- [ ] S1-T4 · Contratos congelados en `shared/contracts.ts` + mocks
- [ ] S1-T5 · CI (Actions) + deploy a GitHub Pages
- [ ] Tablero con issues de Semana 1 asignados

## Semana 1 (extra)
- [x] Contratos congelados + mocks de los 4 módulos (base del trabajo en paralelo)
- [x] Aprobación del `shared-change` de `@huggingface/transformers` (fijado en ^3.8.1)
- [x] Decisión de caché en runtime del WASM de ONNX (RF-14) — ver bitácora D-04

## Semana 2
- [x] S2-T7 · Orquestador v0: botón mic → captura → ASR → texto en chat
      → `src/core/orchestrator.ts` con inyección de dependencias. 4 tests verdes.
- [x] S2-T6 · Chat con botón de micrófono *(versión inicial; luego rediseñada por Monestel)*

## Semana 3
- [x] S3-T2 · Waveform en Canvas ≥30 fps (buffer circular, min/max por píxel)
- [x] S3-T4 · Highlights de gramática en el chat (`buildSegments`, 4 tests)
- [x] Adaptador de micrófono real para demostración (`mocks/demoMicEngine.ts`)
- [x] S3-T5 · **Integración: pipeline real de IA (Whisper + T5) conectado a la UI**
      → Modo `?mock=1` como contingencia de demo + manejo de fallo de descarga.
- [x] S3-T6 · Documento Avance 1 (8 secciones) + bitácora de decisiones (`docs/10`)
- [x] Corrección del calendario de entregas y rescate de la rama de UI (ver bitácora I-02, I-03)
- [ ] Capturas y anexos del documento (Anexo C y D)
- [ ] S3-T7 · Presentación + guion de demo + video de respaldo

## Semana 4 — 🎯 AVANCE 1 (mar 28 jul)
- [ ] S4-T1 · Ensayo general (2 corridas cronometradas)
- [ ] S4-T2 · Entrega en plataforma + presentación
- [ ] S4-T3 · Retrospectiva → ajustes al backlog

## Semana 5
- [ ] S5-T6 · IndexedDB: sesiones y esquema de datos
- [ ] S5-T7 · Actualizar matriz de trazabilidad y marco teórico

## Semana 6
- [ ] S6-T5 · PWA completa: manifest, service worker, precache
- [ ] S6-T6 · Verificar cache de modelos y arranque 100% offline

## Semana 7 — 🎯 AVANCE 2 (mar 18 ago)
- [ ] S7-T1 · Orquestador conversación completa (ASR→gramática→sugerencias→respuesta→TTS→comparador)
- [ ] S7-T5 · Coordinar documento Avance 2

## Semana 8
- [ ] S8-T5 · Prueba offline integral en máquina limpia
- [ ] S8-T7 · Registrar métricas en matriz de trazabilidad

## Semana 9
- [ ] S9-T4 · Coordinar documento final
- [ ] S9-T6 · Feature freeze (viernes): solo bugs desde aquí

## Semana 10 — 🎯 ENTREGA FINAL (mar 8 sep)
- [ ] S10-T2 · Matriz de trazabilidad final completa
- [ ] S10-T5 · Entrega en plataforma (doc + deck + repo + demo)

## Ritmo semanal (recordatorio PM)
Lunes noche: `dev` estable + ensayo · Martes 1 pm: clase + retro · Jueves: check-in de bloqueos · Siempre: revisar PRs (único aprobador de `src/shared/` y `package.json`).
