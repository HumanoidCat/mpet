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

## ⚠️ Limitación — pendiente de validar en runtime

**El worker de gramática no se ha ejecutado todavía.** Lo verificado es tipado, la
lógica de diff (con tests) y el empaquetado. Lo que **no** está comprobado es el modelo
corriendo en el navegador: calidad real de las correcciones, latencia, y si el prefijo
se comporta como indica la documentación.

Antes del Avance 1 conviene un spike corto —igual que S1-T7— que cargue el modelo en
Chrome, corrija un puñado de frases con errores típicos de hispanohablantes y mida
tiempos. Es el mismo riesgo que se mitigó con el ASR, y es barato de hacer.

## Decisión abierta para el equipo

El diff ignora mayúsculas y puntuación al comparar, así que "hello" → "Hello." no genera
un `Edit`. Se hizo para no inundar la UI de marcas triviales. Si el equipo considera que
la capitalización debe corregirse visiblemente, se quita esa normalización
(`normalize()` en `diff.ts`).
