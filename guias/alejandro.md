# ✅ Checklist — Alejandro Zamora · PM + Core/PWA/Integración (`src/core/`)

> Marca `[x]` cuando completes cada tarea. **Solo tú editas este archivo.**
> Detalle de cada tarea (horas, dificultad, herramientas): `docs/04-plan-semanal.md`.
> Regla: trabaja solo en `src/core/` y `tests/core/`, en ramas `feat/core-*`, PR a `dev`.

## Semana 1 (7–13 jul)
- [x] S1-T2 · Repo GitHub, protección de ramas, plantilla PR
- [x] S1-T3 · Scaffold Vite+React+PWA con estructura modular
- [x] S1-T4 · Contratos congelados en `shared/contracts.ts` + mocks
- [x] S1-T5 · CI (Actions) + deploy a GitHub Pages
- [x] Tablero con issues de Semana 1 asignados

## Semana 1 (extra)
- [x] Contratos congelados + mocks de los 4 módulos (base del trabajo en paralelo)
- [x] Aprobación del `shared-change` de `@huggingface/transformers` (fijado en ^3.8.1)
- [x] Decisión de caché en runtime del WASM de ONNX (RF-14) — ver bitácora D-04

## Semana 2
- [x] S2-T7 · Orquestador v0: botón mic → captura → ASR → texto en chat
      → `src/core/orchestrator.ts` con inyección de dependencias. 4 tests verdes.
- [x] Apoyo a S2-T6 · Versión inicial del chat con botón de micrófono, construida
      contra los mocks para desbloquear el orquestador. El módulo `src/ui/` es de
      Monestel, que continúa su desarrollo.

## Semana 3
- [x] Apoyo a S3-T2 · Waveform en Canvas ≥30 fps (buffer circular, min/max por píxel)
- [x] Apoyo a S3-T4 · Highlights de gramática en el chat (`buildSegments`, 4 tests)
- [x] Adaptador de micrófono real para demostración (`mocks/demoMicEngine.ts`)
- [x] S3-T5 · **Integración: pipeline real de IA (Whisper + T5) conectado a la UI**
      → Modo `?mock=1` como contingencia de demo + manejo de fallo de descarga.
- [x] S3-T5b · **Adaptador módulo DSP → contrato `AudioEngine`** (`src/core/audioEngineAdapter.ts`)
      → Une la captura de Fabrizio (AudioWorklet + decimación ÷3 + pasa-banda + RMS)
        con su FFT propia y la entrega como `AudioFrame` al visualizador. 7 tests.
        Pitch y MFCC quedan declarados como pendientes (S5), no inventados.
- [x] S3-T6 · Documento Avance 1 (8 secciones) + bitácora de decisiones (`docs/10`)
- [x] Corrección del calendario de entregas y reconstrucción de los archivos
      compartidos tras una verificación en rojo (ver bitácora I-01, I-02)
- [x] Capturas y anexos del documento (Anexo C y D)
- [x] S3-T7 · Presentación + guion de demo + video de respaldo

## Semana 4 — 🎯 AVANCE 1 (mar 28 jul)
- [x] S4-T1 · Ensayo general (2 corridas cronometradas)
- [x] S4-T2 · Entrega en plataforma + presentación
- [ ] S4-T3 · Retrospectiva → ajustes al backlog

## Semana 5
- [ ] S5-T6 · IndexedDB: sesiones y esquema de datos
- [ ] S5-T7 · Actualizar matriz de trazabilidad y marco teórico

## Semana 6
- [ ] S6-T5 · PWA completa: manifest, service worker, precache
- [ ] S6-T6 · Verificar cache de modelos y arranque 100% offline

## Semana 7 — 🎯 AVANCE 2 (mar 11 ago)
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

---

## Cerrado desde el Avance 1

- [x] Corregir `audioEngineAdapter.ts` con acumulador de tramas (incidencia **I-03**)
- [x] Pruebas del adaptador: amplitud unitaria, tramas por bloque y equivalencia con `StreamingStft`
- [x] Conectar `detectPitchYin` y `MfccExtractor` al adaptador
- [x] Ordenar la entrada de los PR de Fabrizio e Isaac sin que chocaran
- [x] Conectar el comparador de pronunciación al orquestador, con puntaje asíncrono
- [x] Simetrizar la cadena que alimenta al comparador (`AnalyzeOptions`)
- [x] Retirar de la interfaz las notas internas del equipo que se renderizaban al usuario

---

## Cerrado el 11 de agosto

- [x] **Corregir contra qué se puntúa la pronunciación.** El orquestador sintetizaba
      la transcripción, o sea el propio error del estudiante. Error de diseño mío,
      detectado por Fabrizio midiendo (S9-T3)
- [x] **Modo práctica con frase objetivo**, sobre el chat existente: banco curado de
      diez frases, comparación de lo transcrito contra el objetivo, y `targetMatch`
      como señal principal en el chat (**D-16**)
- [x] **Instrumentar el turno** con `getTiempos()` y volcado con `?medir=1`, para
      poder cerrar R06 midiendo en vez de estimar
- [x] Persistencia de sesiones en IndexedDB (**D-10**)
- [x] Exportador de tomas a WAV para la calibración (S9-T3)
- [x] Prueba de arranque que monta `App.tsx`

---

## Lo que falta — actualizado 11 ago

Ninguna es de código. Las tres primeras se cierran en una sola sesión con
`docs/evidencias/s8/s8-t5-offline-y-latencia.md`, que ya tiene los criterios
escritos.

- [ ] **Latencia del turno** (R06): `?medir=1`, cinco turnos. Lo que hay que
      defender es la retroalimentación por debajo de 2 s, no el total (**D-15**)
- [ ] **Arranque sin conexión y caché** (RF-14, RF-15): instalar, modo avión, usar
      el flujo completo. Declarados pendientes desde el 17 de julio y nunca
      comprobados, y sostienen el argumento central del README
- [ ] **Prueba offline en máquina limpia** (S8-T5)
- [ ] **Decidir RF-10** con la medición de Fabrizio: si el modo práctica supera los
      6 de 10 de la señal sola, se presenta cumplido con su limitación declarada

**Coordinación**

- [ ] S7-T5 y S9-T4 · Coordinar los documentos del Avance 2 y final
- [ ] S9-T6 · Congelamiento de código antes de la entrega
- [ ] S10-T2 y S10-T5 · Matriz final y entrega en plataforma
