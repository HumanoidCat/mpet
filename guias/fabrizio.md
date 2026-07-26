# ✅ Checklist — Fabrizio · Ingeniero DSP (`src/audio/`)

> Marca `[x]` cuando completes cada tarea. **Solo tú editas este archivo.**
> Detalle de cada tarea (horas, dificultad, herramientas): `docs/04-plan-semanal.md`.
> Regla: trabaja solo en `src/audio/` y `tests/audio/`, en ramas `feat/audio-*`, PR a `dev`.
> ⚠️ Estás en la **ruta crítica**: FFT, MFCC y YIN se implementan a mano (Meyda/librosa solo para validar) — es la evidencia principal de Señales y Sistemas.

## Semana 1 (7–13 jul)
- [x] S1-T6 · Spike: getUserMedia + AudioContext, confirmar sample rates → mic fijo a 48 kHz, decimación ÷3 (ver `docs/09-marco-teorico.md`)
- [x] S1-T9 · Iniciar marco teórico: muestreo, Nyquist, DFT (con Monestel) → `docs/09-marco-teorico.md`

## Semana 2
- [x] S2-T1 · Captura: AudioWorklet, buffer circular, resampling a 16 kHz → FIR 7.2 kHz + decimación ÷3, alias −73.8 dB (ver `docs/evidencias/s2/s2-t1-remuestreo.md`)
- [x] S2-T2 · Preprocesamiento: normalización RMS + filtro pasa-banda 80–8000 Hz → biquad Butterworth, −3.01 dB en el corte (ver `docs/evidencias/s2/s2-t2-preprocesamiento.md`)
- [x] S2-T3 · VAD por umbral de energía (inicio/fin de habla) → umbral adaptativo al ruido, error de bordes < 30 ms (ver `docs/evidencias/s2/s2-t3-vad.md`)

## Semana 3
- [x] S3-T1 · FFT radix-2 + STFT con ventana Hann → error 1.45e-13 vs DFT directa, 1145× más rápida (ver `docs/evidencias/s3/s3-t1-fft-stft.md`)
  - ⚠️ La validación cruzada vs **Meyda** queda pendiente: agregarlo toca `package.json`, que requiere PR `shared-change` aprobado por Alejandro. Coordinar.
- [x] Mi sección del documento Avance 1 (procesamiento de audio) → §5.1 ampliada, §5.2/§5.4/§5.5 nuevas, §7.3 con mediciones, Anexo B actualizado

## Semana 4 — 🎯 AVANCE 1 (mar 28 jul)
- [ ] Presentar mi parte en la demo
- [x] S4-T4 · Spike: pitch por autocorrelación → error 0.008 Hz en tonos puros; el error de octava con fundamental débil es lo que justifica YIN (ver `docs/evidencias/s4/s4-t4-pitch-autocorrelacion.md`)

## Semana 5 ← tus 2 tareas más difíciles del proyecto
- [ ] S5-T1 · YIN completo (umbral, interpolación parabólica), error < 3 Hz en tonos sintéticos
- [ ] S5-T2 · MFCC propio (mel filterbank 26 + DCT, 13 coef), validado vs librosa (error < 5%)

## Semana 6
- [ ] S6-T1 · DTW sobre secuencias MFCC (usuario vs referencia TTS)
- [ ] S6-T2 · Puntaje global + por palabra con timestamps de Whisper (con Isaac)

## Semana 7 — 🎯 AVANCE 2 (mar 18 ago)
- [ ] S7-T4 · Optimización de latencia del análisis (con Isaac)
- [ ] Mi sección del documento Avance 2

## Semana 8
- [ ] S8-T2 · Edge cases: ruido ambiental, frases largas, silencios
- [ ] S8-T3 · Pruebas unitarias DSP con señales sintéticas conocidas

## Semana 9
- [ ] S9-T3 · Afinado final del comparador con datos de pruebas

## Semana 10 — 🎯 ENTREGA FINAL (mar 8 sep)
- [ ] S10-T6 · Preparar respuestas: Nyquist, por qué MFCC, cómo funciona YIN/DTW

## Cómo trabajas sin depender de nadie
Tu contrato: `AudioEngine` y `PronunciationScorer` en `src/shared/contracts.ts`. Valida con `npm test` y señales generadas por código (seno, chirp) — no necesitas UI ni IA reales. El TTS de referencia lo simulas con `mocks/mockAIPipeline.ts`.
