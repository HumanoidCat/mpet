# Evidencia S5-T1 — YIN: detección de frecuencia fundamental

> Fabrizio Espinoza (DSP) · Semana 5 · Código en `src/audio/features/yin.ts`
> Reproducible con `npx vitest run tests/audio/yin.test.ts` (36 pruebas).
> Referencia: de Cheveigné & Kawahara (2002), *YIN, a fundamental frequency
> estimator for speech and music*, JASA 111(4).

## 1. Qué problema resuelve

El spike de S4-T4 dejó medido qué hay que arreglar. La autocorrelación simple
estima tonos puros con 0.008 Hz de error —muy por debajo del objetivo de 3 Hz—
pero **falla de octava** cuando la fundamental es débil frente a su primer
armónico: para una voz de 100 Hz responde 200 Hz. Y lo grave es que su medida de
confianza (0.96) no delata el error.

YIN no se necesita por precisión. Se necesita por ese caso, que en voz real es
frecuente.

## 2. Los cuatro pasos

| Paso | Qué hace | Para qué |
|---|---|---|
| 1 · Función de diferencia | $d[\tau] = \sum_j (x[j] - x[j+\tau])^2$ | Buscar mínimos en vez de máximos evita el sesgo hacia desfases cortos que tiene la autocorrelación cuando la amplitud varía dentro del frame |
| 2 · Normalización acumulada | $d'[\tau] = d[\tau] \big/ \left[\frac{1}{\tau}\sum_{j\le\tau} d[j]\right]$ | **El paso decisivo.** Cada desfase se compara contra el promedio de los anteriores, de modo que un múltiplo del periodo deje de competir de igual a igual |
| 3 · Umbral absoluto | Tomar el **primer** mínimo bajo el umbral | Evita el error de sub-armónico: quedarse con el mínimo global elegiría un múltiplo |
| 4 · Interpolación parabólica | Vértice del mínimo | Precisión sub-muestra |

### Cálculo por FFT

La función de diferencia se calcula desarrollando el cuadrado:

$$d[\tau] = \sum_j x[j]^2 + \sum_j x[j+\tau]^2 - 2\sum_j x[j]\,x[j+\tau]$$

Los dos primeros términos salen de sumas acumuladas de cuadrados (coste lineal)
y el tercero es una correlación cruzada, que la FFT resuelve en O(N log N). El
cálculo directo costaría unas 262 000 operaciones por trama frente a unas 20 000.

La versión rápida se valida contra la definición literal implementada en el
propio test, con error relativo por debajo de 10⁻⁹ — la misma estrategia usada
con la FFT en S3-T1 y con la autocorrelación en S4-T4.

## 3. Exactitud medida

Tonos puros, frames de 2048 muestras:

| f₀ (Hz) | Estimado | Error |
|---:|---:|---:|
| 70 | 70.000 | 0.000 |
| 100 | 100.002 | +0.002 |
| 137 | 137.004 | +0.004 |
| 175 | 175.005 | +0.005 |
| 200 | 200.015 | +0.015 |
| 250 | 250.030 | +0.030 |
| 300 | 300.037 | +0.037 |
| 350 | 350.059 | +0.059 |
| 390 | 390.115 | +0.115 |

**Peor error: 0.115 Hz**, veintiséis veces por debajo del objetivo de 3 Hz que
fija el plan. El error crece con la frecuencia porque el periodo se mide en
menos muestras: a 390 Hz son 41 muestras y una fracción de muestra pesa más.

## 4. El resultado que justifica la tarea

Voz sintética de 100 Hz con el segundo armónico 6.7 veces más fuerte que la
fundamental:

| Método | Estimación | ¿Correcto? |
|---|---:|---|
| Autocorrelación (S4-T4) | 200.14 Hz | ❌ una octava arriba |
| YIN con el umbral del artículo (0.1) | 200.20 Hz | ❌ una octava arriba |
| **YIN con el umbral del proyecto (0.02)** | **100.00 Hz** | ✅ |

Y sin regresiones en el resto de los casos:

| Caso | Autocorrelación | YIN 0.1 | YIN 0.02 |
|---|---|---|---|
| Voz normal (1 · 0.5 · 0.25), f₀ = 120 | 120.00 ✅ | 120.00 ✅ | 120.00 ✅ |
| Muchos armónicos, f₀ = 150 | 150.00 ✅ | 150.00 ✅ | 150.00 ✅ |
| Fundamental ausente, f₀ = 100 | 100.00 ✅ | 100.00 ✅ | 100.00 ✅ |
| **Fundamental débil, f₀ = 100** | 200.14 ❌ | 200.20 ❌ | **100.00 ✅** |

## 5. Por qué el umbral es 0.02 y no el 0.1 del artículo

Es la decisión de diseño de esta tarea, y conviene ser preciso sobre qué la
motiva, porque la respuesta no es la que parecía al principio.

**La normalización por media acumulada sí hace su trabajo.** Medida sobre la
señal patológica:

```
d'[80]  = 0.04369   ← el armónico: un periodo FALSO
d'[160] = 0.00000   ← el periodo verdadero
```

Los separa por varios órdenes de magnitud. La información está.

**Lo que perdía la estimación era el paso del umbral.** Con 0.1, el valle falso
(0.044) también queda por debajo, y como la regla del artículo es quedarse con
el *primero* que cruce, ganaba el armónico. El artículo asume implícitamente que
el submúltiplo no baja del umbral — supuesto que deja de cumplirse cuando la
fundamental es mucho más débil que su armónico.

Medido sobre las señales de prueba hay un hueco amplio donde ubicar el umbral:

| Señal | d' en el periodo verdadero |
|---|---:|
| Tonos puros y voz con armónicos (peor caso) | 7.75 × 10⁻⁴ |
| Tono con ruido de amplitud 0.2 | 0.0246 |
| **Valle falso del armónico** | **0.0437** |

0.02 queda **26 veces por encima** del peor caso limpio —así que no rechaza voz
legítima— y **2.2 veces por debajo** del valle falso, que queda descartado.

### Un intento descartado

Antes de llegar al umbral se probó una corrección de octava: examinar los
múltiplos del desfase elegido y preferir uno si explicaba la señal mucho mejor.
**Arreglaba el caso patológico pero rompía los tonos puros**: 175 Hz pasaba a
87.5 y 300 Hz a 100. La causa es que con periodos no enteros —175 Hz son 91.43
muestras— el desfase doble a veces se alinea mejor con la rejilla discreta y da
un mínimo más profundo, de modo que reintroducía el error de sub-armónico que el
spike ya había resuelto. Se descartó: el umbral resuelve lo mismo sin heurística
y sin apartarse del artículo.

## 6. El costo: tolerancia al ruido

Bajar el umbral tiene un precio, y está medido. Tono de 200 Hz con ruido blanco
de amplitud creciente:

| Ruido | YIN 0.02 (proyecto) | YIN 0.1 (artículo) |
|---:|---|---|
| 0.00 | 200.01 Hz, confianza 1.000 | 200.01 Hz |
| 0.10 | 200.06 Hz, confianza 0.994 | 200.06 Hz |
| 0.15 | 200.11 Hz, confianza 0.986 | 200.11 Hz |
| 0.20 | **sordo** | 200.16 Hz |
| 0.30 | **sordo** | 200.26 Hz |

El umbral del proyecto declara sordo a partir de ruido 0.20 (unos 15 dB de
relación señal/ruido); el del artículo aguanta hasta 0.30.

**El intercambio es deliberado:** se prefiere marcar sordo un frame ruidoso
antes que devolver una octava equivocada con confianza alta. Un frame sordo se
descarta del contorno; una octava equivocada contamina el puntaje de
pronunciación de la Semana 6 sin dejar rastro.

⚠️ La calibración se hizo con señales sintéticas. Con voz real grabada el valor
puede necesitar ajuste, y queda anotado para S8-T2 (edge cases).

## 7. La confianza ahora sí es útil

En el método por autocorrelación la confianza era la altura de un pico, y valía
0.96 tanto acertando como equivocándose de octava. En YIN es 1 − d'[τ], es decir
**aperiodicidad medida**, y baja de verdad cuando la estimación se degrada:
1.000 sin ruido, 0.994 con ruido 0.10, 0.986 con 0.15, y sordo a partir de ahí.

Eso permite que el comparador de la Semana 6 pondere cada frame según su
fiabilidad en lugar de tratarlos todos igual.

## 8. Archivos

| Archivo | Rol |
|---|---|
| `src/audio/features/yin.ts` | Función de diferencia, normalización acumulada, umbral absoluto, estimador y contorno |
| `src/audio/features/autocorrelation.ts` | Correlación cruzada por FFT e interpolación parabólica, reutilizadas de S4-T4 |
| `tests/audio/yin.test.ts` | 36 pruebas |

## 9. Pendiente

- **S5-T2:** MFCC, que completa el otro campo vacío de `AudioFrame`.
- **Integración:** el adaptador `src/core/audioEngineAdapter.ts` declara
  `pitchHz: null` a la espera de esta tarea. Conectarlo corresponde a
  integración (Alejandro), y `detectPitchYin` respeta la firma que espera el
  contrato: devuelve `null` en los frames sordos.
