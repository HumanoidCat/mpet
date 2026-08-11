# Guion de la presentación final — MPET

Guion leído, para las 15 diapositivas de `MPET-presentacion-final.pptx`.
Duración estimada: **13 minutos**. Se lee tal cual está escrito.

**Reparto** — cada uno habla una sola vez, de corrido, en este orden:

| Turno | Persona | Diapositivas | Tiempo |
|---|---|---|---|
| 1.º | Monestel | 1 – 3 | ~2:15 |
| 2.º | Fabrizio | 4 – 8 | ~4:30 |
| 3.º | Isaac | 9 – 11 | ~2:45 |
| 4.º | Alejandro | 12 – 15 | ~3:20 |

Cada bloque termina con una frase de enlace. Esa frase es la señal para que el
siguiente avance la diapositiva y empiece a hablar. No hace falta decir «ahora le
paso la palabra a».

Las preguntas del final **no** se reparten por bloque sino por especialidad: la
última sección de este documento dice quién responde qué.

---

# TURNO 1 · MONESTEL — diapositivas 1 a 3

## Diapositiva 1 — Portada · 0:35

Buenas tardes. Vamos a presentar My Personal English Teacher, una aplicación que
evalúa la pronunciación del inglés usando procesamiento digital de señales, y que
corre íntegramente dentro del navegador.

Lo que van a escuchar tiene una estructura: primero el problema y cómo está
construida la solución, después los conceptos del curso que aplicamos y cómo
verificamos cada uno, y al final el resultado técnico más importante del proyecto,
que es un límite del método que encontramos midiendo y que nos obligó a cambiar
el enfoque.

Empecemos por el problema.

## Diapositiva 2 — El problema · 0:50

Para un hispanohablante, aprender inglés conversacional no es un problema de
conocimiento sino de producción oral. El estudiante sabe la regla, pero no
consigue pronunciar de forma inteligible.

Hay tres causas concretas.

La primera es fonética. El español tiene cinco vocales; el inglés supera las once.
Pares como *ship* y *sheep* se colapsan en un mismo sonido para el oído no
entrenado, y el estudiante no puede corregir lo que no distingue.

La segunda es de acceso. La práctica oral efectiva exige alguien que corrija en el
momento, y las alternativas reales cuestan, dependen de horarios y requieren
conexión estable.

La tercera es la retroalimentación. Las aplicaciones masivas responden «correcto» o
«inténtalo de nuevo», sin decir qué falló ni por qué.

Ese tercer punto define nuestro objetivo: no basta con detectar el error, hay que
señalar dónde estuvo. Y para poder hacerlo sin depender de una conexión, todo tiene
que ocurrir en el dispositivo del usuario.

## Diapositiva 3 — Por qué en el navegador · 0:50

Que todo ocurra en el navegador no es una preferencia estética. Determina si la
herramienta es utilizable.

Los cuatro modelos de inteligencia artificial —reconocimiento de voz, corrección
gramatical, síntesis de voz y generación de respuestas— se descargan una sola vez y
se ejecutan localmente. En total son 676 megabytes, de los cuales 302 se cargan al
arrancar y el resto llega cuando hace falta.

De esa decisión salen tres propiedades. No hay servidores de inferencia, así que no
hay cuotas por uso ni límite de sesiones y el costo de operación es cero. Tras la
descarga inicial la aplicación funciona sin conexión. Y el audio nunca sale del
dispositivo: la voz es un dato biométrico, y aquí la privacidad no depende de una
política de privacidad sino de la arquitectura.

En zonas con conectividad intermitente o costosa, la práctica oral simplemente no
ocurre. Esto es lo que la hace posible.

**› Enlace:** Veamos ahora qué ocurre, paso a paso, cuando el estudiante habla.

---

# TURNO 2 · FABRIZIO — diapositivas 4 a 8

## Diapositiva 4 — La cadena de un turno · 1:00

Esta es la cadena completa de un turno.

El micrófono entrega audio a 48 kilohertz. Lo primero es bajar a 16 kilohertz, que
es lo que espera el reconocedor, y eso no se puede hacer tirando muestras: hay que
filtrar antes, o la energía por encima de los 8 kilohertz se pliega sobre la banda
de voz. Después se limita a la banda útil, de 80 a 8 000 hertz, y se normaliza el
volumen.

Sobre esa señal ya limpia se calcula el espectro, con transformada rápida de
Fourier y transformada de Fourier de tiempo corto para el espectrograma que se
dibuja en pantalla. De ahí sale la transcripción y, sobre el texto transcrito, la
corrección gramatical.

Hasta aquí el presupuesto es de menos de dos segundos. Ese número no es arbitrario:
la corrección de un error de pronunciación pierde valor si llega tarde, porque el
estudiante ya dejó de pensar en lo que dijo.

Lo que viene después —la respuesta del tutor y las sugerencias de mejora— admite
más tiempo, y por eso se calcula fuera de esa ventana. Y el puntaje de
pronunciación, que aparece al final de la lista, solo se muestra en un modo
concreto, por razones que van a quedar claras en unos minutos.

## Diapositiva 5 — Cada concepto, con su medición · 0:55

Esta tabla resume qué conceptos del curso aplicamos y cómo comprobamos cada uno.

El teorema de muestreo aparece en la decimación de 48 a 16 kilohertz por factor
entero tres, con un filtro FIR de fase lineal: 73.8 decibelios de supresión del
plegamiento frente a decimar directamente.

El filtrado se hace con un pasa-banda Butterworth en cascada de biquads, y en la
frecuencia de corte da menos 3.01 decibelios, que es el valor teórico.

La transformada rápida de Fourier da un error de 1.45 por diez a la menos trece
frente a la definición directa, dentro de la precisión de un flotante de doble
precisión.

La ventana de Hann, con su ganancia coherente compensada, devuelve amplitud
unitaria exacta para un tono puro.

La detección de periodicidad, con el algoritmo YIN, da 0.115 hertz de error en
tonos puros, contra un criterio de 3 hertz.

Y el banco de filtros mel con la transformada del coseno da 0.009 por ciento de
error frente a librosa, la referencia de la industria, contra un criterio del cinco
por ciento.

Hay una frase abajo que quiero leer literal, porque es el criterio con que
verificamos todo el proyecto: la transformada se verifica contra la definición
matemática, no contra otra biblioteca. Comparar dos implementaciones no demuestra
que ninguna sea correcta, solo que coinciden.

## Diapositiva 6 — Tres defectos que solo aparecieron al medir · 0:50

Esa disciplina de medir tuvo consecuencias. Estos tres defectos no eran visibles
leyendo el código.

El primero: el bloque que entrega el micrófono no divide al tamaño de trama. Se
rellenaba con ceros y la ventana se aplicaba sobre el relleno, así que el espectro
salía veinte por ciento bajo.

El segundo: se le aplicaba al espectro de potencia una corrección de escala pensada
para leer amplitudes. Eso hundía veinticuatro de las veintiséis bandas mel por
debajo del piso del logaritmo. El error frente a librosa pasó de 5.02 por ciento a
0.009.

El tercero: el generador pseudoaleatorio con que producíamos ruido daba secuencias
distintas en Python y en JavaScript desde la segunda muestra. Es decir, estábamos
comparando señales distintas creyendo que eran la misma.

Lo importante del segundo es por qué la verificación por etapas no lo detectó: cada
etapa era correcta por separado, y el fallo estaba en la escala con que se
encadenaban. Verificar bloque a bloque es necesario, pero no es suficiente.

Y esto nos lleva al resultado principal.

## Diapositiva 7 — El hallazgo principal · 1:00

El requisito de evaluación de pronunciación pedía que el sistema separara una
pronunciación correcta de una incorrecta por al menos veinte puntos. Con señales
sintéticas —vocales generadas por código con formantes fijos— la separación medida
fue de treinta y un puntos, y el requisito se dio por encaminado.

Después lo medimos con voz real. Cuarenta grabaciones: cinco frases, cuatro
versiones de cada una, dos hablantes.

Estos son los dos números que resumen el proyecto.

Decir la frase **bien**, pero con otra voz, cuesta siete coma cero ocho de distancia
respecto a la referencia.

Decir la frase **mal**, con la voz de la referencia, cuesta uno coma dos.

El efecto del hablante pesa casi seis veces más que el error que queríamos medir. En
cuatro de cada diez casos, la pronunciación incorrecta puntuaba mejor que la
correcta.

## Diapositiva 8 — No es un defecto de implementación · 0:45

La pregunta obvia es si esto es un error nuestro. No lo es, y lo comprobamos de dos
maneras.

Primero, los coeficientes están verificados: 0.009 por ciento de error contra
librosa, con un criterio del cinco por ciento. La matemática es correcta.

Segundo, la causa es física. La longitud del tracto vocal desplaza los formantes
exactamente en los mismos coeficientes que distinguen una vocal de otra. Comparar
espectros mide parecido acústico, y el parecido acústico entre dos personas diciendo
lo mismo es menor que el parecido entre una persona diciendo dos cosas distintas.

Antes de darlo por agotado probamos ocho vías, todas medidas: reescalado de la
puntuación, estadísticos localizados, coeficientes delta, dos variantes de
normalización cepstral, normalización de la longitud del tracto vocal, doble
referencia contrastiva, y quitar el recorte por actividad de voz. Ninguna alcanza el
umbral.

**› Enlace:** Y al revisar cómo se estaba invocando al comparador, apareció algo más.

---

# TURNO 3 · ISAAC — diapositivas 9 a 11

## Diapositiva 9 — La segunda causa · 0:55

Había un segundo problema, de diseño, y más grave que el anterior.

La referencia contra la que se comparaba al estudiante se sintetizaba a partir de la
transcripción de lo que el estudiante acababa de decir.

Síganme la cadena. El estudiante dice *sheep* donde iba *ship*. El reconocedor
transcribe lo que oyó, o sea *sheep*. El sintetizador dice *sheep*. Y el estudiante
se compara contra su propia equivocación.

El puntaje no podía detectar una palabra mal pronunciada por construcción. Lo que
estaba midiendo era cuánto se parece la voz del estudiante a la voz del sintetizador
diciendo sus mismas palabras: acento y timbre.

El razonamiento original era no sintetizar la frase corregida, para no comparar
secuencias de palabras distintas. Ese razonamiento es válido para la corrección
gramatical, pero se extendió a toda la referencia sin advertir que la transcripción
ya contiene el error de pronunciación.

Corregirlo exigía responder a una pregunta: si el espectro no sirve, ¿qué señal sí es
independiente del hablante?

## Diapositiva 10 — La salida · 1:00

La conclusión inicial fue que hacía falta un modelo acústico entrenado con miles de
voces, y eso quedaba fuera del alcance del proyecto. Pero el proyecto ya tiene uno:
el reconocedor de voz. Está entrenado exactamente con eso.

Si en vez de comparar espectros se compara la **transcripción** contra una frase
objetivo conocida, el error aparece en el texto y el timbre deja de influir.

Lo medimos sobre las mismas cuarenta grabaciones. Cuando se pide *ship* y el
estudiante lo pronuncia mal, el reconocedor escribe «I need a new sheep»: el error
queda visible. Cuando se pide *bed*, escribe «She had a bit late». Cuando se pide
*seat*, escribe «Please see it down here».

Seis de diez errores detectados, con cuatro falsas alarmas: casos donde la palabra
estaba bien pronunciada y aun así el reconocedor escribió otra cosa. Ese último
ejemplo de la tabla es uno.

No basta por sí sola, y por eso se combina con la señal acústica. Pero es la única
señal independiente del hablante de la que disponemos.

Ahora bien, esto exige una frase objetivo, y en una conversación libre esa frase no
existe: el sistema no sabe qué quiso decir el estudiante. De ahí el modo práctica.

## Diapositiva 11 — Los dos modos · 0:50

La aplicación quedó con dos modos.

En conversación libre el estudiante habla de lo que quiera. Ve la transcripción de lo
que dijo, la corrección gramatical resaltada palabra por palabra, la respuesta del
tutor y sugerencias de mejora. Lo que **no** ve es un puntaje de pronunciación,
porque ahí no hay contra qué compararlo.

En modo práctica es la aplicación la que propone la frase. El estudiante la repite, y
la comparación se hace palabra por palabra contra esa frase.

La decisión de no mostrar puntaje en conversación libre fue deliberada y la
defendemos: preferimos no dar un número antes que dar uno que mide otra cosa.

El banco tiene diez frases y está cerrado a propósito. Excluye cifras, porque el
sintetizador no sabe decirlas, y excluye ocho palabras concretas que pronuncia mal.
Hay una prueba automática que impide que entre al banco una frase que incumpla ese
criterio.

**› Enlace:** Queda una decisión más, y es cómo se le comunica todo esto al
estudiante.

---

# TURNO 4 · ALEJANDRO — diapositivas 12 a 15

## Diapositiva 12 — Cómo se le dice al estudiante · 0:50

Aquí las cuatro falsas alarmas mandan sobre la redacción.

Si el mensaje fuera «lo dijiste mal», estaríamos acusando de un error a alguien que
pronunció bien cuatro de cada diez veces que aparece el aviso. Eso desmotiva, y
además es falso.

El mensaje que se muestra es «no te entendí bien». Describe lo que realmente
ocurrió, no atribuye culpa, e invita a repetir, que es justamente lo que queremos
que el estudiante haga.

Y la misma regla llega hasta el código: el campo interno se llama `noReconocida`, no
`incorrecta`. Un nombre que afirma más de lo que el dato sostiene acaba saliendo por
pantalla tarde o temprano.

## Diapositiva 13 — Rendimiento y verificación · 0:55

Unos números de costo y de comprobación.

La cadena completa de análisis de señal consume 2.14 por ciento de un núcleo, tras
dos optimizaciones que también se midieron: caché de los planes de la transformada y
decimación polifásica.

La suite comprende cuarenta y dos archivos de prueba que se ejecutan en integración
continua, sin micrófono y sin intervención.

De los 676 megabytes totales, 302 se cargan al arrancar y el resto se descarga cuando
el usuario llega a la función que lo necesita, con una barra de progreso real.

Y la transformada rápida es mil ciento cuarenta y cinco veces más rápida que calcular
la transformada discreta directamente, que es la razón por la que el espectrograma
puede dibujarse mientras el usuario habla.

La última línea es importante para el criterio de verificación: todas las señales de
prueba se generan por código —senos, chirps, deltas, vocales con formantes— de modo
que el resultado esperado se conoce analíticamente y no depende de ningún archivo de
audio externo.

## Diapositiva 14 — Lo que falta · 0:50

Somos explícitos con lo que queda pendiente, ordenado por lo que decide.

Lo primero es medir si la combinación de las dos señales —la comparación contra la
frase objetivo más la acústica— detecta mejor que el seis de diez de la señal sola.
Eso decide si el requisito de pronunciación se presenta cumplido con su limitación o
declarado como limitación.

Lo segundo es verificar el arranque sin conexión. La aplicación está implementada
como aplicación web progresiva, pero todavía no la hemos ejercido en modo avión de
punta a punta, y ese es el argumento de accesibilidad que sostiene todo el proyecto.
No lo damos por cumplido hasta comprobarlo.

Después está medir la latencia real del turno con todo integrado, para confirmar el
presupuesto de dos segundos; normalizar las cifras a palabras antes de sintetizar,
porque un tutor de conversación que enmudece ante un precio falla en el uso más común
del idioma; y evaluar alternativas más livianas al corrector gramatical, que es el
único de los cuatro modelos que nunca se comparó contra otros.

## Diapositiva 15 — Cierre · 0:45

Para cerrar, cómo creemos que debe juzgarse este proyecto.

Propusimos evaluar pronunciación por comparación espectral. Lo implementamos,
verificamos cada etapa contra su definición matemática, y al medir con voz real
determinamos que el método no puede cumplir el objetivo: el efecto del hablante pesa
seis veces más que el error que queríamos medir.

Ese resultado está cuantificado, con la causa explicada, ocho alternativas
descartadas con medición, una vía distinta implementada y sus límites declarados.

Un requisito que se declara cumplido sin comprobarlo es una afirmación. Uno que se
declara incumplido con las cifras que lo demuestran es un resultado.

Gracias. Quedamos para preguntas.

---

# Preguntas — por especialidad, no por turno

Terminada la exposición, cada pregunta la contesta quien domina el tema, aunque no
haya sido quien leyó esa diapositiva. Si la pregunta no es tuya, se pasa sin
disculparse.

**Fabrizio — señales**

- *¿Por qué decimación por factor entero y no un remuestreador genérico?* Porque 48
  entre 16 da exactamente tres, así que basta filtrar y quedarse con una de cada tres
  muestras. Un remuestreador arbitrario habría que justificarlo y no aporta nada.
- *¿Por qué 127 coeficientes en el FIR?* Es el orden que alcanza la supresión
  necesaria en la banda de plegamiento manteniendo fase lineal, que es lo que preserva
  la forma de onda.
- *¿Por qué la distancia crece más al cambiar de voz?* Porque la longitud del tracto
  vocal escala los formantes, y los coeficientes cepstrales codifican la envolvente
  espectral, que es justo donde viven los formantes.
- *¿Probaron normalización cepstral?* Sí, dos variantes, y está en la lista de las
  ocho vías. Reduce el efecto pero no lo suficiente.

**Isaac — modelos**

- *¿Por qué Whisper tiny y no uno mayor?* Por peso y latencia. La versión pequeña cabe
  en el presupuesto de descarga y responde dentro de la ventana de dos segundos.
- *¿Qué pasa si el reconocedor se equivoca?* Ocurre: son las cuatro falsas alarmas de
  cada diez avisos. Por eso el mensaje al usuario es «no te entendí bien» y no «lo
  dijiste mal».
- *¿Por qué el corrector gramatical pesa tanto?* Son 241 megabytes y es el punto débil
  del conjunto. Está declarado como pendiente evaluar alternativas.

**Monestel — interfaz**

- *¿Por qué no mostrar el puntaje siempre?* Porque en conversación libre no hay frase
  objetivo, y el número que saldría mediría parecido de voz, no pronunciación.
- *¿El espectrograma es en tiempo real?* Sí, se dibuja en Canvas mientras el usuario
  habla, por encima de treinta cuadros por segundo.

**Alejandro — proyecto**

- *¿Cómo trabajaron en paralelo sin bloquearse?* Con interfaces de TypeScript
  congeladas desde la primera semana y objetos simulados detrás de cada una, de modo
  que cada módulo se desarrolla y se prueba contra el contrato y no contra el código
  del otro.
- *¿Por qué no usaron un servicio en la nube?* Porque eso elimina las tres propiedades
  de la diapositiva tres: costo cero, funcionamiento sin conexión y privacidad por
  arquitectura.
- *¿Van a cumplir el requisito de pronunciación?* Depende de la medición que falta. Si
  la combinación de señales no supera el umbral, se presenta como limitación declarada
  con las cifras que la sostienen.
