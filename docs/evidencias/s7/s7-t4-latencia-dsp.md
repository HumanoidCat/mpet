# Evidencia S7-T4 — Latencia del análisis DSP

> Fabrizio Espinoza (DSP) · Semana 7 · Parte de audio de S7-T4 (la de modelos es de Isaac)
> Optimizaciones en `src/audio/dsp/fft.ts` y `resampler.ts`.

## 1. Nota sobre el método de medición

Los tiempos absolutos varían bastante entre corridas según la carga de la
máquina: la misma etapa puede medir 0.107 ms en una corrida y 0.171 ms en otra.
Por eso **las mejoras se midieron con comparaciones A/B intercaladas** —ocho
rondas alternando las dos versiones dentro del mismo proceso—, de modo que la
carga afecte por igual a ambas. Los porcentajes de mejora son fiables; los
valores absolutos son órdenes de magnitud, no cifras exactas.

## 2. Reparto del costo por etapa

Medido sobre el pipeline en vivo, por segundo de audio procesado:

| Etapa | ms/s de audio | % de un núcleo |
|---|---:|---:|
| YIN (tono) | 10.70 | 1.07 |
| Remuestreo 48→16 kHz | 4.83 | 0.48 |
| MFCC | 3.04 | 0.30 |
| STFT | 2.41 | 0.24 |
| Preprocesamiento | 0.32 | 0.03 |
| Energía / VAD | 0.06 | 0.01 |
| **Total en vivo** | **21.37** | **2.14** |

El comparador no corre por trama sino una vez por turno: **2.45 ms** para
alinear dos frases de 3 segundos (186 × 186 tramas).

### Conclusión del reparto

**El DSP no es el cuello de botella.** Analizar una frase de 3 segundos cuesta
unos 64 ms en vivo más 2.5 ms de comparador: **67 ms contra un presupuesto de
2000 ms por turno**, o sea el 3.3 %. El resto lo consumen los modelos de IA,
cuya latencia está medida en el documento del Avance 1 (~1.5 s de inferencia).

Eso condicionó qué se optimizó: se atacaron los dos casos donde había
**desperdicio identificable**, no los más lentos en absoluto.

## 3. Optimización 1 — Caché de planes de FFT

**El desperdicio.** Construir un `Fft` calcula la tabla de factores de giro y
los índices de inversión de bits. Ambos dependen solo del tamaño, pero
`autocorrelationFft` y la función de diferencia de YIN creaban un plan nuevo
**en cada trama** para tirarlo enseguida: 62.5 veces por segundo.

**La medida** (8 rondas intercaladas, tamaño 1024, que es el que usa YIN):

| | Costo |
|---|---:|
| `new Fft(1024)` | 0.04548 ms |
| `getFft(1024)` | 0.00004 ms |
| Ahorro por trama | **0.04543 ms** |

**Efecto sobre YIN:**

| | ms/trama | ms/s de audio |
|---|---:|---:|
| Antes | 0.1530 | 9.57 |
| Después | 0.1076 | 6.73 |
| **Mejora** | **29.7 %** | |

Compartir el plan es seguro porque no guarda estado: `forward` e `inverse`
trabajan sobre los arreglos que reciben y solo leen las tablas. Hay una prueba
que verifica que el plan cacheado da resultados idénticos a uno recién creado, y
otra que usarlo dos veces seguidas no arrastra estado.

## 4. Optimización 2 — Decimación polifásica

**El desperdicio.** El camino original filtraba el bloque completo con el FIR de
127 coeficientes y después se quedaba con una de cada tres muestras. Es decir,
**dos de cada tres salidas del filtro se calculaban para tirarlas**.

| | Productos por bloque de 1024 |
|---|---:|
| Filtrar todo y decimar | 1024 × 127 = 130 048 |
| Polifásico | 341 × 127 = 43 307 |

**La medida** (8 rondas intercaladas):

| | ms/bloque | ms/s de audio |
|---|---:|---:|
| Filtrar y decimar | 0.1862 | 8.73 |
| Polifásico | 0.0621 | 2.91 |
| **Mejora** | **3.00×** | **66.7 % menos** |

La mejora coincide **exactamente** con el factor de decimación, que es lo que
predice la teoría: se evalúa la misma convolución en un tercio de los puntos.

Es la razón por la que en procesamiento multitasa nunca se filtra y se decima
como dos pasos separados.

### La optimización no cambia la salida

El decimador emite en las mismas posiciones que el camino genérico, así que el
resultado es idéntico muestra a muestra. La verificación son **las 16 pruebas de
remuestreo que ya existían y siguen pasando sin ningún cambio**, incluida la del
anti-aliasing y la de independencia del tamaño de bloque. Se agregó además una
prueba que compara el camino polifásico contra filtrar-y-decimar explícito.

### Un error encontrado al implementarla

La primera versión guardaba `taps − 1` muestras de historia, igual que el filtro
FIR genérico. Producía `NaN`.

La causa: la fase de lectura puede quedar en −1 al terminar un bloque, y la
salida en esa posición necesita la entrada desde −1 hasta −`taps`, o sea
`taps` muestras. El camino genérico no lo sufría porque en ese caso usaba `prev`
—la última muestra ya filtrada del bloque anterior— en lugar de recalcular. La
versión polifásica trabaja sobre la entrada sin filtrar, así que necesita una
muestra más de historia.

Lo encontró la prueba de independencia del tamaño de bloque, que ya existía
desde S2-T1.

## 5. Lo que se identificó y NO se hizo

**Reducir el número de coeficientes del FIR.** Bajar de 127 a 63 taps
reduciría el costo del remuestreo a la mitad, pero ensancharía la banda de
transición y degradaría la atenuación en el Nyquist destino (hoy −44.6 dB). No
se hizo porque el remuestreo ya está en 0.48 % de un núcleo: se estaría
cambiando calidad de señal medible por un ahorro que nadie percibe.

**Mover el DSP a un worker.** Sacaría el análisis del hilo principal, pero el
hilo principal no está saturado —2.14 % de un núcleo— y añadiría complejidad de
sincronización. Tiene sentido reevaluarlo si el visualizador de la interfaz
llega a competir por el hilo.

**Optimizar el comparador.** 2.45 ms por turno sobre un presupuesto de 2000 ms
no justifica tocar nada.

## 6. Archivos

| Archivo | Cambio |
|---|---|
| `src/audio/dsp/fft.ts` | `getFft(size)`: caché de planes por tamaño |
| `src/audio/features/autocorrelation.ts` | Usa el plan cacheado en vez de crear uno por llamada |
| `src/audio/dsp/resampler.ts` | `PolyphaseDecimator` para relaciones enteras |
| `tests/audio/fft.test.ts` | 3 pruebas del caché |
| `tests/audio/resampler.test.ts` | 1 prueba de equivalencia del camino polifásico |
