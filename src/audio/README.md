# audio/ — Fabrizio (DSP)
Captura (AudioWorklet), preprocesamiento, FFT/STFT, MFCC, YIN, comparador DTW.
Implementar a mano (es la evidencia del curso) y validar contra Meyda/librosa.
Semana 2: captura+filtro+VAD. Semana 3: FFT/STFT. Semana 5: YIN+MFCC. Semana 6: DTW+puntaje.
Estructura sugerida: capture/ · dsp/ · features/ · comparator/

## Estado
- **S2-T1 ✅** captura a 16 kHz: `capture/captureProcessor.js` (worklet, sin DSP) +
  `capture/micCapture.ts` + `capture/ringBuffer.ts` + `dsp/fir.ts` + `dsp/resampler.ts`.
  Evidencia y mediciones: `docs/evidencias/s2/s2-t1-remuestreo.md`.

Regla del módulo: el worklet corre en el hilo de audio en tiempo real y no lleva
DSP; todo el procesamiento vive en funciones puras bajo `dsp/`, probables en Node
sin navegador (`npx vitest run tests/audio`).
