# Product Backlog

Priorización MoSCoW + valor académico. Dueño = responsable principal (todos revisan por PR).
Estimación en *story points* (SP, Fibonacci) y horas-persona aproximadas.

## Épicas

- **E1 — Fundación del proyecto** (repo, CI, PWA shell, contratos) — Alejandro
- **E2 — Motor de Audio DSP** (captura, preprocesamiento, features, comparador) — Fabrizio
- **E3 — Pipeline de IA** (ASR, gramática, sugerencias, TTS, cache de modelos) — Isaac
- **E4 — UI y Visualizaciones** (chat, waveform, espectrograma, feedback) — Monestel
- **E5 — Documentación y Entregas** (documentos, presentaciones, matrices) — Todos (coordina Alejandro)
- **E6 — Calidad** (pruebas, métricas, edge cases) — Todos (coordina Alejandro)

## Historias de usuario

| ID | Historia | Épica | Prioridad | SP | Horas | Dueño | Versión |
|---|---|---|---|---|---|---|---|
| HU-01 | Como equipo quiero un repo con CI, estructura modular y contratos congelados para trabajar en paralelo sin bloquearnos | E1 | Alta | 5 | 10 | Alejandro | MVP |
| HU-02 | Como usuario quiero grabar mi voz desde el navegador para practicar hablando | E2 | Alta | 5 | 12 | Fabrizio | MVP |
| HU-03 | Como usuario quiero ver la forma de onda de mi voz en tiempo real para saber que me está escuchando | E4 | Alta | 5 | 10 | Monestel | MVP |
| HU-04 | Como usuario quiero que mi voz se transcriba a texto (offline) para verificar lo que dije | E3 | Alta | 8 | 16 | Isaac | MVP |
| HU-05 | Como usuario quiero que la app corrija mi gramática y resalte los errores para aprender de ellos | E3 | Alta | 8 | 14 | Isaac | MVP |
| HU-06 | Como usuario quiero una interfaz de chat con botón de micrófono para conversar naturalmente | E4 | Alta | 5 | 12 | Monestel | MVP |
| HU-07 | Como estudiante del curso quiero el documento y presentación del Avance 1 para la evaluación | E5 | Alta | 8 | 20 | Todos | MVP |
| HU-08 | Como usuario quiero ver el espectrograma de mi voz para entender su contenido en frecuencia | E4 | Alta | 5 | 10 | Monestel | V1 |
| HU-09 | Como usuario quiero ver el contorno de pitch de mi voz para comparar mi entonación | E2 | Alta | 8 | 14 | Fabrizio | V1 |
| HU-10 | Como usuario quiero un puntaje de pronunciación con palabras problemáticas resaltadas para saber qué mejorar | E2+E4 | Alta | 13 | 24 | Fabrizio+Monestel | V1 |
| HU-11 | Como usuario quiero escuchar la pronunciación correcta (TTS) para imitarla | E3 | Alta | 8 | 14 | Isaac | V1 |
| HU-12 | Como usuario quiero sugerencias de vocabulario y naturalidad para comunicarme mejor | E3 | Media | 8 | 14 | Isaac | V1 |
| HU-13 | Como usuario quiero mantener una conversación completa (hablo → me corrige → me responde) para practicar de verdad | E1+E3 | Alta | 8 | 16 | Alejandro+Isaac | V1 |
| HU-14 | Como usuario quiero instalar la app y usarla sin internet para practicar donde sea | E1 | Alta | 8 | 14 | Alejandro | V1 |
| HU-15 | Como estudiante del curso quiero el documento y presentación del Avance 2 | E5 | Alta | 8 | 20 | Todos | V1 |
| HU-16 | Como usuario quiero ver mi progreso de pronunciación entre sesiones para motivarme | E1+E4 | Media | 5 | 10 | Alejandro+Monestel | Final |
| HU-17 | Como profesor quiero ver métricas de verificación (WER, latencia, edge cases) para evaluar la calidad técnica | E6 | Alta | 8 | 18 | Todos | Final |
| HU-18 | Como estudiante del curso quiero el documento final, matriz actualizada y demo pulida | E5 | Alta | 13 | 30 | Todos | Final |
| HU-19 | Como usuario con acento fuerte o en ambiente ruidoso quiero feedback útil (no fallos) — edge cases | E6 | Media | 5 | 10 | Fabrizio+Isaac | Final |

**Total estimado:** ~149 SP / ~288 horas-persona ≈ 7.2 h/semana por persona. Viable para 4 estudiantes.

---

# WBS (Work Breakdown Structure)

```
1. My Personal English Teacher (100%)
├── 1.1 Gestión de Proyecto (Alejandro) — 10%
│   ├── 1.1.1 Planificación (backlog, WBS, roadmap, matrices)
│   ├── 1.1.2 Configuración Git/GitHub, CI, plantillas de PR
│   ├── 1.1.3 Seguimiento semanal (tablero, actas, riesgos)
│   └── 1.1.4 Coordinación de entregas (S4, S7, S10)
├── 1.2 App Core + PWA (Alejandro) — 15%
│   ├── 1.2.1 Scaffold Vite+React+TS, estructura modular
│   ├── 1.2.2 Contratos compartidos + mocks
│   ├── 1.2.3 Event bus / orquestador de conversación
│   ├── 1.2.4 Service Worker, manifest, cache de assets
│   ├── 1.2.5 IndexedDB (sesiones, progreso)
│   └── 1.2.6 Verificación offline end-to-end
├── 1.3 Motor de Audio DSP (Fabrizio) — 25%
│   ├── 1.3.1 Captura (getUserMedia, AudioWorklet, resampling a 16 kHz)
│   ├── 1.3.2 Preprocesamiento (normalización, filtro pasa-banda, VAD)
│   ├── 1.3.3 FFT/STFT con ventaneo (Hann) — implementación propia
│   ├── 1.3.4 MFCC (mel filterbank + DCT) — implementación propia
│   ├── 1.3.5 Pitch: autocorrelación → YIN
│   ├── 1.3.6 Energía y formantes (LPC básico)
│   ├── 1.3.7 Comparador acústico (DTW + puntaje)
│   └── 1.3.8 Validación contra librosa/Meyda
├── 1.4 Pipeline de IA (Isaac) — 25%
│   ├── 1.4.1 Setup transformers.js + gestión de modelos
│   ├── 1.4.2 ASR Whisper-tiny (worker + streaming de resultados)
│   ├── 1.4.3 Corrección gramatical T5 + extracción de edits
│   ├── 1.4.4 Sugerencias (LLM ligero) con prompts fijos
│   ├── 1.4.5 TTS SpeechT5 + audio de referencia para comparador
│   ├── 1.4.6 Cache/descarga progresiva de modelos + indicador
│   └── 1.4.7 Medición WER y latencias
├── 1.5 UI y Visualizaciones (Monestel) — 15%
│   ├── 1.5.1 Layout, tema, componentes base
│   ├── 1.5.2 Chat (burbujas, estados, highlights de errores)
│   ├── 1.5.3 Visualizador waveform (Canvas)
│   ├── 1.5.4 Espectrograma (Canvas, colormap)
│   ├── 1.5.5 Pitch overlay + feedback por colores
│   └── 1.5.6 Pantalla de progreso (Final)
└── 1.6 Documentación, QA y Entregas (Todos) — 10%
    ├── 1.6.1 Documento Avance 1 + presentación + demo
    ├── 1.6.2 Documento Avance 2 + presentación + demo
    ├── 1.6.3 Documento Final + presentación + demo
    ├── 1.6.4 Matriz de trazabilidad (viva, se actualiza cada entrega)
    ├── 1.6.5 Plan y casos de prueba, métricas
    └── 1.6.6 Marco teórico (ecuaciones KaTeX, referencias)
```
