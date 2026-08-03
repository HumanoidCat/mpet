# S4-T5 · Spike de síntesis de voz en el navegador

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
4. ¿Cómo suena?

## 2. Qué se comparó

**SpeechT5** (`Xenova/speecht5_tts`) no es un modelo sino **tres piezas ONNX que se
cuantizan por separado**: el *encoder* (entiende el texto), el *decoder* (genera el
espectrograma paso a paso) y el *vocoder* (convierte el espectrograma en onda). El
vocoder vive además en **otro repositorio** (`Xenova/speecht5_hifigan`). Necesita
también un vector de voz de 512 números que define quién habla.

Detalle que condicionó el diseño: el atajo `pipeline('text-to-speech', ...)`
**carga el vocoder en fp32 escrito a fuego** y no acepta uno propio (verificado en la
versión instalada 3.8.1, `pipelines.js` ~línea 2943). Pidiendo `dtype: 'q8'` igual se
descargarían 55 MB de vocoder sin cuantizar. Por eso el spike —y el worker— arman las
piezas a mano con `SpeechT5ForTextToSpeech` + `SpeechT5HifiGan`.

**MMS-TTS** (`Xenova/mms-tts-eng`, arquitectura VITS) entró a la comparación *después*
de que la escucha descartara las tres configuraciones de SpeechT5. Es un único archivo
ONNX que va de texto a onda en una sola pasada: sin vocoder aparte, sin vector de voz y
sin generación cuadro a cuadro.

No se evaluó q4: la decisión **D-05** ya lo descartó por medición en el corrector
gramatical, y aquí corre el mismo motor (ONNX sobre WASM, sin núcleos de 4 bits).

## 3. Resultados

| Config | Modelo | Cuantización | Descarga real | RTF medio | Calidad al oído |
|---|---|---|---|---|---|
| A | SpeechT5 | todo fp32 | **613.0 MB** | 1.12 | Entendible, con voz algo robótica e interferencia de fondo |
| B | SpeechT5 | q8 + vocoder fp32 | 205.0 MB | 3.2–6.4 | Peor que A |
| C | SpeechT5 | todo q8 | 169.5 MB | 1.49 ⚠ | **Ininteligible** |
| D | MMS-TTS (VITS) | fp32 | **109.0 MB** | **1.08** | ⏳ pendiente de escuchar |
| E | MMS-TTS (VITS) | q8 | 36.6 MB | ~1.6 | ⏳ pendiente de escuchar |

Todas las configuraciones, de las dos familias, declaran **16 000 Hz**.

### Detalle por frase (ms)

| Frase | A (fp32) | C (q8) ⚠ | D (VITS fp32) | E (VITS q8) ⚠ |
|---|---|---|---|---|
| Hello, my name is Isaac and I am learning English. | 3 267 | 3 843 | 4 882 | 7 611 |
| Would you like to order something to drink? | 2 539 | 2 225 | 2 731 | 4 224 |
| The class starts at 8 o'clock. | 1 957 | 2 224 | 2 715 | 3 948 |
| ship, sheep, ship, sheep. | 1 574 | 1 898 | 1 745 | 2 258 |
| bad, bed, bad, bed. | 1 414 | 1 435 | 1 780 | 2 753 |
| I went to the supermarket yesterday… (103 caracteres) | 8 528 | 7 864 | 7 358 | — |

⚠ Las columnas C y E se midieron con la pestaña en segundo plano (ver §5).

### Carga y archivos

| Config | Carga en frío | Carga cacheada | Archivos descargados |
|---|---|---|---|
| A | — (falló 3 veces, ver §5) | 3.01 s | encoder 342.8 + decoder 244.5 + vocoder 52.9 MB |
| C | 37.29 s | 8.22 s | `encoder_model_quantized` 84.31 + `decoder_model_merged_quantized` 67.79 + `model_quantized` 17.41 MB |
| D | 27.78 s | — | `onnx/model.onnx` 108.97 MB (**un solo archivo**) |
| E | 12.35 s | — | `onnx/model_quantized.onnx` 36.6 MB |

Heap JS: 33 MB con SpeechT5 q8, **11 MB** con VITS fp32.

## 4. Conclusiones

1. **No hace falta remuestrear.** Las dos familias declaran 16 000 Hz, exactamente el
   `SAMPLE_RATE` del proyecto. La duda que quedaba del contrato queda cerrada: lo que
   devuelva `speak()` entra directo al `AudioContext` de `App.tsx` y al comparador de
   Fabrizio sin conversión intermedia.

2. **SpeechT5 solo sirve sin cuantizar, y sin cuantizar no cabe.** La escucha ordenó
   las tres configuraciones A > B > C, con C directamente ininteligible. La única
   aceptable pesa 613 MB, es decir **el triple de todo lo que la aplicación descarga
   hoy** (~300 MB), y además falló al cargar tres veces seguidas. Queda descartada
   como modelo de producción y se conserva solo como referencia de calidad.

3. **Cuantizar cuesta velocidad, no la ahorra — tercera confirmación en este
   proyecto.** A (fp32) tuvo mejor RTF que C (q8); B, con el vocoder en fp32, fue la
   más lenta de todas; y en VITS, E (q8) resultó ~50 % más lento que D (fp32). Es el
   mismo mecanismo de D-05: ONNX sobre WASM no tiene núcleos enteros optimizados para
   CPU y descuantiza en cada inferencia. **En este proyecto, bajar bits empeora las dos
   dimensiones a la vez.** Es un resultado citable para el Avance 2.

4. **La latencia no cumple el objetivo de 2 s en frases largas, con ningún modelo.**
   El RTF nunca bajó de 1, es decir que sintetizar siempre tarda más que escuchar. Con
   VITS el RTF se mantiene casi constante (1.04–1.15) y la latencia crece de forma
   proporcional al texto, que es más predecible que SpeechT5 (1.05–1.30 y con picos).
   No bloquea el puntaje de pronunciación —el audio de referencia se puede sintetizar
   mientras el estudiante lee— pero obliga a decidir la presentación: sintetizar por
   adelantado la frase del tutor, o mostrar espera en el botón de escuchar.

5. **VITS es 5.6× más liviano que la única versión usable de SpeechT5** (109 MB contra
   613 MB), usa un tercio de la memoria y es un único archivo, sin vocoder ni vector de
   voz. **Si la calidad al oído es aceptable, es la elección.**

## 5. Lo que NO está verificado (honestidad de la medición)

- **Falta escuchar D y E.** Es la pregunta que decide. Los WAV se descargan desde la
  propia página del spike.
- **Las columnas C y E se midieron con la pestaña en segundo plano**
  (`document.visibilityState === 'hidden'`), donde el navegador limita el
  procesamiento; sus milisegundos son probablemente pesimistas. A y D se midieron en
  ventana visible y son los números buenos. Antes de citar cifras en el documento del
  Avance 2 hay que rehacer C y E en ventana visible.
- **La configuración A falló al cargar tres veces seguidas** antes de conseguirlo.
  El texto del error se perdió al recargar la página; el spike ya registra el error
  completo (nombre + mensaje) para la próxima. Sin ese dato no se puede afirmar la
  causa, pero un modelo de 613 MB que no carga de forma fiable no es aceptable en
  producción aunque sonara perfecto.
- **La corrida de B se detuvo** en la quinta frase, y la de E en la sexta, ambas con la
  pestaña oculta.
- **Observación a vigilar:** la misma frase produjo audios de distinta duración entre
  configuraciones del mismo modelo (2.53 s en C contra 1.98 s en B, con el mismo
  decodificador q8). La longitud generada no parece perfectamente reproducible. Importa
  para Fabrizio: si el audio de referencia cambia entre corridas, el puntaje de una
  misma pronunciación también. Hay que confirmarlo repitiendo una frase dos veces en la
  misma configuración.

## 6. Decisiones que alimenta

- Elección de modelo y configuración del worker S5-T5 (`DEFAULT_TTS_CONFIG` en
  `src/ai/tts/ttsProtocol.ts`).
- **S7-T4 (peso de la descarga inicial):** si se adopta VITS, el TTS suma 109 MB en vez
  de 613 MB. Y como la cuantización queda descartada por tercera vez, la vía para
  reducir peso es **cambiar de modelo o cargar bajo demanda**, no bajar bits.
- El vector de voz va **embebido en el código** (`src/ai/tts/speakerEmbedding.ts`), no
  descargado: el ejemplo oficial hace `fetch` a huggingface.co en cada arranque, lo que
  rompería el requisito de funcionar sin conexión. **Si se adopta VITS este archivo
  sobra**, porque VITS lleva la voz en los pesos; habría que borrarlo junto con su test.
- Riesgo R03 (comparar voz humana contra voz sintética): la voz de VITS es distinta de
  la de SpeechT5, así que la calibración prevista con las cuatro voces del equipo se
  hace contra la que quede elegida.
