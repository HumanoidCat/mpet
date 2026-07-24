# My Personal English Teacher (MPET)
## Avance 1 — Documento Técnico

**Curso:** Señales y Sistemas
**Equipo:** Alejandro Zamora (Project Manager e Integración) · Fabrizio (Procesamiento Digital de Señales) · Isaac Morum (Inteligencia Artificial)
**Repositorio:** https://github.com/HumanoidCat/mpet
**Demo desplegada:** https://humanoidcat.github.io/mpet/
**Fecha de entrega:** Semana 4

> **Nota de conformación del equipo.** El proyecto se planificó originalmente para
> cuatro integrantes. Un integrante no se incorporó al desarrollo, por lo que en la
> Semana 3 el Project Manager redistribuyó formalmente sus tareas: el módulo de
> Interfaz y Visualización pasó a Alejandro Zamora, sumado a sus responsabilidades
> de núcleo e integración. La redistribución está documentada en el repositorio
> (`README.md`, `guias/`) y la contribución individual de cada integrante es
> verificable en el historial de commits y pull requests.

---

## 1. Descripción del problema

Aprender inglés conversacional es, para un hispanohablante, un problema distinto al
de aprender su gramática o su vocabulario. La dificultad central no es de
conocimiento sino de **producción oral**: el estudiante sabe la regla, pero no
consigue pronunciar de forma inteligible ni sostener una conversación con fluidez.

Este problema tiene tres causas identificables:

**Barrera fonética.** El inventario fonológico del español tiene cinco vocales; el
del inglés supera las once, además de contrastes consonánticos inexistentes en
español. Pares mínimos como *ship*/*sheep* o *bad*/*bed* se colapsan en un mismo
sonido para el oído no entrenado. El estudiante no puede corregir lo que no
distingue, y sin retroalimentación externa el error se fosiliza.

**Falta de práctica conversacional accesible.** La práctica oral efectiva exige un
interlocutor que corrija en el momento. Las alternativas reales —tutorías privadas,
academias, intercambios— son costosas, dependen de horarios y, sobre todo,
requieren conexión estable. En zonas con conectividad limitada o para estudiantes
con restricciones económicas, esa práctica simplemente no ocurre.

**Retroalimentación tardía o inexistente.** Las aplicaciones masivas de idiomas
evalúan mayoritariamente comprensión y gramática escrita. Cuando incorporan
reconocimiento de voz, devuelven un veredicto binario ("correcto" / "inténtalo de
nuevo") sin explicar *qué* falló: si la vocal fue muy corta, si la entonación cayó
donde debía subir, si el problema fue una consonante final omitida.

### El problema desde la perspectiva de Señales y Sistemas

Evaluar pronunciación automáticamente es, en el fondo, un problema de análisis de
señales. La voz es una señal continua que debe muestrearse respetando el criterio
de Nyquist, filtrarse para eliminar ruido y componentes fuera de la banda de
interés, y transformarse al dominio de la frecuencia para extraer las
características que efectivamente distinguen un fonema de otro. Las dificultades
técnicas son concretas y medibles:

- **Ruido ambiental y variabilidad del canal.** El micrófono captura ruido de fondo,
  reverberación de la sala y distorsiones propias del dispositivo. Sin
  preprocesamiento, ese ruido contamina toda medición posterior.
- **Variabilidad acústica entre hablantes.** La misma palabra pronunciada por dos
  personas produce señales muy distintas en amplitud, duración y frecuencia
  fundamental. La comparación no puede ser muestra a muestra: requiere
  características robustas a esa variabilidad y alineamiento temporal.
- **Restricción de tiempo real.** El análisis debe ocurrir mientras el usuario habla,
  sin bloquear la interfaz, y con retroalimentación en menos de dos segundos para
  que la corrección resulte útil pedagógicamente.

El proyecto aborda estas dificultades aplicando muestreo y decimación con filtro
anti-aliasing, filtrado en banda de voz, transformada de Fourier de tiempo corto,
extracción de coeficientes cepstrales en escala mel (MFCC), detección de frecuencia
fundamental y comparación mediante alineamiento temporal dinámico.

---

## 2. Justificación

**Valor educativo.** La retroalimentación inmediata y específica es el factor que
más acelera la adquisición de una segunda lengua. Una herramienta que señale *qué
palabra* se pronunció mal, con qué grado de desviación y frente a qué referencia,
ataca el problema de la fosilización de errores que las aplicaciones existentes
dejan sin resolver.

**Accesibilidad y costo.** Al ejecutarse íntegramente en el navegador del usuario,
la aplicación tiene costo de operación cero: no hay servidores de inferencia, no
hay cuotas por uso de API, no hay límite de sesiones. Tras la descarga inicial de
los modelos funciona sin conexión, lo que la vuelve utilizable en contextos de
conectividad intermitente o costosa. Esto no es una decisión estética sino la que
determina si la herramienta es realmente accesible para quien más la necesita.

**Privacidad.** La voz es un dato biométrico. En una arquitectura cliente el audio
nunca sale del dispositivo: no se transmite, no se almacena en terceros, no se
utiliza para entrenar modelos ajenos. La privacidad no depende de una política sino
de la arquitectura.

**Pertinencia con el curso.** El proyecto exige aplicar de forma no decorativa los
contenidos de Señales y Sistemas: teorema de muestreo, aliasing, filtrado digital,
DFT y espectrogramas, extracción de características, detección de periodicidad y
comparación de señales. Cada uno de estos conceptos resuelve un problema concreto
dentro de la aplicación, y su correctitud es verificable mediante pruebas contra
señales sintéticas de parámetros conocidos y contra bibliotecas de referencia.

**Pertinencia con la industria de TI.** La combinación de Progressive Web Apps con
inferencia en el borde (*edge AI*) es una tendencia consolidada: reduce costos de
infraestructura, elimina latencia de red y resuelve requisitos de privacidad y
cumplimiento normativo. Trabajar con transformers.js, ONNX Runtime Web y
cuantización de modelos corresponde a competencias vigentes en el mercado.

---

## 3. Arquitectura propuesta a nivel macro

### 3.1 Principio rector: desacoplamiento por contratos

La decisión arquitectónica de mayor impacto fue definir, antes de escribir código
funcional, un conjunto de **interfaces (contratos) en TypeScript** que delimitan la
frontera entre módulos, y congelarlas al cierre de la Semana 1
(`src/shared/contracts.ts`). Cada módulo posee además una **implementación simulada**
(*mock*) que respeta su contrato.

Esta decisión produjo tres beneficios verificables durante el desarrollo:

1. **Trabajo verdaderamente paralelo.** Cada integrante desarrolla contra los mocks
   de los demás; nadie espera código ajeno. La interfaz se desarrolló contra un
   generador de señal sintética antes de que existiera la captura real.
2. **Sustitución sin refactorización.** El orquestador recibe sus dependencias por
   inyección: reemplazar un mock por el módulo real es cambiar una línea de
   composición, sin tocar lógica.
3. **Absorción de la baja de un integrante.** Cuando fue necesario redistribuir el
   módulo de interfaz, no hubo dependencias ocultas que desenredar.

### 3.2 Diagrama de bloques

```mermaid
flowchart TB
    subgraph UI["Interfaz - Alejandro"]
        CHAT[Chat y feedback visual]
        VIS[Visualizador: waveform, espectrograma, pitch]
    end
    subgraph AUDIO["Motor de Audio DSP - Fabrizio"]
        CAP[Captura: getUserMedia + AudioWorklet]
        PRE[Preprocesamiento: decimacion, filtrado, normalizacion, VAD]
        FEAT[Caracteristicas: FFT/STFT, MFCC, pitch YIN, energia]
        COMP[Comparador acustico: DTW y puntaje]
    end
    subgraph IA["Pipeline de IA - Isaac"]
        ASR[ASR: Whisper-tiny]
        GRAM[Gramatica: T5 cuantizado]
        SUG[Sugerencias y respuesta]
        TTS[TTS: SpeechT5]
    end
    subgraph CORE["Nucleo y PWA - Alejandro"]
        BUS[Event bus y orquestador]
        SW[Service Worker + Cache API]
        DB[IndexedDB: sesiones y progreso]
    end
    CAP --> PRE --> FEAT
    FEAT --> COMP
    FEAT --> VIS
    PRE --> ASR
    ASR --> GRAM --> SUG --> TTS
    TTS -->|audio de referencia| COMP
    COMP --> CHAT
    GRAM --> CHAT
    BUS -.orquesta.-> AUDIO & IA & UI
    SW --> DB
```

### 3.3 Flujo de datos de un turno de conversación

1. El usuario activa el micrófono. La captura entrega audio a 48 kHz (rate impuesto
   por el hardware, medido en el spike S1-T6) y se decima por factor entero 3 hasta
   16 kHz, previo filtro anti-aliasing con corte en 7 200 Hz.
2. Se aplica normalización RMS, filtrado pasa-banda en 80–8 000 Hz y detección de
   actividad de voz por umbral de energía.
3. En paralelo: las características alimentan el visualizador en tiempo real, y el
   bloque PCM completo alimenta el reconocedor de voz.
4. El ASR produce la transcripción con marcas temporales por palabra; el corrector
   gramatical devuelve el texto corregido y la lista de ediciones; el generador
   produce la respuesta del tutor y las sugerencias.
5. El sintetizador de voz pronuncia la frase correcta y entrega esa señal como
   **referencia acústica** al comparador.
6. El comparador alinea por DTW las secuencias de MFCC del usuario y de la
   referencia, y produce un puntaje global y por palabra que la interfaz traduce a
   retroalimentación visual.

### 3.4 Organización del repositorio

```
mpet/
├── src/
│   ├── core/      Alejandro: event bus, orquestador, service worker, almacenamiento
│   ├── audio/     Fabrizio: captura, dsp, caracteristicas, comparador
│   ├── ai/        Isaac: asr, gramatica, sugerencias, tts, cache de modelos
│   ├── ui/        Alejandro: chat, visualizador, feedback, progreso
│   └── shared/    Contratos y constantes (cambios solo por PR shared-change)
├── mocks/         Implementaciones simuladas de cada contrato
├── tests/         Espejo de src/, por modulo
└── docs/          Planificacion, marco teorico, evidencias y entregas
```

### 3.5 Decisiones técnicas y su justificación

| Decisión | Alternativa descartada | Justificación |
|---|---|---|
| React 18 + Vite + TypeScript | JavaScript sin framework | Aislamiento por componentes para trabajo paralelo; el tipado estático hace que los contratos entre módulos sean verificables por el compilador, no solo por convención |
| transformers.js (Hugging Face) | Web Speech API como solución final | Web Speech delega el reconocimiento en servidores del navegador: incumple el requisito de ejecución client-side y de operación offline. Se conserva únicamente como plan de contingencia documentado |
| Whisper-tiny.en cuantizado | whisper-base / small | Medido en spike: 41 MB y RTF 0.3. Las variantes mayores comprometen la latencia objetivo sin necesidad demostrada |
| Implementación propia de FFT, MFCC y detección de pitch | Usar directamente una biblioteca DSP | Es el contenido evaluable del curso. Las bibliotecas de referencia (Meyda, librosa) se emplean como patrón de validación numérica, no como implementación |
| Decimación entera con filtro anti-aliasing explícito | Delegar el remuestreo al navegador | El remuestreador del navegador no documenta su filtro; además Safari ignora históricamente el parámetro de sample rate. La decimación explícita es portable y es evidencia directa del curso |
| AudioWorklet y Web Workers | Procesamiento en el hilo principal | Mantiene la interfaz fluida durante análisis e inferencia, requisito de la visualización en tiempo real |
| Canvas 2D para visualización | WebGL o bibliotecas de gráficos | Suficiente para el objetivo de 30 fps; evita dependencias innecesarias |
| Inyección de dependencias en el orquestador | Instanciación directa de módulos | Permite sustituir mocks por módulos reales sin modificar la lógica de coordinación |

---

## 4. Objetivos

### 4.1 Objetivo general

Desarrollar una Progressive Web App de funcionamiento offline para la práctica de
inglés conversacional, que integre procesamiento digital de señales de voz e
inferencia de modelos de inteligencia artificial ejecutados íntegramente en el
navegador.

### 4.2 Objetivos específicos

1. Capturar y acondicionar la señal de voz en tiempo real: decimación con filtro
   anti-aliasing a 16 kHz, normalización RMS, filtrado pasa-banda 80–8 000 Hz y
   detección de actividad de voz.
2. Alcanzar una tasa de error de palabra (WER) menor o igual al 25 % con
   `whisper-tiny.en` sobre un conjunto de 50 frases de práctica.
3. Mantener la latencia de la etapa de reconocimiento por debajo de 2 segundos para
   locuciones de hasta 10 palabras.
4. Implementar la extracción de 13 coeficientes MFCC y la detección de frecuencia
   fundamental mediante el algoritmo YIN, validando ambas contra bibliotecas de
   referencia con un error inferior al 5 %.
5. Calcular un puntaje de pronunciación por palabra a partir de la distancia entre
   secuencias de características del usuario y de una referencia sintetizada,
   alineadas mediante DTW.
6. Renderizar forma de onda y espectrograma en tiempo real a 30 fps o más, sin
   bloquear el hilo principal de la interfaz.
7. Garantizar operación offline completa tras la carga inicial de los modelos,
   verificable mediante la desconexión de red del navegador.
8. Alcanzar una precisión igual o superior al 80 % en la corrección de un conjunto
   de 50 frases con errores gramaticales típicos de hispanohablantes.

### 4.3 Objetivos de aprendizaje

Demostrar la aplicación correcta de: teorema de muestreo de Nyquist–Shannon y
prevención de aliasing; diseño y efecto de filtros digitales; transformada discreta
de Fourier, ventaneo y transformada de tiempo corto; representación cepstral en
escala mel; algoritmos de detección de periodicidad; y comparación de señales
mediante alineamiento temporal no lineal.

---

## 5. Marco teórico

El desarrollo completo del marco teórico, con ecuaciones y hallazgos medidos, se
encuentra en `docs/09-marco-teorico.md` del repositorio. Esta sección resume los
fundamentos aplicados hasta el Avance 1.

### 5.1 Muestreo y teorema de Nyquist

Una señal continua $x(t)$ se convierte en la secuencia discreta
$x[n] = x(nT_s)$, con frecuencia de muestreo $f_s = 1/T_s$. El teorema de
muestreo establece que la reconstrucción sin pérdida requiere

$$f_s > 2 f_{max}$$

siendo la frecuencia de Nyquist $f_N = f_s/2$. A 16 kHz, $f_N = 8\,000$ Hz, techo
suficiente para la voz: la frecuencia fundamental humana se sitúa entre 85 y 255 Hz
y los formantes relevantes para distinguir fonemas se concentran por debajo de
4 kHz.

**Hallazgo medido (spike S1-T6).** El micrófono del equipo entrega exclusivamente
48 000 Hz —`getCapabilities()` devuelve un rango degenerado 48 000–48 000, es decir
un valor único, no negociable—. Como 48 000 / 16 000 = 3 es entero, corresponde una
**decimación exacta**: filtrar pasa-bajos con corte en 7 200 Hz (90 % del Nyquist
destino, con margen para la caída no ideal del filtro) y conservar una de cada tres
muestras. Omitir ese filtro plegaría todo el contenido entre 8 y 24 kHz sobre la
banda útil (aliasing), corrompiendo las mediciones posteriores.

### 5.2 Transformada discreta de Fourier

El análisis espectral se apoya en la DFT:

$$X[k] = \sum_{n=0}^{N-1} x[n] \, e^{-j 2\pi k n / N}$$

calculada mediante FFT de base 2. Para señales no estacionarias como la voz se
emplea la transformada de tiempo corto (STFT), que aplica la DFT sobre ventanas
solapadas, previa multiplicación por una ventana de Hann para atenuar la fuga
espectral introducida por el truncamiento.

### 5.3 Inferencia de modelos en el navegador

transformers.js ejecuta modelos del Hub de Hugging Face sobre ONNX Runtime Web,
compilado a WebAssembly, con posibilidad de acelerar por WebGPU. Los modelos se
distribuyen **cuantizados** —pesos representados en 8 bits en lugar de coma
flotante de 32— lo que reduce el tamaño de descarga y el consumo de memoria a costa
de una pérdida de precisión acotada.

**Mediciones obtenidas (spike S1-T7, Chrome, WASM de un solo hilo):**

| Medida | Valor | Interpretación |
|---|---|---|
| Carga en frío | 17.70 s | Descarga y compilación; ocurre una única vez |
| Carga desde caché | 0.54 s | Aproximadamente 33 veces más rápida |
| Tamaño en caché | ~41 MB | Descarga única, habilita el uso offline |
| Tiempo de inferencia | 1.44–1.72 s | Locuciones de 5 s |
| Factor de tiempo real (RTF) | 0.28–0.31 | Menor que 1: procesa más rápido que el tiempo real |
| Memoria (heap JS) | ~290 MB | A vigilar al incorporar modelos adicionales |

El resultado valida la viabilidad del enfoque offline: la penalización de la primera
carga es un costo único, y en régimen la etapa de reconocimiento queda holgadamente
bajo el objetivo de 2 segundos.

> **Secciones a completar para el documento final:** MFCC y banco de filtros mel
> (Semana 5, Fabrizio), algoritmo YIN (Semana 5, Fabrizio), alineamiento temporal
> dinámico (Semana 6, Fabrizio), síntesis de voz y arquitectura de los modelos
> empleados (Semana 5, Isaac).

---

## 6. Matriz de trazabilidad de requerimientos

Estado al cierre del Avance 1. La matriz completa y actualizada se mantiene en
`docs/07-matriz-trazabilidad.md`.

| ID | Requerimiento | Prioridad | Módulo | Estado | Verificación | Métrica |
|---|---|---|---|---|---|---|
| RF-01 | Captura de micrófono | Alta | `src/audio/capture` | Parcial | Sonda de dispositivo ejecutada; adaptador de demostración operativo | Rate detectado 48 kHz; estrategia de decimación seleccionada en runtime |
| RF-02 | Preprocesamiento: decimación, filtrado, normalización | Alta | `src/audio/dsp` | Parcial | Utilidades de muestreo con pruebas unitarias | Factor entero 3; corte del filtro 7 200 Hz |
| RF-03 | Visualización de forma de onda en tiempo real | Alta | `src/ui/visualizer` | Implementado | Inspección visual con señal real y sintética | Renderizado sobre requestAnimationFrame; objetivo 30 fps |
| RF-04 | Reconocimiento de voz offline (Whisper) | Alta | `src/ai/asr` | Parcial | Spike con mediciones completas; worker en desarrollo | RTF 0.28–0.31; 41 MB en caché |
| RF-05 | Corrección gramatical con resaltado | Alta | `src/ai/grammar` + `src/ui/chat` | Parcial | Resaltado implementado y probado con 4 pruebas unitarias | Modelo real pendiente de integración |
| RF-06 | Interfaz de chat con control de micrófono | Alta | `src/ui/chat` | Implementado | Prueba manual del flujo completo | Estados idle / grabando / procesando operativos |
| RF-07 | Espectrograma en tiempo real | Alta | `src/audio/dsp` + `src/ui` | Pendiente | — | Planificado Semana 5 |
| RF-08 | Detección de frecuencia fundamental | Alta | `src/audio/features` | Pendiente | — | Planificado Semana 5 |
| RF-09 | Extracción de MFCC | Alta | `src/audio/features` | Pendiente | — | Planificado Semana 5 |
| RF-10 | Puntaje de pronunciación | Alta | `src/audio/comparator` | Pendiente | — | Planificado Semana 6 |
| RF-11 | Síntesis de voz | Alta | `src/ai/tts` | Pendiente | — | Planificado Semana 5 |
| RF-12 | Sugerencias de comunicación | Media | `src/ai/suggestions` | Pendiente | — | Planificado Semana 6 |
| RF-13 | Conversación completa | Alta | `src/core/orchestrator` | Parcial | Flujo end-to-end operativo con módulos simulados; 4 pruebas unitarias | Máquina de estados verificada |
| RF-14 | PWA instalable y offline | Alta | `src/core` | Parcial | Service worker generado en build; verificación offline pendiente | 8 entradas en precaché |
| RF-15 | Caché de modelos | Alta | `src/ai/model-cache` | Parcial | Validado en spike | Segunda carga 0.54 s desde caché |
| RF-16 | Procesamiento íntegramente client-side | Alta | Toda la aplicación | Implementado | Ausencia de backend; inspección de red | Cero llamadas a servicios externos en inferencia |
| RF-17 | Retroalimentación visual por colores | Alta | `src/ui` | Parcial | Resaltado de gramática implementado | Colores de pronunciación pendientes |
| RF-18 | Documento técnico por entrega | Alta | `docs/entregas` | En curso | Este documento | Ocho secciones obligatorias |
| RF-19 | Presentación y demostración | Alta | — | En curso | Ensayo cronometrado | 10–15 minutos |
| RF-20 | Matriz de trazabilidad actualizada | Alta | `docs/07` | Implementado | Revisión por hito | 23 requerimientos mapeados |
| RF-21 | Verificación con métricas | Alta | `tests/` | Parcial | 21 pruebas automatizadas en integración continua | WER formal planificado Semana 8 |
| RF-22 | Marco teórico con ecuaciones | Alta | `docs/09` | Parcial | Muestreo, Nyquist y DFT completos | Secciones restantes en Semanas 5 y 6 |
| RF-23 | Análisis de progreso del usuario | Baja | `src/ui/progress` | Pendiente | — | Planificado Semana 9 |

---

## 7. Etapa de desarrollo y verificación de funcionalidades

### 7.1 Metodología

El proyecto se ejecuta con un marco iterativo de sprints semanales alineados con
las sesiones del curso. Cada sprint define objetivos, tareas con estimación y
responsable, riesgos y evidencias esperadas. La planificación completa de las diez
semanas está en `docs/04-plan-semanal.md`; el seguimiento se realiza mediante
GitHub Projects e issues etiquetados por sprint.

**Gestión de la configuración.** Se emplea un flujo de ramas con integración en
`dev` y publicación en `main`. Ningún cambio entra directamente: todo pasa por pull
request con revisión y con la verificación automática en verde. Los archivos
compartidos (contratos y dependencias) requieren un pull request especial
etiquetado `shared-change`, aprobado por el líder técnico y por el responsable del
módulo afectado. Este mecanismo se ejerció en la Semana 3 para incorporar la
dependencia del motor de inferencia.

**Integración continua.** Cada pull request dispara un pipeline que ejecuta
verificación de tipos, pruebas automatizadas y compilación de producción. La rama
`main` despliega automáticamente la demostración pública.

### 7.2 Estrategia de verificación

| Nivel | Método | Estado |
|---|---|---|
| Unitario | Pruebas sobre funciones puras: utilidades de muestreo, segmentación de correcciones, máquina de estados del orquestador, cumplimiento de contratos por los mocks | 21 pruebas en verde |
| Integración | Flujo completo de un turno de conversación con módulos simulados | Verificado |
| Numérico | Comparación de implementaciones propias de DSP contra bibliotecas de referencia con señales sintéticas de parámetros conocidos | Planificado Semanas 5 y 6 |
| Métrico | WER sobre conjunto de 50 frases con cuatro hablantes; latencia por etapa; fotogramas por segundo del visualizador | Planificado Semana 8 |
| Casos límite | Ruido ambiental, acento marcado, locuciones largas, silencios, ausencia de permisos de micrófono | Manejo de permisos implementado; resto planificado Semana 8 |

### 7.3 Resultados del período

**Completado.** Infraestructura del proyecto (repositorio, integración continua,
estructura modular, contratos congelados); orquestador de conversación con
inyección de dependencias y flujo end-to-end operativo sobre módulos simulados;
módulo de interfaz con chat, control de micrófono con estados, visualización de
forma de onda en tiempo real y resaltado de correcciones gramaticales; sonda de
dispositivo de audio con determinación de la estrategia de remuestreo; validación
experimental del reconocimiento de voz en el navegador con mediciones completas;
marco teórico de muestreo, Nyquist y DFT.

**En curso.** Módulo de captura definitivo con AudioWorklet; worker de
reconocimiento de voz sobre el contrato definido; corrección gramatical con modelo
real; integración de módulos reales en sustitución de los simulados.

### 7.4 Incidencias y decisiones de gestión

| Incidencia | Decisión |
|---|---|
| Un integrante no se incorporó al desarrollo | Redistribución formal del módulo de interfaz al Project Manager, documentada en el repositorio. La arquitectura desacoplada permitió absorber la baja sin replanificar el resto de módulos |
| El micrófono no permite negociar la frecuencia de muestreo | Implementar decimación explícita con filtro anti-aliasing en lugar de delegar en el navegador. La decisión además aporta evidencia directa del curso |
| La versión actual del motor de inferencia es una mayor superior a la validada | Fijar la versión a la rama validada experimentalmente, para preservar la correspondencia entre el código y las mediciones documentadas |
| Consumo de memoria de un solo modelo cercano a 290 MB | Registrado como riesgo; se medirá el consumo agregado al incorporar los modelos restantes y se evaluará carga bajo demanda |

---

## 8. Anexos

### Anexo A — Diagramas
Diagrama de bloques de la arquitectura (sección 3.2). Diagrama de Gantt del
proyecto y ruta crítica en `docs/05-roadmap.md`.

### Anexo B — Evidencias experimentales
- `docs/evidencias/s1/captura-audio-spike.md` — Sonda de dispositivo de audio: frecuencias soportadas y estrategia de remuestreo.
- `docs/evidencias/s1/whisper-tiny-spike.md` — Reconocimiento de voz en el navegador: tamaño, tiempos de carga, latencia y precisión cualitativa.
- `docs/evidencias/s3/ui-chat-waveform.md` — Módulo de interfaz: decisiones de implementación y verificación.

### Anexo C — Capturas de la aplicación
> Insertar antes de la entrega: captura de la interfaz con la forma de onda de voz
> real; captura de un turno de conversación con corrección gramatical resaltada;
> captura del pipeline de integración continua en verde; captura del tablero de
> seguimiento.

### Anexo D — Fragmentos de código relevantes
> Incluir: definición de los contratos entre módulos; selección de estrategia de
> remuestreo; máquina de estados del orquestador.

### Anexo E — Gestión del proyecto
Planificación completa (`docs/00` a `docs/08`), historial de commits y pull
requests del repositorio, tablero de issues por sprint.

### Anexo F — Bibliografía
- Oppenheim, A. V., y Schafer, R. W. *Discrete-Time Signal Processing*. Pearson.
- De Cheveigné, A., y Kawahara, H. (2002). *YIN, a fundamental frequency estimator for speech and music*. Journal of the Acoustical Society of America, 111(4).
- Davis, S., y Mermelstein, P. (1980). *Comparison of parametric representations for monosyllabic word recognition in continuously spoken sentences*. IEEE Transactions on Acoustics, Speech, and Signal Processing.
- Radford, A. et al. (2022). *Robust Speech Recognition via Large-Scale Weak Supervision* (Whisper). OpenAI.
- Hugging Face. *Transformers.js Documentation*. https://huggingface.co/docs/transformers.js
- Mozilla Developer Network. *Web Audio API*. https://developer.mozilla.org/docs/Web/API/Web_Audio_API
- Google Developers. *Progressive Web Apps*. https://web.dev/progressive-web-apps/

---

## Secciones pendientes de completar por el equipo

> **Fabrizio (DSP):** ampliar la sección 5 con el desarrollo del filtro
> anti-aliasing implementado y la respuesta en frecuencia obtenida; agregar a la
> sección 7.3 los resultados del módulo de captura definitivo con sus mediciones.
>
> **Isaac (IA):** ampliar la sección 5.3 con la descripción del worker de
> reconocimiento y el mecanismo de caché de modelos; agregar a la sección 7.3 las
> latencias medidas del pipeline real y las decisiones sobre el modelo de
> corrección gramatical.
