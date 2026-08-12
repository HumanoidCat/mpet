# Mensaje para Isaac — qué se tocó en tu módulo (I-09 e I-10)

Isaac, avisándote de dos cosas que se corrigieron en `src/ai/suggestions/`
mientras probábamos la app el 11 de agosto. Las dos son tuyas (S6-T4 / S7-T2),
así que quedan a tu revisión antes de que se suban a `dev` — no se pushó nada
todavía, está local.

## Lo que se vio

Probando la conversación en la app desplegada, dos fallas del modelo del tutor,
una detrás de otra:

**Primero (ya en `dev`, PR #74, mergeado):** ante «Hi, how are you?» el tutor
respondió literalmente:

> I'm sorry, but I cannot respond to this prompt as it goes against OpenAI's use
> case policy on generating inappropriate or offensive content.

**Segundo (recién arreglado, todavía no subido):** con el primero ya corregido,
tres turnos seguidos de una conversación real recibieron la misma respuesta
exacta, sin importar lo que dijera el estudiante:

| Estudiante | Tutor |
|---|---|
| How are you doing? | I'm doing well, thanks for asking. |
| Well, I need to practice my English. | I'm doing well, thanks for asking. |
| Can you help me please? | I'm doing well, thanks for asking. |

Las dos quedaron registradas en `docs/10-bitacora-decisiones.md` como **I-09** e
**I-10**, con el detalle completo de causa y evidencia. Este mensaje es el
resumen de qué se tocó y por qué.

## I-09 — la negativa memorizada (ya integrado)

**Causa.** LaMini-Flan-T5-248M se destiló de salidas de GPT-3.5, y esas negativas
quedaron en su corpus. Ante una entrada que no sabe continuar, devuelve una
memorizada en vez de generar. Es el mismo fenómeno que ya habías anotado en
D-14 durante el spike S6-T4 con el modelo de 77M — acá apareció en el de 248M,
el que se eligió, con una entrada mucho más simple.

**Qué se tocó.** `src/ai/suggestions/cleanup.ts`: se agregó
`esRechazoMemorizado(texto)` y `RESPUESTA_DE_RESERVA`, y `cleanTutorReply` ahora
sustituye la salida cuando la detecta (o cuando viene vacía). Tests nuevos en
`tests/ai/cleanup.test.ts` (queda en 27 casos).

**Estado.** Ya en `dev` y en `main`. PR #74, commit `0813cb3`. Suite completa
corrida por Alejandro: 42 archivos, 522 pruebas, verde.

## I-10 — la repetición (arreglado, sin subir)

**Causa.** `buildTutorPrompt` (en `suggestionsProtocol.ts`) armaba el prompt
intercalando turnos del estudiante y del tutor, y el modelo empezaba a **copiar
la última línea `Tutor:` que ya tenía delante** en vez de generar una nueva. Se
nota porque la respuesta copiada no termina en pregunta, que es justo lo que pide
`TUTOR_INSTRUCTION`.

**Qué se tocó.** Solo `buildTutorPrompt`, en `src/ai/suggestions/suggestionsProtocol.ts`.
La firma no cambia — sigue siendo `(history, turns?)` — así que no toca al
worker ni al cliente. Ahora el prompt solo incluye los turnos del **estudiante**
dentro de la ventana de `HISTORY_TURNS`; se quitan las líneas `Tutor:` de en
medio, y el prompt sigue terminando en `\nTutor:` para que el modelo complete
ahí:

```
You are a friendly English tutor talking with a student. Reply in one short
sentence and end with a question to keep the conversation going.

Student: How are you doing?
Student: Well, I need to practice my English.
Tutor:
```

**Se pierde** que el modelo "vea" sus propias respuestas anteriores. No parece
costar nada en la práctica — las estaba usando para copiarse, no para responder
mejor — pero es tu criterio si lo revisás con más casos.

**Tests.** `tests/ai/suggestionsProtocol.test.ts`: reescribí el bloque de
`buildTutorPrompt`. Los tres tests viejos que asumían líneas `Tutor:` en el
prompt ya no aplicaban con el comportamiento nuevo, así que quedaron reescritos
(no borrados: la prueba de recorte por ventana, la de historial vacío y la del
valor por defecto de `HISTORY_TURNS` siguen). Se agregaron:

- Regresión explícita de I-10: falla si alguien vuelve a meter líneas `Tutor:`
  con contenido en el prompt.
- Un caso con un solo turno del estudiante (el caso real que disparó el bug).
- Un caso que confirma que dos preguntas distintas dan prompts distintos —
  antes del arreglo esto habría sido más difícil de garantizar.

**Verificación.** `tsc --noEmit` limpio. La lógica de `buildTutorPrompt` se
ejecutó de forma aislada (no con vitest — vitest está roto en el entorno donde
se armó el arreglo, problema de un binario nativo de rollup, nada que ver con el
código) y los 15 casos del bloque pasaron, incluido el prompt real que causaba el
bug en producción. **Falta que corras `npx vitest run` completo** antes de que
esto se suba, igual que se hizo con I-09.

## Qué te pido

1. Revisá `buildTutorPrompt` en `suggestionsProtocol.ts` y los tests en
   `suggestionsProtocol.test.ts` — es tu módulo, quiero tu ojo antes de que
   entre.
2. Si te parece bien, corré la suite completa (`npx vitest run`) y abrí el PR a
   `dev` vos, como con I-09. Si preferís que lo abra yo, decime.
3. Si se te ocurre una mejor forma de mantener algo de contexto sin darle al
   modelo líneas para copiar (por ejemplo, numerar los turnos del estudiante en
   vez de solo listarlos), es tu decisión — el arreglo actual es el mínimo que
   quita la causa, no necesariamente el mejor diseño posible.

Los dos incidentes quedan completos en `docs/10-bitacora-decisiones.md` (I-09 e
I-10) por si querés el detalle con más contexto del que puse acá.
