# Evidencia S3-T1 — FFT radix-2 y STFT

> Fabrizio Espinoza (DSP) · Semana 3 · Código en `src/audio/dsp/fft.ts`, `window.ts`, `stft.ts`
> Reproducible con `npx vitest run tests/audio/fft.test.ts tests/audio/stft.test.ts` (35 pruebas).

## 1. Qué se implementó

FFT radix-2 de Cooley–Tukey escrita a mano (iterativa, con tabla de factores de
giro precalculada), ventanas de análisis y STFT completa —offline y en vivo—
que produce el espectrograma del que dependen MFCC (Semana 5) y el comparador
DTW (Semana 6).

## 2. Por qué FFT y no DFT directa

La DFT calculada según su definición

$$X[k] = \sum_{n=0}^{N-1} x[n] \cdot e^{-j2\pi kn/N}$$

cuesta $N^2$ operaciones. La FFT explota que $e^{-j2\pi kn/N}$ se repite:
separando muestras pares e impares, una DFT de $N$ se arma con dos de $N/2$ más
$N$ sumas. Repitiendo la división quedan $\log_2 N$ etapas de $N$ operaciones.

| N | Operaciones DFT ($N^2$) | Operaciones FFT ($N\log_2 N$) | Tiempo DFT | Tiempo FFT | Aceleración medida |
|---:|---:|---:|---:|---:|---:|
| 512 | 262 144 | 4 608 | 11.31 ms | 0.0099 ms | **1 145×** |
| 1024 | 1 048 576 | 10 240 | 44.92 ms | 0.0185 ms | **2 425×** |

La relación de operaciones es 57× para N = 512, pero la aceleración medida es
mucho mayor porque la DFT de referencia evalúa `cos`/`sin` en cada iteración
mientras que la FFT lee los factores de giro de una tabla precalculada. Ambos
efectos son reales y ambos son parte de por qué la FFT hace viable el análisis
en tiempo real.

**Presupuesto de tiempo real:** con `HOP_SIZE` = 256 a 16 kHz salen 62.5 frames
por segundo. A 0.0099 ms por FFT, el análisis espectral consume **0.62 ms por
cada segundo de audio: 0.06 % de un núcleo.** Con la DFT directa serían 707 ms
por segundo de audio — el 71 % de un núcleo solo para la transformada, sin
contar MFCC ni pitch.

## 3. Validación contra la definición

La referencia es la **DFT directa implementada a partir de su fórmula** dentro
del propio test. Es la validación más fuerte posible: no se compara contra otra
librería que también podría estar mal, sino contra la definición del curso.

| N | Error absoluto máximo | Error relativo |
|---:|---:|---:|
| 8 | 3.20 × 10⁻¹⁵ | 1.69 × 10⁻¹⁵ |
| 32 | 6.33 × 10⁻¹⁴ | 9.70 × 10⁻¹⁵ |
| 128 | 4.63 × 10⁻¹³ | 2.61 × 10⁻¹⁴ |
| **512** (el tamaño de producción) | **4.90 × 10⁻¹²** | **1.45 × 10⁻¹³** |
| 1024 | 1.59 × 10⁻¹¹ | 3.26 × 10⁻¹³ |
| 2048 | 5.66 × 10⁻¹¹ | 7.00 × 10⁻¹³ |

El error es puro redondeo de punto flotante (la precisión de un `double` es
~2 × 10⁻¹⁶) y crece muy despacio con N. Crecería bastante más rápido si los
factores de giro se acumularan multiplicando dentro del bucle, que es la
variante corta habitual; precalcularlos en una tabla evita esa deriva.

### Propiedades verificadas

Además del error numérico se comprueban las propiedades que caracterizan a la
transformada, independientes de la implementación:

| Propiedad | Comprobación |
|---|---|
| Linealidad | $F(3x + 2y) = 3F(x) + 2F(y)$ |
| Parseval (conservación de energía) | $\sum \|x[n]\|^2 = \frac{1}{N}\sum \|X[k]\|^2$ |
| Inversa | `ifft(fft(x)) == x`, con parte imaginaria nula |
| Simetría conjugada de señales reales | $X[N-k] = \overline{X[k]}$ — por eso basta media FFT |

### Casos con solución analítica cerrada

Señales cuya transformada se conoce de forma exacta por teoría. No hay
tolerancia estadística ni comparación contra una implementación ajena: el
resultado correcto se deduce en papel y la FFT debe reproducirlo.

| Señal de entrada | Resultado teórico | Verificado |
|---|---|---|
| $\sin(2\pi k_0 n/N)$ centrado en bin | $\|X[k_0]\| = N/2$, cero en los demás bins | ✅ exacto a 10⁻⁶, resto < 10⁻⁹ |
| $\delta[n]$ (impulso en el origen) | $X[k] = 1$ para todo $k$ — espectro plano, fase nula | ✅ a 10⁻⁹ |
| $\delta[n-n_0]$ (impulso desplazado) | $\|X[k]\| = 1$, fase lineal $e^{-j2\pi k n_0/N}$ | ✅ a 10⁻⁹ |
| $x[n] = c$ (constante) | $X[0] = Nc$, cero en los demás bins | ✅ exacto a 10⁻⁶ |
| $\cos(2\pi k_0 n/N)$ | $\Re X[k_0] = N/2$, $\Im X[k_0] = 0$ | ✅ |
| $\sin(2\pi k_0 n/N)$ | $\Re X[k_0] = 0$, $\Im X[k_0] = -N/2$ | ✅ |

Los dos últimos casos confirman además la convención de signo del exponente, y
el par delta/constante ilustra la dualidad tiempo–frecuencia: lo que está
concentrado en un dominio se reparte por completo en el otro.

## 4. Ventanas y fuga espectral

La DFT supone que el frame se repite periódicamente. Si la señal no cabe un
número entero de veces, los extremos no empalman y ese salto artificial se
reparte por todo el espectro: **fuga espectral**.

Medición con un tono en 1015.625 Hz, que cae exactamente entre dos bins — el
caso peor:

| Ventana | Fuga lejana (>5 bins del pico) | Relativa al pico |
|---|---:|---:|
| Rectangular (sin ventana) | 0.05415 | **−21.5 dB** |
| **Hann** (la elegida) | 0.00198 | **−52.7 dB** |
| Hamming | 0.00701 | −41.3 dB |
| Blackman | 0.00068 | −62.3 dB |

Hann deja la fuga **31 dB por debajo** de no usar ventana. Blackman es aún mejor
en fuga pero ensancha más el lóbulo principal, lo que cuesta resolución para
separar formantes cercanos. Hann es el equilibrio habitual en análisis de voz y
es el que pide la tarea.

### Corrección por ganancia coherente

Enventanar atenúa la señal (Hann deja pasar el 50 % de la energía), así que el
espectro hay que dividirlo entre la media de la ventana para recuperar la
amplitud real del tono:

| Amplitud real | Amplitud medida | Error |
|---:|---:|---:|
| 1.00 | 1.0000 | 0.00 % |
| 0.60 | 0.6000 | 0.00 % |
| 0.25 | 0.2500 | 0.00 % |

La corrección ya viene aplicada dentro del STFT.

## 5. STFT

Una FFT sola dice qué frecuencias hay, pero no **cuándo**. Para voz eso no
alcanza: "cat" y "tac" tienen prácticamente el mismo espectro global y son
palabras distintas. La STFT trocea la señal y transforma cada frame por
separado.

| Parámetro | Valor | Consecuencia |
|---|---:|---|
| `FRAME_SIZE` | 512 | 32 ms por frame |
| `HOP_SIZE` | 256 | 50 % de solape, 62.5 frames/s |
| Resolución en frecuencia | 31.25 Hz/bin | separa formantes |
| Resolución temporal | 16 ms | sigue la evolución de una sílaba |
| Bins por frame | 257 | mitad positiva de 512 |

El tamaño del frame es un compromiso sin solución óptima —el principio de
incertidumbre aplicado a señales—: frames largos dan buena resolución en
frecuencia y mala en tiempo, y al revés.

### Prueba central: el chirp

Un barrido de 500 a 4000 Hz en 1 segundo es justo lo que una FFT única no puede
describir. Se verifica que **cada frame del espectrograma coincide con la
frecuencia instantánea en su punto medio**, dentro de 2 bins (62.5 Hz), y que el
pico sube de forma monótona a lo largo de los 61 frames.

Detalle que la prueba dejó en claro: el primer frame no marca 500 Hz sino
562.5 Hz, porque durante sus 512 muestras la frecuencia ya subió ~112 Hz. El
pico refleja el punto medio del frame, que es exactamente el instante con que se
fecha cada frame en `times`.

También se verifica que distingue "grave→agudo" de "agudo→grave", dos señales
con espectro global idéntico.

### Versión en vivo

`StreamingStft` acumula las muestras que llegan del AudioWorklet y emite un
espectro cada vez que junta un frame completo, guardando el sobrante entre
llamadas. Dos pruebas lo aseguran: el resultado es **idéntico procesando en
bloques de 128 o de 1024**, e idéntico al análisis offline de la misma señal.

## 6. Archivos

| Archivo | Rol |
|---|---|
| `src/audio/dsp/fft.ts` | FFT radix-2, espectro de amplitud, conversión a dB |
| `src/audio/dsp/window.ts` | Hann, Hamming, Blackman, rectangular, ganancia coherente |
| `src/audio/dsp/stft.ts` | STFT offline y en vivo, espectrograma |
| `tests/audio/fft.test.ts` | 27 pruebas |
| `tests/audio/stft.test.ts` | 13 pruebas |

## 7. Estrategia de validación: por qué no se usa Meyda

El plan original pedía validar contra **Meyda**. Se escaló la decisión al
Project Manager por implicar una dependencia nueva en `package.json`, y la
resolución fue **no incorporarla**, sustituyendo la validación por referencias
analíticas. El criterio:

> Validar contra otra biblioteca demuestra que la implementación *coincide con
> una caja negra*. Validarla contra resultados analíticos demuestra que es
> *correcta*. Para un curso de Señales y Sistemas, lo segundo vale más.

La validación entregada se apoya en cuatro pilares, ninguno de los cuales
depende de código de terceros:

| Pilar | Qué demuestra |
|---|---|
| DFT directa como referencia | La radix-2 coincide con la definición literal de la transformada |
| Casos con solución cerrada | Señales cuyo espectro se deduce en papel: seno en bin ($N/2$), delta (plano), constante (bin 0) |
| Teorema de Parseval | La transformada está correctamente normalizada |
| Propiedades estructurales | Linealidad, reversibilidad, simetría conjugada |

Una biblioteca externa puede contener errores; la definición matemática, no.
El error medido (1.45 × 10⁻¹³ relativo) está en el límite de la precisión de
punto flotante, de modo que una comparación adicional contra Meyda no podría
aportar información: solo verificaría interoperabilidad, no corrección.

### Nota para los MFCC (S5-T2)

Para los coeficientes cepstrales sí conviene contrastar contra **librosa**, que
es el estándar citado en la literatura. La comparación se hará **sin agregar
dependencias**: se ejecuta librosa en Python una sola vez, se exportan los
coeficientes de referencia a un JSON y ese archivo se versiona como fixture en
`tests/audio/fixtures/`. Las pruebas comparan contra el archivo, de modo que ni
el proyecto ni el navegador incorporan nada nuevo.
