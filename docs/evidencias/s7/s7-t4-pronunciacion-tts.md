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

Dos vías complementarias: una objetiva y automatizable (§3-5) y una de escucha que la
controla (§6).

> **Resultado, en una línea:** 7 fallos de 14 con el conteo reconciliado, más 2 de las
> 5 palabras de **control** —*water* y *book*— fallando en las dos vías. Supera el
> umbral y, sobre todo, invalida la salida barata de curar las frases de práctica.
> Falta el segundo oyente para cerrarlo formalmente (§7).

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

## 6. Vía de escucha — oyente 1 (Isaac Morum, 4-ago-2026)

A ciegas: el oyente escribió lo que oyó **antes** de ver la palabra objetivo, y las 14
trampa iban mezcladas al azar con las 5 de control. Escribió de forma fonética a
propósito, para simular a un estudiante de nivel básico.

### 6.1 Un defecto del instrumento, encontrado con los datos en la mano

La comparación automática de la página es de cadenas exactas, así que contó **12 de
14** fallos. Ese número **no es utilizable**: castiga la ortografía del oyente, no la
pronunciación del modelo. Cinco de esos doce son grafías fonéticas de una
pronunciación **correcta**:

| Escribió | Pronunciación correcta | Lectura |
|---|---|---|
| `wensday` | /ˈwenzdeɪ/ — la *d* de *Wednesday* es muda | correcta |
| `nife` | /naɪf/ — la *k* es muda | correcta |
| `plesure` | /ˈpleʒər/ | correcta |
| `faivorite` | /ˈfeɪvərɪt/ | correcta |
| `trhu` | /θruː/ | correcta |

En *knife* el reconocedor escribió también "nife" en 2 de 3 repeticiones: dos
observadores independientes transcribiendo el mismo sonido correcto.

**Criterio de reconciliación, aplicado a todas las palabras por igual:** cuenta como
fallo solo si el sonido oído difiere del correcto, no si difiere la grafía.

### 6.2 Conteo reconciliado

| Palabra | Reconocedor | Oyente | Veredicto |
|---|---|---|---|
| $25 | "sake is" · "sait as" · "say this" | "yes" | 🔴 falla |
| vegetables | "utubels" · "g-tubles" · "vigitubus" | "vigtables", con **g dura** confirmada | 🔴 falla |
| ginger | "your egg" · "grigand" · "gendre" | "ginderegen" | 🔴 falla |
| engine | "inhined" · "ainjin" · "enin" | "indin" | 🔴 falla |
| island | "iwond" · ok · "ill end" | "i wan" | 🔴 falla |
| salmon | "someone" · "saman" · "summon" | no la reconoció | 🔴 falla |
| chef | ok ×3 | "gif"; solo distinguió la *f* final | 🔴 falla |
| Wednesday · knife · pleasure · favorite · through | mayoría ok | grafía fonética correcta | ✅ ok |
| temperature · nature | ok | ok | ✅ ok |

**7 fallos de 14.** Supera el umbral de 5 fijado antes de medir.

En *chef* el oyente y el reconocedor discrepan. Se cuenta como fallo porque **quien
tiene que reconocer el audio es una persona**, no el reconocedor: el ASR fue un proxy
objetivo, pero el producto existe para que un estudiante imite lo que oye. La
discrepancia queda anotada aquí para que se pueda revisar.

### 6.3 El resultado más importante no está en las 14

**Fallan también dos de las cinco palabras de control, y en las dos vías:**

| Palabra | Reconocedor | Oyente |
|---|---|---|
| water | "witter" · "what her" · "witter" | "wither" |
| book | "but" · "both" · "both" | "buf" |

Las palabras de control son triviales, comunes y sin trampas de escritura. Que fallen
**no es ruido de la medición: es un dato sobre el modelo.** El defecto no se limita a
ortografía exótica.

Esto tiene una consecuencia directa sobre la mitigación barata que se había planteado
—curar el conjunto de frases de práctica para esquivar las palabras problemáticas—:
esa salida funciona si los fallos se concentran en palabras raras. **No se puede curar
un curso de inglés que no sabe decir *water* ni *book*.**

## 7. Lo que falta

- ⚠️ **Falta el segundo oyente.** El protocolo pide dos personas por separado, con
  **los mismos audios** (el panel los descarga para eso), y los desacuerdos entre
  oyentes cuentan como no fallo. Mientras no esté, el conteo de 7 sobre 14 es de un
  solo oyente y la decisión no está cerrada formalmente.
- **Repetir la corrida automática.** El sintetizador es estocástico y el conteo puede
  variar en ±1.
- Ampliar el control de 5 a 15-20 palabras: con cinco, que fallen dos deja un margen
  de atribución demasiado ancho.
- Corregir el instrumento: la comparación por cadena exacta debería admitir grafías
  fonéticas, o el veredicto debería pedirse por separado del texto escrito.

## 8. Corrección aplicada al instrumento

Durante la corrida apareció un **falso positivo**: el reconocedor escribió *favourite*
(grafía británica) y la comparación lo contó como fallo, cuando la pronunciación era
correcta. Se añadió esa forma a las alternativas aceptadas. No cambia el veredicto de
esa palabra —ya salía `ok` por mayoría— pero sí habría falseado el conteo en otra
corrida. Queda como recordatorio de que el instrumento también se verifica.
