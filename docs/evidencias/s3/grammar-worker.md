# Evidencia S3-T3 — Worker de corrección gramatical

**Autor:** Isaac Morum (IA/ML) · **Semana 3** · **Épica E3**
**Modelo:** `Xenova/t5-base-grammar-correction` (ONNX, q8) · transformers.js 3.8.1

## Qué se construyó

| Archivo | Responsabilidad |
|---|---|
| `src/ai/grammar/grammarWorker.ts` | Web Worker: carga el T5 cuantizado y corrige texto |
| `src/ai/grammar/grammarClient.ts` | Envuelve el worker en API de promesas |
| `src/ai/grammar/grammarProtocol.ts` | Tipos de mensajes entre hilos + prefijo del modelo |
| `src/ai/grammar/diff.ts` | Diff palabra a palabra → lista de `Edit` del contrato |

Con esto, `AIPipeline.correctGrammar()` deja de ser paso a través y devuelve
correcciones reales. Completa el lado de IA de **RF-05**.

## Decisiones de diseño

1. **Prefijo `"grammar: "`.** El modelo base `vennify/t5-base-grammar-correction` se
   entrenó con ese prefijo delante de cada entrada. La ficha de la conversión ONNX de
   Xenova lo omite en su ejemplo, pero los pesos son los mismos: sin prefijo la
   corrección se degrada. Se deja configurable en `grammarProtocol.ts`.
2. **Generación determinista** (`do_sample: false`). Corregir gramática no requiere
   creatividad; ante la misma entrada queremos la misma salida, para que tests y
   evidencias sean reproducibles.
3. **Diff por LCS sobre palabras.** El T5 devuelve la frase corregida completa, pero el
   contrato `Edit` pide qué palabra cambió y en qué posición del original — que es lo
   que la UI de Monestel necesita para el resaltado rojo→verde. Se alinean ambas frases
   con *Longest Common Subsequence* (la idea de `git diff`, pero sobre palabras).
4. **Emparejado de bloques contiguos.** Un borrado + una inserción en el mismo punto se
   reportan como UNA sustitución, que es como lo percibe el usuario, en vez de dos
   cambios sueltos.
5. **Clasificación de tipo por similitud.** Si las palabras se parecen (Levenshtein
   normalizado ≥ 0.7) es `spelling` ("recieve"→"receive"); si no, `grammar`
   ("goed"→"went"). **No** se emite `word-choice`: distinguirlo requiere análisis
   semántico que este diff no hace, y se prefiere no adivinar.
6. **Carga secuencial de modelos.** `init()` carga primero el ASR y luego la gramática,
   no en paralelo: cada modelo ocupa cientos de MB (~290 MB de heap midió el ASR en
   S1-T7) y cargarlos a la vez dispararía el pico de memoria.
7. **Degradación segura.** Si el modelo devuelve vacío, se conserva el texto original
   sin marcar cambios, en vez de romper el turno de conversación.

## Verificación

| Comprobación | Resultado |
|---|---|
| `npx tsc --noEmit` | **0 errores** |
| `npx vitest run` | **38/38 verdes** (12 nuevos del diff) |
| `npm run build` | correcto |
| Existencia del modelo y variantes ONNX cuantizadas | verificado en el Hub |
| Prefijo requerido por el modelo base | verificado en la ficha de `vennify/...` |

Los 12 tests cubren: sustitución con su índice, texto ya correcto, clasificación
ortografía vs gramática, inserción, eliminación, bloque contiguo con dos sustituciones,
indiferencia a mayúsculas y puntuación, texto vacío, y las utilidades de tokenizado y
normalización.

## ✅ Validación en runtime (spike `src/ai/spike-s3-t3/`)

Ejecutado en Chrome con la dependencia real (3.8.1), el `diff.ts` de producción y el
agregador de progreso de S2-T5.

| Medida | Valor | Interpretación |
|---|---|---|
| Carga en frío | 52.49 s | Descarga única |
| Tamaño en caché | **238 MB** | ~6× el ASR (41 MB) |
| Latencia media | **320 ms/frase** | Muy por debajo del objetivo de 2 s |
| Latencia máxima | 456 ms | Frase con tres errores simultáneos |
| Efecto del prefijo | Cambió 1 de 8 | Y **a favor** del prefijo |

**Calidad: 6 de 8 frases corregidas.** Aciertos destacados: `I have 25 years old` →
`I am 25 years old`; `Yesterday I go to the store and buyed some breads` →
`Yesterday I went to the store and bought some bread` (tres errores de una vez);
`I am agree with you` → `I agree with you`.

**El prefijo `"grammar: "` queda confirmado:** en la única frase donde hubo diferencia,
con prefijo corrigió `breads → bread` y sin prefijo no lo tocó. La hipótesis tomada de
la ficha del modelo base era correcta.

### Bug que destapó el spike (corregido)

El diff clasificaba `don't → doesn't` como `spelling`, porque la similitud entre ambas
es 0.71 y superaba el umbral. Pero es concordancia sujeto-verbo, es decir `grammar`.
En una app que enseña inglés, marcar eso como "error de escritura" desorienta al
estudiante. Mismo caso con `breads → bread` (número).

Se añadieron dos reglas **antes** del criterio de similitud: si el cambio toca una
palabra de clase cerrada (auxiliares, determinantes, preposiciones) → `grammar`; si las
palabras difieren solo por `-s`/`-es` → `grammar`. Tests del diff: 12 → **14**.

## ⚠️ Limitaciones conocidas

1. **Cobertura del modelo.** No corrigió `He is more tall than me` (falta *taller*) ni
   `Do you can help me?` (falta *Can you help me?*), y en `There is many people in the
   party` arregló el verbo pero no la preposición. Comparativos y orden de preguntas con
   modal son errores **frecuentes en hispanohablantes**, así que conviene decidir en
   equipo si se acepta como limitación documentada o se busca un modelo mayor.
2. **Peso.** 238 MB en caché. Con el ASR (41 MB) y el runtime WASM (21.6 MB), la primera
   corrida descarga **~300 MB**. Recomendación: probar `q4` y comparar tamaño contra
   calidad antes de cerrar la elección de cuantización. El spike ya permite cambiar el
   `dtype` desde la interfaz.
3. **El pipeline completo aún no corre integrado**: `src/App.tsx` sigue inyectando
   `createMockAIPipeline`. La sustitución es tarea de integración (S3-T5, Alejandro).

## Decisión abierta para el equipo

El diff ignora mayúsculas y puntuación al comparar, así que "hello" → "Hello." no genera
un `Edit`. Se hizo para no inundar la UI de marcas triviales. Si el equipo considera que
la capitalización debe corregirse visiblemente, se quita esa normalización
(`normalize()` en `diff.ts`).
