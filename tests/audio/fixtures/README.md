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

**Usar Audacity**, que ya está instalado. La grabadora de Windows guarda `.m4a`,
que es comprimido con pérdida: el códec altera el espectro justo en lo que las
mediciones observan, y además no se puede leer sin agregar dependencias.

### Configuración, una sola vez

1. Abrir Audacity.
2. Abajo a la izquierda, **Frecuencia del proyecto: 16000 Hz**.
3. En la barra de grabación, **1 canal (mono)**.
4. Grabar en un cuarto silencioso, a unos 20 cm del micrófono, con volumen
   normal de conversación.

### Al exportar cada toma

`Archivo → Exportar → Exportar como WAV`, con formato **WAV de 16 bits PCM**.

> Si el menú ofrece "Exportar audio seleccionado", conviene seleccionar solo el
> tramo con voz y dejar medio segundo de silencio a cada lado.

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
| `mal` | Cambiando **la vocal del par mínimo** (decir *sheep* donde dice *ship*) | El error que el sistema debe detectar |
| `rapido` | Bien pronunciada pero deprisa | Verifica que la velocidad no penaliza |

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

## Antes de subirlos al repositorio

**Consultar con el PM.** Cuatro megabytes de audio en el historial de git no se
borran después, y hay dos alternativas razonables:

- Versionarlos, si se considera que la reproducibilidad de la calibración vale
  ese peso.
- Dejarlos fuera y versionar solo las mediciones que produzcan, igual que se
  acordó para el fixture de librosa.

Mientras tanto, esta carpeta tiene un `.gitignore` que **excluye los `.wav`**, de
modo que grabarlos y probarlos en local no los sube por accidente.

---

## Nota sobre consentimiento

Son grabaciones de voz de integrantes del equipo, hechas por ellos mismos para
probar su propio proyecto. Si en algún momento se grabara a alguien externo,
corresponde pedirle permiso explícito antes de incorporar su voz al repositorio.
