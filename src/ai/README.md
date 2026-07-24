# ai/ — Isaac (IA/ML)

transformers.js: ASR (Xenova/whisper-tiny.en), gramática (T5), sugerencias/reply (LLM ligero), TTS (SpeechT5). Todo en Web Workers.
Semana 2: worker ASR. Semana 3: gramática. Semana 5: TTS. Semana 6: sugerencias. Semana 7: reply conversacional.

## Estructura

| Ruta | Qué es | Estado |
|---|---|---|
| `createAIPipeline.ts` | Implementación del contrato `AIPipeline` | ASR real; resto paso a través |
| `asr/asrProtocol.ts` | Tipos de mensajes hilo principal ↔ worker | ✅ S2-T4 |
| `asr/asrWorker.ts` | Web Worker: Whisper + transformers.js | ✅ S2-T4 |
| `asr/asrClient.ts` | Envuelve el worker en API de promesas | ✅ S2-T4 |
| `model-cache/progress.ts` | Agrega el progreso por archivo en un 0–1 por modelo | ✅ S2-T5 |
| `spike-s1-t7/` | Spike desechable de validación (no es código de producción) | ✅ S1-T7 |
| `grammar/` · `suggestions/` · `tts/` | Pendientes | S3 · S6 · S5 |

## Uso

```ts
import { createAIPipeline } from '@ai/createAIPipeline';

const ai = createAIPipeline();                      // opcional: { model, dtype }
await ai.init((model, p) => console.log(model, p)); // p va de 0 a 1
const { text, words } = await ai.transcribe(pcm16kMono);
```

El orquestador (`src/core/orchestrator.ts`) ya reenvía ese progreso como evento
`model-progress` al event bus, que la UI consume.

## Rendimiento medido (spike S1-T7, `whisper-tiny.en` q8)

Carga en frío 17.7 s (41 MB, una sola vez) · carga cacheada 0.54 s · inferencia
RTF ≈ 0.3 (~1.5 s por 5 s de audio) · heap ~290 MB.
Detalle en `docs/evidencias/s1/whisper-tiny-spike.md`.

## ⚠️ Dependencia pendiente

`@huggingface/transformers` **aún no está en `package.json`**. Como es archivo
compartido, requiere PR etiquetado `shared-change` aprobado por Alejandro.
Ver la propuesta en `PROPUESTA-shared-change-s2-t4.md`.
