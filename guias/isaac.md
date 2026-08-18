# ✅ Checklist — Isaac Morum · Ingeniero IA/ML (`src/ai/`)

> Marca `[x]` cuando completes cada tarea. **Solo tú editas este archivo.**
> Detalle de cada tarea (horas, dificultad, herramientas): `docs/04-plan-semanal.md`.
> Regla: trabaja solo en `src/ai/` y `tests/ai/`, en ramas `feat/ai-*`, PR a `dev`.
> ⚠️ Cada modelo corre en un **Web Worker** con variantes **cuantizadas** (q4/q8). Requisito del curso: cero servidores, todo en el navegador con transformers.js.

## Semana 1 (7–13 jul)
- [x] S1-T7 · Spike: cargar `Xenova/whisper-tiny.en`, medir tamaño y latencia en tu laptop
      → Viable: caché 41 MB, carga caliente 0.54 s, inferencia RTF ≈ 0.3. Evidencia: `docs/evidencias/s1/whisper-tiny-spike.md`

## Semana 2
- [x] S2-T4 · Worker ASR con API `transcribe(pcm)` (agregar `@huggingface/transformers` vía PR `shared-change`)
      → Código completo (`src/ai/asr/`, `createAIPipeline.ts`). ⚠️ **Bloqueado**: falta aprobar la
        dependencia. Propuesta lista en `src/ai/PROPUESTA-shared-change-s2-t4.md` (Alejandro).
- [x] S2-T5 · Indicador de progreso de descarga/carga de modelos
      → `model-cache/progress.ts` agrega el progreso por archivo en un 0–1 por modelo. 5 tests verdes.

## Semana 3
- [x] S3-T3 · Worker gramática: T5 cuantizado + extracción de edits palabra a palabra
      → `src/ai/grammar/` (worker + cliente + diff por LCS). 12 tests verdes.
        ⚠️ Falta validar el modelo en runtime (spike corto antes del Avance).
- [x] Mi sección del documento Avance 1 (pipeline de IA)

## Semana 4 — 🎯 AVANCE 1 (mar 28 jul)
- [x] Presentar mi parte en la demo
- [x] S4-T5 · Spike: TTS SpeechT5, medir calidad/latencia
      → SpeechT5 **descartado por medición**: solo es inteligible sin cuantizar y así pesa
        613 MB. Se evaluó la alternativa MMS-TTS (VITS): 109 MB, 16 kHz, carga cacheada
        0.86 s. Cinco configuraciones comparadas. Evidencia: `docs/evidencias/s4/s4-t5-tts-spike.md`

## Semana 5
- [x] S5-T5 · Worker TTS: reproducir + exponer PCM de referencia para el comparador
      → `src/ai/tts/` (worker + cliente + caché de PCM). `speak()` ya devuelve audio real
        a 16 kHz. La reproducción ya estaba hecha por Alejandro en `App.tsx`.
        Verificado **en ejecución**, no solo compilando: destapó dos fallos (audio no
        reproducible entre llamadas y barra de progreso rota en los tres modelos).

## Semana 6
- [x] S6-T4 · Worker sugerencias: LLM ligero con prompts fijos (naturalidad, vocabulario)
      → `src/ai/suggestions/`. LaMini-Flan-T5-248M elegido por medición: el de 77M no
        ejecuta la instrucción, la parafrasea. Evidencia: `docs/evidencias/s6/s6-t4-modelo-tutor.md`
- [x] S6-T2 · Timestamps por palabra de Whisper para el puntaje (con Fabrizio)
      → Lo cerró Fabrizio en el PR #58 usando los timestamps que expone mi ASR.

## Semana 7 — 🎯 AVANCE 2 (mar 11 ago)
- [x] S7-T2 · Respuesta conversacional (prompt de tutor)
      → Mismo worker que S6-T4: un solo modelo con dos instrucciones. Verificado en
        ejecución (suggest y reply a la vez, sin cruzarse).
      → **11-ago, fix I-09/I-10 + defecto de fondo:** el tutor no conversaba, convertía
        la frase del estudiante en pregunta sobre lo mismo ("My name is Ana" → "What
        is your name?"). Prompt reescrito (tarea sobre la última frase, sin rol, sin
        líneas Tutor: que copiar) + `esEco()` en `cleanup.ts` como red de seguridad
        que funciona aunque cambie el modelo. Evidencia:
        `docs/evidencias/s7/s7-t2-respuestas-del-tutor.md`. Falta re-verificar el
        ciclo completo en vivo.
- [ ] S7-T4 · Optimizar latencia: pipeline en paralelo, medir por etapa (con Fabrizio)
- [x] D-12 · Evaluar Kokoro con el banco acordado, medido y cerrado (12-ago)
      -> 1 fallo de 14 (MMS-TTS: 7), 0 de 5 en control, determinista (resuelve el suelo
         de R03), 88.1 MiB cuantizado (menos que los 109 de MMS-TTS). Se recomienda
         pedir el shared-change: docs/evidencias/s7/d12-kokoro-decision-final.md
- [ ] Mi sección del documento Avance 2

## Extra — incidencias
- [x] I-07 · Números a letras antes de sintetizar
      → `src/ai/tts/textNormalization.ts`. El reconocedor ya recupera $25, 8:30 y 1998
        donde antes no oía nada. Evidencia: `docs/evidencias/s7/i07-numeros-a-letras.md`
- [x] D-18 (seguimiento) · Las tres preguntas que quedaron abiertas de Qwen, medidas (13-ago)
      → Peso real ≈495 MiB (coincide con la ficha, a diferencia de Kokoro en D-12) y el
        muestreo sí evita la repetición (3/3 distintas). Pero midiendo el peso aparecieron
        dos problemas serios sin resolver: **el modelo no se cachea, se re-descarga
        completo en cada carga de página** (verificado con recarga completa, dos veces:
        103 s y 108 s — amenaza el offline de RF-14), y la **latencia de reply() salió en
        ~17 s de media / ~22 s máxima**, 10× la referencia de LaMini (1.7 s). No cambié
        `DEFAULT_SUGGESTIONS_CONFIG` — la vuelta atrás a `'grande-248m'` ya existe, la
        decisión de usarla es del equipo. Evidencia:
        `docs/evidencias/s8/d18-qwen-peso-latencia-medidos.md`

## Semana 8
- [ ] S8-T1 · Medir WER: set de 50 frases, 4 hablantes
- [ ] S8-T2 · Edge cases: acento fuerte, ruido (con Fabrizio)

## Semana 9
- [ ] Apoyo a corrección de bugs y afinado

## Semana 10 — 🎯 ENTREGA FINAL (mar 8 sep)
- [ ] S10-T6 · Preparar respuestas: cuantización, ONNX/WASM, WER, por qué whisper-tiny

## Modelos objetivo (validar en spikes)
ASR: `Xenova/whisper-tiny.en` · Gramática: `Xenova/t5-base-grammar-correction` o similar · TTS: `Xenova/speecht5_tts` · Sugerencias/reply: `Xenova/LaMini-Flan-T5-248M` o similar. Si alguno no rinde, documenta la alternativa (también es evidencia).

## Cómo trabajas sin depender de nadie
Tu contrato: `AIPipeline` en `src/shared/contracts.ts`. No necesitas la captura real: usa WAVs pregrabados en `tests/ai/fixtures/`. Tu implementación debe pasar los mismos tests que `mocks/mockAIPipeline.ts`.

---

## Siguiente — plan vigente: `docs/11-plan-post-avance-1.md`

El orden ya no lo fija la semana del calendario sino la dependencia (D-08).

- [x] **S5-T5 · Worker de TTS: reproducir y exponer el PCM de referencia**
      → Hecho con **MMS-TTS**, no con SpeechT5 (descartado por medición en el spike).
        Ruta crítica liberada: Fabrizio ya puede empezar el DTW y José Pablo el color
        por palabra. Falta abrir el PR a `dev`.
- [x] S6-T2 · Puntaje por palabra con las marcas temporales de Whisper (con Fabrizio)
- [x] S6-T4 · Worker de sugerencias del tutor
- [x] S7-T2 · Respuesta del tutor

---

