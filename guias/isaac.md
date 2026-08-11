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
- [ ] S6-T4 · Worker sugerencias: LLM ligero con prompts fijos (naturalidad, vocabulario)
- [x] S6-T2 · Timestamps por palabra de Whisper para el puntaje (con Fabrizio)

## Semana 7 — 🎯 AVANCE 2 (mar 11 ago)
- [ ] S7-T2 · Respuesta conversacional (prompt de tutor)
- [ ] S7-T4 · Optimizar latencia: pipeline en paralelo, medir por etapa (con Fabrizio)
- [ ] Mi sección del documento Avance 2

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

---

## Cerrado el 7 de agosto

- [x] **S7-T4 · Bajar el peso de la descarga inicial** → carga bajo demanda del
      sintetizador, de **411.5 a 302.6 MiB** (D-11)
- [x] **Conteo de fallos de pronunciación del TTS** → **7 de 14**, por encima del
      umbral de 5. Fallan también `water` y `book`, que eran palabras de control.
      Kokoro queda aprobado y diferido a la entrega final (D-12)
- [x] **Peso exacto de la descarga y datos de I-04** → registrados en la bitácora

---

## Lo que falta — actualizado 11 ago

Sos el cuello de botella del proyecto: **las tres primeras son lo único que separa
a la aplicación de estar terminada.**

- [ ] **S7-T2 · Respuesta del tutor.** Sin esto la aplicación no conversa, que es
      lo que promete el nombre. Recomendación: plantilla a partir de la
      transcripción y la corrección. Un LLM solo si la latencia medida cabe en 2 s
- [ ] **S6-T4 · Sugerencias.** `suggest()` devuelve lista vacía. El orquestador y
      la pantalla ya están cableados: funciona en cuanto exista el modelo
- [ ] **I-07 · Números a letras.** El sintetizador no dice cifras: con `$25` no se
      oye un número equivocado, no se oye nada. Una tarde, y va **antes** que Kokoro
- [ ] **R16 · Fijar la referencia del TTS entre sesiones** (con Alejandro). La
      misma frase se sintetiza distinta al recargar, así que el mismo estudiante
      saca puntajes distintos por algo que no depende de él. Ensucia la pantalla
      de progreso de Monestel
- [ ] **Evaluar Kokoro** con el mismo banco de 14 + 5 palabras antes de adoptarlo
      (D-12). Está aprobado pero no medido: si no mejora, no se adopta
- [ ] **S8-T1 · Medir WER**: 50 frases, 4 hablantes. Es la única métrica del
      reconocedor que el curso pide y que no se ha tomado
- [ ] S10-T6 · Preparar respuestas para la defensa. El modelo a seguir es
      `docs/entregas/preguntas-defensa-dsp.md`, de Fabrizio

### Nota de Monestel, de su revisión manual

El texto `'Got it! (respuesta del tutor pendiente — S7-T2)'` **le muestra al
usuario un código de tarea interno**. Es el mismo problema que vigila
`tests/ui/sinNotasDeEquipo.test.ts`, pero esa prueba solo cubre `src/ui/`. No lo
tocó por estar fuera de su módulo. Se resuelve solo cuando entregues S7-T2; si se
demora, cambiá al menos el texto por algo sin código de tarea.
