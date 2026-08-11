# Evidencia S9-T3 — Calibración del comparador con voz real

> Fabrizio Espinoza (DSP) · Riesgo **R03**
> Reproducible con `npx vitest run tests/audio/calibracion.test.ts` (requiere las
> grabaciones en `tests/audio/fixtures/`, que no se versionan).

## Resumen

Con veinte grabaciones de voz real que cumplen el protocolo, **el comparador sí
distingue una pronunciación incorrecta de una correcta: acierta el sentido en las
cinco frases.** Lo que no alcanza es el margen.

| | Resultado |
|---|---|
| Frases donde el error queda más lejos que repetir la frase | **5 de 5** |
| Δ de puntaje entre bien y mal, por frase | 2.4 a 10.6 puntos (mediana 5.5) |
| Δ midiendo localizado, como pide RF-10 | 6.3 a 16.1 puntos (mediana **17.3**) |
| **Exigido por RF-10** | **20 puntos** |

O sea: la dirección es correcta y consistente, pero la magnitud se queda a
mitad de camino. **RF-10 no se cumple con voz real.**

Esto corrige la medición anterior, que daba 1.9 puntos y ni siquiera acertaba el
sentido. Aquella se hizo con grabaciones que traían varias emisiones por archivo;
el problema era el material, como se sospechaba.

## 1. Las grabaciones

Veinte archivos de un hablante: cinco frases × cuatro versiones (`ok`, `ok2`,
`mal`, `rapido`), grabados con la página de captura del protocolo.

| | Valor |
|---|---|
| Formato | PCM 16 bits, mono, 16 kHz — sin compresión |
| Duración | 1.28 a 2.82 s, incluido medio segundo de silencio a cada lado |
| Emisiones por archivo | **1**, verificado al grabar |

Un control que da confianza en el material: la versión `rapido` salió más corta
que la `ok` en las **cinco** frases, sin excepción. Las versiones se grabaron
como el protocolo pedía.

## 2. Resultado principal: mide bien, pero por poco

Comparando a velocidad normal, dentro de cada frase:

| Frase | Par mínimo | Repetir la frase | Decirla mal | Margen | Δ puntaje |
|---|---|---:|---:|---:|---:|
| 1 | ship / sheep | 12.9 | 13.8 | +0.9 | 2.4 |
| 2 | bad / bed | 12.0 | 14.1 | +2.1 | 5.5 |
| 3 | sit / seat | 14.0 | 15.6 | +1.6 | 3.9 |
| 4 | live / leave | 12.6 | 16.6 | +4.0 | 9.6 |
| 5 | pull / pool | 12.5 | 16.9 | +4.4 | 10.6 |

**Las cinco separan.** Decir la vocal equivocada siempre aleja más que volver a
decir la frase bien. Eso es lo que el comparador tiene que hacer, y lo hace.

Pero el margen es del orden del 10 % de la distancia, y al pasar por la curva de
puntaje se traduce en 2 a 11 puntos, no en 20.

Las frases 4 y 5 —*live/leave* y *pull/pool*— son las que mejor separan. Son
también las que más cambian la duración de la vocal, que es lo que los MFCC
capturan con más claridad.

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
| A velocidad normal | **5 de 5** |
| Incluyendo la toma rápida | 4 de 5 |

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

## 5. Estado de RF-10

**No se cumple con voz real.** Δ medido entre 2.4 y 10.6 puntos por frase, o hasta
17.8 de mediana midiendo localizado, contra los 20 exigidos.

La métrica de 31 puntos que figuraba en la matriz de trazabilidad se obtuvo con
**señales sintéticas de tres vocales sostenidas**, donde el fonema cambiado es un
tercio de la señal en vez de una décima parte. Ese número describe el
comportamiento del algoritmo sobre su caso más favorable, no sobre habla.

## 6. Estado del riesgo R03

**Abierto, pero acotado.** El riesgo decía que el puntaje podía no correlacionar
con la percepción real. La medición muestra que **sí correlaciona en el sentido
correcto, de forma consistente en las cinco frases**, y que el problema es de
magnitud, no de dirección.

Dos límites quedan declarados:

- El puntaje global de la frase no puede alcanzar 20 puntos de separación para un
  error de un solo fonema, por dilución.
- Hablar rápido penaliza tanto como pronunciar mal en la frase más difícil de las
  cinco.

Falta lo que esta tanda no pudo medir: **un segundo hablante**. Toda la evidencia
es de una sola voz, así que la parte del riesgo que dice "comparar contra una voz
distinta puede castigar la pronunciación correcta" sigue sin comprobarse.

## 7. Qué falta

1. **Un segundo hablante**, idealmente con tono más agudo. Es lo único que mide
   la tolerancia entre voces, que es el centro de R03.
2. **Puntuar por palabra con las marcas del reconocedor**, en vez de aproximarlo
   con la peor ventana. Es tarea conjunta con Isaac.
3. **Arreglar la fragilidad del recorte por voz**: la fracción de tramas sonoras
   queda demasiado cerca del umbral en voz real.

## 8. Archivos

| Archivo | Rol |
|---|---|
| `tests/audio/calibracion.test.ts` | Toda la medición de esta evidencia |
| `tests/audio/fixtures/README.md` | Protocolo de grabación |
| `src/audio/comparator/scorer.ts` | Escala del puntaje, sin cambios |
