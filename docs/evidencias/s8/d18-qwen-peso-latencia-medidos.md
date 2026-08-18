# D-18 · Qwen2.5-0.5B en producción: peso, latencia y un hallazgo grave

**Responsable:** Isaac Morum (`src/ai/`) · **Fecha:** 13 de agosto de 2026
**Código:** `src/ai/spike-qwen-peso/`
**Continúa:** D-18 (tutor bilingüe con modelo de chat), que dejó tres preguntas
explícitamente marcadas como pendientes en `suggestionsProtocol.ts`.

> **Resumen ejecutivo:** de las tres preguntas abiertas de D-18, una sale bien
> (el muestreo sí evita la repetición), una sale mal (la latencia es ~10× peor
> que la referencia anterior), y midiendo la primera (el peso) apareció un
> **cuarto problema que nadie había preguntado**: el modelo no se está
> cacheando y se re-descarga completo en cada carga de página. Eso compromete
> el requisito central del proyecto — funcionar offline.

## 1. Método

Medido con el **cliente de producción** (`createSuggestionsClient`, sin
opciones — la configuración por defecto real), no con una llamada suelta al
modelo. `src/ai/spike-qwen-peso/index.html`.

## 2. El peso real — la pregunta que se hizo, y la que apareció sola

### 2.1 Cuánto pesa

La ficha del Hub para la variante que carga el worker (`onnx-community/Qwen2.5-0.5B-Instruct`,
`model_quantized.onnx`) dice **512 096 557 bytes** (488.3 MiB) + `tokenizer.json`
7 031 673 bytes (6.7 MiB) + configuraciones mínimas. Total real: **≈495 MiB**.

A diferencia de Kokoro (D-12: estimado 325 MB, medido 88 — una sorpresa buena),
acá la estimación de `expectedMB: 500` que dejé sin verificar en el código
**resultó casi exacta**. No todas las fichas del Hub mienten; esta vez la
verificación confirmó el número en vez de corregirlo.

### 2.2 El modelo no se está cacheando — verificado dos veces

Al leer `caches.open('transformers-cache')` después de cargar, **solo aparecen
4 archivos chicos** (tokenizer y configuraciones, 6.7 MiB): el archivo de pesos
de 488 MiB no está.

Para descartar que fuera un error de mi instrumento de medición, no de la
aplicación: **recargué la página completa y volví a cargar el modelo.**

| Carga | Tiempo | ¿Más rápida que la anterior? |
|---|---:|---|
| 1.ª (recién abierta la página) | 103.33 s | — |
| 2.ª (página recargada del todo) | 107.62 s | **No** — prácticamente igual |

Si el modelo estuviera en caché, la segunda carga habría sido casi
instantánea (como Kokoro: 11.55 s con caché, o el corrector de gramática:
0.86 s). No lo fue. Tras las dos cargas, `caches.keys()` seguía mostrando
solo los 4 archivos chicos, e `indexedDB.databases()` devolvió una lista
vacía — no hay ningún otro sitio donde el navegador esté guardando el peso.

**Se descartó que sea por falta de espacio:** `navigator.storage.estimate()`
mostró 262 MiB usados de una cuota de 2972 MiB — **8.8 %**. Sobra espacio de
sobra.

**Hipótesis, no confirmada:** el archivo de 488 MiB es, con diferencia, el
mayor que carga el proyecto (el siguiente es la gramática, con 241 MiB). El
código instalado de `@huggingface/transformers` tiene una constante
`MAX_EXTERNAL_DATA_CHUNKS`, que sugiere que los modelos ONNX muy grandes se
sirven en pedazos por un camino distinto al que sí queda cacheado — pero no
llegué a confirmarlo leyendo el código a fondo. Lo que sí está confirmado,
sin depender de esa hipótesis, es el síntoma: **se re-descarga cada vez.**

**Por qué esto importa más que un número de peso.** El requisito central del
proyecto es funcionar sin conexión. Si esto se reproduce fuera de esta
máquina, un estudiante que abra la aplicación una segunda vez sin conexión
**no podría conversar con el tutor**, porque el modelo nunca quedó guardado la
primera vez. Es un hallazgo que ninguna de las tres preguntas de D-18 pedía
buscar, y apareció solo por medir la primera con cuidado.

## 3. Latencia — la pregunta que sale mal

| | Media | Máxima |
|---|---:|---:|
| LaMini-Flan-T5 (referencia anterior, spike S6-T4) | 1751 ms | 2285 ms |
| **Qwen2.5-0.5B (medido ahora, cliente real)** | **17 091 ms** | **21 660 ms** |

Tres turnos: 13.3 s, 21.7 s, 16.3 s. **Es un orden de magnitud peor**, no un
empeoramiento marginal. D-15 dice que la respuesta del tutor admite más de los
2 s del presupuesto de retroalimentación porque "una pausa de un segundo y
medio antes de contestar es lo normal en una conversación" — pero 13 a 22
segundos no es una pausa conversacional, es una espera que un estudiante
interpretaría como que la aplicación se colgó.

I-11 ya había encontrado y corregido un problema de latencia (cuantización en
q4 en vez de q8). **Esta medición es con la configuración ya corregida a q8**,
y aun así el resultado está muy lejos de ser aceptable. No se investigó la
causa adicional aquí —haría falta perfilar el worker— pero el número por sí
solo debería bloquear que esto se quede así antes de la entrega.

## 4. El muestreo sí evita la repetición — la pregunta que sale bien

Misma frase de entrada, tres veces, cada una como conversación nueva:

| # | Respuesta |
|---|---|
| 1 | Did you enjoy your trip? |
| 2 | That sounds interesting — could you tell me more? |
| 3 | Did you have fun? |

**3 de 3 distintas.** Confirma la decisión de D-18: el muestreo (`temperature:
0.7`, `top_p: 0.9`) sí resuelve el problema de raíz que la decodificación
voraz producía (I-10, y lo que yo mismo medí con SmolLM2 antes de D-18).

## 5. Un defecto no buscado: deriva de idioma

Los tres turnos de la prueba de latencia se llamaron con `language: 'en'`
explícito en las tres. Dos de las tres respuestas salieron parcial o
totalmente en español:

| Frase del estudiante (inglés) | Respuesta del tutor |
|---|---|
| "Hi! I want to practice my English conversation skills." | *"Hola! ¿Cómo estás? ¿Qué es esto?"* — en español |
| "I work as an engineer and I travel a lot for my job." | en inglés, correcto |
| "What do you think I should study to improve faster?" | *"¿Qué te gustaría hacer para mejorar rápidamente?"* — en español |

No se investigó a fondo, pero descarto que sea un error de mi prueba: el
parámetro se pasó igual las tres veces. Es más probable que sea el propio
modelo —multilingüe, bajo muestreo, a 0.5B de parámetros— derivando de idioma
por su cuenta. Es lo opuesto de lo que el tutor bilingüe necesita: un
estudiante que escribe en inglés y recibe una respuesta en español no gana
nada.

## 6. Prioridad, para quien decida

1. **La falta de caché es lo más urgente de verificar**, porque compromete un
   requisito del proyecto, no solo la experiencia. Habría que confirmarlo en
   otra máquina/navegador antes de darlo por generalizado, y si se confirma,
   decidir si se investiga la causa o se vuelve al modelo anterior mientras
   tanto.
2. **La latencia (10× peor) probablemente ya bastaría por sí sola** para no
   dejar esto en producción tal como está sin al menos medir de dónde sale el
   tiempo.
3. **La deriva de idioma** es menor que las dos anteriores, pero rompe
   silenciosamente la función que el cambio de modelo existía para habilitar.

No cambié `DEFAULT_SUGGESTIONS_CONFIG`. D-18 dejó la vuelta atrás a una línea
de distancia (`'grande-248m'`) a propósito para una situación así; la decisión
de usarla es del equipo, con estos números en la mano.

## 7. Limitaciones de esta medición

- Un solo navegador, una sola máquina, una sola corrida de cada prueba.
- No se perfiló el worker para saber si la latencia sale de la carga del
  modelo en memoria, de la generación token a token, o de otra cosa.
- No se probó si limpiar la caché del navegador por completo (no solo la de
  `transformers-cache`) cambia el resultado del punto 2.2.
