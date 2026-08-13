# Mensaje para Isaac — Kokoro aprobado, arrancá el `shared-change`

Isaac, revisé el #80 (`d12-kokoro-decision-final.md` + `spike-kokoro/`). Ya está
mergeado a `dev`. Y sobre la recomendación de fondo: **aprobado, arrancá el PR
real.**

## Por qué apruebo

El umbral lo habíamos fijado de antemano —5 fallos o más abre el
`shared-change`— y con MMS-TTS ya se cruzaba desde el 4 de agosto (D-12 en la
bitácora). Lo que yo había puesto como condición no era el resultado, era el
calendario: dijimos que se diferiría hasta después del Avance 2 porque meter una
dependencia nueva a seis días de una entrega era imprudente. El Avance 2 ya se
entregó. Esa condición se cumplió, no cambié de criterio al ver el número.

Y el número, con Kokoro medido de verdad y no leído de la ficha, no deja mucho
margen de duda: 1 fallo contra 7, determinista contra el suelo de 49.5 que le
costaba a R03, y más liviano cuantizado que lo que reemplazaría. Registrado como
**D-17** en `docs/10-bitacora-decisiones.md`.

## Lo que dejo escrito como pendiente, no como bloqueo

Vos mismo lo señalaste en el documento en vez de esconderlo: el 7/14 de MMS-TTS
que disparó todo esto nunca tuvo el segundo oyente que pide el protocolo. No creo
que cambie la conclusión —la distancia a 1/14 es demasiado grande para que un
sesgo de un solo oyente la borre— pero quiero que quede en el PR del
`shared-change`, no que se pierda. Si en algún momento alguien pregunta por qué
se adoptó Kokoro, la respuesta tiene que incluir esa limitación, no solo el
número lindo.

## Qué hacer ahora

1. Abrí el PR real: `kokoro-js` y `phonemizer` a `package.json`, el swap en
   `ttsWorker.ts` de MMS-TTS a Kokoro.
2. Etiqueta `shared-change` — vos ya sabés por qué, pero lo repito porque es la
   regla que se saltó una vez (I-08) y no quiero que se repita: toca
   `package.json`, que reviso yo antes de que entre a `dev`.
3. En la descripción del PR, mencioná el hueco del segundo oyente. No hace falta
   resolverlo antes de mergear — la decisión ya está tomada con esa limitación
   declarada — pero tiene que estar escrito ahí, no solo en la bitácora.
4. `I-07` (números a letras) queda en producción igual, conviviendo con Kokoro:
   vos mismo lo dijiste en el documento, deja de ser necesario si Kokoro
   reemplaza a MMS-TTS pero no estorba mientras conviven, y por ahora conviven
   hasta que el swap esté probado.

Buen trabajo con el spike — la disciplina de medir con el mismo banco, declarar
qué no se verificó (una sola voz, una sola repetición) en vez de callarlo, y no
tocar `package.json` hasta tener permiso, es exactamente el criterio con que se
viene armando este proyecto.
