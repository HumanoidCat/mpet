# Evidencia S4-T4 — Spike: pitch por autocorrelación

> Fabrizio (DSP) · Semana 4 · Código en `src/audio/features/autocorrelation.ts` y `pitch.ts`
> Reproducible con `npx vitest run tests/audio/pitch.test.ts` (34 pruebas).

## 1. Objetivo del spike

Medir hasta dónde llega el método clásico de detección de tono y **dónde falla**,
para fijar la referencia contra la que se medirá YIN en S5-T1 y dejar por escrito
qué problemas concretos tiene que resolver.

## 2. Método

La autocorrelación mide cuánto se parece la señal a sí misma desplazada τ
muestras:

$$r[\tau] = \sum_n x[n] \cdot x[n+\tau]$$

Si la señal es periódica con periodo $T$, al desplazarla exactamente $T$ vuelve a
coincidir consigo misma y $r[\tau]$ presenta un máximo. El procedimiento es:

1. Autocorrelación del frame, vía FFT.
2. Normalización al intervalo [−1, 1] corrigiendo el sesgo del solapamiento.
3. Búsqueda del pico dentro del rango 60–400 Hz (desfases de 40 a 267 muestras).
4. Interpolación parabólica para refinar la posición del vértice.
5. Decisión sonoro/sordo según la altura del pico.

### Autocorrelación por FFT

Se implementaron dos caminos que deben coincidir: el directo O(N²), que es la
definición literal, y el de la FFT O(N log N) vía el **teorema de
Wiener–Khinchin**, según el cual la autocorrelación es la transformada inversa
del espectro de potencia:

$$r = \mathcal{F}^{-1}\left\{ |X[k]|^2 \right\}$$

El relleno con ceros hasta al menos 2N es imprescindible: sin él la FFT calcula
la autocorrelación *circular*, que supone que la señal se repite y contamina los
desfases grandes con muestras del otro extremo del frame. Ambos caminos coinciden
a 10⁻⁶ en tonos puros, voz sintética y ruido — la misma estrategia de validación
contra la definición que se usó para la FFT en S3-T1.

## 3. Exactitud medida

Tonos puros, frames de 1024 muestras:

| f₀ (Hz) | Estimado | Error |
|---:|---:|---:|
| 70 | 70.000 | −0.000 |
| 100 | 100.000 | −0.000 |
| 137 | 137.000 | −0.000 |
| 150 | 149.999 | −0.001 |
| 200 | 200.000 | −0.000 |
| 250 | 249.996 | −0.004 |
| 300 | 300.001 | +0.001 |
| 350 | 349.994 | −0.006 |
| 390 | 389.992 | −0.008 |

**Peor error: 0.008 Hz**, tres órdenes de magnitud por debajo del objetivo de
3 Hz que el plan fija para YIN en S5-T1.

La exactitud se debe casi enteramente a la interpolación parabólica. Para 137 Hz
el periodo real son 116.79 muestras; quedarse con el desfase entero más cercano
(117) daría 136.75 Hz, un error de 0.25 Hz — treinta veces mayor.

## 4. Dos errores encontrados durante el spike

Este es el valor real del spike: ambos fallos habrían llegado silenciosamente a
YIN, que se construye sobre la misma maquinaria.

### 4.1 Error de sub-armónico al tomar el máximo global

La primera implementación elegía el máximo global de ρ dentro del rango. Es
incorrecto: una señal de periodo $T$ es **igual de periódica** en $2T$, $3T$…, y
la autocorrelación normalizada vale prácticamente 1 en todos los múltiplos.

Medido con un tono de 200 Hz (periodo de 80 muestras):

```
rho[80]  = 1.0000000000
rho[160] = 1.0000000000
rho[240] = 1.0000000000
máximo global → τ = 240 → 66.7 Hz
```

Cuál de los tres "gana" lo decidía el ruido de punto flotante. El detector
reportaba **66.7 Hz para un tono de 200 Hz** — un tercio de la fundamental — con
confianza 1.0000.

**Corrección:** el periodo verdadero es el *menor* de esos desfases, así que se
toma el **primer máximo local** que alcance el 90 % del máximo global, no el
máximo global. Hay una prueba de regresión para 200, 300 y 350 Hz.

### 4.2 Signo invertido en la interpolación parabólica

El vértice de la parábola que pasa por $(-1, y_0)$, $(0, y_1)$, $(1, y_2)$ es

$$x^* = \frac{y_0 - y_2}{2(y_0 - 2y_1 + y_2)}$$

La implementación inicial usaba el denominador con el signo cambiado, de modo que
**desplazaba el vértice hacia el lado contrario**. Para 150 Hz, cuyo periodo real
son 106.67 muestras, devolvía 107.33 en vez de 106.67.

El efecto sobre la exactitud global:

| | Peor error en 70–390 Hz |
|---|---:|
| Con el signo invertido | 4.315 Hz |
| **Corregido** | **0.008 Hz** |

El error superaba el objetivo de 3 Hz de S5-T1, y era lo bastante pequeño como
para pasar por "imprecisión del método" en lugar de por un defecto.

## 5. Comportamiento con voz sintética

Frames de 2048 muestras, fundamental más armónicos:

| Caso | Amplitudes | f₀ real | Estimado | Confianza |
|---|---|---:|---:|---:|
| Normal | 1 · 0.5 · 0.25 | 120 Hz | 120.00 Hz ✅ | 0.9998 |
| Muchos armónicos | 1 · 0.8 · 0.6 · 0.4 · 0.2 | 150 Hz | 150.00 Hz ✅ | 0.9991 |
| **Fundamental ausente** | 0 · 1 · 0.6 | 100 Hz | 100.00 Hz ✅ | 1.0000 |
| **Fundamental débil** | 0.15 · 1 | 100 Hz | **200.14 Hz ❌** | 0.9557 |

### Hallazgo positivo: la fundamental ausente

Cuando el espectro **no tiene energía alguna en la fundamental** —solo armónicos
2 y 3— el detector la recupera igual. La señal sigue siendo periódica con periodo
$T$ aunque no haya componente en $1/T$, y la autocorrelación lo ve. Es la ventaja
del dominio temporal frente a buscar el pico más grave del espectro, que en este
caso habría respondido 200 Hz.

### Limitación que sobrevive: el error de octava

Es el **único fallo que queda** y por eso justifica S5-T1. Cuando la fundamental
es débil frente a su primer armónico, el pico de $T/2$ supera al de $T$ y el
detector responde el doble de la frecuencia real.

Lo grave no es equivocarse, sino que **la confianza no lo delata**: 0.9557 es un
valor perfectamente normal. No hay forma de detectar el error desde la salida del
propio detector.

Es exactamente lo que YIN resuelve, mediante la función de diferencia acumulada
normalizada y un umbral absoluto que prefiere el primer mínimo que baje del
umbral en lugar del mínimo global.

## 6. Otros hallazgos

**La exactitud no mejora con frames más largos.** Contradice la intuición
inicial:

| Frame | Duración | Estimación de 150 Hz |
|---:|---:|---:|
| 256 | 16 ms | 149.996 Hz |
| 512 | 32 ms | 150.000 Hz |
| 1024 | 64 ms | 149.999 Hz |
| 2048 | 128 ms | 150.000 Hz |

El error no lo domina el largo del frame sino la interpolación del vértice, así
que cuadruplicar el frame solo cuesta cómputo y resolución temporal.
**Conclusión para S5-T1: conviene el frame corto.**

**Restringir el rango de búsqueda no evita los múltiplos.** Buscando solo entre
60 y 120 Hz, un tono de 200 Hz no desaparece: su múltiplo en 160 muestras entra
en el rango de desfases y el detector reporta 100 Hz con confianza 0.99. Acotar
el rango a la voz esperada ayuda, pero no es una garantía.

## 7. Conclusiones para S5-T1 (YIN)

1. La maquinaria base —autocorrelación por FFT, normalización, interpolación
   parabólica— queda validada y es reutilizable.
2. El objetivo de exactitud (< 3 Hz) **ya se cumple con holgura en tonos puros**;
   YIN no se necesita por precisión.
3. YIN se necesita por el **error de octava con fundamental débil**, que es el
   caso realista en voz y que ningún ajuste de umbral o de rango resuelve.
4. Usar frames cortos (512, el `FRAME_SIZE` del proyecto), porque no hay ganancia
   de exactitud en alargarlos.
5. La confianza del método actual no sirve para detectar sus propios errores;
   YIN debe aportar una medida de fiabilidad que sí lo haga.

## 8. Archivos

| Archivo | Rol |
|---|---|
| `src/audio/features/autocorrelation.ts` | Autocorrelación directa y por FFT, normalización, interpolación parabólica |
| `src/audio/features/pitch.ts` | Detector de tono y contorno frame a frame |
| `tests/audio/pitch.test.ts` | 34 pruebas |
