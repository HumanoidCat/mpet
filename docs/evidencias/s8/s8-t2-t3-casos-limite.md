# Evidencia S8-T2 y S8-T3 — Casos límite y cobertura de pruebas

> Fabrizio Espinoza (DSP) · Semana 8 · Código en `src/audio/features/voiceDetection.ts`
> Reproducible con `npx vitest run tests/audio/edgeCases.test.ts` (20 pruebas).

## 1. El hallazgo principal: el VAD era peor de lo documentado

La evidencia de S2-T3 ya anotaba que el detector por energía confundiría un
ruido fuerte y sostenido con habla. Al medirlo sobre la cadena completa resultó
**bastante peor**: incluso un ruido muy bajo se detecta como habla continua.

| Señal | Habla detectada por energía |
|---|---:|
| Silencio puro | 0.00 s ✅ |
| Ruido de amplitud 0.005 | **2.00 s** ❌ |
| Ruido de amplitud 0.05 (ventilador) | **2.00 s** ❌ |
| Ruido de amplitud 0.2 | **2.00 s** ❌ |
| Voz real (1 s dentro de 2 s) | 1.06 s ✅ |

### Por qué

El piso de ruido se estima como el percentil 10 de las energías por trama,
topado a 25 dB por debajo de la trama más fuerte. Ese tope existe desde S2-T3
para que una grabación que es casi toda habla no quede sin detectar.

Con ruido **estacionario** todas las tramas tienen casi la misma energía. El
percentil 10 casi coincide con el máximo, el tope fuerza un piso 25 dB más
abajo, el umbral queda 15 dB bajo el nivel real de la señal… y absolutamente
todo lo supera.

O sea: la protección que resolvía un caso creaba otro. No se ve leyendo el
código; aparece al medir la cadena con señales que no son las de las pruebas
unitarias, que es exactamente para lo que existe S8-T2.

## 2. La solución: mirar la estructura, no solo el nivel

Ya estaba anticipada en la evidencia de S2-T3. La voz es **periódica** —tiene
frecuencia fundamental— y el ruido de banda ancha no. YIN (S5-T1) calcula
exactamente eso, y la separación medida es total:

| Señal | Tramas con tono detectable |
|---|---:|
| Ruido, a cualquier nivel (0.005 a 0.5) | **0 %** |
| Voz real | **49 %** |

El 49 % no es un defecto sino la realidad del habla: alterna sonidos sonoros
(vocales, con tono) y sordos (/s/, /f/, /t/, sin tono). Por eso el umbral se
puso en **20 %** — basta con que una parte del segmento sea sonora — y aun así
queda margen amplio contra el ruido, que da cero.

### Orden de las etapas, por costo

Primero se buscan candidatos por energía, que es barato y no pierde ningún
tramo de voz; después se descarta el que no tenga estructura periódica. Correr
YIN sobre toda la grabación en lugar de solo dentro de los candidatos costaría
mucho más.

### Resultado

| Caso | Antes | Ahora |
|---|---|---|
| Ruido a cualquier nivel | Detectado como habla | **0 segmentos** ✅ |
| Voz limpia | Detectada | Detectada ✅ |
| Voz con ruido de fondo encima | Detectada | Detectada ✅ |
| Tres frases con pausas de 1 s | 3 segmentos | 3 segmentos ✅ |

## 3. Limitación que sobrevive

**Un tono puro sostenido dentro de la banda de voz** —un zumbido de 200 Hz, un
pitido— sí es periódico, así que pasa el filtro igual que una vocal. Medido:
99 % de tramas con tono.

Se documenta en lugar de resolverse, por dos razones. Distinguirlo de una vocal
sostenida exigiría analizar la estructura de formantes, no solo la periodicidad.
Y el caso que motivó la tarea es el ruido de banda ancha —ventilador, ambiente—,
que sí queda resuelto; además, una vocal sostenida real tampoco es habla útil
para el evaluador.

## 4. Frases largas

El costo del DTW crece con el cuadrado de la duración, y **la memoria limita
antes que el tiempo**:

| Duración | Tramas | Tiempo | Memoria de la matriz |
|---:|---:|---:|---:|
| 3 s | 186 × 186 | 4.7 ms | 0.3 MB |
| 10 s | 624 × 624 | 18.4 ms | 3.1 MB |
| 30 s | 1874 × 1874 | 95.4 ms | 28 MB |

Con banda de Sakoe–Chiba se calcula solo la franja cercana a la diagonal, pero
**se sigue reservando la matriz completa**. Para el uso conversacional del
proyecto —frases de segundos— no es un problema, y queda anotado en el código
que si alguna vez hiciera falta comparar grabaciones de un minuto, lo que
corresponde es reservar solo la banda.

**El puntaje no se degrada con la duración:** una frase de 8 s comparada
consigo misma puntúa igual que una de 1 s. Lo consigue la normalización por el
largo del camino; sin ella, una frase larga acumularía más costo y puntuaría
peor por ser larga.

## 5. Silencios y señales degeneradas

Seis entradas patológicas atraviesan toda la cadena —preprocesamiento, VAD,
recorte, MFCC y remuestreo— sin excepciones y sin producir un solo `NaN`:

| Entrada | Comportamiento |
|---|---|
| Todo ceros | 0 segmentos, coeficientes finitos |
| Más corta que un frame (100 muestras) | 0 tramas, sin error |
| Una sola muestra | Sin error |
| Vacía | Sin error |
| Saturada en 1.0 (clipping) | 0 segmentos, sin tono, coeficientes finitos |
| Continua pura (offset 0.5) | El pasa-altas la elimina: 0 segmentos |

El comparador con audio vacío devuelve 0, no `NaN`.

## 6. S8-T3 — Cobertura de pruebas con señales sintéticas

La tarea pedía pruebas unitarias del DSP con señales sintéticas conocidas.
Quedó cubierta a lo largo del proyecto: **todas** las pruebas del módulo usan
señales generadas por código —senos, chirps, ruido determinista, vocales
sintéticas con formantes— de parámetros conocidos. Ninguna necesita micrófono,
grabaciones ni intervención manual, y todas corren en integración continua.

| Archivo | Pruebas | Qué cubre |
|---|---:|---|
| `yin.test.ts` | 37 | Detección de tono, error de octava, umbral |
| `pitch.test.ts` | 34 | Autocorrelación, interpolación parabólica |
| `fft.test.ts` | 30 | FFT vs definición, casos analíticos, caché de planes |
| `mfcc.test.ts` | 28 | Escala mel, banco de filtros, DCT, invariancia |
| `scorer.test.ts` | 27 | Puntaje global y por palabra, normalización cepstral |
| `vad.test.ts` | 20 | Umbral adaptativo, histéresis, hangover |
| `edgeCases.test.ts` | 20 | **Esta tarea** |
| `dtw.test.ts` | 18 | Alineamiento, invariancia a la velocidad, banda |
| `resampler.test.ts` | 17 | Anti-aliasing, decimación polifásica |
| `preprocess.test.ts` | 16 | Normalización RMS, orden de las etapas |
| `stft.test.ts` | 13 | Espectrograma, chirp, versión en vivo |
| `biquad.test.ts` | 9 | Diseño y respuesta de los filtros |
| `sampling.test.ts` | 8 | Nyquist, aliasing, estrategia de remuestreo |
| `ringBuffer.test.ts` | 7 | Buffer circular |
| **Total del módulo** | **284** | |

En el proyecto completo son 335 pruebas.

### Estrategia de validación, en orden de fuerza

1. **Casos con solución analítica cerrada** — seno en bin (`|X[k]| = N/2`),
   delta (espectro plano), constante (bin 0). El resultado se deduce en papel.
2. **La definición como referencia** — DFT directa, autocorrelación directa y
   función de diferencia directa, implementadas en los tests y comparadas
   contra las versiones rápidas.
3. **Propiedades estructurales** — Parseval, linealidad, inversa, simetría
   conjugada, conservación de energía de la DCT.
4. **Señales sintéticas de parámetros conocidos** — para filtros, VAD y
   comparador.

## 7. Archivos

| Archivo | Rol |
|---|---|
| `src/audio/features/voiceDetection.ts` | Detección de habla robusta a ruido: energía + periodicidad |
| `src/audio/comparator/dtw.ts` | Nota de costo y memoria con frases largas |
| `tests/audio/edgeCases.test.ts` | 20 pruebas de casos límite |
