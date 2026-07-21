# Spike S1-T7 — Whisper-tiny en el navegador

Módulo **aislado y desechable** (Isaac / `src/ai/`). Objetivo: comprobar que
`Xenova/whisper-tiny.en` corre client-side con transformers.js y **medir** carga y
latencia, como insumo para la arquitectura (Alejandro) y el marco teórico.

> ⚠️ Este spike **no** modifica `package.json`: carga la librería por CDN (ESM). La
> dependencia `@huggingface/transformers` se agrega recién en Semana 2 (S2-T4) vía PR
> `shared-change`. No forma parte del pipeline real todavía.

## Cómo correrlo (en tu laptop, Chrome recomendado)

Necesita un servidor local (el micrófono y la Cache API requieren `http://localhost`,
que sí es contexto seguro; abrir el `.html` con doble clic **no** funciona).

Desde la raíz del repo:

```bash
python -m http.server 5174 --directory "src/ai/spike-s1-t7"
```

Luego abre <http://localhost:5174/> en Chrome.

> Nota: corre en WASM single-thread (sin cabeceras COOP/COEP), suficiente para el spike.
> Con hilos sería más rápido, pero eso lo evaluamos después.

## Pasos

1. **Grabar 5 s** (di el guion en inglés) — o **cargar un WAV** ya guardado.
2. **Descargar WAV** una vez y muévelo a `tests/ai/fixtures/sample-en.wav`
   → a partir de ahí usa "cargar WAV" para mediciones **reproducibles**.
3. **Cargar modelo + medir** (primera vez = carga en frío).
4. **Recargar la página** y cargar de nuevo = carga **caliente** (cacheada).
5. **Transcribir** y anotar los números.
6. Repetir con `whisper-base.en` para comparar.
7. Captura de pantalla de la tabla → `docs/evidencias/s1/`.

## Resultados (medidos en la laptop de Isaac · Chrome · WASM single-thread)

| Modelo | dtype | Carga fría (s) | Carga caliente (s) | Caché (MB) | Audio (s) | Inferencia (s) | RTF (×) | Heap (MB) |
|---|---|---|---|---|---|---|---|---|
| whisper-tiny.en | q8 | 17.70 | 0.54 | 41.0 | 5.0–5.5 | 1.44–1.72 | 0.28–0.31 | ~290 |
| whisper-base.en | q8 | _(pendiente — opcional)_ | | | | | | |

**Precisión (cualitativa, 3 frases):** muy buena en habla clara. Ej.: *"I am testing a
speech recognition model that runs in my browser"* → transcripción **exacta**. Errores solo
en el **nombre propio** ("Isaac" → "Isisak" en una toma) y alguna palabra función insertada
("and", "with"). Esperable en el modelo `tiny`. Medir WER formal queda para S8-T1.

**Conclusión:** ✅ **Viable.** Con el modelo cacheado, la etapa ASR corre en ~1.5 s para 5 s
de audio (**RTF ≈ 0.3**, muy por debajo del objetivo <2 s). La carga en frío (17.7 s, 41 MB
de descarga única) es aceptable porque **solo ocurre la primera vez**; recargas posteriores
cargan en **0.54 s** desde caché → valida el enfoque **PWA offline**. Memoria ~290 MB de heap:
aceptable, pero **a vigilar** cuando convivan varios modelos (gramática + TTS + sugerencias).
`whisper-tiny.en` basta para el prototipo; comparar con `base` es opcional (más precisión a
costa de tamaño/latencia). **No hace falta el plan B** (Web Speech API) por ahora.
