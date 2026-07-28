# audio/ — Fabrizio (DSP)
Captura (AudioWorklet), preprocesamiento, FFT/STFT, MFCC, YIN, comparador DTW.
Implementar a mano (es la evidencia del curso) y validar contra Meyda/librosa.
Semana 2: captura+filtro+VAD. Semana 3: FFT/STFT. Semana 5: YIN+MFCC. Semana 6: DTW+puntaje.
Estructura sugerida: capture/ · dsp/ · features/ · comparator/

## Estado
- **S2-T1 ✅** captura a 16 kHz: `capture/captureProcessor.js` (worklet, sin DSP) +
  `capture/micCapture.ts` + `capture/ringBuffer.ts` + `dsp/fir.ts` + `dsp/resampler.ts`.
  Evidencia y mediciones: `docs/evidencias/s2/s2-t1-remuestreo.md`.
- **S2-T2 ✅** preprocesamiento: `dsp/biquad.ts` + `dsp/preprocess.ts` (pasa-banda de
  voz 80–8000 Hz y normalización RMS). Evidencia: `docs/evidencias/s2/s2-t2-preprocesamiento.md`.
- **S2-T3 ✅** VAD por energía: `dsp/vad.ts` (umbral adaptativo al ruido del cuarto,
  histéresis + hangover). Evidencia: `docs/evidencias/s2/s2-t3-vad.md`.

- **S3-T1 ✅** FFT/STFT: `dsp/fft.ts` + `dsp/window.ts` + `dsp/stft.ts` (radix-2 a mano,
  ventana Hann, espectrograma offline y en vivo). Evidencia: `docs/evidencias/s3/s3-t1-fft-stft.md`.

- **S4-T4 ✅** spike de pitch: `features/autocorrelation.ts` + `features/pitch.ts`
  (autocorrelación por Wiener–Khinchin, interpolación parabólica). Evidencia:
  `docs/evidencias/s4/s4-t4-pitch-autocorrelacion.md`.

- **S5-T1 ✅** YIN: `features/yin.ts` (función de diferencia por FFT, normalización
  acumulada, umbral absoluto). Peor error 0.115 Hz y resuelve el error de octava
  que el spike documentó. Evidencia: `docs/evidencias/s5/s5-t1-yin.md`.

Cadena actual: captura → remuestreo → preprocesamiento → VAD → STFT → pitch.
Siguiente: MFCC (S5-T2) se monta sobre el espectrograma de `stft.ts`.

### Conclusiones del spike de pitch, para S5-T1 (YIN)
La maquinaria base ya está validada y es reutilizable. El objetivo de exactitud
(< 3 Hz) **ya se cumple**: 0.008 Hz de peor error en tonos puros. YIN se necesita
por el **error de octava con fundamental débil** (reporta el doble de la
frecuencia, con confianza normal), que ningún ajuste de umbral o rango resuelve.
Usar frames cortos: alargarlos no mejora la exactitud.

## Cómo se valida el DSP de este módulo

Resolución del PM (jul 2026): **no se agregan dependencias de validación**
(Meyda queda descartado). El criterio es que comparar contra otra biblioteca
demuestra que coincidimos con una caja negra; comparar contra la teoría
demuestra que estamos en lo correcto. En orden de fuerza:

1. **Casos con solución analítica cerrada** — seno en bin (`|X[k]| = N/2`),
   delta (espectro plano), constante (todo en el bin 0). El resultado se deduce
   en papel.
2. **La definición como referencia** — DFT directa O(N²) implementada en el
   propio test y comparada contra la FFT con señales aleatorias.
3. **Propiedades estructurales** — Parseval, linealidad, inversa, simetría.
4. **Señales sintéticas de parámetros conocidos** — senos, chirps y ruido
   generados por código, para filtros y VAD.

Para los **MFCC (S5-T2)** sí se contrasta contra librosa, pero sin dependencias:
se corre librosa en Python una vez, se exportan los coeficientes de referencia a
JSON y ese archivo se versiona como fixture en `tests/audio/fixtures/`.

Criterio de filtros: FIR donde la fase lineal importa (remuestreo, porque ese PCM
alimenta al comparador); biquad donde solo interesa quitar energía fuera de banda
(preprocesamiento), que cuesta 5 coeficientes en vez de 127.

Regla del módulo: el worklet corre en el hilo de audio en tiempo real y no lleva
DSP; todo el procesamiento vive en funciones puras bajo `dsp/`, probables en Node
sin navegador (`npx vitest run tests/audio`).
