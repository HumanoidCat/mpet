# Respuesta: el conteo de pronunciación, y por qué todavía no pido el `shared-change`

**De:** Isaac Morum (módulo `src/ai/`)
**Para:** Alejandro Zamora (líder técnico)
**Sobre:** tu respuesta a `PROPUESTA-kokoro-s7-t4.md`
**Fecha:** 4 de agosto de 2026

---

## Lo primero, porque es lo que más te va a interesar

**Con las dos vías cruzadas: 7 fallos de 14. Supera tu umbral de 5.** Pero el
resultado que de verdad decide no está en esas 14, y va abajo del todo en el punto 2.

Aclaración de método, porque el número cambió por el camino: la vía automática dio 8 y
la escucha dio 12 en bruto. **Ninguno de los dos es utilizable tal cual** —el primero
porque el control falló, el segundo porque mi comparación castigaba la ortografía del
oyente y no la pronunciación del modelo—. Los 7 salen de reconciliar ambas con un
criterio aplicado por igual a todas las palabras. Está detallado en
`docs/evidencias/s7/s7-t4-pronunciacion-tts.md`, §6.

**Falta el segundo oyente** que pide tu protocolo, así que formalmente esto no está
cerrado. Te lo mando igual porque el hallazgo del punto 2 no depende de eso.

---

## 1. Tu punto 1 del protocolo no funciona, y tengo los datos

Pediste medir con **palabras aisladas**, para que Whisper no pudiera apoyarse en el
contexto. El razonamiento es correcto, pero al ejecutarlo el método se cae:

| Palabra de control (fácil, sin trampas) | Lo que entendió el ASR, aislada |
|---|---|
| water | "bye here" ✘ |
| green | "reen" ✘ |
| book | "no" ✘ · en otra corrida, `[blank_audio]` |
| morning | "morning" ✔ |
| teacher | "teacher" ✔ |

**3 de 5 palabras triviales fallan estando solas.** No es el sintetizador: Whisper
está entrenado con habla continua y medio segundo de audio no le da contexto
acústico. En algunos casos ni siquiera lo considera voz.

**Lo que hice en su lugar:** frase portadora fija, `Say ___ again, please.` Es la
técnica estándar en fonética exactamente para este problema — da contexto acústico
(duración, entonación, algo antes y después) sin que el contexto permita adivinar la
palabra objetivo, porque en ese hueco cabe cualquiera. Añadí también 0.25 s de
silencio alrededor, que es lo que eliminó los `[blank_audio]`.

**El sesgo que introduce, declarado:** algo de contexto lingüístico queda, así que el
reconocedor podría recuperar una palabra mal pronunciada y el conteo quedaría *por
debajo* del real. El sesgo empuja hacia "no cambiar de modelo". Es la dirección
conservadora: este método sirve para **descartar** el gasto de 216 MB, no para
justificarlo.

Cambié tu protocolo sin consultarte porque el original no producía ningún dato. Queda
escrito con su evidencia en `docs/evidencias/s7/s7-t4-pronunciacion-tts.md`, §4.

## 2. El resultado que decide no está en las 14 palabras trampa

**Fallan también `water` y `book`, y fallan en las dos vías a la vez:**

| Palabra | Reconocedor | Oyente |
|---|---|---|
| water | "witter" · "what her" · "witter" | "wither" |
| book | "but" · "both" · "both" | "buf" |

Son **palabras de control**: las metí porque son triviales, comunes y sin trampas de
escritura, para detectar si los fallos venían del reconocedor. Que fallen en las dos
vías significa que no son ruido de la medida: **el sintetizador pronuncia mal palabras
corrientes.**

Y eso es lo que desarma tu mitigación barata. Curar el conjunto de frases funciona si
los fallos se concentran en ortografía exótica: quitás *vegetables* y seguís
adelante. **No se puede curar un curso de inglés que no sabe decir *water* ni *book*.**

Lo digo con la incomodidad de que este resultado favorece mi propuesta original. Por
eso te doy los datos crudos de las dos vías en la evidencia, para que lo verifiques en
vez de creerme.

### Las 14, para que conste

Fallan `$25`, `vegetables`, `ginger`, `engine`, `island`, `salmon` y `chef`. Salen
limpias `temperature`, `nature`, `Wednesday`, `knife`, `pleasure`, `favorite` y
`through`.

En *chef* el oyente y el reconocedor discrepan: el ASR la entendió 3 de 3, la persona
solo distinguió la *f* final. La cuento como fallo porque **quien tiene que reconocer
el audio es un estudiante**, no el reconocedor; el ASR era un proxy objetivo, no el
destinatario. Queda anotado por si querés contarlo al revés: sin *chef* serían 6, que
sigue por encima del umbral.

## 3. Dos ajustes al protocolo que propongo

1. **Ampliar el control de 5 a 15 o 20 palabras.** Con cinco, que fallen dos da una
   tasa del 40 % y el margen de atribución es demasiado ancho para afinar nada. Con
   quince, la tasa de ruido del reconocedor se estima con una precisión utilizable.
2. **En la vía de escucha, preguntar "¿qué oíste?" en vez de "¿reconocerías esta
   palabra?".** Enseñarle la palabra al oyente antes de reproducir el audio induce la
   respuesta: uno oye lo que espera oír. Ya está implementado así: el oyente escribe
   lo que oye, y la comparación con el objetivo la hace la página después. Las
   palabras trampa y las de control van además mezcladas en orden aleatorio, para que
   el oyente no sepa cuáles "deberían" salir bien.

   Tu criterio binario y tu regla de desacuerdo se mantienen tal cual.

   Un detalle que hay que respetar y que no estaba en el protocolo: los dos oyentes
   tienen que escuchar **exactamente los mismos audios**. El sintetizador es
   estocástico, así que si cada uno genera los suyos estarían juzgando cosas
   distintas y sus desacuerdos no significarían nada. El panel permite descargarlos
   para eso.

## 4. Un hallazgo que sí es concluyente, y no depende de Kokoro

**El sintetizador no sabe decir cifras.** Con `$25`, el reconocedor no oyó un número
equivocado: no oyó **nada** donde iba la cifra, en las tres repeticiones ("sake is",
"sait as", "say this"). Es coherente con cómo funciona MMS-TTS, que va carácter a
carácter y nunca aprendió a convertir dígitos en palabras.

Para un tutor de conversación pega donde duele: precios, horas y fechas son contenido
básico de una clase de inglés. La mitigación es barata y no necesita aprobación de
nadie: **convertir números a letras antes de sintetizar** ("$25" → "twenty five
dollars"). Cabe entera en `src/ai/` y la hago pase lo que pase con Kokoro.

Esto además refuerza tu idea de curar las frases de práctica: hay que evitar cifras
escritas en dígitos hasta que la normalización esté puesta.

## 5. Lo que me pediste

### 5.1 Datos para la incidencia I-04

**Condición exacta**, en `createProgressAggregator.handle`
(`src/ai/model-cache/progress.ts`):

```ts
const known = files.get(event.file);
if (!known && event.loaded >= event.total) return;
```

Un archivo cuyo **primer** evento ya viene completo se descarta y no se registra; en
consecuencia su `done` posterior tampoco cuenta. Un archivo que se descarga de verdad
llega troceado, así que su primer evento siempre trae `loaded < total`. La regla no
depende de ningún tamaño umbral, solo de cómo llega el archivo.

**Números**, medidos con `Xenova/mms-tts-eng` fp32 (109 MB, un único archivo ONNX),
caché fría, a través del worker y el cliente reales:

- Antes: 1928 eventos de progreso recibidos → **1 reporte emitido**.
- Después: **1690 reportes graduales**.

El conteo de eventos varía entre corridas porque el troceado de la descarga varía; el
"1 reporte" no.

### 5.2 Peso real de la descarga inicial

Tu cifra de 388 se queda corta, y hay un problema de unidades detrás:

| Pieza | Bytes | MiB |
|---|---|---|
| ASR `whisper-tiny.en` q8 (7 archivos) | 42 985 755 | 41.0 |
| Gramática `t5-base-grammar-correction` q8 (6 archivos) | 252 557 916 | 240.9 |
| TTS `mms-tts-eng` fp32 (4 archivos) | 114 263 006 | 109.0 |
| **Modelos** | **409 806 677** | **390.8** |
| Runtime ONNX/WASM (`ort-wasm-simd-threaded.jsep.wasm`, servido desde la app) | ≈21 600 000 | 20.6 |
| **Total de la primera carga** | | **≈411** |

Dos advertencias para que no vuelvan a circular tres cifras:

- **Unidades.** 411 MiB son **431 MB decimales**. Los 21.6 MB que tenés anotados del
  WASM y mis 20.6 MiB **son el mismo archivo** contado de dos formas. Ahí nace media
  confusión. Elegí una convención y la pongo igual en los tres documentos.
- **Cómo se obtuvo.** El desglose del ASR está **verificado empíricamente**: leí la
  caché del navegador tras una descarga real y da 42 985 755 bytes exactos, los 7
  archivos. El del TTS también. El de gramática está calculado con el mismo método,
  que ya acertó dos veces, pero no lo he verificado leyendo la caché. Si querés el
  dato empírico puro, cargo el corrector una vez y te paso la tabla: son 240 MB de
  descarga y lo hago cuando digas.

### 5.3 Sobre el remuestreo

Verificado: `resample(input, fromRate, toRate)` existe en
`src/audio/dsp/resampler.ts:81` con esa firma, y `chooseResampleStrategy` /
`designAntiAliasFilter` resuelven la relación 3:2 y el filtrado. Tenías razón: no
escribo nada, lo importo si Kokoro llega a entrar.

## 6. Una cosa de coordinación, no técnica

Tu carril me pone S6-T2 (puntaje por palabra con las marcas de Whisper) como tarea
mía con Fabrizio. **El PR #58 de Fabrizio dice cerrar S6-T1 y S6-T2**, y por lo que
se lee ya usa los timestamps de Whisper para acotar cada palabra.

O bien la tarea ya está hecha y hay que sacarla de mi carril, o bien lo que hizo él
necesita algo mío y conviene decirlo explícitamente antes de que ninguno de los dos
repita trabajo. Voy a revisar su PR igualmente, porque hay un supuesto que solo se ve
desde mi lado: **la referencia del TTS no es reproducible entre sesiones**. Dentro de
una sesión la fijé con una caché, pero al recargar la página la misma frase se
sintetiza distinta. Si su calibración o sus pruebas asumen un audio de referencia
estable, ese supuesto se rompe.

---

## 7. Qué pido, entonces

Con 7 de 14 y con *water* y *book* cayendo, **sí pido abrir el `shared-change` de
Kokoro** — con tu condición intacta: **solo junto con la carga bajo demanda del TTS**,
nunca antes. Adoptarlo sin eso subiría la primera descarga a unos 604 MiB, que
contradice de frente el objetivo de S7-T4.

Dos matices honestos sobre esa petición:

1. **Falta el segundo oyente.** Si querés esperar a tenerlo antes de aprobar, me
   parece correcto y no bloquea nada: S5-T5 ya está entregado y funcionando.
2. **Kokoro no está medido, está leído.** De MMS-TTS tengo mediciones; de Kokoro tengo
   la ficha del modelo. Antes de fijarlo habría que pasarle exactamente este mismo
   banco de 14 + 5 palabras y comparar los conteos. Si no mejora, no vale los 216 MB
   por bonito que suene el nombre.

## Resumen

- Pido el `shared-change`, con tu condición de carga bajo demanda por delante.
- El 7 de 14 supera el umbral, pero lo decisivo es que fallan *water* y *book*: la
  salida de curar las frases ya no alcanza.
- Falta el segundo oyente para cerrarlo formalmente.
- Tu punto 1 del protocolo quedó invalidado con datos; lo sustituí por frase
  portadora y dejé el sesgo declarado.
- Propongo ampliar el control a 15-20 palabras y que la escucha sea a ciegas por
  transcripción, no por sí/no.
- El sintetizador no dice cifras: eso lo arreglo en mi módulo, sin depender de nada.
- Van los datos de I-04 y el peso real: son ~411 MiB, no 388, y hay un lío de
  unidades que conviene cerrar.
