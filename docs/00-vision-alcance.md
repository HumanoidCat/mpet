# My Personal English Teacher — Visión y Alcance

**Curso:** Señales y Sistemas · **Duración:** 10 semanas · **Equipo:** Alejandro Zamora (PM/Integración), Fabrizio (DSP), Isaac Morum (IA/ML), Monestel (Frontend/Visualización)

## 1. Visión

PWA que funciona 100% offline en el navegador para practicar inglés conversacional: el usuario habla, la app transcribe (ASR), corrige gramática y pronunciación mediante análisis de señales (MFCC, pitch, energía, formantes), sugiere mejoras y responde con voz (TTS). Todo el procesamiento de IA corre client-side con transformers.js (Hugging Face + ONNX/WebAssembly).

**Diferenciador académico:** la app es un vehículo para demostrar conceptos de Señales y Sistemas — muestreo/Nyquist, FFT y espectrogramas, extracción de MFCC, detección de pitch (autocorrelación/YIN), filtrado y comparación acústica — visibles y explicables en la demo.

## 2. Alcance

**Dentro del alcance:** captura de micrófono (Web Audio API), preprocesamiento (normalización, filtrado), visualización en tiempo real (waveform, espectrograma, pitch), ASR con Whisper-tiny, corrección gramatical con T5 cuantizado, puntaje de pronunciación por distancia entre vectores de características, sugerencias con LLM ligero, TTS, PWA instalable con cache de modelos (Cache API/IndexedDB), documentación y presentaciones de los 3 hitos.

**Fuera del alcance:** backend/servidores, cuentas de usuario en la nube, multi-idioma (posible extensión), entrenamiento de modelos propios.

## 3. Clasificación de funcionalidades: MVP → Versión 1 → Versión Final

| ID | Funcionalidad | MVP (Avance 1, S4) | V1 (Avance 2, S7) | Final (S10) |
|---|---|:---:|:---:|:---:|
| F01 | Captura de micrófono + preprocesamiento (normalización, filtro) | ✅ | | |
| F02 | Visualización de waveform en tiempo real | ✅ | | |
| F03 | ASR (Whisper-tiny vía transformers.js) → transcripción | ✅ | | |
| F04 | Corrección gramatical (T5 cuantizado) con resaltado | ✅ básica | ✅ refinada | |
| F05 | UI tipo chat con botón de micrófono | ✅ | | |
| F06 | Espectrograma en tiempo real (FFT/STFT) | | ✅ | |
| F07 | Pitch tracking (YIN/autocorrelación) visualizado | | ✅ | |
| F08 | Extracción de MFCC + energía + formantes | | ✅ | |
| F09 | Puntaje de pronunciación (distancia acústica vs. referencia) + highlights por palabra | | ✅ | ✅ afinado |
| F10 | TTS (SpeechT5) para respuestas habladas | | ✅ | |
| F11 | Sugerencias de comunicación (LLM ligero: vocabulario, naturalidad) | | ✅ básica | ✅ completa |
| F12 | Conversación completa: habla → transcribe → corrige → responde | | ✅ | |
| F13 | PWA instalable + cache de modelos + offline real verificado | | ✅ parcial | ✅ |
| F14 | Feedback visual con colores por calidad de pronunciación | | ✅ | |
| F15 | Historial/progreso del usuario (evolución de pronunciación) — extensión para nota alta | | | ✅ |
| F16 | Pruebas con métricas: WER, latencia <2s, edge cases (ruido, acento) | ✅ iniciales | ✅ | ✅ completas |

**Regla de gestión:** ninguna funcionalidad de una columna posterior se desarrolla antes de completar la anterior. El MVP debe estar *demostrable en vivo* en la semana 4.

## 4. Objetivos

**General:** Desarrollar una PWA offline para práctica conversacional de inglés integrando procesamiento digital de señales de voz e IA client-side.

**Específicos (medibles):**
1. Lograr WER ≤ 25% con Whisper-tiny en frases de práctica (micrófono estándar, ambiente silencioso).
2. Latencia total habla→respuesta ≤ 2 s en frases de ≤ 10 palabras (hardware de referencia del equipo).
3. Implementar extracción de MFCC (13 coeficientes) y pitch (YIN) verificados contra librería de referencia (librosa) con error < 5%.
4. Calcular puntaje de pronunciación por distancia (DTW/euclidiana) entre vectores de features del usuario y referencia TTS.
5. Renderizar waveform y espectrograma a ≥ 30 fps sin bloquear la UI (procesamiento en AudioWorklet/Web Worker).
6. Operación offline completa tras primera carga (verificado con DevTools → Network offline).
7. Corrección gramatical con precisión ≥ 80% sobre un set de 50 frases de prueba con errores típicos de hispanohablantes.

**De aprendizaje:** demostrar dominio de muestreo y teorema de Nyquist, DFT/FFT/STFT, ventaneo, MFCC, detección de pitch, filtrado digital y análisis comparativo de señales de voz.
