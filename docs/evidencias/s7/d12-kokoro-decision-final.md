# D-12 · Kokoro medido con el banco acordado — cierre

**Responsable:** Isaac Morum (`src/ai/`) · **Fecha:** 12 de agosto de 2026
**Código:** `src/ai/spike-kokoro/`
**Continúa a:** `src/ai/PROPUESTA-kokoro-s7-t4.md` (propuesta original, 3-ago) y la respuesta
de Alejandro que fijó el umbral y las condiciones (D-12 en la bitácora del equipo).

## 1. Qué pedía Alejandro y si se cumple

Su respuesta a la propuesta original fijó, **antes de medir**, el umbral y una
condición no negociable:

| Fallos sobre 14 | Decisión de Alejandro |
|---|---|
| 1 o 2 | Se queda MMS-TTS |
| 3 o 4 | Se curan las frases de práctica |
| 5 o más | Se abre el `shared-change`, **siempre junto con la carga bajo demanda del TTS** |

**Las dos condiciones ya están cumplidas, de forma independiente:**

- El conteo reconciliado de MMS-TTS con las dos vías (S7-T4) dio **7 fallos de 14** —
  cruza el umbral de 5. (Con la advertencia ya documentada de que falta el segundo
  oyente para cerrarlo del todo, pero el número no es ambiguo: está muy por encima de 4.)
- **La carga bajo demanda del TTS ya está en producción** desde S7-T4
  (`src/ai/lazy.ts`, `ttsLoader` en `createAIPipeline.ts`). No es algo que falte hacer
  si se adopta Kokoro: ya está hecho, y benefició primero a MMS-TTS.

Es decir: el criterio de Alejandro para pedir el `shared-change` **ya se cumplía antes
de medir Kokoro**. Lo que faltaba era la segunda mitad: ¿vale la pena el cambio?

## 2. Kokoro, medido con el mismo banco

Mismas 14 palabras trampa + 5 de control, misma frase portadora, mismo criterio de
acierto y el mismo reconocedor que se usaron para medir MMS-TTS
(`docs/evidencias/s7/s7-t4-pronunciacion-tts.md`), para que los números signifiquen lo
mismo.

| | MMS-TTS (en producción) | **Kokoro-82M** |
|---|---|---|
| Fallos en palabras trampa | 7 de 14 (reconciliado, 1 oyente) | **1 de 14** |
| Fallos en palabras de control | 2 de 5 (`water`, `book`) | **0 de 5** |
| Determinista | No — mide un suelo de 49.5/100 en el puntaje (R03) | **Sí** — verificado dos veces, 25 600 muestras idénticas |
| Descarga real (q8) | 109.0 MiB | **88.1 MiB** (medido: caché real, no la ficha del Hub) |
| Convierte números a letras | No — necesitó el parche de I-07 | **Sí, integrado** — verificado con audio real, 2.67 s de habla genuina para "$25", no silencio |
| Carga (con caché) | 0.86 s | 11.55 s (con caché; en frío no se midió) |

La única palabra que sigue fallando es la misma de siempre: *vegetables* → "vedgerables".

## 3. Lo que esto cambia respecto a la propuesta original

La propuesta del 3 de agosto estimaba el costo de Kokoro sobre fichas del Hub, sin
medirlo: **325 MB sin cuantizar**, con la advertencia de D-05 de que cuantizar suele
empeorar calidad. La medición real dice otra cosa:

- **Cuantizado (q8), Kokoro pesa menos que MMS-TTS** (88.1 contra 109.0 MiB) y aun así
  falla 7 veces menos. La preocupación de D-05 no se cumplió aquí — a diferencia del
  corrector de gramática, donde cuantizar sí perjudicaba, en este modelo la calidad se
  sostiene cuantizado. Vale la pena decirlo así de explícito porque contradice la
  intuición que traíamos de D-05.
- **No hace falta remuestreo nuevo.** Se usó `resample()` de `src/audio/dsp/sampling.ts`
  (Fabrizio) tal como él sugirió al revisar la propuesta original — cero líneas de
  código de remuestreo propias.
- **Resuelve la mitad del problema de R03 de regalo.** El suelo de 49.5/100 que
  MMS-TTS le impone al puntaje de pronunciación (por no ser determinista) desaparece
  con Kokoro.
- **La normalización de números de I-07 deja de ser necesaria** si se adopta Kokoro
  (tiene su propio conversor). No se retira: mientras MMS-TTS siga en producción sigue
  haciendo falta, y no estorba si conviven.

## 4. Lo que sigue costando, sin cambios

- **Dos dependencias nuevas**: `kokoro-js` y su transitiva `phonemizer`. Compatibilidad
  de versión con `@huggingface/transformers` ya verificada en la propuesta original.
- **Carga más lenta con caché** (11.55 s contra 0.86 s), a confirmar con más muestras.
- **Medido con una sola voz** (`af_heart`) y una sola repetición por palabra, no tres
  como en el conteo de MMS-TTS — porque al ser determinista, repetir no debería cambiar
  el resultado, pero no se verificó esa suposición sobre el banco completo, solo sobre
  la frase de control del punto 2.

## 5. Recomendación

**Pedir el `shared-change`.** El umbral que Alejandro fijó de antemano ya se cruzaba
con MMS-TTS solo, y Kokoro no es un cambio marginal: falla 7 veces menos, no tiene el
problema de determinismo que le cuesta la mitad de la escala al puntaje de
pronunciación (R03), y cuantizado pesa menos que el modelo que reemplazaría.

La condición no negociable de Alejandro —carga bajo demanda— ya está satisfecha desde
S7-T4, así que no hay nada que bloquee esto por ese lado.

No toco `package.json`. Queda a la espera de que Alejandro y el dueño del módulo
afectado aprueben el PR con la etiqueta `shared-change`.
