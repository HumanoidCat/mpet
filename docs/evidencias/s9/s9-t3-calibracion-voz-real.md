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

### Por qué era esperable

Comparar MFCC crudos con alineamiento temporal mide **parecido acústico**, y dos
personas distintas diciendo lo mismo se parecen menos acústicamente que una
persona diciendo dos cosas distintas. El largo del tracto vocal cambia las
frecuencias de los formantes, y eso vive en los mismos coeficientes que
distinguen una vocal de otra.

Los sistemas que sí puntúan pronunciación de forma independiente del hablante no
comparan contra una grabación: comparan contra un **modelo acústico de fonemas**,
entrenado con muchos hablantes. Eso está fuera del alcance del curso, y no es un
defecto de la implementación: es el límite del método elegido.

## 6. Estado de RF-10

**No se cumple.**

| Escenario | Δ medido | Exigido |
|---|---|---:|
| Referencia de la misma voz | 2.4 a 10.6 por frase | 20 |
| Referencia de la misma voz, midiendo por palabra | hasta 17.8 de mediana | 20 |
| **Referencia de otra voz — el caso real** | **−3.0 a +11.0** | 20 |

La métrica de 31 puntos que figuraba en la matriz de trazabilidad se obtuvo con
**señales sintéticas de tres vocales sostenidas**, comparando cada voz contra sí
misma y con el fonema cambiado ocupando un tercio de la señal en vez de una
décima parte. Ese número describe el algoritmo en su caso más favorable, no sobre
habla.

## 7. Estado del riesgo R03

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

## 8. Qué falta

1. **Decidir con el equipo cómo se presenta el puntaje**, a la luz de esto. Es
   una decisión de producto, no de DSP, y afecta a la interfaz (RF-17) y al
   documento final.
2. **Puntuar por palabra con las marcas del reconocedor**, en vez de aproximarlo
   con la peor ventana. Sube el Δ de 5.5 a 17.3 de mediana contra la propia voz.
   Tarea conjunta con Isaac.
3. **Arreglar la fragilidad del recorte por voz**: la fracción de tramas sonoras
   queda entre 0.11 y 0.41 con la puerta en 0.10, demasiado al filo.

## 9. Archivos

| Archivo | Rol |
|---|---|
| `tests/audio/calibracion.test.ts` | Toda la medición de esta evidencia |
| `tests/audio/fixtures/README.md` | Protocolo de grabación |
| `src/audio/comparator/scorer.ts` | Escala del puntaje, sin cambios |
