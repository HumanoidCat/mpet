# Matriz de Trazabilidad de Requerimientos

Formato exigido por el curso: ID, Descripción, Prioridad, Fuente, Módulo/Funcionalidad, Estado, Pruebas de Verificación, Métricas. Documento vivo: se actualiza en cada entrega (S4, S7, S10).

| ID | Requerimiento (del documento del curso) | Prioridad | Fuente | Módulo / Funcionalidad | Versión | Estado | Prueba de verificación | Métrica |
|---|---|---|---|---|---|---|---|---|
| RF-01 | Captura de micrófono (Web Audio API + MediaStream) | Alta | Curso | `src/audio/capture` (F01) | MVP | Pendiente | Grabar 5 s y verificar PCM 16 kHz válido | Sample rate correcto; sin drops |
| RF-02 | Preprocesamiento: filtrado y normalización | Alta | Curso | `src/audio/dsp` (F01) | MVP | Pendiente | Respuesta en frecuencia del filtro; RMS objetivo | Atenuación >20 dB fuera de banda |
| RF-03 | Visualización waveform en tiempo real | Alta | Curso | `src/ui/visualizer` (F02) | MVP | Pendiente | Inspección visual + medición fps | ≥30 fps |
| RF-04 | ASR offline con Whisper vía transformers.js | Alta | Curso | `src/ai/asr` (F03) | MVP | Pendiente | Set de 50 frases, 4 hablantes | WER ≤ 25% |
| RF-05 | Corrección gramatical (T5 cuantizado) con resaltado | Alta | Curso | `src/ai/grammar` + `src/ui/chat` (F04) | MVP | Pendiente | 50 frases con errores típicos | Precisión ≥ 80% |
| RF-06 | Interfaz tipo chat con botón de micrófono | Alta | Curso | `src/ui/chat` (F05) | MVP | Pendiente | Prueba de usabilidad con 3 usuarios | Flujo completable sin ayuda |
| RF-07 | Espectrograma en tiempo real (FFT/STFT propia) | Alta | Curso | `src/audio/dsp` + `src/ui/visualizer` (F06) | V1 | Pendiente | Vocal sostenida: formantes visibles; FFT propia vs Meyda | Error FFT < 1%; ≥30 fps |
| RF-08 | Pitch tracking (autocorrelación/YIN) | Alta | Curso | `src/audio/features` (F07) | V1 | Pendiente | Tonos sintéticos 100–400 Hz | Error < 3 Hz |
| RF-09 | Extracción de MFCC | Alta | Curso | `src/audio/features` (F08) | V1 | Pendiente | Comparación vs librosa | Error < 5% |
| RF-10 | Corrección de pronunciación: distancia acústica vs referencia + puntaje + highlights | Alta | Curso | `src/audio/comparator` + `src/ui/feedback` (F09, F14) | V1 | Pendiente | Pares mínimos (ship/sheep); buena vs mala pronunciación | Puntaje discrimina casos (Δ>20 pts) |
| RF-11 | TTS (SpeechT5) para respuestas habladas | Alta | Curso | `src/ai/tts` (F10) | V1 | Pendiente | Inteligibilidad evaluada por el equipo | 4/4 frases entendidas |
| RF-12 | Sugerencias de comunicación efectiva (LLM ligero) | Media | Curso | `src/ai/suggestions` (F11) | V1 | Pendiente | 20 frases: relevancia de sugerencias | ≥70% juzgadas útiles |
| RF-13 | Conversación completa: habla → respuesta (texto+voz) + sugerencias | Alta | Curso | `src/core/orchestrator` (F12) | V1 | Pendiente | Conversación de 5 turnos sin fallo | Latencia ≤ 2 s/turno (obj.) |
| RF-14 | PWA instalable, funciona sin internet tras cargar modelos | Alta | Curso | `src/core/sw` + Cache API (F13) | V1→Final | Pendiente | Instalar, modo avión, usar todo el flujo | 100% funcional offline |
| RF-15 | Cache de modelos (IndexedDB/Cache API) con descarga progresiva | Alta | Curso | `src/ai/model-cache` (F13) | V1 | Pendiente | Segunda carga sin red | 0 requests de red en recarga |
| RF-16 | Todo el procesamiento IA client-side (sin servidores) | Alta | Curso | Toda la app | MVP→Final | Pendiente | DevTools Network durante inferencia | 0 llamadas a APIs externas |
| RF-17 | Feedback visual con colores para correcciones | Alta | Curso | `src/ui/feedback` (F14) | V1 | Pendiente | Inspección con casos buenos/malos | Colores coherentes con puntaje |
| RF-18 | Documento técnico por entrega con estructura obligatoria | Alta | Curso | `docs/entregas/` | Cada hito | Pendiente | Checklist contra estructura del curso | 8/8 secciones completas |
| RF-19 | Presentación 10–15 min + demo en vivo por entrega | Alta | Curso | Entregables | Cada hito | Pendiente | Ensayo cronometrado | 10–15 min |
| RF-20 | Matriz de trazabilidad actualizada por entrega | Alta | Curso | Este documento | Cada hito | En curso | Revisión en cada hito | 100% requisitos mapeados |
| RF-21 | Verificación con métricas: WER, latencia, edge cases | Alta | Curso | `tests/` (F16) | Final | Pendiente | Plan de pruebas S8 | Reporte completo |
| RF-22 | Marco teórico con ecuaciones (DFT, MFCC) en KaTeX | Alta | Curso | `docs/marco-teorico.md` | Cada hito | Pendiente | Revisión del profesor | Ecuaciones clave presentes |
| RF-23 | Extensión: análisis de progreso de pronunciación (nota alta) | Baja | Equipo | `src/ui/progress` + IndexedDB (F15) | Final | Pendiente | Datos de ≥3 sesiones graficados | Gráfica de evolución |

**Correspondencia con criterios de evaluación:** Calidad Técnica 40% → RF-01…RF-17, RF-21 · Documento 30% → RF-18, RF-20, RF-22 · Presentación 20% → RF-19 · Innovación 10% → RF-23 + visualizaciones avanzadas (RF-07/08).
