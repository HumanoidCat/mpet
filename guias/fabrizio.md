# ✅ Checklist — Fabrizio · Ingeniero DSP (`src/audio/`)

> Marca `[x]` cuando completes cada tarea. **Solo tú editas este archivo.**
> Detalle de cada tarea (horas, dificultad, herramientas): `docs/04-plan-semanal.md`.
> Regla: trabaja solo en `src/audio/` y `tests/audio/`, en ramas `feat/audio-*`, PR a `dev`.
> ⚠️ Estás en la **ruta crítica**: FFT, MFCC y YIN se implementan a mano (Meyda/librosa solo para validar) — es la evidencia principal de Señales y Sistemas.

## Semana 1 (14–21 jul)
- [x] S1-T6 · Spike: getUserMedia + AudioContext, confirmar sample rates → mic fijo a 48 kHz, decimación ÷3 (ver `docs/09-marco-teorico.md`)
- [x] S1-T9 · Iniciar marco teórico: muestreo, Nyquist, DFT (con Monestel) → `docs/09-marco-teorico.md`

## Semana 2
- [ ] S2-T1 · Captura: AudioWorklet, buffer circular, resampling a 16 kHz
- [ ] S2-T2 · Preprocesamiento: normalización RMS + filtro pasa-banda 80–8000 Hz
- [ ] S2-T3 · VAD por umbral de energía (inicio/fin de habla)

## Semana 3
- [ ] S3-T1 · FFT radix-2 + STFT con ventana Hann, validada vs Meyda (tabla de error)
- [ ] Mi sección del documento Avance 1 (procesamiento de audio)

## Semana 4 — 🎯 AVANCE 1 (mar 4 ago)
- [ ] Presentar mi parte en la demo
- [ ] S4-T4 · Spike: pitch por autocorrelación

## Semana 5 ← tus 2 tareas más difíciles del proyecto
- [ ] S5-T1 · YIN completo (umbral, interpolación parabólica), error < 3 Hz en tonos sintéticos
- [ ] S5-T2 · MFCC propio (mel filterbank 26 + DCT, 13 coef), validado vs librosa (error < 5%)

## Semana 6
- [ ] S6-T1 · DTW sobre secuencias MFCC (usuario vs referencia TTS)
- [ ] S6-T2 · Puntaje global + por palabra con timestamps de Whisper (con Isaac)

## Semana 7 — 🎯 AVANCE 2 (mar 25 ago)
- [ ] S7-T4 · Optimización de latencia del análisis (con Isaac)
- [ ] Mi sección del documento Avance 2

## Semana 8
- [ ] S8-T2 · Edge cases: ruido ambiental, frases largas, silencios
- [ ] S8-T3 · Pruebas unitarias DSP con señales sintéticas conocidas

## Semana 9
- [ ] S9-T3 · Afinado final del comparador con datos de pruebas

## Semana 10 — 🎯 ENTREGA FINAL (mar 15 sep)
- [ ] S10-T6 · Preparar respuestas: Nyquist, por qué MFCC, cómo funciona YIN/DTW

## Cómo trabajas sin depender de nadie
Tu contrato: `AudioEngine` y `PronunciationScorer` en `src/shared/contracts.ts`. Valida con `npm test` y señales generadas por código (seno, chirp) — no necesitas UI ni IA reales. El TTS de referencia lo simulas con `mocks/mockAIPipeline.ts`.
