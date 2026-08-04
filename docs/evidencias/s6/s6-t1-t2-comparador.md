# Evidencia S6-T1 y S6-T2 — Comparador acústico y puntaje de pronunciación

> Fabrizio Espinoza (DSP) · Semana 6 · Código en `src/audio/comparator/`
> Reproducible con `npx vitest run tests/audio/dtw.test.ts tests/audio/scorer.test.ts` (45 pruebas).

## 1. Qué resuelve

Implementa el contrato `PronunciationScorer`: recibe el análisis del usuario, el
de la referencia sintetizada por el TTS y los tiempos por palabra de Whisper, y
devuelve un puntaje de 0 a 100 para la frase y otro para cada palabra.

```
MFCC usuario ─┐
              ├─ normalización cepstral ─ DTW ─ costo medio ─ puntaje 0–100
MFCC TTS ─────┘                            │
                                           └─ costo por tramo ─ puntaje por palabra
```

## 2. S6-T1 · DTW

Dos personas nunca dicen la misma frase a la misma velocidad. Comparar trama a
trama mediría quién habla más rápido. DTW busca la correspondencia óptima entre
las dos líneas de tiempo:

$$D[i][j] = d(i,j) + \min\big( D[i-1][j],\; D[i][j-1],\; D[i-1][j-1] \big)$$

Los tres términos del mínimo son los tres movimientos posibles: el usuario
alargó, acortó, o van al mismo ritmo.

### Verificación

| Propiedad | Comprobación |
|---|---|
| Secuencias idénticas | Distancia 0, camino diagonal exacto |
| Condiciones de borde | El camino va de (0,0) al final de ambas |
| Monotonía y continuidad | El tiempo no retrocede y no se saltan tramas |
| Costo a mano | Caso pequeño verificado con lápiz |

### La propiedad que justifica DTW

| Comparación | Distancia normalizada |
|---|---:|
| Secuencia contra sí misma, 3× más lenta | **0.000** |
| La misma, con estiramientos irregulares | **0.000** |
| Comparando trama a trama sin alinear | **> 2** |
| Contra una secuencia realmente distinta | **> 2** |

DTW absorbe el cambio de velocidad por completo, pero sigue distinguiendo
contenido distinto.

### Banda de Sakoe–Chiba

Limita cuánto puede desviarse el alineamiento de la diagonal. Sin ella, DTW
deforma el tiempo lo que haga falta: con un pico en la posición 3 de una
secuencia y en la 7 de la otra, el costo baja a ~0 aunque eso signifique alinear
una sílaba con otra muy posterior. Con radio 1 el costo sube por encima de 5,
que es lo correcto.

El radio por defecto es el 15 % de la secuencia más larga, con mínimo de 10
tramas.

## 3. S6-T2 · Puntaje

### La decisión que definió la tarea: normalización cepstral

Al medir las primeras distancias apareció un problema que invalidaba el
evaluador. **Cambiar el tono costaba casi tanto como cambiar de vocal:**

| Comparación (sin normalizar) | Distancia |
|---|---:|
| Misma vocal, tono 120 → 180 Hz | 21.10 |
| Misma vocal, tono 120 → 220 Hz | 46.10 |
| /a/ vs /u/ (vocales distintas) | 36.49 |

Como **la referencia la genera un TTS, usuario y referencia son siempre voces
distintas**, el evaluador habría castigado a quien pronuncia bien por tener otra
voz. Medido sobre frases de tres vocales, las dos clases se solapaban:

| | Peor caso "bien pronunciado" | Mejor caso "mal pronunciado" | |
|---|---:|---:|---|
| **Sin CMN** | 39.39 | 11.66 | ❌ se solapan |
| **Con CMN** | 6.45 | 17.91 | ✅ separadas 2.8× |

Sin normalización, una pronunciación **correcta con otra voz** puntuaba **peor**
que una **equivocada con la misma voz**. Hay una prueba que documenta ese
solapamiento explícitamente.

La solución es la técnica estándar: restar a cada trama el promedio del
enunciado. Lo que distingue a dos hablantes que dicen lo mismo es sobre todo una
inclinación espectral constante —largo del tracto vocal, tono, micrófono—, y esa
componente constante *es* la media.

#### Un intento fallido, y por qué

La primera medición de CMN pareció desastrosa: aplicada a vocales sostenidas,
/a/ vs /i/ caía a 0.01, o sea que el evaluador dejaba de distinguir vocales.

La causa no era CMN sino la señal de prueba. **En un sonido sostenido la media
es la señal entera**, así que restarla deja casi cero. CMN sirve cuando el
enunciado contiene varios sonidos distintos, que es el caso de cualquier palabra
real. Repitiendo la medición con frases de tres vocales —el caso de uso— el
resultado se invierte por completo, como muestra la tabla de arriba.

Queda documentado en el código: **no aplicar CMN a sonidos sostenidos.**

### Curva distancia → puntaje

$$\text{puntaje} = 100 \cdot e^{-d/20}$$

Exponencial y no recta por dos razones: está acotada por construcción —nunca da
negativo ni pasa de 100, sin recortes artificiales— y su pendiente es mayor cerca
de cero, que es donde conviene distinguir. La diferencia entre una pronunciación
muy buena y una buena importa más que entre una mala y una peor.

La constante 20 está calibrada con las distancias medidas:

| Caso | Distancia | Puntaje |
|---|---:|---:|
| Idéntica, o solo distinto volumen | 0.00 | **100** |
| Mismo texto, otra voz (120→180 Hz) | 3.23 | **85** |
| Mismo texto, otra voz (120→220 Hz) | 6.45 | **72** |
| Texto distinto | 17.91 | **41** |
| Texto distinto y otra voz | 18.96 | **39** |

### Métrica de RF-10

El requisito es que el puntaje discrimine casos por más de 20 puntos.

| | Puntaje |
|---|---:|
| Peor caso bien pronunciado (otra voz muy distinta) | 72 |
| Mejor caso mal pronunciado (texto distinto, misma voz) | 41 |
| **Separación** | **31 puntos** ✅ |

### Puntaje por palabra

Para cada palabra se toman las tramas del usuario que caen en su intervalo según
Whisper y se promedia el costo local **solo de ese tramo** del camino de DTW. Una
palabra mal pronunciada no arrastra el puntaje de las demás: verificado con una
frase donde solo la vocal del medio es incorrecta.

Si un timestamp del ASR no cubre ninguna trama, la palabra recibe el puntaje
global en lugar de un cero — no se castiga al usuario por un dato raro del
reconocedor.

## 4. Invariancias verificadas

Las tres cosas que **no** deben afectar al puntaje:

| Qué cambia | Puntaje |
|---|---:|
| Nada (idéntica) | 100 |
| Volumen (+50 %) | > 95 |
| Velocidad (+50 % de duración) | > 90 |
| Voz (120 → 180 Hz) | > 70 |

Cada una viene de una decisión de una tarea anterior: el volumen lo neutralizan
la normalización RMS de S2-T2 y el descarte de c₀ de S5-T2; la velocidad, la DTW
de esta tarea; la voz, la normalización cepstral.

## 5. Archivos

| Archivo | Rol |
|---|---|
| `src/audio/comparator/dtw.ts` | Alineamiento temporal, banda de Sakoe–Chiba, costo por tramo |
| `src/audio/comparator/scorer.ts` | Contrato `PronunciationScorer`, curva de puntaje, mapeo de palabras a tramas |
| `src/audio/features/mfcc.ts` | `cepstralMeanNormalize` |
| `tests/audio/dtw.test.ts` | 18 pruebas |
| `tests/audio/scorer.test.ts` | 27 pruebas |

## 6. Limitaciones

**Las señales de prueba son sintéticas.** Las vocales se sintetizan con
formantes fijos, sin transiciones ni consonantes. Los valores absolutos de
distancia con voz real serán distintos, y la constante de escala podría
necesitar ajuste. Está anotado para S9-T3 (afinado del comparador con datos de
pruebas), que es donde el plan lo contempla.

**El puntaje por palabra depende de los timestamps de Whisper.** Si el
reconocedor sitúa mal una frontera, el tramo evaluado se corre. No es corregible
desde el módulo de audio; se mitiga con el criterio de no penalizar rangos vacíos.

**CMN necesita un enunciado con variedad fonética.** Sobre una palabra muy corta
—una sílaba— la media se parece demasiado al contenido y la normalización resta
información útil. Para frases completas, que es el caso de uso, no aplica.
