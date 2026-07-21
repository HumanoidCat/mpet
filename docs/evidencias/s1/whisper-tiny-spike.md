# Evidencia S1-T7 — Spike de Whisper-tiny en el navegador

**Autor:** Isaac Morum (IA/ML) · **Semana 1** · **Épica E3**
**Entorno:** Chrome · transformers.js (`@huggingface/transformers` v3, vía CDN) ·
ONNX Runtime Web en WASM single-thread · `Xenova/whisper-tiny.en` cuantizado (q8).

> Reproducible con `src/ai/spike-s1-t7/` (ver su README). Fixture de audio:
> `tests/ai/fixtures/sample-en.wav`.

## Objetivo

Verificar que el ASR (Whisper) puede correr **100% client-side** en el navegador y **medir**
si su latencia y tamaño son viables para una conversación fluida offline (objetivo <2 s por
etapa), como insumo para la arquitectura (Alejandro) y el marco teórico.

## Mediciones

| Medida | Valor | Comentario |
|---|---|---|
| Carga **en frío** (1ª vez) | **17.70 s** | Incluye descarga (~41 MB) + compilación WASM. Ocurre **una sola vez**. |
| Carga **en caliente** (cacheada) | **0.54 s** | Modelo servido desde Cache API/IndexedDB. ~33× más rápido. |
| Tamaño en caché | **~41 MB** | Δ de `navigator.storage.estimate()`. Descarga única para uso offline. |
| Duración de audio | 5.0–5.5 s | 3 tomas (2 mismas frase, 1 distinta). |
| Tiempo de **inferencia** | **1.44–1.72 s** | Transcripción completa de la frase. |
| **RTF** (inferencia / audio) | **0.28–0.31×** | <1 = más rápido que tiempo real. |
| Memoria (heap JS) | **~290 MB** | `performance.memory`. A vigilar al sumar más modelos. |

## Precisión (cualitativa)

| Frase dicha | Transcripción | Observación |
|---|---|---|
| "I am testing a speech recognition model that runs in my browser." | *"I am testing a speech recognition model that runs in my browser."* | ✅ Exacta |
| "Hello, my name is Isaac. I am learning English every day." | *"Hello my name is Isisak and I'm learning English everyday."* | Nombre propio mal ("Isisak"); función insertada |
| (misma, desde WAV) | *"Hello, my name is Isaac and I'm ... Learning English every day."* | "Isaac" correcto; leve inserción |

El modelo `tiny` acierta muy bien en habla clara con vocabulario común; los errores se
concentran en **nombres propios** y alguna **palabra función** — comportamiento esperado en
la variante más pequeña. Medición formal de **WER** planificada para S8-T1.

## Conclusiones

1. **Es viable.** Con el modelo cacheado, la etapa ASR (~1.5 s / RTF ≈ 0.3) queda **muy por
   debajo del objetivo <2 s**. `whisper-tiny.en` es suficiente para el prototipo.
2. **El enfoque offline se valida:** la penalización de 17.7 s es un costo **único** de
   primera carga; luego arranca en ~0.5 s desde caché → correcto para una PWA instalable.
3. **A vigilar:** ~290 MB de heap con un solo modelo. Cuando convivan gramática (T5), TTS
   (SpeechT5) y sugerencias (LLM), habrá que medir memoria total y considerar cargar/descargar
   modelos bajo demanda.
4. **Plan B (Web Speech API) no es necesario** por ahora.
5. **Siguiente (S2-T4):** implementar el worker ASR real con la API `transcribe(pcm)` del
   contrato `AIPipeline`, agregando `@huggingface/transformers` a `package.json` vía PR
   `shared-change`.

## Nota para el equipo

Comparar `whisper-tiny.en` vs `whisper-base.en` quedó **pendiente/opcional**: `tiny` ya
cumple el objetivo de latencia. Se puede reactivar si se necesita más precisión.
