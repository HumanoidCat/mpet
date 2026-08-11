# Grabaciones para el afinado del comparador (S9-T3)

> Fabrizio Espinoza (DSP). **Todo el código de análisis ya está escrito.**
> Falta grabar los audios y dejarlos en esta carpeta.

## Por qué hacen falta

Todo el módulo está calibrado con **señales sintéticas**: vocales generadas por
código con formantes fijos. Eso sirvió para verificar que la matemática está
bien, pero dos constantes se eligieron midiendo sobre esas señales y con voz
real van a cambiar:

| Constante | Valor actual | Dónde |
|---|---:|---|
| Escala de la puntuación | 20 | `comparator/scorer.ts` |
| Umbral de YIN | 0.02 | `features/yin.ts` |

S9-T3 consiste en volver a medirlas con voz de verdad.

---

## Cómo grabar

Sirve cualquier grabadora que exporte **WAV sin comprimir**. Audacity es la
opción cómoda si está instalada.

Lo que **no** sirve es la grabadora de Windows: guarda `.m4a`, comprimido con
pérdida. El códec altera el espectro justo en lo que estas mediciones observan,
y además no se puede leer sin agregar dependencias al proyecto.

### Configuración, una sola vez

1. **Frecuencia de muestreo: 16000 Hz.** En Audacity, abajo a la izquierda.
2. **1 canal (mono).**
3. **Formato de exportación: WAV de 16 bits PCM.**
4. Grabar en un cuarto silencioso, a unos 20 cm del micrófono, con volumen
   normal de conversación.

Si la grabadora no deja fijar 16 kHz, grabar a 44.1 o 48 kHz también vale: el
análisis remuestrea con el filtro del propio proyecto. Lo que no admite
excepción es que el archivo sea WAV sin comprimir.

### ⚠️ Regla que decide si la medición sirve: una sola emisión por archivo

**Cada archivo tiene que contener la frase dicha UNA vez, y nada más.** Sin
repeticiones, sin la toma anterior, sin carraspeos ni "a ver, otra vez".

No es una preferencia de orden. La primera sesión de grabación (S9-T3, agosto)
falló exactamente por esto: cada archivo traía de 3 a 7 emisiones, el detector
las separa por las pausas, y el comparador terminó enfrentando *"I need"* contra
*"a new ship"*. El resultado fue **1.9 puntos** de separación entre bien y mal
pronunciado, cuando RF-10 exige 20. Con las señales sintéticas daban 31.

El síntoma que lo delató: dos tomas de la misma versión, del mismo hablante y la
misma sesión, quedaron a distancia 57 — más lejos que el par promedio
*correcto contra incorrecto*.

### Al exportar cada toma

1. Con el ratón, **seleccionar solo el tramo de la emisión**, dejando alrededor
   de medio segundo de silencio a cada lado.
2. `Archivo → Exportar → Exportar audio seleccionado`, formato
   **WAV de 16 bits PCM**.

Antes de exportar conviene mirar la forma de onda: tiene que verse **un solo
bloque de actividad** entre dos zonas planas. Si se ven dos o más bloques, hay
más de una emisión y el archivo no sirve.

La frase dura entre 1 y 2 segundos, así que **cada archivo debe pesar entre 30 y
70 KB** a 16 kHz mono. Uno de 300 KB tiene varias tomas dentro.

---

## Qué grabar

Cinco frases, cada una en cuatro versiones. **Dos personas distintas** (idealmente
una voz más grave y otra más aguda — es justo lo que el comparador debe tolerar).

### Las frases

Se eligieron por contener pares mínimos, que son los que el requisito RF-10
menciona: cambian en un solo sonido y sirven para distinguir "bien" de "mal".

| # | Frase | Par mínimo que ejercita |
|---|---|---|
| 1 | *I need a new ship* | ship / sheep |
| 2 | *She had a bad day* | bad / bed |
| 3 | *Please sit down here* | sit / seat |
| 4 | *He will live there* | live / leave |
| 5 | *Can you pull it* | pull / pool |

### Las cuatro versiones de cada frase

| Versión | Cómo decirla | Para qué sirve |
|---|---|---|
| `ok` | Lo mejor que puedas | Referencia de pronunciación correcta |
| `ok2` | Otra vez, igual de bien | Mide la repetibilidad: dos tomas buenas deben puntuar alto entre sí |
| `mal` | Cambiando **la vocal del par mínimo**, y solo esa | El error que el sistema debe detectar |
| `rapido` | Bien pronunciada pero deprisa | Verifica que la velocidad no penaliza |

**Qué cambia exactamente en la versión `mal`.** El resto de la frase se dice
igual: la única diferencia debe ser la vocal. Si además se cambia el ritmo o el
volumen, la medición deja de atribuir la diferencia a la pronunciación.

| # | Versión `ok` dice… | Versión `mal` dice… | El cambio |
|---|---|---|---|
| 1 | *I need a new **ship*** — vocal corta, como la "i" española | *I need a new **sheep*** — vocal larga, "shíip" | ɪ → iː |
| 2 | *She had a **bad** day* — boca abierta, entre "a" y "e" | *She had a **bed** day* — "e" clara española | æ → ɛ |
| 3 | *Please **sit** down here* — corta, "sit" | *Please **seat** down here* — larga, "síit" | ɪ → iː |
| 4 | *He will **live** there* — corta, "liv" | *He will **leave** there* — larga, "líiv" | ɪ → iː |
| 5 | *Can you **pull** it* — corta, "pul" | *Can you **pool** it* — larga, "púul" | ʊ → uː |

### Cómo nombrar los archivos

```
<hablante>-<frase>-<version>.wav
```

Por ejemplo:

```
fabrizio-1-ok.wav
fabrizio-1-ok2.wav
fabrizio-1-mal.wav
fabrizio-1-rapido.wav
fabrizio-2-ok.wav
...
isaac-1-ok.wav
...
```

El hablante en minúsculas y sin tildes; la frase con su número del 1 al 5.

**Total: 2 hablantes × 5 frases × 4 versiones = 40 archivos.** A 16 kHz mono son
unos 32 KB por segundo, así que el conjunto completo ronda los 4 MB.

### Si el tiempo aprieta

El mínimo que ya permite recalibrar es **un hablante, tres frases, versiones
`ok`, `ok2` y `mal`** — nueve archivos. Con eso salen las dos distribuciones que
importan, aunque sin poder medir la tolerancia entre voces distintas.

---

## Qué pasa después

Con los archivos en esta carpeta, se corre:

```
npx vitest run tests/audio/calibracion.test.ts
```

El análisis ya está escrito y produce:

1. La distribución de distancias de los pares **correctos** (`ok` contra `ok2`,
   `ok` contra `rapido`, y entre hablantes distintos).
2. La distribución de los pares **incorrectos** (`ok` contra `mal`).
3. El punto de separación entre ambas y la constante de escala que la maximiza.
4. Comparación de las cifras reales contra las sintéticas actuales.

De ahí sale el ajuste de las dos constantes y la evidencia de S9-T3.

---

## Los audios NO se versionan — decidido

Se versiona **solo el resultado de las mediciones**, en `docs/evidencias/s9/`.
Los archivos de audio quedan fuera del repositorio, igual que se acordó para el
fixture de librosa (D-07): cuatro megabytes en el historial de git no se borran
después, y la evidencia que el curso evalúa son las cifras, no las grabaciones.

El `.gitignore` de esta carpeta excluye `.wav`, `.mp3`, `.m4a`, `.flac` y `.ogg`,
así que grabar y probar en local no sube nada por accidente. La exclusión cubre
los formatos comprimidos porque en la primera sesión los `.mp3` originales sí se
colaron a un commit.

**Consecuencia práctica:** quien quiera reproducir la calibración tiene que
grabar sus propias tomas siguiendo este protocolo. Por eso el protocolo está
escrito con este nivel de detalle.

---

## Nota sobre consentimiento

Son grabaciones de voz de integrantes del equipo, hechas por ellos mismos para
probar su propio proyecto. Si en algún momento se grabara a alguien externo,
corresponde pedirle permiso explícito antes de incorporar su voz al repositorio.
