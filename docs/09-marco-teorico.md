# 09 · Marco teórico — Señales y Sistemas

> **S1-T9** · Fabrizio (DSP) + Monestel (visualización) · Iniciado Semana 1.
> Este documento crece con el proyecto: Semana 1 cubre muestreo, Nyquist y DFT;
> las secciones de MFCC, YIN y DTW se agregan en las Semanas 5 y 6.
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

$$w[n] = 0.5 \left( 1 - \cos\left(\frac{2\pi n}{N-1}\right) \right)$$

que suaviza los extremos a cero y reduce los lóbulos laterales.

---

## Pendiente (se agrega más adelante)

- **Semana 5** — Banco de filtros mel y DCT (MFCC); autocorrelación y función de
  diferencia acumulada de YIN.
- **Semana 6** — Alineamiento temporal dinámico (DTW) y métrica de distancia.

## Referencias

- Oppenheim & Schafer, *Discrete-Time Signal Processing*, cap. 4 (muestreo) y 8 (DFT).
- Smith, J.O., *Spectral Audio Signal Processing*, CCRMA (enventanado, STFT).
- de Cheveigné & Kawahara (2002), *YIN, a fundamental frequency estimator for speech and music*.
