# S7-T4 · ¿Cuántas palabras pronuncia mal el sintetizador de voz?

**Responsable:** Isaac Morum (módulo `src/ai/`) · **Fecha:** 4 de agosto de 2026
**Código:** `src/ai/spike-s7-t4/`
**Cómo se corre:** `npm.cmd run dev` → <http://localhost:5173/src/ai/spike-s7-t4/index.html>

## 1. Qué se mide y por qué

El spike S4-T5 detectó de oído que MMS-TTS pronuncia mal *vegetables* ("veyitables").
Eso es una observación, no una medición, y de ella depende una decisión cara: si el
defecto es frecuente hay que cambiar de modelo, lo que significa dos dependencias
nuevas y **216 MB adicionales** de descarga.

Importa más que en una aplicación normal porque el audio sintetizado es la
**referencia contra la que se puntúa la pronunciación del estudiante**. Una referencia
defectuosa hace dos daños a la vez: el estudiante imita el error, y el comparador
penaliza a quien pronuncie *bien*.

## 2. Protocolo, fijado antes de medir

Acordado con Alejandro **antes** de ver ningún resultado, para que el dato no se
interprete a conveniencia:

| Fallos sobre 14 | Decisión |
|---|---|
| 1 o 2 | Se queda MMS-TTS. Limitación documentada. |
| 3 o 4 | No se cambia de modelo: se curan las frases de práctica para evitar esas palabras. |
| 5 o más | Se abre el `shared-change` de Kokoro, **siempre junto con** la carga bajo demanda del TTS. |

Dos vías complementarias: una objetiva y automatizable, y una de escucha que la
controla. Este documento cubre la primera; la segunda está pendiente (§6).

## 3. La vía objetiva: cerrar el ciclo con nuestras propias piezas

```
texto → TTS (MMS-TTS) → PCM 16 kHz → ASR (Whisper-tiny.en) → texto reconocido
```

Si nuestro propio reconocedor no recupera la palabra que el sintetizador intentó
decir, la pronunciación es defectuosa. La ventaja es que se puede repetir cuando se
quiera y no depende del oído de nadie. Y recorre exactamente el mismo camino que el
comparador de pronunciación, así que mide el defecto donde duele.

Se usan los clientes reales de producción (`ttsClient`, `asrClient`), no copias.

- Repeticiones por palabra: **3**, porque el sintetizador es estocástico y una sola
  síntesis puede salir por casualidad buena o mala. Falla si no se reconoce en al
  menos 2 de 3.
- Silencio añadido alrededor de cada audio: 0.25 s.

## 4. Corrección del método, con su evidencia

El protocolo pedía medir con la **palabra aislada**, para que el reconocedor no
pudiera apoyarse en el contexto. Al ejecutarlo, ese método resultó **inválido**:

| Palabra de control | Lo que entendió el ASR | Veredicto |
|---|---|---|
| water | "bye here" | **FALLA** |
| green | "reen" | **FALLA** |
| book | "no" | **FALLA** |
| morning | "morning" | ok |
| teacher | "teacher" | ok |

**3 de 5 palabras fáciles fallaron con la palabra sola**, y en una corrida anterior
*book* devolvió directamente `[blank_audio]`. No es culpa del sintetizador: Whisper
está entrenado con habla continua y un recorte de medio segundo no le da contexto
acústico; a veces ni siquiera lo considera voz.

Se sustituyó por una **frase portadora** fija: `Say ___ again, please.` Es la técnica
estándar en fonética para este problema: da contexto acústico —duración, entonación,
algo antes y después— sin que el contexto permita adivinar la palabra objetivo,
porque en ese hueco cabe cualquiera.

**Sesgo que introduce, declarado:** algo de contexto lingüístico queda, así que el
reconocedor podría recuperar una palabra mal pronunciada y el conteo quedaría *por
debajo* del real. El sesgo empuja hacia "no cambiar de modelo", que es la dirección
conservadora: sirve para descartar el cambio, no para justificarlo.

## 5. Resultados

### 5.1 Control — y por qué el resultado no es concluyente por sí solo

| Palabra | Lo que entendió el ASR (3 repeticiones) | Aciertos | Veredicto |
|---|---|---|---|
| water | "say witter…" · "say what her…" · "say witter…" | 0/3 | **FALLA** |
| green | "say green…" · "say green…" · "say greened…" | 3/3 | ok |
| book | "say but…" · "say both…" · "say both…" | 0/3 | **FALLA** |
| morning | "say morning …*" · "say morning again please" ×2 | 3/3 | ok |
| teacher | "say teacher read and…" · "say teacher again…" · "say keeture…" | 2/3 | ok |

> \* Una transcripción de *morning* incluyó una palabra ofensiva. Es ruido del
> reconocedor al oír "again please", no contenido: se censura aquí y queda anotado
> para que nadie lo tome por un dato.

**2 de 5 palabras de control fallaron.** Son palabras triviales —*water*, *book*—, así
que una parte de los fallos de la tabla siguiente puede venir del reconocedor y no del
sintetizador. **Esta vía, por sí sola, no decide.**

### 5.2 Palabras objetivo

| Palabra | Qué prueba | Lo que entendió el ASR | Aciertos | Veredicto |
|---|---|---|---|---|
| vegetables | sílabas que se comprimen | "utubels" · "g-tubles" · "vigitubus" | 0/3 | **FALLA** |
| temperature | sílabas que se comprimen | correcta ×3 | 3/3 | ok |
| favorite | sílabas que se comprimen | correcta ×2 · "favourite" | 3/3 | ok |
| Wednesday | letra muda | "widdens day" · "it and stay" · correcta | 1/3 | **FALLA** |
| ginger | ge/gi suave | "your egg" · "grigand" · "gendre" | 0/3 | **FALLA** |
| engine | ge/gi suave | "inhined" · "ainjin" · "enin" | 0/3 | **FALLA** |
| knife | k muda | "nife" · "dayphagan" · "nife" | 0/3 | **FALLA** |
| island | s muda | "iwond" · correcta · "ill end" | 1/3 | **FALLA** |
| salmon | l muda | "someone" · "saman" · "summon" | 0/3 | **FALLA** |
| nature | terminación -ture | correcta ×2 · "necher" | 2/3 | ok |
| pleasure | terminación -sure | correcta ×3 | 3/3 | ok |
| chef | "ch" que suena /ʃ/ | correcta ×3 | 3/3 | ok |
| through | familia "ough" | correcta ×3 | 3/3 | ok |
| **$25** | cifras y símbolos | "sake is" · "sait as" · "say this" | 0/3 | **FALLA** |

**Resultado bruto: 8 fallos de 14.** Sobre el umbral de 5, dispararía el
`shared-change` de Kokoro — **pero no se puede tomar esa decisión todavía**, porque el
control no salió limpio.

### 5.3 Lo que sí se puede concluir ya

Un hallazgo no depende del reconocedor y es grave por su cuenta:

> **El sintetizador no sabe decir cifras.** Con `$25` el reconocedor no oyó un número
> equivocado: no oyó nada donde debía ir la cifra, en las tres repeticiones. Es
> coherente con cómo funciona el modelo, que trabaja carácter a carácter y nunca
> aprendió a convertir dígitos en palabras.

Para un tutor de conversación eso pega donde duele: precios, horas y fechas son
contenido básico de una clase de inglés. Es independiente de si Kokoro entra o no, y
la mitigación es barata: **convertir los números a letras antes de sintetizar**
("$25" → "twenty five dollars"). Cabe en mi módulo y no necesita aprobación de nadie.

## 6. Lo que falta

- **La vía de escucha**, que es la que decide, porque la automática quedó no
  concluyente. Dos oyentes por separado, criterio binario por palabra —¿un hablante
  de inglés la reconocería sin contexto?— y los desacuerdos cuentan como no fallo.
- **Repetir la corrida automática.** El sintetizador es estocástico: el conteo puede
  variar en ±1 entre corridas.
- Queda pendiente decidir si el control debe ampliarse: con 5 palabras, que fallen 2
  da una tasa de control demasiado alta para afinar. Con 15-20 palabras de control el
  margen de atribución sería más estrecho.

## 7. Corrección aplicada al instrumento

Durante la corrida apareció un **falso positivo**: el reconocedor escribió *favourite*
(grafía británica) y la comparación lo contó como fallo, cuando la pronunciación era
correcta. Se añadió esa forma a las alternativas aceptadas. No cambia el veredicto de
esa palabra —ya salía `ok` por mayoría— pero sí habría falseado el conteo en otra
corrida. Queda como recordatorio de que el instrumento también se verifica.
