# S4-T5 · Spike de síntesis de voz (SpeechT5) en el navegador

**Responsable:** Isaac Morum (módulo `src/ai/`) · **Fecha:** 3 de agosto de 2026
**Código:** `src/ai/spike-s4-t5/` (`index.html` + `spike.ts`)
**Cómo se corre:** `npm.cmd run dev` → <http://localhost:5173/src/ai/spike-s4-t5/index.html>

## 1. Para qué se hizo

S5-T5 (el worker de TTS) es la única tarea de la ruta crítica del proyecto: sin audio
de referencia sintetizado no hay comparación por alineamiento temporal (Fabrizio) ni
retroalimentación por palabra (José Pablo). Antes de escribir ese worker había que
responder cuatro preguntas que ningún test automático puede contestar:

1. ¿A qué frecuencia sintetiza el modelo? El contrato promete PCM a 16 kHz y
   `src/App.tsx` crea el `AudioContext` fijo a 16 kHz **sin remuestrear**.
2. ¿Cuánto pesa la descarga real?
3. ¿Cuánto tarda por frase, contra el objetivo de 2 s?
4. ¿Cómo suena cuantizado?

## 2. Qué es SpeechT5 y qué se comparó

SpeechT5 no es un modelo sino **tres piezas ONNX que se cuantizan por separado**:
el *encoder* (entiende el texto), el *decoder* (genera el espectrograma paso a paso)
y el *vocoder* (convierte el espectrograma en onda de audio). El vocoder vive además
en **otro repositorio** (`Xenova/speecht5_hifigan`).

Detalle que condicionó el diseño: el atajo `pipeline('text-to-speech', ...)` de
transformers.js **carga el vocoder en fp32 escrito a fuego** y no acepta uno propio
(verificado en la versión instalada 3.8.1, `pipelines.js` ~línea 2943). Pidiendo
`dtype: 'q8'` igual se descargarían 55 MB de vocoder sin cuantizar. Por eso el spike
—y el worker— arman las piezas a mano con `SpeechT5ForTextToSpeech` +
`SpeechT5HifiGan`.

| Config | encoder | decoder | vocoder | Peso esperado (Hub) |
|---|---|---|---|---|
| A | fp32 | fp32 | fp32 | ~643 MB |
| B | q8 | q8 | fp32 | ~215 MB |
| C | q8 | q8 | q8 | ~178 MB |

No se evaluó q4: la decisión **D-05** ya lo descartó por medición en el corrector
gramatical, y aquí corre el mismo motor (ONNX sobre WASM, sin núcleos de 4 bits).

## 3. Resultados medidos

### Configuración C — todo q8 (corrida completa)

| Medida | Valor |
|---|---|
| Descarga real (suma exacta de archivos) | **169.51 MB** |
| Carga en frío | 37.29 s |
| Carga con caché | **8.22 s** |
| Frecuencia de salida | **16 000 Hz** |
| Latencia media / máxima | 3 248 ms / 7 864 ms |
| RTF medio | 1.49 |
| Heap JS | 33 MB |

Archivos que descargó realmente (esto prueba qué variante se usó):

| Archivo | Tamaño |
|---|---|
| `onnx/encoder_model_quantized.onnx` | 84.31 MB |
| `onnx/decoder_model_merged_quantized.onnx` | 67.79 MB |
| `onnx/model_quantized.onnx` (vocoder) | 17.41 MB |
| tokenizer y configuraciones | 0.02 MB |

Por frase:

| Frase | ms | Audio (s) | RTF |
|---|---|---|---|
| Hello, my name is Isaac and I am learning English. | 3 843 | 2.53 | 1.52 |
| Would you like to order something to drink? | 2 225 | 1.57 | 1.42 |
| The class starts at 8 o'clock. | 2 224 | 1.66 | 1.34 |
| ship, sheep, ship, sheep. | 1 898 | 1.41 | 1.35 |
| bad, bed, bad, bed. | 1 435 | 1.02 | 1.40 |
| I went to the supermarket yesterday… (103 caracteres) | 7 864 | 4.13 | 1.91 |

### Configuración B — vocoder fp32 (corrida parcial)

| Medida | Valor |
|---|---|
| Descarga real | **204.97 MB** (el vocoder fp32 son 52.86 MB frente a 17.41 MB) |
| Carga | 20.38 s (con encoder y decoder ya en caché) |
| Latencias | 12 680 · 5 762 · 4 855 · 3 555 ms — se detuvo en la 5.ª frase |
| RTF | 6.39 · 3.40 · 3.23 · 2.65 |

Frase a frase contra la misma frase en C: **B tarda entre 2.4× y 3.3× más**.

### Configuración A — fp32

No se ejecutó. Con 643 MB duplica por sí sola toda la descarga actual de la
aplicación (~300 MB); solo tendría sentido si B y C sonaran inaceptables.

## 4. Conclusiones

1. **No hace falta remuestrear.** El modelo declara 16 000 Hz, exactamente los
   `SAMPLE_RATE` del proyecto. La duda que quedaba del contrato queda cerrada: lo que
   devuelva `speak()` entra directo al `AudioContext` de `App.tsx` y al comparador de
   Fabrizio sin conversión intermedia.
2. **Cuantizar el vocoder no cuesta velocidad: la regala.** La hipótesis previa era
   que convenía dejar el vocoder en fp32 porque es la pieza que se oye. La medición
   dice que además de pesar 35 MB más, **es entre 2.4× y 3.3× más lento**. Es el mismo
   patrón de D-05: en WASM sobre CPU, más bits no salen gratis. Salvo que la diferencia
   al oído sea grande, la configuración elegida es **C**.
3. **La latencia no cumple el objetivo de 2 s en frases largas.** Con C, una frase de
   ~100 caracteres tardó 7.9 s y el RTF se mantuvo por encima de 1 (más lento que
   tiempo real) en todos los casos. Esto no bloquea el puntaje de pronunciación —el
   audio de referencia se puede sintetizar mientras el estudiante lee— pero sí obliga
   a decidir cómo se presenta: sintetizar por adelantado la frase del tutor, o mostrar
   un indicador de espera en el botón de escuchar.
4. **Peso:** aun con la configuración más liviana, el TTS suma ~170 MB a los ~300 MB
   actuales. Es insumo directo para S7-T4.

## 5. Lo que NO está verificado (honestidad de la medición)

- **La calidad al oído está pendiente.** Es la pregunta 4 y la que decide entre B y C.
  Los WAV se descargan desde la propia página del spike.
- **Los tiempos absolutos son provisionales.** Toda la medición se hizo con la pestaña
  en segundo plano (`document.visibilityState === 'hidden'`), y el navegador limita el
  procesamiento de las pestañas ocultas. Las comparaciones entre configuraciones son
  válidas porque se hicieron en las mismas condiciones, pero **los milisegundos hay que
  rehacerlos en una ventana visible** antes de citarlos en el documento del Avance 2.
- **La corrida de B se detuvo** en la quinta frase y no llegó a completar la tabla.
- **Observación a vigilar:** la misma frase produjo audios de distinta duración entre
  configuraciones (2.53 s en C contra 1.98 s en B) aunque el decodificador era q8 en
  ambas. La longitud generada no parece perfectamente reproducible. Importa para
  Fabrizio: si el audio de referencia cambia entre corridas, el puntaje de una misma
  pronunciación también varía. Hay que confirmarlo repitiendo la misma frase dos veces
  en la misma configuración.

## 6. Decisiones que alimenta

- Configuración del worker S5-T5 (`DEFAULT_TTS_CONFIG` en `src/ai/tts/ttsProtocol.ts`).
- El vector de voz va **embebido en el código** (`src/ai/tts/speakerEmbedding.ts`), no
  descargado: el ejemplo oficial hace `fetch` a huggingface.co en cada arranque, lo que
  rompería el requisito de funcionar sin conexión.
- Insumo de S7-T4 (peso de la descarga inicial) y del riesgo R03 (comparar voz humana
  contra voz sintética).
