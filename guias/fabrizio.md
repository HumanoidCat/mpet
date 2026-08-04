# ✅ Checklist — Fabrizio · Ingeniero DSP (`src/audio/`)

> Marca `[x]` cuando completes cada tarea. **Solo tú editas este archivo.**
> Detalle de cada tarea (horas, dificultad, herramientas): `docs/04-plan-semanal.md`.
> Regla: trabaja solo en `src/audio/` y `tests/audio/`, en ramas `feat/audio-*`, PR a `dev`.
> ⚠️ Estás en la **ruta crítica**: FFT, MFCC y YIN se implementan a mano y se verifican contra la definición matemática, sin bibliotecas externas (D-07) — es la evidencia principal de Señales y Sistemas.

## Semana 1 (7–13 jul)
- [x] S1-T6 · Spike: getUserMedia + AudioContext, confirmar sample rates → mic fijo a 48 kHz, decimación ÷3 (ver `docs/09-marco-teorico.md`)
- [x] S1-T9 · Iniciar marco teórico: muestreo, Nyquist, DFT (con Monestel) → `docs/09-marco-teorico.md`

## Semana 2
- [x] S2-T1 · Captura: AudioWorklet, buffer circular, resampling a 16 kHz → FIR 7.2 kHz + decimación ÷3, alias −73.8 dB (ver `docs/evidencias/s2/s2-t1-remuestreo.md`)
- [x] S2-T2 · Preprocesamiento: normalización RMS + filtro pasa-banda 80–8000 Hz → biquad Butterworth, −3.01 dB en el corte (ver `docs/evidencias/s2/s2-t2-preprocesamiento.md`)
- [x] S2-T3 · VAD por umbral de energía (inicio/fin de habla) → umbral adaptativo al ruido, error de bordes < 30 ms (ver `docs/evidencias/s2/s2-t3-vad.md`)

## Semana 3
- [x] S3-T1 · FFT radix-2 + STFT con ventana Hann → error 1.45e-13 vs DFT directa, 1145× más rápida (ver `docs/evidencias/s3/s3-t1-fft-stft.md`)
  - Validación cerrada sin dependencia externa: se verifica contra la definición directa de la DFT, Parseval, linealidad, simetría conjugada, desplazamiento y casos analíticos (decisión **D-07**). No hace falta Meyda.
- [x] Mi sección del documento Avance 1 (procesamiento de audio) → §5.1 ampliada, §5.2/§5.4/§5.5 nuevas, §7.3 con mediciones, Anexo B actualizado

## Semana 4 — 🎯 AVANCE 1 (mar 28 jul)
- [x] Presentar mi parte en la demo
- [x] S4-T4 · Spike: pitch por autocorrelación → error 0.008 Hz en tonos puros; el error de octava con fundamental débil es lo que justifica YIN (ver `docs/evidencias/s4/s4-t4-pitch-autocorrelacion.md`)

## Semana 5 ← tus 2 tareas más difíciles del proyecto
- [x] S5-T1 · YIN completo (umbral, interpolación parabólica), error < 3 Hz en tonos sintéticos → **0.115 Hz** de peor error; resuelve el error de octava del spike (ver `docs/evidencias/s5/s5-t1-yin.md`)
- [x] S5-T2 · MFCC propio (mel filterbank 26 + DCT, 13 coef) → invariancia al volumen exacta (3.8e-6 en un rango de 1000x); fixture de librosa preparado, pendiente de correr (ver `docs/evidencias/s5/s5-t2-mfcc.md`)

## Semana 6
- [x] S6-T1 · DTW sobre secuencias MFCC (usuario vs referencia TTS) → invariante a velocidad y volumen (ver `docs/evidencias/s6/s6-t1-t2-comparador.md`)
- [x] S6-T2 · Puntaje global + por palabra con timestamps de Whisper → RF-10 cumplido: separa bien/mal por **31 puntos** (exigía 20)

## Semana 7 — 🎯 AVANCE 2 (mar 11 ago)
- [x] S7-T4 · Optimización de latencia del análisis → parte DSP: caché de planes FFT (YIN −29.7 %) y decimación polifásica (3.00×). Total 2.14 % de un núcleo (ver `docs/evidencias/s7/s7-t4-latencia-dsp.md`). Falta la parte de modelos, de Isaac.
- [x] Mi sección del documento Avance 2 → redactada en `docs/entregas/avance-2-seccion-dsp.md`, lista para que Alejandro la integre cuando exista `avance-2.md`

## Semana 8
- [x] S8-T2 · Edge cases: ruido ambiental, frases largas, silencios → el VAD por energía confundía ruido con habla a cualquier nivel; resuelto con periodicidad (ver `docs/evidencias/s8/s8-t2-t3-casos-limite.md`)
- [x] S8-T3 · Pruebas unitarias DSP con señales sintéticas conocidas → 284 pruebas del módulo, todas con señales generadas por código

## Semana 9
- [ ] S9-T3 · Afinado final del comparador con datos de pruebas

## Semana 10 — 🎯 ENTREGA FINAL (mar 8 sep)
- [ ] S10-T6 · Preparar respuestas: Nyquist, por qué MFCC, cómo funciona YIN/DTW

## Cómo trabajas sin depender de nadie
Tu contrato: `AudioEngine` y `PronunciationScorer` en `src/shared/contracts.ts`. Valida con `npm test` y señales generadas por código (seno, chirp) — no necesitas UI ni IA reales. El TTS de referencia lo simulas con `mocks/mockAIPipeline.ts`.

---

## Siguiente — plan vigente: `docs/11-plan-post-avance-1.md`

El orden ya no lo fija la semana del calendario sino la dependencia (D-08).

- [x] Subir S4-T4, S5-T1 y S5-T2 como PR a `dev`, con evidencia en `docs/evidencias/s5/`
- [x] S6-T1 · DTW sobre secuencias de MFCC
- [x] S6-T2 · Puntaje global y por palabra (con Isaac)
- [x] S5-T7 · Marco teórico de MFCC, YIN y STFT → §4 STFT, §5 MFCC, §6 YIN y §7 DTW en `docs/09-marco-teorico.md`, con índice de evidencias

---

## Lo que falta — actualizado 4 ago

Tu módulo está prácticamente cerrado. Quedan **3 tareas**, y las dos primeras son
las que deciden si el puntaje sirve.

- [ ] **S9-T3 · Calibrar el comparador con las cuatro voces del equipo** (riesgo **R03**).
      Comparar voz humana contra voz sintetizada puede castigar pronunciación correcta.
      Si el puntaje no separa bien, la función principal del producto no sirve aunque
      el código esté bien. Las herramientas de calibración ya las subiste
- [ ] **S6-T7 · Pares mínimos**: ship/sheep, bad/bed. Es la evidencia más directa de que
      el puntaje mide pronunciación y no timbre ni volumen (con el equipo)
- [ ] **RF-09 · Verificación cruzada de MFCC contra librosa.** Son las 3 pruebas omitidas
      de la suite; el fixture está preparado en `tests/audio/fixtures/` y nunca se corrió.
      Métrica exigida: error menor al 5 %
- [ ] S10-T6 · Preparar respuestas: Nyquist, por qué MFCC, cómo funcionan YIN y DTW
