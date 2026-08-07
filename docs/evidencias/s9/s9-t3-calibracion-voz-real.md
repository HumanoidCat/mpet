# Evidencia S9-T3 — Primera calibración con voz real

> Fabrizio Espinoza (DSP) · Riesgo **R03**
> Reproducible con `npx vitest run tests/audio/calibracion.test.ts` (requiere las
> grabaciones en `tests/audio/fixtures/`).

## Resumen

Se grabaron las primeras muestras de voz real y se pasaron por la cadena
completa. **Dos resultados, uno bueno y uno malo:**

- ✅ **La detección de habla se calibró y ahora funciona con voz real.** Con los
  umbrales anteriores, dos de las cuatro grabaciones no detectaban nada.
- ❌ **El comparador no discrimina con estas grabaciones.** La separación entre
  pronunciación correcta e incorrecta es de **1.9 puntos**, cuando el requisito
  RF-10 exige 20 y las señales sintéticas daban 31.

El segundo resultado **no está explicado todavía**. Hay evidencia de que el
problema puede estar en las grabaciones y no en el comparador, pero no alcanza
para afirmarlo.

## 1. Las grabaciones

Cuatro archivos de un solo hablante, frase 1, versiones `ok`, `ok2`, `mal` y
`rapido`. Grabados a 48 kHz mono, convertidos desde MP3.

| Archivo | Duración | Pico | Segmentos de habla |
|---|---:|---:|---:|
| `ok` | 13.25 s | 0.082 | 5 |
| `ok2` | 9.89 s | 0.071 | 5 |
| `mal` | 14.45 s | 0.075 | 7 |
| `rapido` | 6.89 s | 0.085 | 3 |

**Dos observaciones sobre el material:**

- El nivel es bajo: pico de 0.08, unos −42 dBFS. No impide el análisis —la
  normalización lo compensa— pero deja menos margen.
- Cada archivo contiene **varios tramos de habla** para una frase de cinco
  palabras que dura unos 1.5 s. Son varias tomas por archivo, o una frase con
  pausas que el detector separa.

## 2. Lo que sí quedó calibrado: la detección de habla

Con los umbrales fijados sobre señales sintéticas, **dos de los cuatro archivos
no detectaban ni un segundo de habla**. El detector de energía sí encontraba
tramos, pero el filtro de periodicidad los rechazaba todos.

### La causa

El umbral de periodicidad se había puesto en 20 % porque la voz sintética daba
49 % de tramas sonoras. **La voz real daba entre 2 % y 26 %.**

A su vez, ese porcentaje bajo venía del umbral de YIN, fijado en 0.02 para que el
*valor* del tono fuera correcto. Sobre voz real ese umbral es demasiado estricto:
en un tramo hablado solo el 27 % de las tramas obtenía tono.

### La solución: dos umbrales distintos para dos decisiones distintas

| Decisión | Qué necesita | Umbral |
|---|---|---|
| ¿Hay periodicidad? | No perder voz real | **0.15** (flojo) |
| ¿Qué frecuencia es? | No equivocarse de octava | **0.02** (estricto) |

Aflojar el umbral **solo** para la decisión de sonoridad no tiene costo, y eso es
lo que lo justifica:

| Señal | Tramas sonoras, umbral 0.02 → 0.30 |
|---|---|
| Ruido de banda ancha (amplitud 0.05 a 0.5) | **0 % en todos los umbrales** |
| Silencio | **0 % en todos** |
| Voz real, tramo hablado | 27 % → 61 % |

El error de octava sí reaparece por encima de 0.1, pero en la decisión de
sonoridad **solo se cuentan tramas, no se usan sus frecuencias**: que una trama
reporte 200 Hz en vez de 100 no cambia que sea sonora. El estimador de tono
conserva su umbral estricto.

También se bajó la fracción mínima de tramas sonoras de 20 % a 10 %, con el mismo
argumento: la voz real da entre 14 % y 85 % por segmento y el silencio da 0 %.

### Resultado

| Archivo | Antes | Ahora |
|---|---:|---:|
| `ok` | 1.92 s | 6.16 s |
| `ok2` | **0.00 s** | 5.34 s |
| `mal` | 1.25 s | 8.26 s |
| `rapido` | **0.00 s** | 4.69 s |

### Tono medido en voz real

| | Valor |
|---|---|
| Rango detectado | 91 – 400 Hz |
| Mediana | 118 Hz |
| En un tramo hablado continuo | 120 – 131 Hz, estable |

Un fundamental masculino típico, y estable dentro de cada tramo: confirma que
YIN engancha periodicidad real y no ruido. El rango configurado (60–400 Hz) es
adecuado.

## 3. Lo que NO funcionó: el comparador

| | Distancia |
|---|---|
| Pares correctos (`ok`, `ok2`, `rapido` entre sí) | 25.38 – 28.21 |
| Pares incorrectos (con `mal`) | 29.75 – 33.06 |
| **Factor de separación** | **1.05** |

| Escala del puntaje | Δ entre bien y mal |
|---:|---:|
| 10 | 0.8 |
| 20 (actual) | 1.8 |
| 30 | 1.9 |
| 60 | 1.6 |

**Ninguna escala alcanza los 20 puntos que exige RF-10.** El máximo posible con
estos datos es 1.9.

### Qué se descartó

**No es que el comparador esté roto.** Las distancias de referencia son sanas:

| Comparación | Distancia |
|---|---:|
| Una toma contra sí misma | **0.00** |
| La misma toma desfasada 10 ms | 8.71 |
| Dos tramos de silencio entre sí | 0.00 |

**No es el promediado de varias tomas por archivo.** Se repitió la medición
extrayendo los 20 tramos de habla individuales y comparándolos de a pares: el
resultado empeora. Correctos con mediana 47.99, incorrectos con mediana 49.45, y
38 de 91 pares incorrectos caen por debajo de la mediana de los correctos.

**No es ruido de fondo.** El silencio de los archivos es digitalmente nulo.

### El dato que orienta la investigación

> **Dos tomas de la misma versión, del mismo hablante y la misma sesión, dan
> distancia 57.13** — más que la mediana de los pares "correcto contra
> incorrecto", que es 49.45.

Si dos repeticiones de la misma frase quedan tan lejos como dos frases
distintas, el comparador no tiene con qué discriminar. Y como una toma contra sí
misma da exactamente cero, el problema no está en la implementación.

La hipótesis más probable es que **los tramos comparados no contienen el mismo
contenido**: el detector separa por pausas, y un tramo puede quedarse con parte
de la frase mientras otro se queda con otra parte. Comparar "I need" contra
"a new ship" daría exactamente este resultado.

**No se pudo verificar**, porque requiere escuchar las grabaciones y confirmar
qué dice cada tramo.

## 4. Qué hace falta para cerrar S9-T3

Grabaciones con **una sola emisión de la frase por archivo**, recortadas, como
especifica `tests/audio/fixtures/README.md`. Con eso la comparación enfrenta
contenidos equivalentes y la medición pasa a ser interpretable.

Si con material limpio la separación sigue siendo insuficiente, entonces sí es
un problema del comparador, y las vías a explorar serían el número de
coeficientes, la ponderación de las bandas o el paso a una distancia distinta de
la euclídea.

## 5. Estado del riesgo R03

**Abierto, y con evidencia de que es real.** El riesgo decía que comparar voz
humana contra voz sintetizada podía castigar la pronunciación correcta. La
medición no lo confirma ni lo descarta —falta material adecuado— pero sí muestra
que **el puntaje no discrimina con las primeras grabaciones reales**, mientras
que con señales sintéticas daba 31 puntos de separación.

Hasta cerrarlo, la métrica de RF-10 debe leerse como **verificada solo sobre
señales sintéticas**.

## 6. Archivos

| Archivo | Rol |
|---|---|
| `src/audio/features/voiceDetection.ts` | Umbrales recalibrados con voz real |
| `tests/audio/calibracion.test.ts` | Mide las distribuciones y propone la escala |
| `tests/audio/fixtures/README.md` | Protocolo de grabación |
