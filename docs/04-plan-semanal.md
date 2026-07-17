# Plan Semanal — Sprint Backlogs (10 semanas)

Sprints de 1 semana (miércoles→martes: cada **martes 1:00 pm** hay clase y se muestra el avance; los hitos caen en martes: Avance 1 = 4 ago, Avance 2 = 25 ago, Final = 15 sep). Convenciones de tareas: **P** = prioridad (Alta/Media/Baja), **D** = dificultad (1 fácil – 5 difícil), **h** = horas estimadas. Herramientas base para todas: VS Code, Git/GitHub, Chrome DevTools. Solo se listan herramientas adicionales.

---

## Semana 1 — Planificación y fundación (Sprint 0)

**Objetivos:** planificación aprobada, repo funcionando, contratos congelados, cada quien puede trabajar aislado desde el día 1.
**Historias:** HU-01. **Tiempo total:** ~28 h.

| ID | Tarea | Dueño | P | D | h | Herramientas | Conocimientos |
|---|---|---|---|---|---|---|---|
| S1-T1 | Revisar documento del curso en equipo y validar esta planificación | Todos | Alta | 1 | 2 | — | Requisitos del curso |
| S1-T2 | Crear repo GitHub, protección de main, plantilla PR, convención de commits | Alejandro | Alta | 2 | 3 | GitHub | Git flow |
| S1-T3 | Scaffold Vite + React + TS + vite-plugin-pwa + estructura de carpetas modular | Alejandro | Alta | 2 | 4 | Node, Vite | React, PWA básico |
| S1-T4 | Definir y congelar contratos (`shared/contracts.ts`) + mocks de los 4 módulos | Alejandro + revisión de todos | Alta | 3 | 5 | TypeScript | Diseño de interfaces |
| S1-T5 | CI con GitHub Actions (lint + test + build) y deploy a GitHub Pages | Alejandro | Media | 2 | 3 | GH Actions | YAML, CI |
| S1-T6 | Spike DSP: probar getUserMedia + AudioContext, confirmar sample rates disponibles | Fabrizio | Alta | 2 | 3 | Web Audio API | Muestreo, Nyquist |
| S1-T7 | Spike IA: cargar Xenova/whisper-tiny en browser, medir tamaño/latencia | Isaac | Alta | 3 | 4 | transformers.js | Pipelines HF |
| S1-T8 | Wireframes de la UI (chat + visualizadores) y sistema de diseño básico | Monestel | Media | 2 | 3 | Figma/papel | UX básico |
| S1-T9 | Iniciar marco teórico: muestreo, Nyquist, DFT (con ecuaciones KaTeX) | Fabrizio + Monestel | Media | 2 | 3 | Markdown/KaTeX | Señales y Sistemas |

**Riesgos:** transformers.js no corre bien en la laptop de alguien (probar en S1-T7, mitigación: modelos quantized q4). **Dependencias:** S1-T4 bloquea el trabajo paralelo → se hace en reunión conjunta. **Resultado esperado:** `npm run dev` funciona para los 4; mocks permiten desarrollar cualquier módulo aislado.
**Evidencias para el profesor:** repo con commits de los 4, planificación en `/docs`, captura del spike de Whisper corriendo en browser, wireframes.

---

## Semana 2 — Captura de audio + ASR prototipo

**Objetivos:** audio real capturado y preprocesado; primera transcripción offline; esqueleto de chat.
**Historias:** HU-02, HU-04 (parcial), HU-06 (parcial). **Tiempo total:** ~30 h.

| ID | Tarea | Dueño | P | D | h | Herramientas | Conocimientos |
|---|---|---|---|---|---|---|---|
| S2-T1 | Módulo de captura: AudioWorklet, buffer circular, resampling a 16 kHz | Fabrizio | Alta | 4 | 6 | AudioWorklet | Muestreo, interpolación |
| S2-T2 | Preprocesamiento: normalización RMS + filtro pasa-banda 80–8000 Hz (biquad) | Fabrizio | Alta | 3 | 4 | Web Audio | Filtros digitales |
| S2-T3 | VAD simple por umbral de energía (detectar inicio/fin de habla) | Fabrizio | Media | 3 | 3 | — | Energía de señal |
| S2-T4 | Worker de ASR: Whisper-tiny con transformers.js, API `transcribe(pcm)` | Isaac | Alta | 4 | 6 | transformers.js, Web Worker | ONNX, workers |
| S2-T5 | Indicador de descarga/carga de modelos (progreso) | Isaac | Media | 2 | 3 | — | Eventos de progreso |
| S2-T6 | Componente de chat: burbujas usuario/app, botón micrófono con estados (usando mocks) | Monestel | Alta | 2 | 5 | React | Componentes, estado |
| S2-T7 | Orquestador v0: botón mic → captura → ASR → texto en chat | Alejandro | Alta | 3 | 3 | — | Event bus |

**Riesgos:** AudioWorklet + resampling es lo más difícil de la semana (D4); si se atasca, fallback temporal con ScriptProcessorNode. **Dependencias:** S2-T7 integra T1+T4+T6, se hace al final; hasta entonces cada quien usa mocks. **Resultado esperado:** hablo y veo mi transcripción en el chat, sin internet (tras cargar modelo).
**Evidencias:** video corto de la transcripción funcionando, gráfica del filtro (respuesta en frecuencia), PRs revisados.

---

## Semana 3 — DSP visible + gramática + preparación Avance 1

**Objetivos:** waveform en tiempo real, FFT propia, corrección gramatical, documento Avance 1 completo.
**Historias:** HU-03, HU-05, HU-07 (doc). **Tiempo total:** ~34 h.

| ID | Tarea | Dueño | P | D | h | Herramientas | Conocimientos |
|---|---|---|---|---|---|---|---|
| S3-T1 | Implementar FFT propia (radix-2) + STFT con ventana de Hann; validar vs Meyda | Fabrizio | Alta | 4 | 6 | Meyda (verificación) | DFT/FFT, ventaneo |
| S3-T2 | Visualizador de waveform en Canvas a 30+ fps (consume `onFrame`) | Monestel | Alta | 3 | 5 | Canvas 2D | requestAnimationFrame |
| S3-T3 | Worker de gramática: T5 cuantizado, extraer diffs palabra a palabra | Isaac | Alta | 3 | 5 | transformers.js | seq2seq, diff |
| S3-T4 | Mostrar correcciones en chat con highlights (rojo error → verde corrección) | Monestel | Alta | 2 | 3 | React | — |
| S3-T5 | Integración: hablar → transcribir → corregir → mostrar | Alejandro | Alta | 2 | 3 | — | — |
| S3-T6 | Documento Avance 1 (estructura obligatoria del curso completa) | Todos (coord. Alejandro) | Alta | 3 | 8 | Word/Docs, Draw.io | Redacción técnica |
| S3-T7 | Presentación Avance 1 (10–15 min) + guion de demo en vivo + plan B grabado | Todos | Alta | 2 | 4 | PowerPoint | — |

**Riesgos:** demo en vivo falla (micrófono/permisos) → ensayo previo + video de respaldo. Documento a última hora → empezar lunes, congelar código el jueves. **Dependencias:** S3-T5 requiere S2 completa; S3-T6 requiere arquitectura (ya lista S1). **Resultado esperado:** MVP demostrable + documento Avance 1 terminado.
**Evidencias:** el propio documento, deck, demo funcional, validación FFT propia vs Meyda (tabla de error).

---

## Semana 4 — 🎯 AVANCE 1 (entrega y presentación)

**Objetivos:** entregar y presentar; retrospectiva; colchón para imprevistos.
**Historias:** HU-07 (cierre). **Tiempo total:** ~14 h.

| ID | Tarea | Dueño | P | D | h | Herramientas | Conocimientos |
|---|---|---|---|---|---|---|---|
| S4-T1 | Ensayo general de presentación (2 corridas, cronometradas) | Todos | Alta | 1 | 3 | — | Oratoria |
| S4-T2 | Entrega en plataforma + presentación + demo | Todos | Alta | 1 | 3 | — | — |
| S4-T3 | Retrospectiva: qué ajustar del plan para el sprint 5–7 | Todos | Alta | 1 | 2 | — | Scrum |
| S4-T4 | Spike: pitch por autocorrelación (base para YIN en S5) | Fabrizio | Media | 3 | 3 | — | Autocorrelación |
| S4-T5 | Spike: TTS SpeechT5 en browser, medir calidad/latencia | Isaac | Media | 3 | 3 | transformers.js | TTS |

**Riesgos:** feedback del profesor exige cambios → la retro los incorpora al backlog. **Resultado esperado:** Avance 1 entregado; equipo listo para fase de señales avanzadas.
**Evidencias:** acta de retro, comprobante de entrega, feedback recibido.

---

## Semana 5 — Señales avanzadas: pitch, espectrograma, MFCC + TTS

**Objetivos:** corazón DSP del proyecto: espectrograma, YIN y MFCC funcionando; TTS operativo.
**Historias:** HU-08, HU-09, HU-11. **Tiempo total:** ~32 h.

| ID | Tarea | Dueño | P | D | h | Herramientas | Conocimientos |
|---|---|---|---|---|---|---|---|
| S5-T1 | Pitch tracking YIN completo (umbral, interpolación parabólica) | Fabrizio | Alta | 5 | 7 | Paper YIN | Autocorrelación, YIN |
| S5-T2 | MFCC propio: mel filterbank (13 coef.) + DCT; validar vs librosa (Python) | Fabrizio | Alta | 5 | 7 | Python/librosa | Escala mel, cepstrum |
| S5-T3 | Espectrograma en Canvas (STFT → colormap, scroll temporal) | Monestel | Alta | 3 | 5 | Canvas 2D | STFT, dB |
| S5-T4 | Overlay de contorno de pitch sobre espectrograma | Monestel | Media | 2 | 3 | Canvas | — |
| S5-T5 | Worker TTS: SpeechT5, reproducir + exponer PCM de referencia | Isaac | Alta | 3 | 5 | transformers.js | Vocoders (concepto) |
| S5-T6 | Persistencia de sesiones en IndexedDB + esquema de datos | Alejandro | Media | 2 | 3 | IndexedDB | — |
| S5-T7 | Actualizar matriz de trazabilidad y marco teórico (MFCC, YIN, STFT) | Alejandro + Fabrizio | Media | 2 | 2 | KaTeX | — |

**Riesgos:** YIN y MFCC son las tareas más difíciles del proyecto (D5) → Fabrizio las tiene en exclusiva, sin otras cargas; validación contra librosa detecta errores temprano. **Dependencias:** S5-T3/T4 consumen `AudioFrame` ya definido (sin esperar a Fabrizio: mock genera frames sintéticos — seno de 440 Hz, chirp). **Resultado esperado:** visualizaciones completas de señales; la app "habla".
**Evidencias:** captura espectrograma de una vocal sostenida mostrando formantes, tabla MFCC propio vs librosa (error < 5%), demo pitch con nota cantada.

---

## Semana 6 — Comparador acústico + sugerencias + PWA offline

**Objetivos:** puntaje de pronunciación funcionando (feature estrella), sugerencias, app instalable offline.
**Historias:** HU-10, HU-12, HU-14 (parcial). **Tiempo total:** ~33 h.

| ID | Tarea | Dueño | P | D | h | Herramientas | Conocimientos |
|---|---|---|---|---|---|---|---|
| S6-T1 | DTW sobre secuencias de MFCC (usuario vs referencia TTS) | Fabrizio | Alta | 4 | 6 | — | DTW, distancias |
| S6-T2 | Puntaje global + por palabra (usando timestamps de Whisper) | Fabrizio + Isaac | Alta | 4 | 5 | — | Alineación temporal |
| S6-T3 | Feedback visual: colores por palabra según puntaje, panel de detalle | Monestel | Alta | 3 | 5 | React/Canvas | — |
| S6-T4 | Worker de sugerencias: LLM ligero con prompts fijos (naturalidad, vocabulario) | Isaac | Media | 3 | 5 | transformers.js | Prompting |
| S6-T5 | PWA completa: manifest, service worker (Workbox), precache de app shell | Alejandro | Alta | 3 | 5 | vite-plugin-pwa | Service Workers |
| S6-T6 | Verificar cache de modelos y arranque 100% offline | Alejandro | Alta | 3 | 4 | DevTools | Cache API |
| S6-T7 | Casos de prueba de pronunciación (frases con pares mínimos: ship/sheep) | Todos | Media | 2 | 3 | — | Fonética básica |

**Riesgos:** puntaje de pronunciación poco correlacionado con percepción humana → calibrar con las 4 voces del equipo; enmarcarlo como "feedback educativo", no juicio absoluto (recomendación del profesor). **Dependencias:** S6-T1 requiere MFCC (S5) y TTS (S5) — ya listos. **Resultado esperado:** flujo completo de corrección de pronunciación; app instalable.
**Evidencias:** video del puntaje ante buena/mala pronunciación, captura app instalada + funcionando en modo avión, tabla de calibración.

---

## Semana 7 — 🎯 AVANCE 2 (conversación completa + entrega)

**Objetivos:** integrar conversación end-to-end; documento y presentación Avance 2.
**Historias:** HU-13, HU-15. **Tiempo total:** ~30 h.

| ID | Tarea | Dueño | P | D | h | Herramientas | Conocimientos |
|---|---|---|---|---|---|---|---|
| S7-T1 | Orquestador completo: habla → ASR → gramática → sugerencias → respuesta → TTS → comparador | Alejandro | Alta | 4 | 6 | — | Async, colas |
| S7-T2 | Generación de respuesta conversacional (mismo LLM de sugerencias, prompt de tutor) | Isaac | Alta | 3 | 4 | — | Prompting |
| S7-T3 | Pulir UX del flujo (estados de carga, errores de micrófono, reintentos) | Monestel | Alta | 2 | 4 | — | — |
| S7-T4 | Optimizar latencia: pipeline en paralelo, quantización q4, medir por etapa | Isaac + Fabrizio | Media | 3 | 4 | Performance API | Profiling |
| S7-T5 | Documento Avance 2 (estructura obligatoria; foco: señales aplicadas y verificación) | Todos | Alta | 3 | 8 | — | — |
| S7-T6 | Presentación + demo Avance 2 + video de respaldo | Todos | Alta | 2 | 4 | PowerPoint | — |

**Riesgos:** latencia acumulada del pipeline > objetivo → mostrar métricas por etapa y plan de optimización (honestidad técnica suma con el profesor). **Resultado esperado:** conversación completa demostrada; Avance 2 entregado.
**Evidencias:** demo en vivo de conversación, tabla de latencias por etapa, documento y deck entregados.

---

## Semana 8 — Pruebas, métricas y endurecimiento

**Objetivos:** verificación formal con métricas cuantitativas; corregir lo encontrado.
**Historias:** HU-17, HU-19. **Tiempo total:** ~28 h.

| ID | Tarea | Dueño | P | D | h | Herramientas | Conocimientos |
|---|---|---|---|---|---|---|---|
| S8-T1 | Medir WER: set de 50 frases grabadas por los 4 (voces/acentos distintos) | Isaac | Alta | 3 | 5 | script WER | Métrica WER |
| S8-T2 | Pruebas de edge cases: ruido ambiental, frases largas, acento fuerte, silencios | Fabrizio + Isaac | Alta | 3 | 5 | — | Diseño de pruebas |
| S8-T3 | Pruebas unitarias DSP (FFT, MFCC, YIN con señales sintéticas conocidas) | Fabrizio | Alta | 3 | 4 | Vitest | Señales de prueba |
| S8-T4 | Pruebas de UI y compatibilidad (Chrome/Edge; documentar límites en Firefox/Safari) | Monestel | Media | 2 | 4 | Vitest, navegadores | Testing |
| S8-T5 | Prueba offline integral en máquina limpia (sin cache previa) | Alejandro | Alta | 2 | 3 | — | — |
| S8-T6 | Corrección de bugs priorizados del hallazgo de pruebas | Todos | Alta | 3 | 6 | — | — |
| S8-T7 | Registrar todas las métricas en la matriz de trazabilidad | Alejandro | Alta | 1 | 1 | — | — |

**Riesgos:** WER peor de lo esperado con acentos → documentar y reencuadrar como análisis de variabilidad acústica (contenido valioso del curso). **Resultado esperado:** app estable con métricas documentadas.
**Evidencias:** reporte de pruebas con tablas (WER por hablante, latencias, fps), cobertura de tests, issues cerrados.

---

## Semana 9 — Extensiones para nota alta + documento final (borrador)

**Objetivos:** progreso del usuario, pulido, borrador completo del documento final.
**Historias:** HU-16, HU-18 (parcial). **Tiempo total:** ~30 h.

| ID | Tarea | Dueño | P | D | h | Herramientas | Conocimientos |
|---|---|---|---|---|---|---|---|
| S9-T1 | Pantalla de progreso: evolución del puntaje de pronunciación por sesión (gráfica) | Monestel + Alejandro | Media | 3 | 5 | Canvas/Recharts | — |
| S9-T2 | Gamificación ligera: racha diaria, frases dominadas (solo si va sobrado) | Monestel | Baja | 2 | 3 | — | — |
| S9-T3 | Afinado final del comparador con datos de las pruebas S8 | Fabrizio | Media | 3 | 4 | — | — |
| S9-T4 | Documento final: todas las secciones obligatorias, integrado y verificado | Todos (coord. Alejandro) | Alta | 3 | 10 | — | Redacción |
| S9-T5 | Anexos: diagramas finales, snippets clave, capturas, bibliografía | Todos | Alta | 2 | 4 | Draw.io | — |
| S9-T6 | Congelar features (feature freeze viernes S9); solo bugs desde aquí | Alejandro | Alta | 1 | 1 | — | — |
| S9-T7 | Grabar video demo de respaldo completo | Monestel | Alta | 1 | 3 | OBS | — |

**Riesgos:** tentación de agregar features en S10 → feature freeze estricto. **Resultado esperado:** app final completa; documento al 90%.
**Evidencias:** gráfica de progreso con datos reales, borrador del documento, video demo.

---

## Semana 10 — 🎯 ENTREGA FINAL

**Objetivos:** entregar documento final, presentación y demo impecable.
**Historias:** HU-18 (cierre). **Tiempo total:** ~20 h.

| ID | Tarea | Dueño | P | D | h | Herramientas | Conocimientos |
|---|---|---|---|---|---|---|---|
| S10-T1 | Revisión cruzada del documento final (cada uno revisa sección de otro) | Todos | Alta | 2 | 4 | — | — |
| S10-T2 | Matriz de trazabilidad final: todo requisito → estado + prueba + métrica | Alejandro | Alta | 2 | 2 | — | — |
| S10-T3 | Presentación final (10–15 min): guion, reparto de secciones entre los 4 | Todos | Alta | 2 | 5 | PowerPoint | — |
| S10-T4 | 2 ensayos generales con demo en vivo + preguntas simuladas de profesor | Todos | Alta | 2 | 4 | — | — |
| S10-T5 | Entrega en plataforma (documento + deck + repo + demo desplegada) | Alejandro | Alta | 1 | 2 | — | — |
| S10-T6 | Preparar respuestas a preguntas probables (Nyquist, por qué MFCC, cómo funciona YIN/DTW, cuantización) | Todos | Alta | 2 | 3 | — | Todo el marco teórico |

**Riesgos:** fallo técnico el día de la demo → checklist pre-demo (permisos de mic, modelos cacheados, modo avión probado) + video de respaldo. **Resultado esperado:** Entrega final completa con demo funcional.
**Evidencias:** entrega completa, repo con historial de 10 semanas de los 4 integrantes.
