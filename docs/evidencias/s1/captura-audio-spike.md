# Evidencia S1-T6 — Spike de captura de audio en el navegador

**Autor:** Fabrizio (DSP) · **Semana 1**
**Entorno:** Chrome · Web Audio API (`AudioContext`) · `navigator.mediaDevices.getUserMedia`.

> Reproducible con `src/audio/capture/probeAudioDevice.ts` (ver instrucciones en la
> cabecera del archivo). Lógica pura validada en `tests/audio/sampling.test.ts`.

## Objetivo

Determinar si el navegador puede entregar audio directamente a **16 kHz** (el sample rate
que exige Whisper, `SAMPLE_RATE` en `shared/constants.ts`) o si hay que capturar al rate
nativo del dispositivo y **remuestrear a mano**. La respuesta define el diseño de la
captura en S2-T1.

## Mediciones

| Medida | Valor | Comentario |
|---|---|---|
| `AudioContext` por defecto | **48 000 Hz** | Rate del hardware. |
| ¿Acepta `new AudioContext({ sampleRate: 16000 })`? | **sí** | Chrome remuestrea internamente. |
| Sample rate del track de micrófono | **48 000 Hz** | `track.getSettings()`. |
| Rates soportados por el dispositivo | **48 000–48 000 Hz** | `track.getCapabilities()`. **Valor único, no rango.** |
| Factor de remuestreo requerido | **3** (48 000 / 16 000) | Relación entera → decimación exacta. |
| Nyquist destino | **8 000 Hz** | Techo de lo analizable a 16 kHz. |

## Interpretación

**El micrófono no negocia el sample rate.** `getCapabilities()` devuelve un rango
degenerado (48 000–48 000), así que pedir 16 kHz por `getUserMedia` no es una opción en
este equipo. La conversión 48 kHz → 16 kHz ocurre sí o sí; la única pregunta es **quién**
la hace.

Chrome sí acepta fijar el `AudioContext` a 16 kHz, es decir que ya está remuestreando por
su cuenta — pero sin documentar qué filtro anti-aliasing aplica.

### Por qué implementamos el remuestreo igualmente

1. **Es la evidencia del curso.** El filtro anti-aliasing previo a la decimación *es*
   contenido de Señales y Sistemas. Delegarlo en una caja negra del navegador vacía de
   contenido la parte central del proyecto.
2. **Portabilidad.** Safari históricamente ignora el parámetro `sampleRate` del
   `AudioContext`, así que el camino explícito hace falta de todos modos.

### Consecuencia para S2-T1

Como 48 000 / 16 000 = 3 es **entero**, corresponde **decimación exacta**: filtrar
pasa-bajos y conservar 1 de cada 3 muestras. El corte del filtro se fija en **7 200 Hz**
(90 % del Nyquist destino), dejando margen para la caída no ideal del filtro.

El caso incómodo — 44 100 Hz, factor 2.75625, no entero, que obliga a interpolación —
queda contemplado en `chooseResampleStrategy()` aunque no aplique a este equipo, porque
otros integrantes o dispositivos sí pueden encontrarlo.

## Nota sobre las constraints de captura

La sonda pide el micrófono con `echoCancellation`, `noiseSuppression` y `autoGainControl`
en **`false`**. Son filtros no documentados del navegador que alterarían el espectro y el
RMS **antes** de nuestro análisis, invalidando tanto el VAD por energía (S2-T3) como las
mediciones de pitch y MFCC. Debe mantenerse así en la captura definitiva.

## Conclusiones

1. **Hay que remuestrear**, y en este equipo es el caso fácil (decimación entera ÷3).
2. **No se puede asumir el sample rate**: el código debe leerlo del `AudioContext` en
   runtime y elegir estrategia, no hardcodear 48 kHz.
3. **Siguiente (S2-T1):** AudioWorklet + buffer circular + decimación ÷3 con filtro
   anti-aliasing a 7 200 Hz.

## Teoría relacionada

Muestreo, Nyquist, aliasing y DFT desarrollados en [`docs/09-marco-teorico.md`](../../09-marco-teorico.md) (S1-T9).
