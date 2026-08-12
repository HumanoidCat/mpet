# Evidencia S9-T3 — Calibración del comparador con voz real

> Fabrizio Espinoza (DSP) · Riesgo **R03**
> Reproducible con `npx vitest run tests/audio/calibracion.test.ts` (requiere las
> grabaciones en `tests/audio/fixtures/`, que no se versionan).

## Resumen

Cuarenta grabaciones de **dos hablantes** que cumplen el protocolo. El resultado
depende por completo de contra qué se compare, y esa es la conclusión:

| Escenario | Detecta el error |
|---|---|
| Referencia de la **misma voz** del usuario | **9 de 10** frases |
| Referencia de **otra voz** — como en la aplicación | **6 de 10** frases |

Comparando contra la propia voz el comparador funciona en el sentido correcto,
aunque con poco margen: 2.4 a 10.6 puntos contra los 20 que exige RF-10.

Comparando contra otra voz —que es lo que la aplicación hace, porque la
referencia la sintetiza el TTS— **el puntaje deja de ser confiable**. Δ va de −3.0
a +11.0: en cuatro de diez casos la pronunciación incorrecta puntúa mejor que la
correcta.

**RF-10 no se cumple y el riesgo R03 se confirma.**

Revisando la integración aparece además una **segunda causa, independiente**
(§6): la referencia contra la que se puntúa es el sintetizador diciendo *lo que
el reconocedor entendió*, no la pronunciación correcta. Con eso el puntaje no
puede detectar una palabra mal dicha por construcción, porque la referencia se
adapta al error.

Y con ella, la primera vía prometedora: **el reconocedor sí distingue los pares
mínimos en el texto** —6 de 10, con 4 falsas alarmas— y esa señal es
independiente del hablante. No alcanza sola, pero es la única de las nueve vías
probadas que ataca el problema por fuera del parecido acústico.

Esto corrige la medición anterior, que daba 1.9 puntos y ni siquiera acertaba el
sentido. Aquella se hizo con grabaciones que traían varias emisiones por archivo;
el problema era el material, como se sospechaba.

## 1. Las grabaciones

Cuarenta archivos, dos hablantes (`fabrizio` y `evelyn`), cinco frases × cuatro
versiones (`ok`, `ok2`, `mal`, `rapido`), grabados con la página de captura del
protocolo.

| | Valor |
|---|---|
| Formato | PCM 16 bits, mono, 16 kHz — sin compresión |
| Duración | 1.28 a 3.07 s, incluido medio segundo de silencio a cada lado |
| Emisiones por archivo | **1**, verificado al grabar |

Un control que da confianza en el material: la versión `rapido` salió más corta
que la `ok` en las **cinco** frases de cada hablante, sin excepción. Las
versiones se grabaron como el protocolo pedía.

## 2. Contra la propia voz: mide bien, pero por poco

Comparando a velocidad normal, dentro de cada frase y con el mismo hablante:

| Frase | Par mínimo | fabrizio: repetir → mal | Δ | evelyn: repetir → mal | Δ |
|---|---|---|---:|---|---:|
| 1 | ship / sheep | 12.9 → 13.8 | 2.4 | 12.3 → 15.6 | 8.2 |
| 2 | bad / bed | 12.0 → 14.1 | 5.5 | 13.0 → 13.8 | 2.0 |
| 3 | sit / seat | 14.0 → 15.6 | 3.9 | 13.2 → 14.2 | 2.6 |
| 4 | live / leave | 12.6 → 16.6 | 9.6 | 14.6 → 14.0 | **−1.3** |
| 5 | pull / pool | 12.5 → 16.9 | 10.6 | 12.5 → 15.2 | 6.9 |

**Nueve de diez separan.** Decir la vocal equivocada aleja más que volver a decir
la frase bien, salvo en *live/leave* de la segunda hablante.

Pero el margen es del orden del 10 % de la distancia, y al pasar por la curva de
puntaje se traduce en 2 a 11 puntos, no en 20.

Ninguna frase es difícil para las dos voces: *live/leave* es la mejor de un
hablante y la única que falla en la otra. Con dos hablantes no se puede
distinguir si eso es propiedad del par mínimo o de cómo lo pronunció cada
persona.

## 3. Tres hallazgos de la medición

### 3.1 Medir agrupando las cinco frases fabrica un solapamiento que no existe

La versión anterior de la prueba metía los treinta pares en dos distribuciones,
una de correctos y otra de incorrectos, y concluía que se solapaban. **Eso era un
error de método.**

Cada frase tiene su propio nivel de distancia base, porque depende de cuántos
fonemas tiene y de cuáles. Repetir la frase 3 da 14.0, y decir mal la frase 1 da
13.8: agrupadas, el error de una frase queda por debajo del acierto de otra, y
las clases parecen mezcladas. Pero **la aplicación nunca compara la frase 1 con
la 3**: siempre enfrenta lo que dijo el usuario contra la referencia de esa misma
frase.

Medido dentro de la frase, que es como se usa, la separación aparece.

### 3.2 El recorte por voz estorba, y se sabe por qué

Las grabaciones ya vienen recortadas con medio segundo parejo a cada lado.
Aplicarles encima el recorte por voz no quita silencio: quita **cantidades
distintas en cada archivo**. En la frase 1 se ve entero:

| Archivo | Dura | Tras el recorte |
|---|---:|---:|
| `ok` | 2.05 s | **2.02 s — no recortó nada** |
| `ok2` | 2.56 s | 1.74 s |
| `mal` | 2.82 s | 1.70 s |

Dos tomas de la misma frase quedan con contenidos distintos, y esa diferencia es
mayor que la de la vocal que se busca.

**El mecanismo.** La fracción de tramas sonoras de estas grabaciones cae entre
0.11 y 0.41, y la puerta está en 0.10. Varios segmentos quedan a un punto
porcentual del umbral, así que aceptarlos o rechazarlos pasa a depender del
ruido de la medición y no del contenido.

| | Frases que separan |
|---|---:|
| Sin recortar | **5 de 5** |
| Con el recorte por voz | 4 de 5 |

Esto **no es un problema del comparador sino del detector de voz**, y sí importa
en producción: ahí la referencia viene del sintetizador, limpia y sin silencio, y
la del usuario viene del micrófono con silencio alrededor. El recorte hace falta,
pero con este umbral es demasiado frágil. Queda anotado como trabajo pendiente.

### 3.3 El límite lo pone la velocidad, no la pronunciación

Al incluir la toma `rapido` entre las correctas, una frase deja de separar:

| Frase 2 (*bad/bed*) | Distancia |
|---|---:|
| Repetir la frase | 12.0 |
| **Decirla rápido** | **15.2** |
| Decirla mal | 14.1 |

Hablar deprisa aleja **más** que pronunciar mal. Con eso, ningún umbral puede
distinguir las dos cosas en esa frase.

Y no es un defecto del alineamiento. Se comprobó: quitar la banda de
Sakoe–Chiba deja la distancia idéntica en 14 de 15 pares, así que el
alineamiento no está forzado. Lo que pasa es acústico — al hablar rápido las
vocales se reducen y el espectro cambia de verdad, y eso el alineamiento
temporal no lo puede deshacer porque no es un problema de tiempo.

| | Frases que separan |
|---|---:|
| A velocidad normal | **9 de 10** |
| Incluyendo la toma rápida | 4 de 10 |

Es una limitación real del enfoque, no un error de implementación, y conviene
declararla: **el sistema tolera la velocidad solo hasta cierto punto.**

## 4. La vía que pide RF-10: puntuar por palabra

El puntaje de la frase **diluye un error de un fonema por construcción**.
Promedia el costo de todo el alineamiento, y en una frase de cinco palabras la
vocal equivocada son unas pocas tramas de un centenar. Que el margen quede en el
10 % no es casualidad: es aproximadamente la fracción de la frase que cambió.

Por eso RF-10 no pide solo un puntaje global sino **también uno por palabra**, con
las marcas de tiempo del reconocedor. Eso ya está implementado en
`frameRangeForWord` y `segmentCost` (S6-T2), pero las marcas vienen del módulo de
Isaac y aquí no las hay.

Se aproximó tomando el tramo del alineamiento donde el costo es mayor: si el
único error introducido es la vocal del par mínimo, ese tramo debería caer sobre
ella. La ventana es de 100 ms, la duración típica de una vocal acentuada.

| Frase | Repetir | Decirla mal | Margen |
|---|---:|---:|---:|
| 1 ship/sheep | 19.6 | 32.0 | +12.4 |
| 2 bad/bed | 15.9 | 22.7 | +6.8 |
| 3 sit/seat | 19.9 | 26.1 | +6.3 |
| 4 live/leave | 15.6 | 31.8 | +16.1 |
| 5 pull/pool | 17.7 | 31.9 | +14.3 |

**Separan las cinco, y los márgenes se triplican.** En puntaje:

| Escala | Δ peor frase | Δ mediana |
|---:|---:|---:|
| 20 (actual) | 9.9 | **17.3** |
| 25 | 10.0 | 17.8 |
| 30 | 9.7 | 17.6 |

La mediana llega a 17.8 y la peor frase a 10.0. Sigue sin alcanzar los 20 en el
peor caso, pero **confirma la dirección**: la discriminación vive en la palabra,
no en el promedio de la frase. Medir por palabra con las marcas reales del
reconocedor es lo que puede cerrar la brecha.

La escala se deja en **20**. El barrido muestra que el óptimo está en 25 y que la
mejora es de una décima de punto, que no justifica tocar una constante ya
documentada.

## 5. El riesgo R03, medido: cambiar de voz pesa más que pronunciar mal

Con las dos voces se puede por fin hacer la pregunta que define el riesgo:

> ¿Está más lejos decir la frase **bien con otra voz** que decirla **mal con la
> propia**?

| | Distancia mediana | Puntaje |
|---|---:|---:|
| Bien pronunciada, misma voz | 13.04 | 52 |
| **Bien pronunciada, otra voz** | **20.12** | **37** |
| Mal pronunciada, misma voz | 14.24 | 49 |

**Sí, y en las cinco frases.** Cambiar de voz cuesta **+7.08** de distancia;
pronunciar mal cuesta **+1.20**. Casi seis veces más. Una persona que pronuncia
perfecto pero con otra voz saca 37, y una que se equivoca de vocal con la voz de
referencia saca 49.

### Pero eso todavía no decide

En la aplicación la referencia es **fija** —siempre la que sintetiza el TTS— así
que ese desplazamiento afecta por igual a la toma buena y a la mala, y en
principio podría cancelarse. Lo que importa es si, con una referencia de otra
voz, el error sigue quedando más lejos que el acierto.

Medido usando la toma buena de cada hablante como referencia del otro:

| Usuario | Referencia | Detecta el error |
|---|---|---:|
| evelyn | fabrizio | 2 de 5 |
| fabrizio | evelyn | 4 de 5 |
| | **Total** | **6 de 10** |

**No se cancela.** Contra la propia voz detecta 9 de 10; contra otra voz, 6 de
10, y el Δ de puntaje va de **−3.0 a +11.0**. En cuatro de diez casos la
pronunciación incorrecta puntúa mejor que la correcta.

Seis de diez, con dos clases, está cerca de lo que daría tirar una moneda.

### Se intentó arreglarlo, y no alcanza

La normalización cepstral por media (CMN) está puesta justamente para quitar la
huella del hablante. Se probaron variantes más agresivas:

| Variante | Bien, misma voz | Bien, otra voz | Mal, misma voz | Margen del error |
|---|---:|---:|---:|---:|
| CMN desde c₁ (actual) | 12.67 | 20.59 | 14.65 | 1.98 |
| CMN desde c₃ | 11.13 | 17.51 | 12.16 | 1.03 |
| CMVN desde c₁ | 2.52 | 3.44 | 2.55 | **0.03** |
| CMVN desde c₃ | 2.38 | 3.23 | 2.41 | 0.02 |

Ninguna sirve. Descartar más coeficientes bajos reduce algo la penalización por
voz, pero **reduce todavía más la señal del error**. Y normalizar también la
varianza (CMVN) comprime todas las distancias a la cuarta parte y borra la
diferencia entre bien y mal: margen 0.03 contra 1.98.

En las cuatro variantes, cambiar de voz sigue pesando más que pronunciar mal en
las cinco frases.

### La medición que lo explica del todo

La frase anterior —"dos personas distintas diciendo lo mismo se parecen menos que
una persona diciendo dos cosas distintas"— no es una figura retórica. Está
medida:

| | Misma frase | Otra frase | **Contraste fonético** |
|---|---:|---:|---:|
| Misma voz | 12.86 | 21.11 | **8.25** |
| Otra voz | 20.12 | 23.59 | **3.47** |

Decir la frase **correcta con otra voz** (20.12) queda tan lejos como decir **una
frase completamente distinta con la propia** (21.11). El cambio de hablante
consume casi todo el rango disponible.

Lo que queda para distinguir pronunciación es el contraste: **8.25 dentro de la
misma voz, 3.47 entre voces**. Se reduce al 42 %. Y como una vocal es alrededor
del 15 % del contenido fonético de la frase, el error a detectar vale ~1.2
puntos con la misma voz —que es exactamente lo medido— y ~0.5 entre voces, por
debajo de la variación entre dos tomas de la misma persona.

**No hay señal que rescatar en ese régimen.** No es cuestión de afinar una
constante.

### Ocho vías probadas para cumplir RF-10

Antes de declararlo no alcanzable se buscó activamente una configuración que
cumpliera. Cada fila se midió sobre las 40 grabaciones.

| Vía | Idea | Resultado |
|---|---|---|
| Escala del puntaje | Barrido de 10 a 60 | El óptimo está en 15–25 y mueve décimas |
| Estadístico localizado | Peor ventana de 50, 100 y 200 ms en vez del promedio | **Ayuda con la misma voz** (mediana 5.9 → 14.3); entre voces, nada |
| Coeficientes delta | Añadir las derivadas temporales, que dependen menos del hablante | Con la misma voz, mediana 15.4 (el mejor); entre voces, nada |
| CMN desde c₂ y c₃ | Descartar más coeficientes bajos, que cargan la huella del hablante | Baja la penalización por voz, pero **baja más la señal del error** |
| CMVN | Normalizar también la varianza | Comprime todo a la cuarta parte y **borra el error**: margen 0.03 contra 1.98 |
| **VTLN** | Escalar el eje de frecuencias del banco mel por un factor α por hablante, estimado con una frase de calibración | α = 0.92 y 1.10, direcciones plausibles, pero la distancia solo baja de 17.0 a 16.9. **La diferencia entre voces no es un escalado uniforme** |
| **Doble referencia** | Comparar contra la versión correcta *y* la incorrecta sintetizadas con la misma voz, y decidir por cuál está más cerca. El desplazamiento por voz debería cancelarse | 13 de 20 aciertos, Δ 1.2 puntos. **No se cancela**, porque el alineamiento no es lineal |
| Sin recorte por voz | Quitar la fuente de variación del detector | Sube de 4 a 5 de 5 con la misma voz; entre voces, nada |

**La mejor configuración encontrada** —deltas más peor ventana de 100 ms, escala
25— detecta el error en **10 de 10** frases con la misma voz y sube la mediana
del Δ de 5.9 a **15.4**. Sigue sin llegar a 20 en el peor caso, y **no mejora el
escenario real** entre voces.

Por eso no se cambia la implementación: sería añadir complejidad para mejorar una
métrica que no es la que decide.

### Por qué era esperable

Comparar MFCC crudos con alineamiento temporal mide **parecido acústico**. El
largo del tracto vocal escala las frecuencias de los formantes, y eso vive en los
mismos coeficientes que distinguen una vocal de otra: no hay forma de quitar uno
sin quitar el otro, y las seis normalizaciones probadas lo confirman.

Los sistemas que sí puntúan pronunciación de forma independiente del hablante no
comparan contra una grabación: comparan contra un **modelo acústico de fonemas**
entrenado con miles de voces, y puntúan con la probabilidad de que lo dicho
corresponda al fonema esperado. Eso requiere entrenamiento y está fuera del
alcance del curso.

No es un defecto de la implementación —verificada contra librosa con 0.009 % de
error— sino el límite del método elegido.

## 6. Una segunda causa, en la integración

Todo lo anterior mide el comparador suponiendo que la referencia es la
pronunciación **correcta** de la frase. Revisando cómo lo llama el orquestador,
resulta que no lo es. En `src/core/orchestrator.ts`:

```ts
const referencePcm = await ai.speak(transcription.text);
```

**La referencia es el sintetizador diciendo lo que el reconocedor entendió**, no
una frase objetivo. Si el usuario dice *sheep* donde iba *ship*, el reconocedor
transcribe *sheep*, el sintetizador dice *sheep*, y el usuario se compara contra
su propio error.

**El puntaje no puede detectar una palabra mal dicha, por construcción.** Lo que
mide es cuánto se parece la voz del usuario a la del sintetizador diciendo *sus
mismas palabras*: acento y timbre. Eso concuerda exactamente con lo medido en §5
—que el puntaje está dominado por la identidad del hablante— y le da una segunda
explicación, independiente.

No es un defecto del módulo de audio: el contrato `PronunciationScorer` recibe la
referencia ya elegida. Es una decisión de integración que hay que revisar con el
equipo.

### El reconocedor sí distingue los pares mínimos, en parte

Esto abre una vía que se había descartado demasiado rápido. En §5 se concluyó que
puntuar pronunciación de forma independiente del hablante requiere un modelo
acústico de fonemas entrenado con miles de voces. **El proyecto ya tiene uno:
Whisper.** Si se compara la *transcripción* contra una frase objetivo, el error
se detecta en el texto y la identidad del hablante deja de importar.

Se midió sobre las 40 grabaciones con `Xenova/whisper-tiny.en`, el modelo que usa
el proyecto:

| Grabación | Debía decir | Whisper oyó | |
|---|---|---|---|
| fabrizio 1 ok | ship | "I need a new ship." | ✅ |
| fabrizio 1 mal | sheep | "I need a new **sheep**" | ✅ detecta |
| fabrizio 2 ok | bad day | "She had a bad **date**." | ⚠️ falsa alarma |
| fabrizio 2 mal | bed | "She had a **bit** day." | ✅ detecta |
| fabrizio 3 ok | sit | "Please, sit down here." | ✅ |
| fabrizio 3 mal | seat | "Please, **sit** down here." | ❌ no detecta |
| fabrizio 4 ok | live | "He will **leave** there." | ⚠️ falsa alarma |
| fabrizio 4 mal | leave | "He will leave there" | ❌ no distingue |
| fabrizio 5 ok | pull | "Can you pull it?" | ✅ |
| fabrizio 5 mal | pool | "Can you **pull it**?" | ❌ no detecta |
| evelyn 1 ok | ship | "I need a new **chip**" | ⚠️ falsa alarma |
| evelyn 1 mal | sheep | "I need a new **sheep**" | ✅ detecta |
| evelyn 2 ok | bad day | "She had a bad day." | ✅ |
| evelyn 2 mal | bed | "She had a **bit late**." | ✅ detecta |
| evelyn 3 ok | sit | "Please sit down here." | ✅ |
| evelyn 3 mal | seat | "Please **see it** down here." | ✅ detecta |
| evelyn 4 ok | live | "He will **leave** there." | ⚠️ falsa alarma |
| evelyn 4 mal | leave | "He will leave there." | ❌ no distingue |
| evelyn 5 ok | pull | "Can you pull it?" | ✅ |
| evelyn 5 mal | pool | "Can you **bo-eat**?" | ✅ detecta |

| | Resultado |
|---|---:|
| Errores detectados en el texto | **6 de 10** |
| Falsas alarmas sobre tomas correctas | 4 de 10 |

No alcanza sola, pero es una señal **independiente de la acústica** y del
hablante, y las dos se pueden combinar. Sobre todo: es la única de las nueve vías
probadas que ataca el problema por fuera del parecido acústico.

### Un límite del conjunto de pruebas que conviene declarar

En la frase 4 (*live/leave*), Whisper oyó **"leave" en las cuatro grabaciones** —
las buenas y las malas, de los dos hablantes.

Un modelo entrenado con miles de voces oyendo la misma palabra en las dos
versiones sugiere que **en esas tomas no se produjo el contraste**. *Live/leave*
es de los pares más difíciles para hispanohablantes. Y era justamente la frase
que fallaba acústicamente con la segunda hablante.

Lo mismo puede pasar en `fabrizio 3 mal` y `fabrizio 5 mal`, donde Whisper oyó la
versión correcta.

Esto **no cambia la conclusión sobre RF-10** —el efecto del hablante está medido
aparte, con las tomas correctas de las dos personas, y ahí no hay ambigüedad—
pero sí acota cómo leer el 6 de 10 acústico: parte de los fallos pueden ser tomas
donde el error no estaba en el audio. Cerrarlo requiere verificar
perceptualmente que cada toma `mal` contiene el sonido equivocado.

### Reproducirlo

El reconocedor no se corre en la suite: cargar el modelo tarda y depende de red
la primera vez. Se hizo una vez fuera del repositorio con
`@huggingface/transformers`, que ya es dependencia del proyecto, alimentando el
PCM de cada WAV al *pipeline* `automatic-speech-recognition`. Es el mismo
procedimiento acordado para el fixture de librosa (**D-07**): se corre una vez y
se versiona el resultado, no la dependencia.

## 7. Estado de RF-10

**No se cumple, y se buscó activamente que se cumpliera** (§5, ocho vías).

| Escenario | Δ medido | Exigido |
|---|---|---:|
| Referencia de la misma voz, configuración actual | 2.4 a 10.6 por frase | 20 |
| Referencia de la misma voz, mejor configuración hallada | peor 0.7, **mediana 15.4** | 20 |
| **Referencia de otra voz — el caso real** | **−3.0 a +11.0** | 20 |

La métrica de 31 puntos que figuraba en la matriz de trazabilidad se obtuvo con
**señales sintéticas de tres vocales sostenidas**, comparando cada voz contra sí
misma y con el fonema cambiado ocupando un tercio de la señal en vez de una
décima parte. Ese número describe el algoritmo en su caso más favorable, no sobre
habla.

## 8. Estado del riesgo R03

**Confirmado y materializado.** El riesgo decía que el puntaje podía no
correlacionar con la percepción real. La medición muestra que:

- Contra la propia voz **sí correlaciona**, en 9 de 10 frases, con poco margen.
- Contra otra voz **no correlaciona de forma confiable**: 6 de 10, y en cuatro
  casos el orden se invierte.
- La causa está identificada y **no se resuelve con los ajustes disponibles**.

Corresponde aplicar la mitigación que el propio riesgo preveía: **presentar el
puntaje como retroalimentación educativa relativa y no como veredicto**, y
declarar la limitación en el documento de la entrega. Concretamente, tiene
sentido que la interfaz muestre la evolución del usuario contra sus propias
tomas anteriores —donde el comparador sí es fiable— antes que un número absoluto
contra la referencia sintetizada.

## 9. Qué falta

En orden de lo que más mueve la aguja:

1. **Revisar contra qué se puntúa** (§6). Hoy la referencia es el sintetizador
   diciendo lo que el reconocedor entendió, así que un error de palabra es
   invisible por construcción. Es lo primero, porque hasta que no se resuelva
   ninguna mejora del comparador puede notarse. Toca el orquestador: decisión
   con Alejandro.
2. **Un modo práctica con frase objetivo.** Es lo que habilita detectar el error
   en el texto, comparando la transcripción contra la frase que se pidió repetir.
   Hoy la aplicación es conversación libre, así que no hay contra qué comparar
   —de ahí que el diseño terminara sintetizando la transcripción—. Toca
   orquestador e interfaz.
3. **Combinar las dos señales**: la textual del reconocedor (6 de 10,
   independiente del hablante) con la acústica (informativa contra la propia voz).
   Ninguna alcanza sola.
4. **Decidir cómo se presenta el puntaje.** Es decisión de producto y afecta a la
   interfaz (RF-17) y al documento final.
5. **Puntuar por palabra con las marcas del reconocedor**, en vez de aproximarlo
   con la peor ventana. Sube el Δ de 5.5 a 17.3 de mediana contra la propia voz.
   Tarea conjunta con Isaac.
6. **Arreglar la fragilidad del recorte por voz**: la fracción de tramas sonoras
   queda entre 0.11 y 0.41 con la puerta en 0.10, demasiado al filo. Es del
   módulo de audio y se puede hacer aparte.
7. **Verificar perceptualmente las tomas `mal`**, sobre todo las de *live/leave*,
   donde hay indicios de que el contraste no se produjo.

## 10. Archivos

| Archivo | Rol |
|---|---|
| `tests/audio/calibracion.test.ts` | Toda la medición de esta evidencia |
| `tests/audio/fixtures/README.md` | Protocolo de grabación |
| `src/audio/comparator/scorer.ts` | Escala del puntaje, sin cambios |
