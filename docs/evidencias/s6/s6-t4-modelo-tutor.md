# S6-T4 / S7-T2 · Qué modelo usa el tutor

**Responsable:** Isaac Morum (módulo `src/ai/`) · **Fecha:** 4 de agosto de 2026
**Código:** `src/ai/spike-s6-t4/`
**Cómo se corre:** `npm.cmd run dev` → <http://localhost:5173/src/ai/spike-s6-t4/index.html>

## 1. Qué decide

Con qué modelo se construyen `suggest()` (sugerencias de mejora, S6-T4) y `reply()`
(respuesta conversacional del tutor, S7-T2). **Las dos salen del mismo modelo con
instrucciones distintas**, así que se elige una sola vez: cargar dos T5 para pedirles
dos cosas duplicaría cientos de MB sin ganar nada.

La pregunta es peso contra calidad. Tras la carga bajo demanda (S7-T4) la aplicación
descarga ~303 MiB de arranque; el modelo grande casi duplica eso.

## 2. Resultados

| | Pequeño · 77M q8 | Grande · 248M q8 |
|---|---|---|
| Descarga real | **93.0 MiB** | **264.8 MiB** |
| Carga | 23.1 s | 35.9 s |
| Latencia media / máx | 865 / 1779 ms | 1751 / 2285 ms |
| Sugerencias sin cambios | 2 de 8 | 5 de 8 |
| Respuestas que son una pregunta | **0 de 4** | **4 de 4** |
| Heap JS | 43 MB | 40 MB |

### 2.1 El pequeño no sirve, y no por poco

Con 77M de parámetros el modelo **no ejecuta la instrucción: la parafrasea**.

| Entrada | Lo que devolvió |
|---|---|
| *Rewrite the following sentence the way a native English speaker would say it* — "My favorite food is rice with chicken." | "The native English speaker would say it is a favorite food." |
| Misma instrucción — "I want to improve my English for my job." | "The native English speaker would say it in the rewritten sentence \"I want to improve my English for my job.\"" |
| Respuesta del tutor — "I want to improve my English for my job." | "I'm sorry, but I cannot provide a response to this prompt as it is not a valid instruction." |
| Respuesta del tutor — "My favorite food is rice with chicken." | "I'm sorry, but I cannot provide a response to this prompt as it goes against my programming to provide inappropriate or offensive content." |

Ninguna de las cuatro respuestas del tutor fue utilizable. Las negativas del tipo
"I'm sorry, but I cannot…" son ruido heredado de los datos con que se destiló el
modelo, no una decisión sobre el contenido: la frase sobre el arroz con pollo no tiene
nada que rechazar.

**93 MiB no valen nada si lo que devuelven no se puede enseñar a un estudiante.**

### 2.2 El grande funciona

Respuestas del tutor, las cuatro coherentes y las cuatro terminadas en pregunta:

| Frase del estudiante | Respuesta del tutor |
|---|---|
| I went to the beach yesterday with my family. | What did you do yesterday? |
| I want to improve my English for my job. | What do you want to achieve with your English? |
| My favorite food is rice with chicken. | What is your favorite food? |
| I do not like horror movies because they scare me. | What do you think about horror movies? |

Sugerencias: **3 de 8 mejoraron la frase de verdad**, y las que mejoraron lo hicieron
bien:

- "I went to the beach yesterday with my family." → *Más natural:* "Yesterday, I went
  to the beach with my family." (reordena la referencia temporal al frente, que es
  como suena natural en inglés)
- "I want to improve my English for my job." → *Vocabulario:* "I am determined to
  enhance my proficiency in English for my job."

Las otras 5 devolvieron la frase sin tocar. No es un fallo grave —si la frase ya está
bien no hay nada que sugerir— pero la interfaz no debe mostrar una "sugerencia" que es
idéntica a lo que el estudiante escribió.

## 3. Decisión

**Se elige el 248M.** El pequeño no es una alternativa más barata: es inservible para
esta tarea, así que la comparación de peso no llega a plantearse.

## 4. Consecuencias que hay que mirar de frente

**El peso del tutor no es opcional en la práctica.** La carga bajo demanda difiere el
sintetizador porque hay usuarios que nunca pulsan "escuchar", pero `reply()` se llama
**en cada turno de conversación**: el modelo se va a descargar en el primer mensaje de
cualquiera que use la aplicación. Lo que la carga perezosa consigue aquí es que la
pantalla inicial no espere por él, no ahorrarlo.

Descarga total de una sesión completa de conversación:

| | MiB |
|---|---|
| Arranque (reconocedor + corrector + runtime) | 302.6 |
| Tutor, en el primer turno | 264.8 |
| Sintetizador, la primera vez que se pulsa escuchar | 109.0 |
| **Total** | **676.4** |

Esto reabre la prioridad de S7-T4: el objetivo de bajar el peso ya no se cumple solo
con diferir descargas. El siguiente candidato obvio sigue siendo el **corrector de
gramática (241 MiB)**, que es el único de los tres que todavía no se ha comparado
contra alternativas más livianas.

Y afecta a la decisión pendiente sobre Kokoro: adoptarlo sumaría otros ~216 MB sobre
estos 676.

## 5. Dos ajustes que el worker tiene que hacer, detectados aquí

1. **Quitar las comillas que envuelven la salida.** Dos de las cuatro respuestas
   llegaron como `"What do you want to achieve with your English?"`, con comillas
   literales incluidas. Si se muestran tal cual, el chat se ve mal.
2. **Descartar la sugerencia que es idéntica a la frase original.** Es el caso más
   frecuente (5 de 8) y mostrarla sería ruido. Mejor una lista vacía que una sugerencia
   que no sugiere nada.

## 6. Limitaciones de esta medición

- **Cuatro frases y un solo evaluador.** Sirve para descartar el 77M, que falla de
  forma evidente, pero no para afirmar que el 248M es bueno en general.
- **Las frases entran ya corregidas**, que es como llegan en el pipeline real, así que
  no se midió qué hace el modelo con una frase agramatical.
- **La latencia se midió con la pestaña en segundo plano**, donde el navegador limita
  el procesamiento: los milisegundos absolutos son pesimistas. La comparación entre los
  dos modelos sí es válida, porque se hizo en las mismas condiciones.
- **Un turno completo son tres generaciones** (dos sugerencias y una respuesta), así
  que el coste por turno es la suma, no la latencia de una sola.
- **El detector de "termina en pregunta" del spike marcó 2 de 4** cuando en realidad
  eran 4 de 4: las comillas literales de la salida hacían que la cadena no terminara en
  `?`. El instrumento se corrige junto con el punto 5.1.

## 7. El worker, verificado en ejecución

Construido tras la decisión: `src/ai/suggestions/` (protocolo + worker + cliente +
limpieza), conectado a `suggest()` y `reply()` del contrato, **bajo demanda**.

Un solo worker sirve las dos tareas porque son el mismo modelo con instrucciones
distintas. Eso obliga a algo que los otros tres workers no necesitaban: el registro de
peticiones pendientes guarda **de qué tipo** era cada una. Sin eso, una respuesta de
sugerencias podría resolver la promesa de una respuesta del tutor y el chat mostraría
una lista donde espera una frase.

Verificado con `src/ai/spike-s6-t4/verificacion-worker.html`, que usa el `AIPipeline`
real y **no llama a `init()`**, para probar de paso la carga bajo demanda:

| Prueba | Resultado |
|---|---|
| `suggest()` sin `init()` previo | ✅ 17.0 s (incluye cargar el modelo) → `["Yesterday, I went to the beach with my family."]` |
| El filtro de sugerencias inútiles | ✅ de las dos generaciones sobrevivió una: la otra repetía la frase y se descartó |
| `reply()` | ✅ 1.35 s → `What did you do yesterday?` · sin comillas · termina en pregunta |
| Las dos a la vez, por el mismo canal | ✅ no se cruzaron: la lista llegó como lista y la frase como frase |

Los dos defectos que había detectado el spike quedan corregidos y comprobados con
salidas reales: las comillas envolventes se quitan y las sugerencias que repiten la
frase original no llegan a la interfaz.

**Limitación honesta:** la carga bajo demanda deja la primera petición del tutor sin
barra de progreso. El contrato entrega el callback en `init()`, así que si el modelo
se carga después hay que haberlo guardado —eso está hecho— pero si nunca se llamó a
`init()`, como en esta página de verificación, no hay a quién avisar. En la aplicación
real `init()` siempre se llama antes, así que el progreso sí llega.
