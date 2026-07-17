# ✅ Checklist — Isaac Morum · Ingeniero IA/ML (`src/ai/`)

> Marca `[x]` cuando completes cada tarea. **Solo tú editas este archivo.**
> Detalle de cada tarea (horas, dificultad, herramientas): `docs/04-plan-semanal.md`.
> Regla: trabaja solo en `src/ai/` y `tests/ai/`, en ramas `feat/ai-*`, PR a `dev`.
> ⚠️ Cada modelo corre en un **Web Worker** con variantes **cuantizadas** (q4/q8). Requisito del curso: cero servidores, todo en el navegador con transformers.js.

## Semana 1 (14–21 jul)
- [ ] S1-T7 · Spike: cargar `Xenova/whisper-tiny.en`, medir tamaño y latencia en tu laptop

## Semana 2
- [ ] S2-T4 · Worker ASR con API `transcribe(pcm)` (agregar `@huggingface/transformers` vía PR `shared-change`)
- [ ] S2-T5 · Indicador de progreso de descarga/carga de modelos

## Semana 3
- [ ] S3-T3 · Worker gramática: T5 cuantizado + extracción de edits palabra a palabra
- [ ] Mi sección del documento Avance 1 (pipeline de IA)

## Semana 4 — 🎯 AVANCE 1 (mar 4 ago)
- [ ] Presentar mi parte en la demo
- [ ] S4-T5 · Spike: TTS SpeechT5, medir calidad/latencia

## Semana 5
- [ ] S5-T5 · Worker TTS: reproducir + exponer PCM de referencia para el comparador

## Semana 6
- [ ] S6-T4 · Worker sugerencias: LLM ligero con prompts fijos (naturalidad, vocabulario)
- [ ] S6-T2 · Timestamps por palabra de Whisper para el puntaje (con Fabrizio)

## Semana 7 — 🎯 AVANCE 2 (mar 25 ago)
- [ ] S7-T2 · Respuesta conversacional (prompt de tutor)
- [ ] S7-T4 · Optimizar latencia: pipeline en paralelo, medir por etapa (con Fabrizio)
- [ ] Mi sección del documento Avance 2

## Semana 8
- [ ] S8-T1 · Medir WER: set de 50 frases, 4 hablantes
- [ ] S8-T2 · Edge cases: acento fuerte, ruido (con Fabrizio)

## Semana 9
- [ ] Apoyo a corrección de bugs y afinado

## Semana 10 — 🎯 ENTREGA FINAL (mar 15 sep)
- [ ] S10-T6 · Preparar respuestas: cuantización, ONNX/WASM, WER, por qué whisper-tiny

## Modelos objetivo (validar en spikes)
ASR: `Xenova/whisper-tiny.en` · Gramática: `Xenova/t5-base-grammar-correction` o similar · TTS: `Xenova/speecht5_tts` · Sugerencias/reply: `Xenova/LaMini-Flan-T5-248M` o similar. Si alguno no rinde, documenta la alternativa (también es evidencia).

## Cómo trabajas sin depender de nadie
Tu contrato: `AIPipeline` en `src/shared/contracts.ts`. No necesitas la captura real: usa WAVs pregrabados en `tests/ai/fixtures/`. Tu implementación debe pasar los mismos tests que `mocks/mockAIPipeline.ts`.
