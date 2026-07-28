# Evidencia S2-T1 — Captura y remuestreo a 16 kHz

> Fabrizio Espinoza (DSP) · Semana 2 · Código en `src/audio/capture/` y `src/audio/dsp/`
> Reproducible con `npx vitest run tests/audio` (32 pruebas, sin micrófono).

## 1. Cadena implementada

```
getUserMedia (48 kHz, mono)
  → AudioWorklet  ·  bloques de 1024 muestras (~21 ms)
  → hilo principal
      → FIR pasa-bajas 7 200 Hz (127 taps, ventana de Hann)
      → decimación ÷3
  → RingBuffer  ·  PCM a 16 kHz listo para Whisper
```

**Por qué el DSP no vive en el worklet.** El worklet corre en el hilo de audio en
tiempo real: si un bloque tarda más de ~2.7 ms el navegador produce glitches.
Ahí solo se acumulan muestras y se postean. El filtrado y el remuestreo se hacen
en el hilo principal, con funciones puras (`dsp/fir.ts`, `dsp/resampler.ts`) que
se prueban en Node sin navegador — que es lo que permite tener esta evidencia.

## 2. Filtro anti-aliasing

Sinc enventanado con Hann, corte en 7 200 Hz (`antiAliasCutoffHz`, 90 % del
Nyquist destino), 127 coeficientes, normalizado a ganancia 1 en DC.

| Frecuencia | Ganancia | dB | Zona |
|---:|---:|---:|---|
| 100 Hz | 1.00000 | 0.0 | paso (F0) |
| 300 Hz | 1.00003 | 0.0 | paso (F0) |
| 1 000 Hz | 1.00002 | 0.0 | paso (formantes) |
| 3 400 Hz | 1.00006 | 0.0 | paso (formantes) |
| 6 000 Hz | 0.99833 | −0.0 | paso |
| 7 000 Hz | 0.74753 | −2.5 | transición |
| **7 200 Hz** | 0.50003 | **−6.0** | corte |
| 7 500 Hz | 0.15414 | −16.2 | transición |
| **8 000 Hz** | 0.00589 | **−44.6** | Nyquist destino |
| 9 000 Hz | 0.00027 | −71.4 | rechazo |
| 12 000 Hz | 0.00002 | −95.4 | rechazo |
| 20 000 Hz | 0.00000 | −114.7 | rechazo |

Banda de paso plana hasta 6 kHz (error < 0.2 %) y −44.6 dB justo en el Nyquist
destino: nada que quede por encima de 8 kHz alcanza a contaminar la banda útil.

**Compromiso asumido:** la transición se come de 6.5 a 8 kHz, donde viven las
fricativas más agudas (/s/, /ʃ/). Es el precio de un filtro real: con 127 taps
la transición no puede ser más angosta. Se aceptó porque la energía dominante
de las fricativas está por debajo de 7 kHz y el pasa-banda de S2-T2 llega hasta
8 kHz de todos modos. Si el evaluador de pronunciación resulta sensible a esto
(Semana 6), la solución es subir el nº de taps, no bajar el corte.

## 3. Prueba central: aliasing

Un tono de **9 000 Hz** muestreado a 48 kHz supera el Nyquist destino (8 kHz).
Al decimar ÷3 se pliega a

$$f_{alias} = \left| ((9000 + 8000) \bmod 16000) - 8000 \right| = 7\,000 \text{ Hz}$$

es decir, aparece como una fricativa de 7 kHz que **nunca se pronunció**.
Medición de la componente de 7 kHz en la salida a 16 kHz:

| Método | Amplitud en 7 kHz | dB |
|---|---:|---:|
| Decimación ingenua (1 de cada 3, sin filtrar) | 1.00000 | 0.0 |
| **Filtrar y luego decimar** | **0.00021** | **−73.8** |

**Mejora: 73.8 dB.** La decimación ingenua traslada *toda* la energía del tono a
una frecuencia falsa; el orden filtrar → decimar la elimina. El orden inverso no
tiene arreglo: una vez plegada, la componente de 9 kHz es matemáticamente
indistinguible de una de 7 kHz real, y ningún filtro posterior puede separarlas.

Prueba automatizada en `tests/audio/resampler.test.ts` (bloque
*"Anti-aliasing: por qué el filtro va ANTES de decimar"*).

## 4. Verificación de la señal útil

| Comprobación | Resultado |
|---|---|
| 1 s a 48 kHz → muestras a 16 kHz | 16 000 (÷3 exacto) |
| Amplitud de un tono de 1 kHz tras remuestrear | 1.00002 (error 0.002 %) |
| Fase lineal (filtro simétrico) | ✅ retardo de grupo 63 muestras |
| Retardo introducido | 1.31 ms a 48 kHz — despreciable |
| Procesar en bloques de 128 vs. de una vez | idéntico (6 decimales) |
| 44 100 → 16 000 (relación no entera) | 16 000 muestras, tono preservado |

La independencia del tamaño de bloque es lo que garantiza que la captura en vivo
dé el mismo resultado que el procesamiento offline: el `StreamingResampler`
conserva entre callbacks tanto la historia del FIR como la fase fraccionaria de
lectura.

## 5. Archivos

| Archivo | Rol |
|---|---|
| `src/audio/capture/captureProcessor.js` | AudioWorkletProcessor (JS plano, sin DSP) |
| `src/audio/capture/micCapture.ts` | Orquesta getUserMedia + worklet + remuestreo |
| `src/audio/capture/ringBuffer.ts` | Buffer circular con conteo de muestras perdidas |
| `src/audio/dsp/fir.ts` | Diseño del FIR y filtrado (streaming y offline) |
| `src/audio/dsp/resampler.ts` | Decimación / interpolación con anti-aliasing |
| `tests/audio/ringBuffer.test.ts` | 7 pruebas |
| `tests/audio/resampler.test.ts` | 16 pruebas |

## 6. Pendiente

`micCapture.ts` todavía **no** implementa el contrato `AudioEngine`: falta el
`AudioFrame`, que necesita FFT (S3-T1), MFCC y pitch (Semana 5). Este módulo
entrega PCM limpio a 16 kHz; el motor completo se arma encima.
