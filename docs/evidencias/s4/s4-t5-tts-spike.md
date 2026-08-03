# S4-T5 · Spike de síntesis de voz en el navegador

**Responsable:** Isaac Morum (módulo `src/ai/`) · **Fecha:** 3 de agosto de 2026
**Código:** `src/ai/spike-s4-t5/` (spike + verificación del worker real)
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
| D | MMS-TTS (VITS) | fp32 | **109.0 MB** | **1.08** | **Inteligible.** Articulación apresurada; pronuncia mal *vegetables* |
| E | MMS-TTS (VITS) | q8 | 36.6 MB | ~1.6 | Prácticamente igual que D, algo peor |

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
   613 MB), usa un tercio de la memoria, es un único archivo sin vocoder ni vector de
   voz, y su **carga cacheada es de 0.86 s** frente a los 8.22 s de SpeechT5 — del
   orden del ASR (0.54 s). Es la elección para S5-T5.

6. **La velocidad del habla no se puede cambiar desde el código.** El grafo ONNX de
   MMS-TTS solo acepta `input_ids` y `attention_mask`: el `speaking_rate` de la
   configuración quedó fijado como constante al exportar el modelo. Verificado leyendo
   `inputNames` de la sesión ONNX en ejecución.

   Ahora bien, la percepción de que "habla muy rápido" no se sostiene como tempo: para
   la misma frase, D produce **4.32 s de audio frente a los 2.91 s de A**, es decir que
   habla más despacio que SpeechT5. Lo que se percibe es la articulación —palabras
   pegadas, sin pausas— no la velocidad. Un estiramiento temporal no lo arreglaría:
   ralentizaría lo mismo. Y para el estudiante, la aplicación **ya tiene** el botón de
   reproducción lenta a 0.7× que conectó Alejandro (`SLOW_RATE` en `src/App.tsx`).

7. **Limitación real de MMS-TTS: pronuncia mal algunas palabras.** En la escucha,
   *vegetables* sonó como "veyitables". Es una debilidad de conversión de letra a
   sonido del modelo, no se corrige por configuración. **Importa más de lo que parece
   en este proyecto concreto:** si el audio de referencia pronuncia mal una palabra, el
   estudiante imita el error y, peor, el comparador de Fabrizio penalizará a quien la
   pronuncie *bien*. Queda anotado como limitación documentada y como insumo de la
   evaluación de Kokoro (§6).

## 5. Lo que NO está verificado (honestidad de la medición)

- **La escucha es de un solo oyente (yo) y sin prueba a ciegas.** Las cinco
  configuraciones se juzgaron sabiendo cuál era cuál. Para el Avance 2 conviene que
  otro integrante confirme al menos la comparación A contra D.
- **No se midió cuán frecuente es la mala pronunciación de MMS-TTS.** Se detectó en una
  palabra (*vegetables*) de seis frases. Antes de aceptarla como limitación menor hay
  que pasar por el spike un puñado de frases típicas del tutor y contar los fallos.
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

## 6. Alternativa evaluada sobre el papel: Kokoro-82M

Ante la pronunciación defectuosa de MMS-TTS se revisó la única alternativa de calidad
claramente superior que corre en el navegador. **No se adoptó**, y estas son las cifras
que sostienen la decisión:

| | MMS-TTS (elegido) | Kokoro-82M |
|---|---|---|
| Peso sin cuantizar | 109 MB | 325 MB |
| Peso cuantizado | 36.6 MB | 92 MB |
| Frecuencia de salida | **16 kHz** (la del proyecto) | 24 kHz → habría que remuestrear |
| Dependencias nuevas | ninguna | `kokoro-js` + `phonemizer` |
| Control de velocidad | no | sí, nativo |
| Pronunciación | falla en algunas palabras | usa un conversor fonético real |

Kokoro requeriría una solicitud etiquetada `shared-change` sobre `package.json` (dos
dependencias nuevas; `kokoro-js` 1.2.1 pide `@huggingface/transformers ^3.5.1`, así que
es compatible con la 3.8.1 que ya usa el proyecto), más código propio de remuestreo de
24 kHz a 16 kHz con sus pruebas. Es decir: aprobación de terceros y trabajo nuevo sobre
la tarea que hoy bloquea a dos compañeros.

La decisión es entregar S5-T5 con MMS-TTS —que desbloquea el puntaje de pronunciación
hoy— y dejar la evaluación de Kokoro como tarea aparte dentro de S7-T4, que ya existe
para revisar peso y calidad de los modelos. El worker queda parametrizado por
configuración, de modo que cambiar de motor después es añadir una rama y cambiar una
constante, no rehacerlo.

## 7. Decisiones que alimenta

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

## 8. Lo que apareció al ejecutar el worker real (S5-T5)

El worker se verificó con una página que usa el `ttsClient` y el `ttsWorker` reales
(`src/ai/spike-s4-t5/verificacion-worker.html`), no una copia. Encontró dos fallos que
ni el compilador ni los tests veían, y ninguno de los dos era evidente sobre el papel.

### 8.1. El audio de referencia no era reproducible

La misma frase, sintetizada tres veces seguidas en la misma sesión y con el mismo
modelo, dio **53 760, 55 040 y 57 088 muestras**. No es un fallo del código: VITS lleva
un predictor de duración estocástico —muestrea ruido a propósito— para que la prosodia
no suene idéntica siempre. Y como el grafo ONNX solo acepta `input_ids` y
`attention_mask`, ese ruido no se puede apagar.

Para una aplicación cualquiera sería un detalle simpático. Aquí no: es la referencia
contra la que se puntúa la pronunciación, así que la misma pronunciación sacaría
puntajes distintos y las pruebas del comparador no tendrían contra qué fijarse.

**Solución:** `src/ai/tts/pcmCache.ts` guarda el PCM por frase. La referencia queda
estable durante la sesión y, de paso, volver a escuchar una frase ya sintetizada pasó
de ~10 s a **0 ms**, verificado en ejecución. Limitación honesta: al recargar la página
la caché se vacía y la frase se vuelve a sintetizar distinta; persistirla entre
sesiones es trabajo del almacenamiento en IndexedDB (S5-T6, Alejandro).

### 8.2. La barra de progreso estaba rota para los tres modelos

Al cargar el modelo con caché fría, la barra saltaba a 100 % de inmediato y se quedaba
ahí durante los 109 MB restantes. El registro de los eventos crudos dio la causa exacta:

```
{"file":"config.json","loaded":1656,"total":1656}            ← llega completo de una vez
{"file":"onnx/model.onnx","loaded":16375,"total":114258806}  ← empieza después
```

El agregador de S2-T5 contaba `config.json`, calculaba 1656/1656 = 100 % y, como la
barra es monótona por diseño, quedaba bloqueada. De 1928 eventos de progreso recibidos,
**reportaba exactamente uno**.

No era un problema del TTS: le pasaba igual al reconocedor y al corrector, porque todos
descargan configuraciones pequeñas antes de sus pesos. Explica por qué en todas las
corridas anteriores el registro mostraba un único `carga: 100%`.

**Solución:** en `src/ai/model-cache/progress.ts`, los archivos que aparecen completos
en su primer evento ya no cuentan para la barra — un archivo que se descarga de verdad
llega troceado. La regla no depende de ningún tamaño arbitrario. Verificado con
descarga real de 109 MB: pasó de **1 reporte a 1690 graduales**.
