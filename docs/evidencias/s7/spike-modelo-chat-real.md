# Spike · ¿Un modelo de chat real reemplaza a LaMini en el tutor?

**Responsable:** Isaac Morum (`src/ai/`) · **Fecha:** 12 de agosto de 2026
**Código:** `src/ai/spike-chat-model/`
**Motivo:** tras I-09, I-10 y el arreglo del eco, el tutor dejó de romperse pero
—correctamente señalado por el usuario— seguía sin conversar de verdad: no responde
preguntas ni recuerda nada entre turnos. Con LaMini eso no tiene arreglo de prompt: es
un T5 de instrucciones, entrenado para reescribir, no para dialogar.

## 1. Qué se verificó primero

`@huggingface/transformers` 3.8.1, **ya instalada, sin dependencia nueva**, soporta
`pipeline('text-generation', modelo)` con un array de mensajes `{role, content}` y
plantilla de chat aplicada por el propio tokenizador (`apply_chat_template`,
confirmado en el código fuente instalado, `pipelines.js` línea ~1024). Esto permite
pasarle el historial real de la conversación, no una frase suelta.

## 2. Candidato medido: SmolLM2-135M-Instruct

Elegido por ser, según su ficha, el modelo de chat más liviano con soporte de
"text rewriting" además de conversación — candidato a cubrir `suggest()` y `reply()`
a la vez, como pide D-14.

| | Valor |
|---|---|
| Descarga real (q8) | **132.8 MiB** — menos que los 264.8 MiB de LaMini |
| Carga | 71.9 s (sin caché) |

### 2.1 La prueba que decide: memoria conversacional

Se le da un dato en el turno 1, un turno de relleno, y se le pide el dato de vuelta en
el turno 3 — algo que LaMini no podía hacer ni en principio, porque su prompt nunca
llevaba turnos anteriores.

| Turno | Tutor |
|---|---|
| 1 — "Hi! My name is Ana and I work as a nurse." | "Welcome to our clinic. I'm Ana, the nurse. What brings you in today?" |
| 2 — "The weather today is really nice." | "…What brings you in today?" |
| 3 — "By the way, what is my name, and what do I do for work?" | "My name is Ana, and I'm a nurse. I work as a nurse in a hospital…" |

**Recordó el nombre: sí. Recordó la profesión: sí.** Es la diferencia cualitativa que
importa. Pero hay un defecto de calidad real: el modelo **se confunde de quién es
quién** — en el turno 1 responde como si él mismo fuera "Ana, la enfermera", en vez de
dirigirse a la estudiante. El dato se retiene; el rol no siempre queda claro.

### 2.2 Preguntas directas — sí contesta

| Pregunta | Tutor | ms |
|---|---|---|
| What is the capital of France? | **The capital of France is Paris.** | 2 748 |
| Can you help me practice English? | I'm here to help you practice English. What's your first question? | 4 459 |
| Do you think it is hard to learn a new language? | Yes, it can be a challenge… (se extiende) | **12 467** |

Esto es lo que LaMini nunca pudo hacer: **contestar contenido**, no solo devolver una
pregunta. Es la respuesta directa a "no tiene sentido usar la función si no conversa".

**Pero la latencia es un problema real.** 12.5 s en el tercer caso, muy por encima del
presupuesto de 2 s (D-15). Con `max_new_tokens: 60` el modelo a veces se explaya.

### 2.3 Entradas adversariales

| Entrada | Tutor | — |
|---|---|---|
| I hate my job. | "I'm sorry for the misunderstanding, but as an English conversation tutor, my primary function is…" | sin negativa de OpenAI, pero es una evasión rígida |
| My friend is stupid. | **"My friend is stupid."** | la repite tal cual — un tipo de eco distinto al de LaMini |
| Hi, how are you? | "Hello! I'm glad you're having a great day…" | ok |

**0 de 3 con la negativa memorizada de OpenAI** que rompía a LaMini (I-09). Pero
aparece un defecto nuevo: ante una frase declarativa corta, a veces la repite en vez de
responder — el `esEco` actual no lo cubriría porque no es una pregunta, es la frase
entera repetida.

### 2.4 `suggest()` — no cubre la segunda tarea

Con el mismo prompt de reescritura que usa LaMini, y también con un prompt más
directivo (*"Output ONLY the rewritten sentence… Do not add comments"*):

| Frase | Salida |
|---|---|
| "I go to school every day and I like it very much." | *"The sentence is grammatically correct, but it's a bit long and could be broken up for better clarity. Here's a revised version: I go to school every day and I like it"* — comenta en vez de solo reescribir, pese a la instrucción explícita |
| "I am very tired because I working all day." | *"I'm very tired because I working all day."* — casi no cambia nada, ni corrige el error de gramática |

**No es un reemplazo fiable para `suggest()`.** LaMini, con sus defectos, es más
consistente en esta tarea (3 de 8 reescrituras genuinas, formato limpio).

## 3. El costo real, en peso

| Escenario | Arranque | Modelo(s) del tutor | TTS (bajo demanda) | **Total sesión** |
|---|---|---|---|---|
| **Hoy** (LaMini para las dos tareas) | 302.6 | 264.8 | 109.0 | **676.4 MiB** |
| **A** — SmolLM2 solo para `reply()`, LaMini se mantiene para `suggest()` | 302.6 | 264.8 + 132.8 = 397.6 | 109.0 | **809.2 MiB** ⚠️ peor |
| **B** — SmolLM2 para las dos tareas (se abandona LaMini) | 302.6 | 132.8 | 109.0 | **544.4 MiB** ✅ mejor, si `suggest()` llega a funcionar |

El escenario B es el único que mejora el peso, y depende de resolver la calidad de
`suggest()` — que hoy no está resuelta (§2.4).

## 4. Conclusión y lo que falta antes de decidir

**El usuario tiene razón: sin un modelo de chat real, `reply()` no vale la pena.**
SmolLM2-135M-Instruct demuestra que el límite era el modelo, no el prompt — responde
preguntas y recuerda datos, algo que ningún ajuste de prompt le sacó nunca a LaMini.

Pero no es un intercambio simple. Quedan tres preguntas abiertas, en orden de qué tan
bloqueantes son:

1. **`suggest()` necesita su propia solución** si se abandona LaMini: otro prompt para
   SmolLM2, un modelo aparte, o resignarse a que suggest() y reply() ya no compartan
   modelo (rompe D-14, con su costo de peso).
2. **La latencia hay que acotarla** — bajar `max_new_tokens`, medir si eso arruina las
   respuestas largas, y confirmar contra el presupuesto de 2 s.
3. **El defecto de "confundir quién es quién"** y el "repetir la frase entera" son
   nuevos, no estaban catalogados. Necesitarían su propio filtro en `cleanup.ts`, del
   mismo tipo que `esEco`, antes de ir a producción.
4. **Solo se midió una vez por caso** (sin repetición ni segundo evaluador), y no se
   probó `SmolLM2-360M-Instruct` (349.7 MiB estimado), que podría resolver la calidad
   de `suggest()` a cambio de más peso — pendiente si el 135M no alcanza tras iterar el
   prompt.

## 5. Recomendación

Migrar `reply()` a **SmolLM2-135M-Instruct** — el salto de calidad es real y medido, y
el modelo pesa menos que LaMini. Pero antes de tocar el worker de producción:

- Iterar el prompt de `suggest()` sobre este mismo modelo (una tarde más de spike) antes
  de resignarse al escenario A (dos modelos, peor peso).
- Si `suggest()` no mejora, decidir explícitamente entre A (peor peso, se mantienen las
  dos tareas con calidad conocida) y una tercera opción no explorada aquí.
- Cualquiera de los dos casos necesita nuevos filtros en `cleanup.ts` para los defectos
  de §2.1 y §2.3, siguiendo el mismo patrón que `esEco`.

No se toca `createAIPipeline.ts` ni `suggestionsWorker.ts` todavía: es una decisión de
producto (peso contra calidad) tanto como técnica, y falta cerrar `suggest()`.
