# I-07 · Números a letras antes de sintetizar

**Responsable:** Isaac Morum (`src/ai/`) · **Fecha:** 7 de agosto de 2026
**Código:** `src/ai/tts/textNormalization.ts`

## 1. El fallo, medido

El conteo de pronunciación (S7-T4) encontró que MMS-TTS **no dice cifras**. Con `$25`
el reconocedor no oyó un número equivocado: no oyó **nada** donde iba la cifra, en las
tres repeticiones — "sake is", "sait as", "say this". Es coherente con cómo funciona el
modelo, que convierte caracteres en sonidos y nunca aprendió que "2" se dice "two".

Importa porque precios, horas y fechas son contenido básico de una clase de inglés
conversacional. El estudiante oía un hueco mudo justo en la parte que tenía que
aprender — y como ese audio es además la referencia contra la que se puntúa, el hueco
se convertía en un puntaje injusto.

## 2. La solución

Escribir el número en letras antes de dárselo al modelo. Sin cambiar de modelo, sin
dependencias nuevas y sin pedir aprobación a nadie: ocurre dentro del worker, así que
lo recibe cualquiera que llame a `speak()`, venga de donde venga el texto.

| Entra | Sale |
|---|---|
| `$25` | twenty-five dollars |
| `$1.50` | one dollar fifty cents |
| `8:30` | eight thirty |
| `8:00` | eight o'clock |
| `8:05` | eight oh five |
| `1998` | nineteen ninety-eight |
| `2005` | two thousand five |
| `3rd` | third |
| `21st` | twenty-first |
| `50%` | fifty percent |
| `3.14` | three point one four |

Las reglas se aplican de la más específica a la más general, y ese orden es parte del
diseño: `$25.50` tiene que reconocerse como dinero **antes** de que la regla de los
decimales lo parta en "twenty-five point five zero".

## 3. Verificación en ejecución

Ciclo completo con los clientes reales — texto → TTS → PCM → ASR:

| Frase sintetizada | Lo que entendió el reconocedor |
|---|---|
| It costs **$25** and starts at **8:30** in the morning. | "It costs **$25** and starts at **8 30** in the morning." |
| I was born in **1998**. | "I was born in **1998**." |
| The **3rd** of May at **9:15**. | "The **third** of May at **915**." |

El reconocedor devuelve las cifras en dígitos porque así normaliza su salida; lo que
importa es que **el sonido está y significa lo correcto**, frente al silencio anterior.

23 pruebas unitarias sobre la lógica pura.

## 4. Alcance y limitaciones declaradas

- **Inglés, hasta los millones.** No cubre números romanos, fracciones ni notación
  científica: no aparecen en conversación de práctica.
- Lo que no reconoce **lo deja pasar a la regla general de enteros**, que siempre
  convierte. Nunca quedan dígitos sueltos, porque un dígito suelto es un silencio.
- `25:60` no se dice como hora —no lo es— pero igual se pronuncia "twenty-five sixty".
  Imperfecto y audible es mejor que correcto y mudo.
- No arregla las otras palabras que MMS-TTS pronuncia mal (*vegetables*, *water*,
  *book*): eso sigue dependiendo de la decisión sobre Kokoro.
