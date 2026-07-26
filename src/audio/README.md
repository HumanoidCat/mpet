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

Cadena actual: captura → remuestreo → preprocesamiento → VAD → STFT.
Siguiente: MFCC y YIN (Semana 5) se montan sobre el espectrograma de `stft.ts`.

Criterio de filtros: FIR donde la fase lineal importa (remuestreo, porque ese PCM
alimenta al comparador); biquad donde solo interesa quitar energía fuera de banda
(preprocesamiento), que cuesta 5 coeficientes en vez de 127.

Regla del módulo: el worklet corre en el hilo de audio en tiempo real y no lleva
DSP; todo el procesamiento vive en funciones puras bajo `dsp/`, probables en Node
sin navegador (`npx vitest run tests/audio`).
