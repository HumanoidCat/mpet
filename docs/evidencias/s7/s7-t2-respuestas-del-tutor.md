# S7-T2 · Por qué el tutor no conversaba, y qué se cambió (I-09, I-10, y el defecto de fondo)

**Responsable:** Isaac Morum (`src/ai/`) · **Fecha:** 11 de agosto de 2026

## 1. Tres incidentes, una sola raíz

Los tres se produjeron **pidiéndole al modelo que actuara** en vez de que hiciera una
tarea sobre una frase concreta. LaMini-Flan-T5 es un T5 de instrucciones, no un modelo
de chat: se le da bien "reescribe esto así" y mal "sé un tutor".

| | Qué se vio | Causa |
|---|---|---|
| **I-09** (ya en `dev`, PR #74) | Ante *"Hi, how are you?"*: *"I'm sorry, but I cannot respond to this prompt as it goes against OpenAI's use case policy…"* | Negativa memorizada del destilado del modelo (se entrenó con salidas de GPT-3.5) |
| **I-10** (diagnosticado por Alejandro) | Tres turnos seguidos con la respuesta idéntica: *"I'm doing well, thanks for asking."* | El prompt intercalaba líneas `Student:`/`Tutor:`; el modelo copiaba la última línea `Tutor:` que ya tenía delante |
| **Sin numerar, encontrado al revisar I-10** | El tutor no conversa: convierte la frase del estudiante en una pregunta sobre lo mismo, o se la devuelve tal cual si es una pregunta | Límite del modelo, no del prompt — probado con dos formulaciones que se lo prohibían explícitamente y las ignoró |

## 2. Lo que se cambió

### 2.1 El prompt (`suggestionsProtocol.ts`)

De `"You are a friendly English tutor talking with a student…"` con turnos
intercalados, a una tarea sobre la última frase del estudiante, sin ningún rol y sin
ninguna línea `Tutor:` que copiar:

```
Write one friendly follow-up question about this sentence: "I went to the beach."
```

Medido con tres formulaciones sobre las mismas frases (spike, sesión previa): cuanto
más se le pide adoptar un papel, más se activa el reflejo de negarse; el formato de
diálogo fue el peor de los tres. Con la tarea concreta: **0 negativas de 8**, incluidas
dos frases elegidas a propósito para provocar el reflejo (*"I hate my job."*, *"My
friend is stupid."*) y **8 respuestas distintas de 8** — verificado con el modelo real
en esta sesión.

Esto resuelve I-09 en la causa (deja de producirse) y no solo en el síntoma (filtrarla
después), y resuelve I-10 por construcción: sin líneas `Tutor:` en el prompt no hay
nada que el modelo pueda copiar.

### 2.2 El defecto de fondo (`cleanup.ts`): el tutor no conversa

Con el prompt ya arreglado, una conversación simulada de diez turnos mostró que el
modelo **sigue sin conversar** — no es un fallo, es lo único que sabe hacer un T5 de
este tamaño: parafrasear.

| Estudiante dijo | Tutor (antes de este arreglo) |
|---|---|
| Hi! My name is Ana. | What is your name? |
| My favorite beach is Manuel Antonio. | What is your favorite beach? |
| Do you like the beach? | Do you like the beach? *(la repite tal cual)* |

Se probaron dos prompts que se lo prohibían explícitamente — *"Do not ask for
information the student already gave"*— y el modelo los ignoró. No es arreglable con
más instrucciones.

**La solución va en `cleanup.ts`, después de generar, no en el prompt:**
`esEco(pregunta, fraseDelEstudiante)` compara las palabras con contenido de la
pregunta contra las de la frase del estudiante; si la pregunta no aporta ninguna
palabra nueva, se sustituye por una de cuatro preguntas de seguimiento que rotan por
turno (para no caer en el mismo defecto al arreglarlo). El mismo mecanismo, con una
regla más simple de "es idéntica a la anterior", cubre I-10 como red de seguridad —
por si la repetición volviera a aparecer por otra causa, ahora que la original se quitó
de raíz.

**Por qué esta capa importa más que el prompt:** es la única de las dos que sigue
funcionando **si el modelo cambia**. Filtra la salida por su contenido, no depende de
cómo se construyó el prompt ni de qué modelo la generó.

## 3. Verificación

### 3.1 Contra la transcripción real (regresión)

Los diez pares de la conversación simulada, capturados literalmente del modelo real
antes de este arreglo, se usan como fixture de regresión: `esEco` detecta **6 de los
10** como eco genuino — los dos "loro" exactos y los tres ecos de un dato puntual
(nombre, país, favorita). Las otras 4 no se marcan: aportan una palabra de contenido
nueva aunque giren sobre el mismo tema (*"profession"*, *"difficulty of the task"*,
*"work schedule"*, *"kind of activities… usually"*), que es el comportamiento que se
quiere — sustituir el eco puro, no cualquier pregunta relacionada.

El número (6, no 10) no se ajustó para que "se viera mejor": es el resultado medido de
correr el algoritmo contra los datos reales, y quedó así en el test.

### 3.2 Suite completa

`tsc --noEmit` limpio. **545 pruebas en 42 archivos, verde** (8 omitidas, fixtures de
audio que no están en el repo). Incluye 47 casos en `cleanup.test.ts` y 14 en
`suggestionsProtocol.test.ts`, reescritos donde el diseño del prompt cambió.

### 3.3 Verificación en vivo, y un segundo defecto que solo apareció ahí

La primera vez que se escribió este documento, la descarga del modelo (265 MB) había
fallado tres veces por red y quedó pendiente re-verificar el ciclo completo. Isaac
probó la aplicación real en su máquina (`http://localhost:5174/`, capturas de pantalla
del 11-ago) con una red más estable, y **encontró un defecto que ninguna de las dos
piezas por separado dejaba ver**:

| Estudiante | Tutor (con el arreglo de §2, sin el de esta sección) |
|---|---|
| Tell me your name. | *Nice, why do you think that is?* |

La pregunta de reserva no tenía nada que ver con lo que se dijo. Reproducido en el
mismo navegador y máquina, contra el worker real:

```
buildTutorPrompt(...) → 'Write one friendly follow-up question about this sentence: "Tell me your name."'
el modelo devolvió    → "What is your name?"
esEco(...)            → true   (comparte la palabra "name")
```

`esEco` funcionaba como estaba diseñado: la salida del modelo repite "name" sin
aportar nada, así que la sustituye. **El defecto estaba en el conjunto de preguntas de
reserva**, no en el detector: *"Nice, why do you think that is?"* presupone que el
estudiante acaba de dar una opinión o una razón. Ante una orden (*"Tell me your
name."*), esa suposición no se sostiene y la respuesta suena a que el tutor no entendió
nada.

**Arreglo:** las cuatro preguntas de reserva se reescribieron para no presuponer qué
tipo de frase dijo el estudiante — ni opinión, ni relato, ni pregunta, ni orden.
Verificado en vivo, con el worker real y el modelo real, en el mismo entorno donde
apareció el fallo:

| Estudiante | Tutor (arreglo final) |
|---|---|
| Hello, hello, hello. | What is the next step? |
| Tell me your name. | I'd like to hear more about that. |
| Hi, how are you? | How are you doing? |
| I'm doing fine and new. | What's your current status? |
| My name is Anna | That sounds interesting — could you tell me more? |

Y la conversación de diez turnos completa, con el arreglo final: **0 negativas, 0
repeticiones literales, ninguna pregunta de reserva fuera de lugar.**

**Lección para la evidencia, no solo para el código:** las dos piezas se habían medido
por separado (el prompt contra el modelo, `esEco` contra una transcripción) y las dos
pasaban. El defecto solo apareció al componerlas en una conversación real con una
entrada que ninguna de las pruebas anteriores incluía — una orden dirigida al tutor en
vez de una frase para practicar. Confirma, otra vez, que compilar y pasar los tests no
es lo mismo que funcionar.

## 4. Lo que queda flojo, declarado

- El tutor sigue sin comentar antes de preguntar ("Nice!"). La formulación que lo
  hacía era la de rol, que es la que se negaba.
- La perspectiva de los pronombres a veces se cuela: ante *"My friend is stupid"*
  puede responder sobre *"my friend's behavior"* en vez de *"your friend's"*.
- Sin memoria conversacional real: cada respuesta mira solo la última frase del
  estudiante. Es una limitación del modelo (T5 de instrucciones, no de chat), no algo
  que este arreglo pueda resolver sin cambiar de modelo.
