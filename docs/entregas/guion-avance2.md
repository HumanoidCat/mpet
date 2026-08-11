# Guion — Avance 2 · 11 de agosto

Guion leído, para las 15 diapositivas de `MPET-Avance2-Presentacion.pptx`.
Duración estimada: **12:45**, con la demo dentro.

**Reparto** — cada uno habla una sola vez, de corrido, en este orden:

| Turno | Persona | Diapositivas | Tiempo |
|---|---|---|---|
| 1.º | Monestel | 1 – 5 (incluye la demo) | ~4:00 |
| 2.º | Fabrizio | 6 – 9 | ~3:30 |
| 3.º | Isaac | 10 – 12 | ~2:45 |
| 4.º | Alejandro | 13 – 15 | ~2:30 |

Cada bloque termina con una frase de enlace. Esa frase es la señal para que el
siguiente avance la diapositiva y empiece a hablar.

Las preguntas del final **no** se reparten por bloque sino por especialidad: la
última sección dice quién responde qué.

---

# TURNO 1 · MONESTEL — diapositivas 1 a 5

## Diapositiva 1 — Portada · 0:25

Buenas tardes. Este es el Avance 2 de My Personal English Teacher, una aplicación
que evalúa la pronunciación del inglés usando procesamiento digital de señales y
que corre íntegramente dentro del navegador.

Vamos a recordar en treinta segundos de qué se trata, mostrarles la conversación
completa funcionando, y después dedicar el grueso del tiempo al resultado técnico
de estas dos semanas, que no es el que esperábamos.

## Diapositiva 2 — Recordatorio · 0:40

Muy rápido, porque esto ya lo presentamos el 28 de julio.

El problema: el español tiene cinco vocales, el inglés supera las once. Pares como
*ship* y *sheep* se colapsan en un mismo sonido para el oído no entrenado, y el
estudiante no puede corregir lo que no distingue. Las aplicaciones masivas
responden «correcto» o «inténtalo de nuevo» sin decir qué falló, y nuestro
objetivo es justamente señalar dónde estuvo el error.

La decisión de arquitectura: los cuatro modelos se ejecutan dentro del navegador.
De ahí salen tres propiedades. Costo de operación cero, porque no hay servidores
de inferencia. Funcionamiento sin conexión tras una descarga única de 676
megabytes. Y el audio nunca sale del equipo, así que la privacidad no depende de
una política sino de la arquitectura.

## Diapositiva 3 — Qué cambió desde el Avance 1 · 0:50

Estas son las dos semanas que estamos presentando.

Primero, la conversación completa. La cadena entera funciona de punta a punta
—hablar, transcribir, corregir, responder y sintetizar— sin objetos simulados en
medio. Eso era el objetivo declarado del periodo y está cumplido; se los vamos a
mostrar en un minuto.

Segundo, la calibración con voz real: cuarenta grabaciones de dos hablantes. De
ahí sale el resultado principal de este avance.

Tercero, un modo práctica, que es una vía distinta para evaluar pronunciación,
construida sobre el chat que ya existía.

Y cuarto, la verificación cruzada de los coeficientes cepstrales contra librosa,
que bajó el error de 5.02 por ciento a 0.009.

El primero y el tercero son lo que estaba planificado. Lo interesante de este
avance es lo que apareció al medir, y a eso le vamos a dedicar la mitad del
tiempo.

## Diapositiva 4 — La cadena de un turno · 0:55

Antes de la demo, la cadena completa, para que sepan qué están viendo.

El micrófono entrega audio a 48 kilohertz. Lo primero es bajar a 16, que es lo que
espera el reconocedor, y eso no se puede hacer tirando muestras: hay que filtrar
antes, o la energía por encima de los 8 kilohertz se pliega sobre la banda de voz.
Después se limita a la banda útil, de 80 a 8 000 hertz, y se normaliza el volumen.

Sobre esa señal ya limpia se calcula el espectro, con transformada rápida de
Fourier y transformada de tiempo corto para el espectrograma. De ahí sale la
transcripción, y sobre el texto transcrito, la corrección gramatical.

Hasta ahí el presupuesto es de menos de dos segundos, y ese número no es
arbitrario: la corrección pierde valor si llega tarde, porque el estudiante ya
dejó de pensar en lo que dijo. La respuesta del tutor y las sugerencias admiten
más tiempo y por eso van fuera de esa ventana.

El puntaje de pronunciación, que está al final de la lista, solo se muestra en un
modo concreto. Por qué, lo explicamos después de la demo.

## Diapositiva 5 — Demostración en vivo · 1:10

Vamos a ver tres cosas.

Primero, conversación libre: hablo, y ustedes ven la transcripción, la corrección
gramatical resaltada palabra por palabra y la respuesta del tutor.

*(Ejecutar. Una frase con un error gramatical deliberado.)*

Segundo, el modo práctica: la aplicación propone una frase, yo la repito, y la
comparación se hace palabra por palabra contra esa frase.

*(Ejecutar. Una frase del banco.)*

Y tercero, el espectrograma dibujándose mientras hablo, que es el análisis de
señal ocurriendo en vivo.

*(Ejecutar.)*

**› Enlace:** Eso es lo que hace. Ahora, qué hay debajo y qué encontramos al
medirlo.

*Si algo falla: se pasa al video de respaldo sin explicar por qué. La explicación,
si hace falta, va al final.*

---

# TURNO 2 · FABRIZIO — diapositivas 6 a 9

## Diapositiva 6 — Cada concepto, con su medición · 0:55

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
error frente a librosa, contra un criterio del cinco por ciento.

La frase de abajo la quiero leer literal, porque es el criterio con que
verificamos todo el proyecto: la transformada se verifica contra la definición
matemática, no contra otra biblioteca. Comparar dos implementaciones no demuestra
que ninguna sea correcta, solo que coinciden.

## Diapositiva 7 — Tres defectos que solo aparecieron al medir · 0:50

Esa disciplina tuvo consecuencias. Estos tres defectos no eran visibles leyendo el
código.

El primero: el bloque que entrega el micrófono no divide al tamaño de trama. Se
rellenaba con ceros y la ventana se aplicaba sobre el relleno, así que el espectro
salía veinte por ciento bajo.

El segundo: se le aplicaba al espectro de potencia una corrección de escala
pensada para leer amplitudes. Eso hundía veinticuatro de las veintiséis bandas mel
por debajo del piso del logaritmo. El error frente a librosa pasó de 5.02 por
ciento a 0.009.

El tercero: el generador pseudoaleatorio con que producíamos ruido daba secuencias
distintas en Python y en JavaScript desde la segunda muestra. Estábamos comparando
señales distintas creyendo que eran la misma.

Lo importante del segundo es por qué la verificación por etapas no lo detectó:
cada etapa era correcta por separado, y el fallo estaba en la escala con que se
encadenaban. Verificar bloque a bloque es necesario, pero no es suficiente.

Y esto nos lleva al resultado principal del avance.

## Diapositiva 8 — El hallazgo principal · 1:00

El requisito de evaluación de pronunciación pedía separar una pronunciación
correcta de una incorrecta por al menos veinte puntos. Con señales sintéticas
—vocales generadas por código con formantes fijos— la separación medida fue de
treinta y un puntos, y el requisito se dio por encaminado.

Estas dos semanas lo medimos con voz real. Cuarenta grabaciones: cinco frases,
cuatro versiones de cada una, dos hablantes.

Estos son los dos números que resumen el avance.

Decir la frase **bien**, pero con otra voz, cuesta siete coma cero ocho de
distancia respecto a la referencia.

Decir la frase **mal**, con la voz de la referencia, cuesta uno coma dos.

El efecto del hablante pesa casi seis veces más que el error que queríamos medir.
En cuatro de cada diez casos, la pronunciación incorrecta puntuaba mejor que la
correcta.

## Diapositiva 9 — No es un defecto de implementación · 0:45

La pregunta obvia es si esto es un error nuestro. No lo es, y lo comprobamos de
dos maneras.

Primero, los coeficientes están verificados: 0.009 por ciento de error contra
librosa, con un criterio del cinco por ciento. La matemática es correcta.

Segundo, la causa es física. La longitud del tracto vocal desplaza los formantes
exactamente en los mismos coeficientes que distinguen una vocal de otra. Comparar
espectros mide parecido acústico, y el parecido acústico entre dos personas
diciendo lo mismo es menor que el parecido entre una persona diciendo dos cosas
distintas.

Antes de darlo por agotado probamos ocho vías, todas medidas: reescalado de la
puntuación, estadísticos localizados, coeficientes delta, dos variantes de
normalización cepstral, normalización de la longitud del tracto vocal, doble
referencia contrastiva, y quitar el recorte por actividad de voz. Ninguna alcanza
el umbral.

**› Enlace:** Y al revisar cómo se estaba invocando al comparador, apareció algo
más.

---

# TURNO 3 · ISAAC — diapositivas 10 a 12

## Diapositiva 10 — La segunda causa · 0:55

Había un segundo problema, de diseño, y más grave que el anterior.

La referencia contra la que se comparaba al estudiante se sintetizaba a partir de
la transcripción de lo que el estudiante acababa de decir.

Síganme la cadena. El estudiante dice *sheep* donde iba *ship*. El reconocedor
transcribe lo que oyó, o sea *sheep*. El sintetizador dice *sheep*. Y el
estudiante se compara contra su propia equivocación.

El puntaje no podía detectar una palabra mal pronunciada por construcción. Lo que
estaba midiendo era cuánto se parece la voz del estudiante a la del sintetizador
diciendo sus mismas palabras: acento y timbre.

El razonamiento original era no sintetizar la frase corregida, para no comparar
secuencias de palabras distintas. Ese razonamiento es válido para la corrección
gramatical, pero se extendió a toda la referencia sin advertir que la
transcripción ya contiene el error de pronunciación.

Corregirlo exigía responder a una pregunta: si el espectro no sirve, ¿qué señal sí
es independiente del hablante?

## Diapositiva 11 — La salida · 1:00

La conclusión inicial fue que hacía falta un modelo acústico entrenado con miles
de voces, y eso quedaba fuera del alcance del proyecto. Pero el proyecto ya tiene
uno: el reconocedor de voz. Está entrenado exactamente con eso.

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

Ahora bien, esto exige una frase objetivo, y en conversación libre esa frase no
existe: el sistema no sabe qué quiso decir el estudiante. De ahí el modo práctica.

## Diapositiva 12 — Dos modos, y una decisión incómoda · 0:50

Por eso la aplicación quedó con dos modos, y ambos los vieron en la demo.

En conversación libre el estudiante habla de lo que quiera y ve transcripción,
corrección gramatical, respuesta del tutor y sugerencias. Lo que **no** ve es un
puntaje de pronunciación, porque ahí no hay contra qué compararlo. Esa decisión
fue deliberada: preferimos no dar un número antes que dar uno que mide otra cosa.

En modo práctica la aplicación propone la frase, de un banco cerrado de diez, y la
comparación se hace palabra por palabra. Ahí sí hay referencia, y por tanto
puntaje.

Y la última tarjeta es cómo se le comunica al estudiante. Con cuatro falsas
alarmas de cada diez avisos, un mensaje que dijera «lo dijiste mal» estaría
acusando a alguien que pronunció bien. El mensaje es «no te entendí bien»:
describe lo que ocurrió sin atribuir culpa. Y la misma regla llega hasta el
código, donde el campo se llama `noReconocida` y no `incorrecta`.

**› Enlace:** Queda el otro número que teníamos que traer a este avance: la
latencia.

---

# TURNO 4 · ALEJANDRO — diapositivas 13 a 15

## Diapositiva 13 — Latencia por etapa · 0:55

El presupuesto es de dos segundos para la retroalimentación, y estas son las
etapas medidas.

El análisis de señal de una frase de tres segundos cuesta 64 milisegundos. El
reconocimiento de voz, unos 1 500. La corrección gramatical, 320. Y el comparador,
que corre una vez por turno y no por trama, dos coma cuatro cinco.

La suma da unos 1 886 milisegundos, o sea 114 de margen. Y quiero ser explícito
con lo que significa ese número: cada etapa se midió por separado y sobre audios
de distinta duración, así que **la suma es una cota superior, no la latencia
real**. La medición del turno completo, integrado y en vivo, está instrumentada
pero todavía no ejecutada.

Con un margen tan estrecho, esa medición no es un trámite: es la que decide si el
requisito se cumple.

Lo que sí está claro es dónde no está el problema. Dentro del análisis de señal,
YIN se lleva 10.70 milisegundos por segundo de audio, el remuestreo 4.83, los
coeficientes cepstrales 3.04 y el espectrograma 2.41. Todo junto es el 2.14 por
ciento de un núcleo. El costo está en los modelos, no en el procesamiento de
señal.

## Diapositiva 14 — Lo que falta para el 8 de septiembre · 0:50

Cuatro semanas hasta la entrega final, y esto es lo que queda, ordenado por lo que
decide.

Lo primero es medir si la combinación de las dos señales detecta mejor que el seis
de diez de la señal sola. Eso decide si el requisito de pronunciación se presenta
cumplido con su limitación o declarado como limitación.

Lo segundo es la latencia integrada que acabo de mencionar.

Lo tercero es verificar el arranque sin conexión. Está implementado como
aplicación web progresiva, pero no lo hemos ejercido en modo avión de punta a
punta, y ese es el argumento de accesibilidad que sostiene el proyecto entero. No
lo damos por cumplido hasta comprobarlo.

Después queda normalizar las cifras a palabras antes de sintetizar, porque un
tutor de conversación que enmudece ante un precio falla en el uso más común del
idioma; y evaluar alternativas más livianas al corrector gramatical, que es el
único de los cuatro modelos que nunca se comparó contra otros.

Ninguna de las tres primeras es código nuevo: son mediciones sobre lo que ya está
construido.

## Diapositiva 15 — Cierre · 0:45

Para cerrar, dónde queda el proyecto.

La conversación completa funciona de punta a punta, que era el objetivo del
periodo, y cada etapa de señal está verificada contra su definición matemática.

Al medir la evaluación de pronunciación con voz real determinamos que el método no
puede cumplir el objetivo: el efecto del hablante pesa seis veces más que el error
que queríamos medir. Ese resultado está cuantificado, con la causa explicada, ocho
alternativas descartadas con medición y una vía distinta ya implementada.

Un requisito que se declara cumplido sin comprobarlo es una afirmación. Uno que se
declara incumplido con las cifras que lo demuestran es un resultado.

Gracias. Quedamos para preguntas.

---

# Preguntas — por especialidad, no por turno

Cada pregunta la contesta quien domina el tema, aunque no haya leído esa
diapositiva. Si la pregunta no es tuya, se pasa sin disculparse.

**Fabrizio — señales**

- *¿Por qué decimación por factor entero y no un remuestreador genérico?* Porque 48
  entre 16 da exactamente tres, así que basta filtrar y quedarse con una de cada
  tres muestras. Un remuestreador arbitrario habría que justificarlo y no aporta nada.
- *¿Por qué 127 coeficientes en el FIR?* Es el orden que alcanza la supresión
  necesaria manteniendo fase lineal, que es lo que preserva la forma de onda.
- *¿Por qué la distancia crece más al cambiar de voz?* Porque la longitud del tracto
  vocal escala los formantes, y los coeficientes cepstrales codifican la envolvente
  espectral, que es justo donde viven los formantes.
- *¿Probaron normalización cepstral?* Sí, dos variantes, y está en la lista de las
  ocho vías. Reduce el efecto pero no lo suficiente.

**Isaac — modelos**

- *¿Por qué Whisper tiny y no uno mayor?* Por peso y latencia. La versión pequeña cabe
  en el presupuesto de descarga y su factor de tiempo real es 0.3.
- *¿Qué pasa si el reconocedor se equivoca?* Ocurre: son las cuatro falsas alarmas de
  cada diez avisos. Por eso el mensaje es «no te entendí bien» y no «lo dijiste mal».
- *¿Por qué el corrector gramatical pesa tanto?* Son 241 megabytes y es el punto débil
  del conjunto. Está declarado como pendiente evaluar alternativas.

**Monestel — interfaz**

- *¿Por qué no mostrar el puntaje siempre?* Porque en conversación libre no hay frase
  objetivo, y el número que saldría mediría parecido de voz, no pronunciación.
- *¿El espectrograma es en tiempo real?* Sí, se dibuja en Canvas mientras el usuario
  habla, por encima de treinta cuadros por segundo.

**Alejandro — proyecto**

- *¿Por qué la latencia integrada no está medida todavía?* La instrumentación está
  hecha y el volcado se activa con un parámetro en la URL. Falta ejecutarla sobre
  cinco turnos reales, y está agendada para esta semana.
- *¿Cómo trabajaron en paralelo sin bloquearse?* Con interfaces de TypeScript
  congeladas desde la primera semana y objetos simulados detrás de cada una, de modo
  que cada módulo se prueba contra el contrato y no contra el código del otro.
- *¿Van a cumplir el requisito de pronunciación?* Depende de la medición que falta. Si
  la combinación de señales no supera el umbral, se presenta como limitación declarada
  con las cifras que la sostienen.
