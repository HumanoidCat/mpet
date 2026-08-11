# Avance 2 — Sección de Procesamiento Digital de Señales

> # ⚠️ VERSIÓN SUPERADA — NO INTEGRAR ESTA
>
> **Integrar `avance-2-seccion-dsp-actualizado.md`.**
>
> La calibración con voz real (11 de agosto, S9-T3) contradijo tres
> afirmaciones de este documento: que la normalización cepstral resuelve la
> penalización por cambio de voz, que RF-10 se cumple con 31 puntos, y que la
> verificación contra librosa estaba pendiente.
>
> Este archivo se conserva **sin modificar** como registro de lo que se sabía al
> redactarlo. El contenido de abajo queda intacto a propósito.

> **Material preparado por Fabrizio Espinoza para integrar en `avance-2.md`.**
>
> No es el documento de la entrega: es el aporte del módulo de audio, redactado
> en el mismo registro que el Avance 1 y listo para insertar. Cada bloque indica
> a qué sección de la estructura obligatoria corresponde.
>
> Todas las cifras están medidas y son reproducibles con `npx vitest run tests/audio`.
> El desarrollo completo de cada una está en `docs/evidencias/`.

---

# → Para la sección 5 · Marco teórico

*(Continúa la numeración del Avance 1, que llegó hasta 5.5. El desarrollo
extenso con todas las ecuaciones está en `docs/09-marco-teorico.md`, secciones
4 a 7.)*

## 5.6 Transformada de tiempo corto

Una transformada única indica qué frecuencias contiene una señal, pero no en qué
instante. Para voz esa información es indispensable: dos palabras con los mismos
fonemas en distinto orden presentan espectros globales prácticamente idénticos.

La transformada de tiempo corto divide la señal en tramas solapadas y transforma
cada una por separado:

$$X[m, k] = \sum_{n=0}^{N-1} x[n + mH]\, w[n]\, e^{-j2\pi kn/N}$$

donde $m$ indexa la trama, $H$ es el salto entre tramas y $w[n]$ la ventana de
análisis. El resultado es una matriz tiempo–frecuencia: el espectrograma.

Los parámetros adoptados y su consecuencia:

| Parámetro | Valor | Consecuencia |
|---|---:|---|
| Tamaño de trama | 512 muestras | 32 ms de duración |
| Salto | 256 muestras | 50 % de solapamiento, 62.5 tramas por segundo |
| Resolución en frecuencia | 31.25 Hz | separación entre bins |
| Resolución temporal | 16 ms | intervalo entre tramas |

El producto de ambas resoluciones no puede reducirse arbitrariamente: constituye
el principio de incertidumbre aplicado a señales. Tramas largas favorecen la
resolución en frecuencia y degradan la temporal, y a la inversa. Los valores
adoptados permiten separar formantes y seguir simultáneamente la evolución de una
sílaba.

**Verificación.** Sobre un barrido lineal de 500 a 4 000 Hz de un segundo de
duración, cada trama del espectrograma coincide con la frecuencia instantánea en
su punto medio, dentro de dos bins.

## 5.7 Coeficientes cepstrales en escala mel

Son las características sobre las que opera la comparación de pronunciación. El
procedimiento encadena cuatro transformaciones, y cada una descarta
deliberadamente información que no debe influir en la comparación.

### Escala mel

La percepción de la frecuencia no es lineal: la diferencia entre 200 y 300 Hz
resulta claramente audible, mientras que 5 000 y 5 100 Hz son prácticamente
indistinguibles. La escala mel modela ese comportamiento:

$$m(f) = 2595 \log_{10}\left(1 + \frac{f}{700}\right)$$

Es aproximadamente lineal por debajo de 1 kHz y logarítmica por encima, que es
donde se concentra la información distintiva de las vocales. Se adoptó la
formulación de HTK, correspondiente al estándar de reconocimiento de voz.

### Banco de filtros triangulares

Se distribuyen 28 puntos equiespaciados **en mel** entre 0 Hz y el Nyquist, se
convierten a hercios y de ahí a índices de bin. Cada uno de los 26 filtros emplea
tres puntos consecutivos, ascendiendo del primero al segundo y descendiendo hasta
el tercero. La energía de cada banda es la suma ponderada del espectro de
potencia.

El efecto de la escala se aprecia en el ancho resultante de las bandas:

| Banda | Frecuencia central | Ancho |
|---|---:|---:|
| Primera | 68 Hz | 75 Hz |
| Última | 7 225 Hz | 706 Hz |

Esta agrupación reduce 257 bins a 26 valores y, sobre todo, **elimina los
armónicos individuales** —que dependen de la frecuencia fundamental del
hablante— conservando la envolvente espectral, que es la que define el fonema.

### Logaritmo y transformada del coseno

El logaritmo convierte productos en sumas. La señal de voz es la excitación
glotal filtrada por el tracto vocal, lo que en el dominio espectral constituye un
producto; al aplicar el logaritmo, ambos factores se separan en sumandos.
Adicionalmente, un cambio de volumen deja de ser un factor multiplicativo para
convertirse en un desplazamiento constante.

La transformada discreta del coseno de tipo II, en su formulación ortonormal,
descorrelaciona las bandas —que se solapan y presentan alta correlación mutua— y
concentra la información en los primeros coeficientes, de modo que trece de los
veintiséis resultan suficientes.

La normalización ortonormal **conserva la energía**, condición necesaria para que
la distancia entre dos vectores de coeficientes conserve el significado métrico
que tiene en el dominio original.

### Propiedad que justifica su empleo

Multiplicar la señal por un factor $g$ multiplica la potencia por $g^2$, lo que
añade $20\log_{10} g$ decibelios a todas las bandas por igual. La transformada
del coseno concentra cualquier componente constante en el coeficiente de orden
cero. En consecuencia:

$$c_0 \to c_0 + \sqrt{M}\cdot 20\log_{10}g, \qquad c_i \to c_i \quad (i > 0)$$

**Los coeficientes de orden uno en adelante son independientes del volumen.**
Verificado sobre un rango de ganancia de mil veces, la variación máxima es de
$3.8 \times 10^{-6}$, correspondiente a la precisión del tipo de dato empleado.
Es la propiedad que permite que la evaluación mida pronunciación y no intensidad.

## 5.8 Estimación de la frecuencia fundamental

### Punto de partida y su limitación

La autocorrelación mide la semejanza de una señal consigo misma desplazada:

$$r[\tau] = \sum_n x[n]\,x[n+\tau]$$

Una señal periódica de periodo $T$ presenta un máximo en $\tau = T$. El cálculo se
realiza mediante el teorema de Wiener–Khinchin, que reduce el costo a $O(N\log N)$.

El método alcanza una exactitud notable —error inferior a 0.01 Hz sobre tonos
puros— pero presenta un fallo estructural: la función también presenta máximos en
todos los múltiplos del periodo. Cuando la frecuencia fundamental resulta débil
frente a su primer armónico, situación frecuente en voz, el estimador responde el
doble de la frecuencia real. La circunstancia agravante es que su medida de
confianza no delata el error.

### El algoritmo YIN

Sustituye la semejanza por la **diferencia**:

$$d[\tau] = \sum_{j=0}^{W-1} \left( x[j] - x[j+\tau] \right)^2$$

y a continuación aplica el paso determinante, la normalización por la media
acumulada:

$$d'[\tau] = \frac{d[\tau]}{\frac{1}{\tau}\sum_{j=1}^{\tau} d[j]}$$

Cada desfase se compara contra el promedio de los anteriores. Al alcanzar el
doble del periodo, dicho promedio ya incorpora el mínimo profundo correspondiente
al periodo verdadero, de manera que los múltiplos dejan de competir en igualdad
de condiciones.

La estimación se completa seleccionando el **primer** desfase que desciende por
debajo de un umbral —no el mínimo absoluto, que volvería a favorecer a los
múltiplos— y refinando su posición mediante interpolación parabólica.

### Decisión de diseño: el valor del umbral

El artículo original propone un umbral de 0.1. En esta implementación se adoptó
**0.02**, y la diferencia se sustenta en medición.

Sobre el caso patológico —fundamental 6.7 veces más débil que su segundo
armónico— la normalización cumple su función: separa el valle correspondiente al
periodo verdadero (0.00000) del valle espurio del armónico (0.04369) por varios
órdenes de magnitud. La información necesaria está presente.

Lo que la desaprovechaba era el paso del umbral: con 0.1 el valle espurio también
califica y, por la regla de seleccionar el primero, resulta elegido. El artículo
presupone implícitamente que el submúltiplo no desciende bajo el umbral, supuesto
que deja de cumplirse cuando la fundamental es sustancialmente más débil que su
armónico.

La medición proporciona un margen amplio para situar el valor:

| Señal | $d'$ en el periodo verdadero |
|---|---:|
| Tonos puros y voz armónica (caso más desfavorable) | 7.75 × 10⁻⁴ |
| Tono con ruido de amplitud 0.2 | 0.0246 |
| **Valle espurio del armónico** | **0.0437** |

El valor adoptado queda veintiséis veces por encima del peor caso de señal limpia
y 2.2 veces por debajo del valle espurio.

## 5.9 Comparación mediante alineamiento temporal dinámico

### Fundamento

Dos hablantes nunca pronuncian una misma frase con idéntica cadencia. Una
comparación trama a trama mediría la velocidad de elocución en lugar de la
pronunciación.

El alineamiento temporal dinámico determina la correspondencia óptima entre ambas
líneas temporales mediante la recurrencia:

$$D[i,j] = d(i,j) + \min\big( D[i-1,j],\; D[i,j-1],\; D[i-1,j-1] \big)$$

Los tres términos del mínimo representan los tres movimientos admisibles: que el
hablante haya alargado, acortado o mantenido el ritmo de la referencia. El camino
de costo mínimo constituye el alineamiento, y su costo medio la medida de
semejanza.

De la propia recurrencia se derivan tres propiedades del camino: se extiende entre
los extremos de ambas secuencias, es monótono —el tiempo no retrocede— y es
continuo —no se omiten tramas—. La normalización por la longitud del camino hace
comparables frases de distinta duración.

Se aplica adicionalmente la restricción de Sakoe–Chiba, que limita la desviación
respecto de la diagonal. Sin ella el algoritmo puede deformar el tiempo
arbitrariamente y alinear una sílaba con otra muy posterior si con ello reduce el
costo.

### Normalización cepstral: una necesidad, no una mejora

La referencia de comparación la genera un sintetizador de voz. En consecuencia,
usuario y referencia corresponden **siempre** a hablantes distintos, y esta
circunstancia resultó determinante.

Las primeras mediciones revelaron que un cambio de frecuencia fundamental costaba
casi tanto como un cambio de vocal: 46.10 frente a 36.49 unidades de distancia.
El evaluador habría penalizado una pronunciación correcta por proceder de una voz
distinta a la de la referencia.

Sobre frases de tres vocales, las dos clases resultaban **indistinguibles**:

| | Peor caso bien pronunciado | Mejor caso mal pronunciado |
|---|---:|---:|
| **Sin normalización cepstral** | 39.39 | 11.66 — **las clases se solapan** |
| **Con normalización cepstral** | 6.45 | 17.91 — separadas por un factor de 2.8 |

Sin la normalización, una pronunciación **correcta emitida por otra voz**
obtenía peor puntuación que una **incorrecta emitida por la misma voz**.

La técnica consiste en sustraer de cada trama el promedio del enunciado. Lo que
diferencia a dos hablantes que pronuncian lo mismo es fundamentalmente una
inclinación espectral constante a lo largo de la emisión —longitud del tracto
vocal, frecuencia fundamental, respuesta del micrófono—, y esa componente
constante es precisamente la media.

### Del costo a la puntuación

$$P = 100 \cdot e^{-\bar{D}/20}$$

Se adoptó una curva exponencial en lugar de una relación lineal por dos motivos:
está acotada por construcción, sin necesidad de recortes artificiales, y presenta
mayor pendiente en las proximidades del cero, que es donde interesa discriminar.

---

# → Para la sección 7 · Etapa de desarrollo y verificación

## 7.x Resultados del módulo de procesamiento de señales

Durante este período el módulo completó la cadena de análisis y la comparación
acústica. La cadena operativa es:

```
captura → remuestreo → preprocesamiento → detección de voz →
análisis espectral → frecuencia fundamental → coeficientes cepstrales →
alineamiento temporal → puntuación
```

Con ello los dos contratos que el módulo debe proveer —`AudioEngine` y
`PronunciationScorer`— disponen de implementación real, y los campos que la
integración declaraba pendientes quedaron cubiertos.

### Mediciones frente a los criterios del plan

| Requisito | Criterio | Resultado medido |
|---|---|---|
| RF-08 · Frecuencia fundamental | Error < 3 Hz | **0.115 Hz** ✅ |
| RF-09 · Coeficientes cepstrales | Error < 5 % frente a referencia | Validado contra la definición de cada etapa; contraste con librosa pendiente |
| RF-10 · Puntuación de pronunciación | Discriminación > 20 puntos | **31 puntos** ✅ |

### Invariancias verificadas de la puntuación

Tres factores que no deben influir en la evaluación, cada uno neutralizado por
una etapa distinta de la cadena:

| Factor que varía | Puntuación | Etapa responsable |
|---|---:|---|
| Ninguno (señal idéntica) | 100 | — |
| Volumen (+50 %) | > 95 | Normalización por valor eficaz y descarte del coeficiente cero |
| Velocidad (+50 % de duración) | > 90 | Alineamiento temporal dinámico |
| Voz del hablante (120 → 180 Hz) | > 70 | Normalización cepstral |

### Costo computacional

El análisis en tiempo real consume **2.14 % de un núcleo**. El procesamiento de
una frase de tres segundos requiere aproximadamente 67 milisegundos frente a un
presupuesto de 2 000 milisegundos por turno conversacional, es decir, un 3.3 %.

| Etapa | Milisegundos por segundo de audio |
|---|---:|
| Frecuencia fundamental | 10.70 |
| Remuestreo | 4.83 |
| Coeficientes cepstrales | 3.04 |
| Análisis espectral | 2.41 |
| Preprocesamiento y detección de voz | 0.38 |
| **Total** | **21.37** |

El comparador acústico se ejecuta una vez por turno y requiere 2.45 milisegundos
para frases de tres segundos.

**Se concluye que el procesamiento de señales no constituye el factor limitante
de la latencia**, que corresponde a la inferencia de los modelos.

### Optimizaciones aplicadas

Dado que el módulo no limita la latencia, la optimización se dirigió a los dos
casos donde existía desperdicio identificable, no a los más costosos en términos
absolutos.

| Optimización | Fundamento | Mejora medida |
|---|---|---|
| Reutilización de los planes de transformada | Se reconstruía la tabla de factores de giro en cada trama, 62.5 veces por segundo | **29.7 %** en la estimación de frecuencia fundamental |
| Decimación polifásica | Se filtraban 1 024 muestras por bloque para conservar 341: dos de cada tres productos se calculaban para descartarse | **3.00×**, coincidente con el factor de decimación |

La segunda optimización no altera la señal de salida en ninguna muestra; la
verificación consiste en que las dieciséis pruebas de remuestreo preexistentes
continúan superándose sin modificación alguna.

### Estrategia de verificación

La totalidad de las pruebas del módulo emplea señales generadas por
procedimiento —senoides, barridos, ruido determinista y vocales sintéticas con
formantes controlados— de parámetros conocidos. Ninguna requiere micrófono,
grabaciones ni intervención manual, y todas se ejecutan en la integración
continua.

La validación se organiza en cuatro niveles, en orden de solidez decreciente:

1. **Casos de solución analítica cerrada.** Señales cuya transformada se deduce
   sobre el papel: una senoide centrada en un bin debe producir magnitud $N/2$
   exacta; un impulso, espectro plano; una señal constante, toda la energía en el
   primer coeficiente.
2. **La definición como referencia.** La transformada discreta directa, la
   autocorrelación directa y la función de diferencia directa se implementan
   dentro de las propias pruebas y se contrastan contra las versiones optimizadas.
3. **Propiedades estructurales.** Linealidad, conservación de la energía
   (Parseval), reversibilidad y simetría conjugada.
4. **Señales sintéticas de parámetros conocidos**, para filtros, detección de voz
   y comparador.

Esta estrategia responde a una decisión registrada en la bitácora: contrastar una
implementación contra otra biblioteca demuestra únicamente que ambas coinciden,
mientras que contrastarla contra resultados deducibles de la teoría demuestra que
es correcta.

**Cobertura resultante: 284 pruebas del módulo**, sobre un total de 335 en el
proyecto.

### Incidencias del período

| Incidencia | Resolución |
|---|---|
| La detección de voz por energía clasificaba como habla cualquier ruido estacionario, a cualquier nivel | Se incorporó un criterio de periodicidad: el ruido de banda ancha presenta 0 % de tramas con frecuencia fundamental detectable frente al 49 % de la voz real |
| El comparador penalizaba la diferencia de voz casi tanto como la diferencia de fonema | Normalización cepstral por media, que separa las clases por un factor de 2.8 |
| La interpolación parabólica presentaba el signo invertido en la determinación del vértice | Corregido; el error máximo desciende de 4.315 Hz a 0.008 Hz |
| La selección del máximo absoluto de la autocorrelación producía errores de sub-armónico | Se selecciona el primer máximo local que alcanza el 90 % del máximo global |
| El espectro emitido por la integración presentaba un déficit de amplitud del 20 % | Diagnosticado desde el módulo de audio y corregido por integración: el tamaño de bloque del worklet no divide en tramas de análisis, y se rellenaba con ceros un tercio de cada trama |

## 7.y Limitaciones declaradas

Se documentan explícitamente por corresponder a decisiones conscientes y no a
omisiones:

**Un tono puro sostenido dentro de la banda de voz** supera el criterio de
periodicidad, dado que efectivamente es periódico. Distinguirlo de una vocal
sostenida requeriría analizar la estructura de formantes. El caso que motivó la
mejora —ruido de banda ancha ambiental— queda resuelto.

**La invariancia al volumen de los coeficientes cepstrales se degrada** cuando
alguna banda alcanza el valor mínimo que evita el logaritmo de cero, situación que
se presenta con señales de banda limitada o de nivel muy reducido.

**El costo del alineamiento temporal crece con el cuadrado de la duración**, y la
memoria constituye el límite antes que el tiempo: una comparación de treinta
segundos requiere 28 MB. Para el uso conversacional previsto no representa un
problema.

**La calibración de las constantes se realizó con señales sintéticas.** Los
valores absolutos de distancia con voz real diferirán, y la constante de escala de
la puntuación podría requerir ajuste. Corresponde a la tarea de afinado
programada con datos de prueba reales.

---

# → Para el Anexo B · Evidencias experimentales

Documentos nuevos de este período, todos con procedimiento reproducible:

- `docs/evidencias/s4/s4-t4-pitch-autocorrelacion.md` — Estimación de frecuencia fundamental por autocorrelación: exactitud, errores encontrados y limitaciones que motivan el algoritmo definitivo.
- `docs/evidencias/s5/s5-t1-yin.md` — Algoritmo YIN: exactitud, resolución del error de octava y calibración del umbral.
- `docs/evidencias/s5/s5-t2-mfcc.md` — Coeficientes cepstrales: escala mel, banco de filtros, transformada del coseno e invariancia al volumen.
- `docs/evidencias/s6/s6-t1-t2-comparador.md` — Comparador acústico: alineamiento temporal, normalización cepstral y calibración de la puntuación.
- `docs/evidencias/s7/s7-t4-latencia-dsp.md` — Costo computacional por etapa y optimizaciones aplicadas.
- `docs/evidencias/s8/s8-t2-t3-casos-limite.md` — Casos límite: ruido ambiental, frases largas, silencios y cobertura de pruebas.

El desarrollo teórico completo, con todas las ecuaciones, se encuentra en
`docs/09-marco-teorico.md`, secciones 4 a 7.

---

# Notas para la coordinación

1. **Numeración.** Las secciones del marco teórico se numeraron como 5.6 a 5.9
   suponiendo que el Avance 2 continúa la numeración del Avance 1, que llegó
   hasta 5.5. Ajustar si la estructura cambia.

2. **La sección 7 lleva letras en lugar de números** porque se desconoce cuántas
   subsecciones tendrá el apartado en el documento final.

3. **Verificación cruzada de los coeficientes cepstrales.** La métrica de RF-09
   es "error < 5 % frente a librosa" y esa comparación no se ha ejecutado. El
   generador del fixture está preparado y el asunto queda registrado como
   incidencia abierta. Se ha redactado como pendiente y no como cumplido.

4. **Duplicación con el marco teórico.** Las secciones 5.6 a 5.9 resumen lo que
   `docs/09-marco-teorico.md` desarrolla en extenso. Si se prefiere evitar la
   repetición, pueden reducirse a un párrafo por tema con remisión al documento,
   aunque conviene que el documento de entrega sea autocontenido.
