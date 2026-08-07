# 09 · Marco teórico — Señales y Sistemas

> **S1-T9 y S5-T7** · Fabrizio Espinoza (DSP) + José Pablo Monestel (visualización).
> Cubre la cadena de señales completa del proyecto: muestreo y Nyquist, DFT y
> FFT, enventanado, STFT, MFCC, YIN y alineamiento temporal dinámico.
> Cada sección remite a su verificación experimental en `docs/evidencias/`
> (índice al final del documento).
> Las ecuaciones usan KaTeX (`$...$` en línea, `$$...$$` en bloque).

---

## 1. Muestreo

La voz es una señal continua $x(t)$ (presión acústica). Para procesarla en el
navegador la convertimos en una secuencia discreta tomando muestras cada $T_s$
segundos:

$$x[n] = x(nT_s), \qquad f_s = \frac{1}{T_s}$$

donde $f_s$ es la **frecuencia de muestreo**. En MPET el destino es
$f_s = 16\,000$ Hz (`SAMPLE_RATE` en `src/shared/constants.ts`), impuesto por
Whisper.

### Hallazgo del spike S1-T6 (medido en hardware real, Chrome)

| Medición | Valor |
|---|---|
| `AudioContext` por defecto | 48 000 Hz |
| ¿Acepta forzar 16 kHz? | sí |
| Track de micrófono | 48 000 Hz |
| Rates soportados por el dispositivo | 48 000–48 000 Hz (**valor único**) |

El micrófono **solo** entrega 48 kHz: no es un rango negociable, así que pedir
16 kHz vía `getUserMedia` no es una opción. El `AudioContext` sí acepta
`{ sampleRate: 16000 }`, lo que significa que Chrome ya está haciendo la
conversión 48 kHz → 16 kHz internamente.

**Decisión:** implementamos igual nuestro propio remuestreo
(`src/audio/dsp/sampling.ts`) por dos razones:

1. El remuestreo del navegador es una caja negra — no documenta su filtro
   anti-aliasing, y ese filtro *es* el contenido de Señales y Sistemas que el
   proyecto debe evidenciar.
2. Safari históricamente ignora el parámetro `sampleRate`, así que el camino
   con decimación explícita hace falta de todos modos para portabilidad.

La relación 48 000 / 16 000 = 3 es entera, o sea **decimación exacta**: filtrar
a 7 200 Hz y quedarse con 1 de cada 3 muestras. El caso feo (44 100 Hz, factor
2.75625, que obliga a interpolar) queda contemplado en el código pero no aplica
a este equipo.

## 2. Teorema de muestreo de Nyquist–Shannon

Una señal limitada en banda a $f_{max}$ se reconstruye sin pérdida si

$$f_s > 2 f_{max}$$

La mitad del rate se llama **frecuencia de Nyquist**:

$$f_N = \frac{f_s}{2} = 8\,000 \text{ Hz a } 16 \text{ kHz}$$

### ¿Por qué 16 kHz basta para voz?

| Componente | Rango típico | ¿Bajo 8 kHz? |
|---|---|---|
| F0 (pitch) — voz masculina | 85–180 Hz | ✅ |
| F0 — voz femenina | 165–255 Hz | ✅ |
| Formantes F1–F3 (vocales) | 300–3 500 Hz | ✅ |
| Fricativas (/s/, /ʃ/, /f/) | 4 000–8 000 Hz | ✅ (al límite) |

La información fonética que necesita el evaluador de pronunciación vive por
debajo de 8 kHz. Por eso el rango de pitch que buscará YIN se acota a
60–400 Hz (`PITCH_MIN_HZ` / `PITCH_MAX_HZ`) y el pasa-banda del
preprocesamiento (S2-T2) va de 80 a 8 000 Hz.

### Aliasing

Si una componente supera $f_N$, no se pierde: se **pliega** dentro de la banda
útil y se confunde con una frecuencia legítima. La frecuencia aparente es

$$f_{alias} = \left| \left( (f + f_N) \bmod f_s \right) - f_N \right|$$

Ejemplo: una componente de 9 kHz muestreada a 16 kHz aparece en 7 kHz — justo
en la banda de las fricativas, donde arruinaría el análisis. De ahí que la
decimación **siempre** vaya precedida de un filtro pasa-bajos con corte por
debajo de $f_N$ (`antiAliasCutoffHz()`, 7 200 Hz con 10 % de margen para la
caída del filtro).

> Verificado en `tests/audio/sampling.test.ts`.

## 3. Transformada Discreta de Fourier (DFT)

Para ver **qué frecuencias** contiene un frame de audio pasamos del dominio del
tiempo al de la frecuencia:

$$X[k] = \sum_{n=0}^{N-1} x[n] \, e^{-j 2\pi k n / N}, \qquad k = 0, 1, \dots, N-1$$

Cada bin $k$ corresponde a la frecuencia física

$$f_k = \frac{k f_s}{N}$$

Con $N = 512$ (`FFT_SIZE`) y $f_s = 16$ kHz, la **resolución espectral** es

$$\Delta f = \frac{f_s}{N} = \frac{16\,000}{512} = 31.25 \text{ Hz por bin}$$

y el frame dura $N / f_s = 32$ ms.

### El compromiso tiempo–frecuencia

Frames más largos dan mejor resolución en frecuencia pero peor en tiempo (y la
voz cambia rápido). 32 ms es el compromiso estándar en procesamiento de voz: lo
bastante corto para que el tracto vocal se considere estacionario, lo bastante
largo para resolver los formantes. El solapamiento del 50 % (`HOP_SIZE = 256`,
16 ms) evita perder transiciones entre fonemas.

Como $x[n]$ es real, el espectro es simétrico y solo guardamos la mitad
positiva: $N/2 + 1 = 257$ bins (esto es `fftDb` en el contrato `AudioFrame`).

### FFT

La DFT directa cuesta $O(N^2)$. El algoritmo **FFT radix-2** (S3-T1, implementado
a mano) lo baja a $O(N \log N)$ dividiendo recursivamente en muestras pares e
impares. Para $N = 512$: de ~262 000 operaciones a ~4 600.

### Enventanado

Cortar el audio en frames equivale a multiplicar por una ventana rectangular,
cuyos flancos abruptos introducen **fuga espectral** (energía falsa repartida por
todo el espectro). Aplicamos una ventana de **Hann** antes de la FFT:

$$w[n] = 0.5 \left( 1 - \cos\left(\frac{2\pi n}{N}\right) \right), \qquad n = 0, \dots, N-1$$

que suaviza los extremos a cero y reduce los lóbulos laterales.

**Nota sobre el divisor.** Se usa $N$ y no $N-1$: es la variante **periódica** de
la ventana. La simétrica (con $N-1$) es la correcta para diseñar filtros, donde
interesa la simetría exacta de los coeficientes; la periódica es la correcta para
análisis espectral, porque hace que la ventana empalme consigo misma al
repetirse, que es exactamente lo que la DFT asume de la señal. Ambas se
implementan en `dsp/window.ts` y el análisis usa la periódica.

**Efecto medido** (S3-T1) con un tono situado entre dos bins, el caso más
desfavorable:

| Ventana | Fuga a más de 5 bins del pico |
|---|---:|
| Rectangular (sin ventana) | −21.5 dB |
| **Hann** | **−52.7 dB** |
| Hamming | −41.3 dB |
| Blackman | −62.3 dB |

Hann deja la fuga 31 dB por debajo de no enventanar. Blackman la reduce más pero
ensancha el lóbulo principal, lo que cuesta resolución para separar formantes
próximos.

**Corrección por ganancia coherente.** Enventanar atenúa la señal: la media de la
ventana de Hann es 0.5, así que el espectro sale a la mitad. Para recuperar la
amplitud real del tono se divide entre esa media:

$$\bar{w} = \frac{1}{N}\sum_{n=0}^{N-1} w[n] = 0.5 \quad \Rightarrow \quad |X_{\text{corr}}[k]| = \frac{2\,|X[k]|}{N \bar{w}}$$

Verificado con error del 0.00 % en las amplitudes probadas.

---

## 4. Transformada de tiempo corto (STFT)

Una sola DFT dice qué frecuencias hay, pero no **cuándo**. Para voz eso no
alcanza: *cat* y *tac* tienen prácticamente el mismo espectro global y son
palabras distintas. La STFT trocea la señal y transforma cada frame por separado:

$$X[m, k] = \sum_{n=0}^{N-1} x[n + mH]\, w[n]\, e^{-j2\pi kn/N}$$

donde $m$ es el índice de frame, $H$ el salto (`HOP_SIZE`) y $w[n]$ la ventana.
El resultado es una matriz tiempo–frecuencia: el **espectrograma**.

| Parámetro | Valor | Consecuencia |
|---|---:|---|
| $N$ (`FRAME_SIZE`) | 512 | 32 ms por frame |
| $H$ (`HOP_SIZE`) | 256 | 50 % de solape, 62.5 frames/s |
| $\Delta f$ | 31.25 Hz | resolución en frecuencia |
| $\Delta t$ | 16 ms | resolución temporal |

El producto $\Delta f \cdot \Delta t$ no puede reducirse arbitrariamente: es el
**principio de incertidumbre** aplicado a señales. Frames largos dan buena
resolución en frecuencia y mala en tiempo, y a la inversa.

**Verificación.** Sobre un barrido lineal de 500 a 4000 Hz en un segundo, cada
frame del espectrograma coincide con la frecuencia instantánea en su punto medio,
dentro de 2 bins.

---

## 5. Coeficientes cepstrales en escala mel (MFCC)

Son las características con las que se compara la pronunciación. La cadena es:

$$x[n] \;\to\; w[n]x[n] \;\to\; |X[k]|^2 \;\to\; E[m] \;\to\; \log E[m] \;\to\; c[i]$$

Cada paso descarta algo que **no** debe influir en la comparación.

### 5.1 Escala mel

El oído no percibe la frecuencia de forma lineal: distinguimos con facilidad 200
de 300 Hz, pero 5000 y 5100 Hz suenan casi igual. La escala mel refleja esa
percepción:

$$m(f) = 2595 \log_{10}\left(1 + \frac{f}{700}\right), \qquad f(m) = 700\left(10^{m/2595} - 1\right)$$

Es casi lineal por debajo de 1 kHz y logarítmica por encima, que es justo donde
está la información de las vocales. Se usa la formulación de **HTK**, el estándar
de reconocimiento de voz.

### 5.2 Banco de filtros triangulares

Se reparten $M + 2$ puntos equiespaciados **en mel** entre 0 y el Nyquist, se
convierten a Hz y de ahí a índices de bin. Cada filtro usa tres puntos
consecutivos:

$$H_m[k] = \begin{cases}
\dfrac{k - b_{m-1}}{b_m - b_{m-1}} & b_{m-1} < k < b_m \\[2ex]
\dfrac{b_{m+1} - k}{b_{m+1} - b_m} & b_m \le k < b_{m+1} \\[1ex]
0 & \text{en otro caso}
\end{cases}$$

y la energía de cada banda es

$$E[m] = \sum_{k} H_m[k]\, |X[k]|^2$$

Con $M = 26$ bandas (`N_MEL_FILTERS`) los 257 bins se reducen a 26 valores. El
ancho de las bandas crece con la frecuencia, como corresponde a la escala:

| Banda | Centro | Ancho |
|---|---:|---:|
| Primera | 68 Hz | 75 Hz |
| Última | 7225 Hz | 706 Hz |

Ese agrupamiento **borra los armónicos individuales** —que se mueven con el tono
de quien habla— y conserva la envolvente, que es lo que define el fonema.

### 5.3 Logaritmo y DCT

El logaritmo convierte productos en sumas. La voz es la fuente glotal filtrada
por el tracto vocal, y en el espectro eso es un producto; al tomar log, fuente y
filtro se separan en sumandos. Además, un cambio de volumen deja de ser un factor
y pasa a ser un desplazamiento constante.

La DCT-II ortonormal descorrelaciona las bandas, que se solapan y están muy
correlacionadas entre sí:

$$c[i] = \alpha_i \sum_{m=0}^{M-1} \log E[m] \, \cos\left(\frac{\pi i (2m+1)}{2M}\right), \qquad
\alpha_i = \begin{cases} \sqrt{1/M} & i = 0 \\ \sqrt{2/M} & i > 0 \end{cases}$$

Tras la DCT la información se concentra en los primeros coeficientes, así que
bastan $i = 0, \dots, 12$ (`N_MFCC` = 13) de los 26.

La normalización ortonormal **conserva la energía**, condición necesaria para que
la distancia entre dos vectores de MFCC signifique lo mismo que en el dominio
original — sin eso, la comparación de la sección 7 no tendría sentido métrico.

### 5.4 La propiedad que justifica usar MFCC

Multiplicar la señal por $g$ multiplica la potencia por $g^2$, lo que suma
$20\log_{10} g$ dB **a todas las bandas por igual**. La DCT manda una constante
al coeficiente cero, así que:

$$c_0 \to c_0 + \sqrt{M}\cdot 20\log_{10}g, \qquad c_i \to c_i \;\; (i > 0)$$

**Los coeficientes $c_1$ a $c_{12}$ no dependen del volumen.** Medido sobre un
rango de ganancia de mil veces, el mayor cambio es $3.8 \times 10^{-6}$: la
precisión de un `float32`. Es lo que hace que el puntaje mida pronunciación y no
intensidad.

**Limitación:** la invariancia se rompe si alguna banda queda fijada en el piso
que evita $\log 0$, porque entonces el desplazamiento deja de ser uniforme. Ocurre
con señales de banda limitada o muy flojas.

---

## 6. Detección de frecuencia fundamental: YIN

### 6.1 Punto de partida: autocorrelación

La autocorrelación mide cuánto se parece una señal a sí misma desplazada $\tau$:

$$r[\tau] = \sum_n x[n]\,x[n+\tau]$$

Si la señal es periódica de periodo $T$, presenta un máximo en $\tau = T$. Se
calcula por el **teorema de Wiener–Khinchin**, que la vuelve $O(N\log N)$:

$$r = \mathcal{F}^{-1}\left\{|X[k]|^2\right\}$$

**Su problema** (medido en S4-T4): también hay máximos en todos los **múltiplos**
del periodo, y con una fundamental débil frente a su armónico el método responde
el doble de la frecuencia real — el clásico **error de octava**. Peor aún: lo hace
con confianza alta, así que el error no se detecta desde su propia salida.

### 6.2 Función de diferencia

YIN parte de medir cuánto se **diferencia** la señal de sí misma desplazada, en
lugar de cuánto se parece:

$$d[\tau] = \sum_{j=0}^{W-1} \left( x[j] - x[j+\tau] \right)^2$$

Buscar mínimos en vez de máximos evita el sesgo hacia desfases cortos que aparece
cuando la amplitud varía dentro del frame. Desarrollando el cuadrado se calcula
también por FFT:

$$d[\tau] = \sum_j x[j]^2 + \sum_j x[j+\tau]^2 - 2\sum_j x[j]x[j+\tau]$$

### 6.3 Normalización por la media acumulada

Es el paso decisivo:

$$d'[\tau] = \begin{cases}
1 & \tau = 0 \\[1ex]
\dfrac{d[\tau]}{\frac{1}{\tau}\sum_{j=1}^{\tau} d[j]} & \tau > 0
\end{cases}$$

Cada desfase se compara contra el promedio de todos los anteriores. Al llegar a
$2T$, ese promedio ya incluye el mínimo profundo de $T$, de modo que un múltiplo
**deja de competir de igual a igual** con el periodo verdadero.

Medido sobre el caso patológico —fundamental 6.7 veces más débil que su segundo
armónico—: $d'[T] = 0.00000$ contra $d'[T/2] = 0.04369$. La normalización separa
los dos valles por varios órdenes de magnitud.

### 6.4 Umbral absoluto

Se toma el **primer** desfase que baja del umbral, no el mínimo global. Sin esa
regla, un múltiplo ligeramente más profundo volvería a ganar.

El artículo original propone 0.1. En este proyecto se usa **0.02**, calibrado por
medición: con 0.1 el valle falso del armónico (0.044) también califica y, por la
regla del primero, gana. El valor adoptado queda 26 veces por encima del peor caso
de señal limpia y 2.2 veces por debajo del valle falso. El costo es tolerancia al
ruido, y se acepta: es preferible declarar sordo un frame ruidoso a devolver una
octava equivocada con confianza alta.

### 6.5 Interpolación parabólica

El vértice de la parábola que pasa por los tres puntos alrededor del mínimo:

$$\tau^* = \tau_0 + \frac{d'[\tau_0-1] - d'[\tau_0+1]}{2\left(d'[\tau_0-1] - 2d'[\tau_0] + d'[\tau_0+1]\right)}$$

Es lo que da la exactitud: con 16 kHz y un tono de 200 Hz el periodo son 80
muestras, y quedarse con el desfase entero erraría hasta media muestra. **Peor
error medido: 0.115 Hz** entre 70 y 390 Hz, contra el criterio de 3 Hz del plan.

La confianza se define como $1 - d'[\tau^*]$, o sea la periodicidad medida. A
diferencia de la altura de un pico de autocorrelación, **sí baja** cuando la
estimación se degrada.

---

## 7. Comparación: alineamiento temporal dinámico (DTW)

### 7.1 El problema

Dos personas nunca dicen la misma frase a la misma velocidad. Comparar las
secuencias de MFCC trama a trama mediría quién habla más rápido.

### 7.2 La recurrencia

DTW busca la correspondencia óptima entre ambas líneas de tiempo:

$$D[i,j] = d(i,j) + \min\big( D[i-1,j],\; D[i,j-1],\; D[i-1,j-1] \big)$$

donde $d(i,j)$ es la distancia euclídea entre la trama $i$ del usuario y la $j$ de
la referencia. Los tres términos del mínimo son los tres movimientos permitidos:
el usuario alargó, acortó, o van al mismo ritmo.

El camino de menor costo cumple tres condiciones que salen de la propia
recurrencia: empieza en $(0,0)$ y termina en $(n-1, m-1)$, es **monótono** —el
tiempo no retrocede— y es **continuo** —no se saltan tramas—.

La distancia se normaliza por el largo del camino, de modo que frases de distinta
duración sean comparables:

$$\bar{D} = \frac{D[n-1, m-1]}{|\text{camino}|}$$

**Restricción de Sakoe–Chiba.** Sin límite, DTW puede deformar el tiempo lo que
haga falta y alinear una sílaba con otra muy posterior. Se acota la desviación
respecto de la diagonal a un 15 % de la secuencia más larga.

### 7.3 Normalización cepstral

La referencia la genera un sintetizador de voz, así que usuario y referencia son
**siempre** hablantes distintos. Lo que los diferencia es sobre todo una
inclinación espectral constante a lo largo del enunciado —largo del tracto vocal,
tono, micrófono—, y esa componente constante es la media. Restarla deja lo que
varía dentro de la frase, que es la secuencia de fonemas:

$$\tilde{c}_i[m] = c_i[m] - \frac{1}{M}\sum_{m'} c_i[m']$$

Medido sobre frases de tres vocales, sin esta normalización las dos clases se
solapan:

| | Peor caso bien pronunciado | Mejor caso mal pronunciado |
|---|---:|---:|
| Sin normalizar | 39.39 | 11.66 — **se solapan** |
| Normalizado | 6.45 | 17.91 — separadas 2.8× |

Sin normalizar, una pronunciación **correcta con otra voz** puntúa **peor** que una
**equivocada con la misma voz**.

⚠️ No aplicar a sonidos sostenidos: en una señal estacionaria la media *es* la
señal, y restarla borra la información.

### 7.4 Del costo al puntaje

$$P = 100 \cdot e^{-\bar{D}/\lambda}, \qquad \lambda = 20$$

La exponencial está acotada por construcción —nunca da negativo ni pasa de 100,
sin recortes— y tiene mayor pendiente cerca de cero, que es donde conviene
distinguir. La constante está calibrada con las distancias medidas, y la
separación entre el peor caso bien pronunciado y el mejor mal pronunciado es de
**31 puntos**, sobre los 20 que exige el requisito RF-10.

Las tres invariancias del puntaje, cada una heredada de una etapa distinta:

| Qué cambia | Puntaje | Gracias a |
|---|---:|---|
| Volumen (+50 %) | > 95 | Normalización RMS (§ preprocesamiento) y descarte de $c_0$ (§5.4) |
| Velocidad (+50 %) | > 90 | DTW (§7.2) |
| Voz (120 → 180 Hz) | > 70 | Normalización cepstral (§7.3) |

## Referencias

- Oppenheim & Schafer, *Discrete-Time Signal Processing*, cap. 4 (muestreo) y 8 (DFT).
- Smith, J.O., *Spectral Audio Signal Processing*, CCRMA (enventanado, STFT).
- de Cheveigné & Kawahara (2002), *YIN, a fundamental frequency estimator for speech and music*, JASA 111(4).
- Davis & Mermelstein (1980), *Comparison of parametric representations for monosyllabic word recognition*, IEEE TASSP (MFCC).
- Sakoe & Chiba (1978), *Dynamic programming algorithm optimization for spoken word recognition*, IEEE TASSP (DTW).
- Bristow-Johnson, R., *Audio EQ Cookbook* (coeficientes de los biquads).

## Evidencia medida

Cada sección teórica tiene su verificación experimental en el repositorio:

| Sección | Evidencia |
|---|---|
| 1–2 · Muestreo, Nyquist, aliasing | `docs/evidencias/s2/s2-t1-remuestreo.md` |
| Filtrado en banda de voz | `docs/evidencias/s2/s2-t2-preprocesamiento.md` |
| Energía y detección de habla | `docs/evidencias/s2/s2-t3-vad.md` y `docs/evidencias/s8/s8-t2-t3-casos-limite.md` |
| 3–4 · DFT, FFT, enventanado, STFT | `docs/evidencias/s3/s3-t1-fft-stft.md` |
| 5 · MFCC | `docs/evidencias/s5/s5-t2-mfcc.md` |
| 6 · YIN | `docs/evidencias/s4/s4-t4-pitch-autocorrelacion.md` y `docs/evidencias/s5/s5-t1-yin.md` |
| 7 · DTW y puntaje | `docs/evidencias/s6/s6-t1-t2-comparador.md` |
| Costo computacional | `docs/evidencias/s7/s7-t4-latencia-dsp.md` |
