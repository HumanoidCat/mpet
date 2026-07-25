# Evidencia S2-T4 / S2-T5 — Worker de ASR y progreso de carga

**Autor:** Isaac Morum (IA/ML) · **Semana 2** · **Épica E3**
**Rama:** `feat/ai-asr-worker-s2-t4-t5` · **Dependencia:** `@huggingface/transformers@3.8.1`

## Qué se construyó

| Archivo | Responsabilidad |
|---|---|
| `src/ai/asr/asrWorker.ts` | Web Worker: carga `Xenova/whisper-tiny.en` (q8) y transcribe con timestamps por palabra |
| `src/ai/asr/asrClient.ts` | Envuelve el worker en API de promesas (correlación por id, errores, `dispose()`) |
| `src/ai/asr/asrProtocol.ts` | Tipos de los mensajes entre hilos, en un único sitio |
| `src/ai/createAIPipeline.ts` | Implementa el contrato `AIPipeline` |
| `src/ai/model-cache/progress.ts` | Agrega el progreso por archivo en un único 0–1 por modelo |

**Decisiones de diseño**

1. **Web Worker (S2-T4).** La inferencia tarda ~1.5 s por cada 5 s de audio (medido en
   S1-T7). En el hilo principal congelaría la UI ese tiempo completo. El worker la deja
   fluida y cumple el requisito del equipo de un worker por modelo.
2. **Timestamps por palabra.** Se pide `return_timestamps: 'word'` porque el comparador de
   pronunciación (Fabrizio, S6-T2) los necesita para alinear. Es la frontera exacta entre
   ambos módulos, definida en `contracts.ts` como `WordAlign`.
3. **Etapas pendientes con paso a través.** `correctGrammar`, `suggest`, `reply` y `speak`
   devuelven valores neutros documentados en vez de lanzar error: así el orquestador puede
   integrar el ASR real sin romper la app hasta que esas etapas existan (S3, S5, S6, S7).
4. **Progreso agregado (S2-T5).** transformers.js reporta progreso por archivo (en el spike
   el log escupía cientos de líneas sueltas). Se acumulan bytes de todos los archivos en un
   único 0–1 y se fuerza monotonía, para que la barra de la UI no salte hacia atrás cuando
   aparece un archivo nuevo. Cierra en 100% con `complete()` aunque el modelo venga de caché.

## Verificación

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` contra `@huggingface/transformers@3.8.1` | **0 errores** |
| API v3 verificada sin *casts* en las opciones (`dtype`, `progress_callback`) | ✅ |
| `npx vitest run` | **26/26 tests verdes** (5 nuevos de S2-T5) |
| `npm run build` | ✅ correcto |
| Empaquetado del worker (build de app con el pipeline importado) | worker JS **877 kB**; WASM de ONNX emitido como **asset aparte de 21.6 MB** (no incrustado) |

Los 5 tests nuevos cubren el agregador de progreso: combinación de varios archivos,
monotonía, eventos sin tamaño, evento `done` y cierre en 100% desde caché.

## ⚠️ Hallazgo para integración — RESUELTO

El build emite `ort-wasm-simd-threaded.jsep-*.wasm` de **21.6 MB** como archivo aparte.
Ese runtime de ONNX es imprescindible para la inferencia, y **no estaba quedando en el
precaché** del service worker, lo que amenazaba el requisito de **offline real**
(criterio de Calidad Técnica, 40%).

**Corrección sobre el diagnóstico inicial:** este documento atribuyó la causa a
`maximumFileSizeToCacheInBytes: 5 MB`. La causa operativa real es el `globPatterns` de
Workbox, que solo lista `js/css/html/svg/png`: el `.wasm` nunca habría entrado al
precaché, independientemente de su tamaño. El síntoma estaba bien identificado; el
mecanismo, no.

**Resolución (Alejandro, rama `chore/pwa-cache-wasm`):** *runtime caching* con estrategia
**CacheFirst** para los `.wasm`, en vez de subir el límite del precaché. Razonamiento: los
modelos ya se cachean en runtime, así que precachear 22 MB en la instalación no daría
offline igualmente y sí introduciría un punto de fallo todo-o-nada en el service worker.
La estrategia queda coherente: primera corrida en línea descarga runtime + modelos; de ahí
en adelante, offline. Verificado en el `sw.js` generado.

## Limitación honesta

El worker **no se ha ejecutado todavía en runtime**: `src/App.tsx` sigue inyectando
`createMockAIPipeline`, así que el pipeline real no está conectado (esa sustitución es
tarea de integración de Alejandro). Lo verificado hasta aquí es tipado, tests unitarios y
empaquetado. La transcripción real con Whisper sí quedó demostrada en el spike S1-T7, con
la misma librería v3 y el mismo modelo.

**Siguiente paso:** al integrar, medir latencia de punta a punta y comparar contra el
objetivo <2 s por etapa.
