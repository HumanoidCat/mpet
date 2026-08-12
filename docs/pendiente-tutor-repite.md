# RESUELTO · El tutor repite siempre la misma respuesta

> **Arreglado el 11 de agosto.** Registrado como **I-10** en
> `docs/10-bitacora-decisiones.md`. El diagnóstico de abajo es el que se usó para
> el arreglo; se deja como está por si hace falta el detalle completo. El mensaje
> con lo que se tocó está en `MENSAJE-isaac-i09-i10.md`, en esta misma carpeta.
>
> **Falta:** correr `npx vitest run` completo (se verificó la lógica de forma
> aislada, no con vitest) y abrir el PR a `dev`.

## Qué se ve

El tutor contesta **«I'm doing well, thanks for asking.» a todo**, sin importar lo
que diga el estudiante. Tres turnos seguidos, respuesta idéntica:

| El estudiante dice | El tutor responde |
|---|---|
| How are you doing? | I'm doing well, thanks for asking. |
| Well, I need to practice my English. | I'm doing well, thanks for asking. |
| Can you help me please? | I'm doing well, thanks for asking. |

## Qué NO es

- **No es el deploy.** La versión desplegada es la correcta.
- **No es el filtro de negativas memorizadas** que se acaba de mergear (PR #74).
  Ese funciona: la respuesta que mencionaba a OpenAI ya no aparece. Este es un
  síntoma distinto del mismo modelo.
- **No es el prompt de sugerencias.** Las sugerencias funcionan bien; en las
  mismas capturas devuelven cosas útiles («I must practice my English
  diligently.», «Can you please provide me with more information about what you
  need?»).

## Causa

`buildTutorPrompt` en `src/ai/suggestions/suggestionsProtocol.ts` arma el prompt
con los últimos cuatro turnos, así:

```
You are a friendly English tutor talking with a student. Reply in one short
sentence and end with a question to keep the conversation going.

Student: How are you doing?
Tutor: I'm doing well, thanks for asking.
Student: Well, I need to practice my English.
Tutor:
```

El modelo (LaMini-Flan-T5-248M) **copia la línea `Tutor:` que ya tiene delante**
en vez de generar una nueva. Es comportamiento conocido de un T5 pequeño ante un
transcript multi-turno: LaMini-Flan está afinado para instrucciones sueltas —el
propio comentario del archivo lo dice— y el historial le da algo que copiar.

**La evidencia de que copia y no razona:** la respuesta no termina en pregunta,
que es exactamente lo que `TUTOR_INSTRUCTION` le pide. No está desobedeciendo la
instrucción, la está ignorando para repetir texto del contexto.

## Arreglo propuesto (opción A, la más chica)

Quitar del prompt las líneas del tutor, que son la fuente de la copia. Solo se le
pasa lo que dijo el estudiante.

En `src/ai/suggestions/suggestionsProtocol.ts`:

```ts
export function buildTutorPrompt(
  history: readonly HistoryTurn[],
  turns: number = HISTORY_TURNS
): string {
  const ultimoDelEstudiante = [...history]
    .reverse()
    .find((m) => m.role === 'user');
  return `${TUTOR_INSTRUCTION}\n\nStudent: ${ultimoDelEstudiante?.text ?? ''}\nTutor:`;
}
```

**Qué se pierde:** el contexto conversacional. El tutor deja de "recordar" turnos
anteriores. Cuesta poco en la práctica, porque el modelo no lo estaba usando para
nada útil: lo usaba para copiarse.

**Ojo:** el parámetro `turns` queda sin uso y hay tests en
`tests/ai/suggestionsProtocol.test.ts` que verifican el formato multi-turno del
prompt. Hay que actualizarlos junto con el cambio, no borrarlos.

## Si la opción A no alcanza

**Opción B — conservar contexto sin dar qué copiar.** Mantener el historial pero
incluir solo los turnos del estudiante, numerados o concatenados, sin ninguna
línea `Tutor:`. Conserva algo de contexto y elimina la fuente de la copia.

**Opción C — tocar la generación.** En `suggestionsWorker.ts`, pasarle al
`generate` un `no_repeat_ngram_size` o un `repetition_penalty`. Es la más
arriesgada de las tres porque afecta también a las sugerencias, que hoy funcionan
bien. No hacerla sin medir antes y después.

## Cómo verificar

Sin modelo, en pruebas: que `buildTutorPrompt` ya no contenga la cadena `Tutor:`
seguida de texto previo, con un historial de varios turnos.

Con modelo, en la app: tres turnos seguidos con frases distintas
—«How are you doing?», «I need to practice my English», «Can you help me?»— y
comprobar que las tres respuestas son distintas entre sí y que cada una termina
en pregunta, que es lo que pide la instrucción.

## Contexto

Esto **no bloquea la entrega**: el tutor conversacional funciona técnicamente,
responde, y la cadena completa está integrada. Lo que falla es la calidad de la
respuesta. Pero se nota de inmediato en cualquier demostración en vivo, así que
conviene cerrarlo antes de la entrega final del 8 de septiembre.

Está relacionado con el pendiente ya registrado de evaluar alternativas al
modelo: es el mismo modelo el que produce los dos síntomas.
