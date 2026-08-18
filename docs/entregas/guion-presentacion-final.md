# Guion leído · Presentación técnica final

**Duración objetivo:** 13 a 15 minutos. **Diapositivas:** 16.
**Orden de intervención:** Alejandro → Fabrizio → Isaac → José Pablo. Cada quien
habla su bloque completo y entrega el turno al siguiente. No hay intercalados.

| Bloque | Quién | Diapositivas | Palabras | Tiempo leído |
|---|---|---|---:|---|
| 1 | Alejandro Zamora | 1 a 4 | 462 | 3:00 – 3:20 |
| 2 | Fabrizio Espinoza | 5 a 10 | 758 | 4:50 – 5:25 |
| 3 | Isaac Morum | 11 a 13 | 457 | 2:55 – 3:15 |
| 4 | José Pablo Monestel | 14 a 16 | 404 | 2:35 – 2:55 |
| — | Demostración en vivo | 16 | — | 1:30 – 2:00 |
| | | **Total** | **2 081** | **15:00 aprox.** |

El cálculo asume entre 140 y 155 palabras por minuto, que es el ritmo normal de
lectura en voz alta. **Si el ensayo se pasa de 15 minutos**, lo primero que se
recorta está señalado al final, en las notas de ensayo.

> **Cómo leerlo.** Cada párrafo es una unidad de respiración: se lee de corrido y
> se hace una pausa al final. Lo que va **en negrita** es lo que conviene marcar
> con la voz. Los corchetes son indicaciones, no se leen.

---

## Bloque 1 · Alejandro Zamora — diapositivas 1 a 4

### Diapositiva 1 · Portada

Buenos días. Somos el equipo de **My Personal English Teacher**, y lo que vamos a
presentar hoy es una aplicación para practicar inglés conversacional en la que
**todo el procesamiento de señales y toda la inteligencia artificial ocurren
dentro del navegador del usuario**. No hay servidor. No hay llamadas a servicios
externos. La aplicación está desplegada y la vamos a usar en vivo al final.

Yo soy Alejandro Zamora, y me toca el núcleo y la integración. Después van a
hablar Fabrizio, con la parte de procesamiento de señales; Isaac, con los modelos;
y José Pablo, con la interfaz y la demostración.

[Avanzar]

### Diapositiva 2 · El problema

El problema que atacamos tiene una particularidad: **no es un problema de
conocimiento, es un problema de producción oral.** El estudiante hispanohablante
suele saber la regla gramatical. Lo que no consigue es pronunciar de forma
inteligible.

Y eso tiene tres causas.

La primera es fonética. El español tiene cinco vocales; el inglés supera las once.
Pares como *ship* y *sheep* se colapsan en un mismo sonido para el oído no
entrenado. **El estudiante no puede corregir lo que no distingue.**

La segunda es de acceso: la práctica oral efectiva necesita a alguien que corrija
en el momento, y eso cuesta dinero, horarios y conexión estable.

Y la tercera es la que nos abrió el espacio: las aplicaciones que existen
devuelven un veredicto binario. **Nunca dicen qué falló.**

[Avanzar]

### Diapositiva 3 · El problema como señales

Ahora, visto desde este curso, evaluar pronunciación automáticamente es un
problema de análisis de señales, y las dificultades son concretas y medibles.

El micrófono captura **ruido** que contamina toda medición posterior: lo atiende el
filtro pasa-banda. Dos personas que dicen la misma palabra producen señales **muy
distintas**: lo atienden los coeficientes cepstrales. Nadie dice la frase **al mismo
ritmo**: lo atiende el alineamiento temporal. Y todo eso tiene que ocurrir en
**menos de dos segundos** para que la corrección sirva pedagógicamente.

Esta diapositiva es, en el fondo, el índice de la cadena que Fabrizio va a
recorrer enseguida.

[Avanzar]

### Diapositiva 4 · Arquitectura

Antes de eso, cómo está construido.

Cuatro módulos, uno por integrante, **desacoplados por contrato**. Las interfaces
entre ellos se congelaron en la primera semana, y desde entonces cualquier cambio
a un tipo compartido pasa por una solicitud que revisamos los cuatro.

La consecuencia práctica es la que importa: **cada módulo trae un simulacro de sus
dependencias.** La interfaz se desarrolló desde el primer día contra
transcripciones falsas, y el núcleo pudo integrarse antes de que existiera un solo
modelo real. Nadie se quedó esperando el trabajo de otro.

En el diagrama: el audio entra arriba a la izquierda, baja al motor de señales, de
ahí sale al reconocedor, y el audio de referencia que produce el sintetizador
vuelve al comparador.

Con eso les dejo a Fabrizio. **Fabrizio.**

---

## Bloque 2 · Fabrizio Espinoza — diapositivas 5 a 10

### Diapositiva 5 · La cadena de señales

Gracias. Esta es la cadena, y quiero subrayar una idea antes de los números: **cada
etapa descarta deliberadamente algo que no debe influir en la comparación.**

Capturamos a 48 kilohercios y decimamos por tres hasta 16. La relación es entera,
así que es una decimación exacta: filtro anti-alias y nos quedamos con una de cada
tres muestras. Ese filtro tiene 127 coeficientes y **atenúa el alias en 73.8
decibelios**. Después, el pasa-banda, la normalización que borra el volumen, y la
detección de voz que recorta los silencios. Y luego el análisis: transformada de
tiempo corto, coeficientes cepstrales, frecuencia fundamental con YIN, y el
alineamiento temporal.

Los criterios del plan eran menos de 3 hercios de error en la frecuencia
fundamental y menos del 5 por ciento en los coeficientes. Medimos **0.115 hercios
y 0.009 por ciento**: los dos superados en dos órdenes de magnitud. Y todo esto
cuesta 21.4 milisegundos por segundo de audio.

[Avanzar]

### Diapositiva 6 · Verificación

¿Y cómo sabemos que esos números son ciertos? Aquí está la decisión metodológica
del proyecto.

Implementamos la transformada, el banco mel y YIN a mano. No por capricho:
**porque nos permite verificar contra la definición y no contra otra biblioteca.**
Contrastar una implementación contra otra demuestra que ambas coinciden.
Contrastarla contra lo que se deduce en el papel demuestra que es correcta.

Verificamos en cinco niveles: casos de solución cerrada, la definición como
referencia, propiedades estructurales como Parseval y la simetría conjugada,
señales sintéticas, y grabaciones reales solo para calibrar.

Pero —y esto es lo honesto— **los cuatro primeros verifican que cada etapa cumple
su definición; no verifican que el sistema sirva a su propósito.** Los dos
hallazgos de fondo aparecieron al contrastar contra una referencia externa y
contra voz real. Vienen ahora.

[Avanzar]

### Diapositiva 7 · Hallazgo 1

El primero. Corrimos una verificación cruzada contra librosa, la implementación de
referencia en Python.

Y encontramos que nuestra cadena aplicaba al espectro una corrección de amplitud
que hundía **veinticuatro de las veintiséis bandas mel** por debajo del mínimo del
logaritmo. Es decir: veinticuatro bandas **habían dejado de responder a la señal**.
El error era del 5.02 por ciento; al retirar esa corrección bajó a **0.009**.

Lo importante no es el número. Es que **cada etapa era correcta por separado**: el
defecto estaba en la escala con la que se encadenaban dos etapas buenas, y por eso
ningún nivel deducible lo detectó.

[Avanzar]

### Diapositiva 8 · La evaluación de pronunciación

El segundo hallazgo es más grande, porque cambió el producto.

El planteamiento era el clásico: comparar los coeficientes del estudiante contra
una referencia sintetizada, alinearlos en el tiempo y convertir la distancia en un
puntaje. Sobre señales sintéticas funciona: **31 puntos de separación**, sobre los
20 que pedía el requisito.

Entonces grabamos voz real. Cuarenta grabaciones, dos hablantes. Y el resultado es
este: **cambiar de voz cuesta 7.08 unidades de distancia. Pronunciar mal cuesta
1.20.** La identidad del hablante pesa casi seis veces más que el error que
queremos detectar.

Y como la referencia siempre la sintetiza la máquina, el estudiante **siempre** es
una voz distinta.

[Avanzar]

### Diapositiva 9 · Hallazgo 2

Quiero ser preciso en el diagnóstico, porque no es un error de programación.

**Es el límite del método.** Comparar coeficientes cepstrales mide parecido
acústico, y la longitud del tracto vocal escala los formantes en los mismos
coeficientes que distinguen una vocal de otra. No se puede suprimir uno sin
suprimir el otro. Probamos ocho normalizaciones distintas y está medida cada una.

Ahora, lo interesante: **la solución ya estaba dentro del proyecto.** El reconocedor
de voz que usamos *es* un modelo acústico entrenado con miles de hablantes. Si en
lugar del audio comparamos **la transcripción** contra una frase objetivo, el error
aparece en el texto y la identidad del hablante deja de importar.

Sobre las mismas grabaciones: la vía acústica detecta 6 errores de 10; la de
transcripción, **8 de 10**. Un tercio más, y sin ningún umbral que calibrar.

[Avanzar]

### Diapositiva 10 · Consecuencia

Y esto no lo dejamos escrito como una limitación. **Reorientó la funcionalidad**,
en tres decisiones.

Primera: **la pronunciación solo se evalúa en modo práctica**, contra una frase que
el sistema propone. En conversación libre no se puntúa, porque sin referencia no
existe una pronunciación correcta contra la cual comparar.

Segunda: la señal principal pasa a ser el texto. Y la redacción sigue a la
medición: el método marca catorce de cada treinta tomas correctas, así que decir
«lo dijiste mal» sería incorrecto una de cada dos veces. **El mensaje dice «no
entendí bien».**

Y tercera: el modo práctica trabaja sobre un banco de frases **cuyo comportamiento
está medido**.

Con eso le paso la palabra a Isaac. **Isaac.**

---

## Bloque 3 · Isaac Morum — diapositivas 11 a 13

### Diapositiva 11 · Canal de inferencia

Gracias, Fabrizio.

Ejecutar los modelos en el navegador tiene una consecuencia que condiciona todo:
**cada megabyte de modelo es tiempo de espera antes de poder hacer nada.** Y
nosotros arrancábamos pidiendo 411 megabytes.

La vía obvia era comprimir más. La medimos y la descartamos: bajar de 8 a 4 bits
en el corrector gramatical resultó **3.8 veces más lento y además más pesado**. No
era intuitivo, pero está medido.

La que sí funcionó salió de mirar el turno del usuario. **Un turno no necesita los
cuatro modelos a la vez.** El estudiante primero habla, y solo después pulsa
«escuchar». Hay usuarios que no lo pulsan nunca. Así que el sintetizador se
descarga cuando hace falta: la primera carga bajó de 411 a **302 megabytes, un 26
por ciento menos de espera, sin tocar ningún modelo**.

[Avanzar]

### Diapositiva 12 · Elección por medición

La otra decisión fue qué sintetizador usar, y la resolvimos midiendo, no leyendo
fichas técnicas. Armamos un banco de catorce palabras difíciles y cinco de
control, con el mismo criterio para los tres candidatos.

SpeechT5 quedó fuera por peso: 613 megabytes. MMS-TTS falló **siete de catorce**.
Kokoro falló **una**, cero de cinco en el control, y encima pesa menos: 88
megabytes contra 109.

Pero el dato decisivo es el de abajo. **MMS-TTS no es determinista**: lleva un
predictor de duración que muestrea ruido y no se puede apagar. ¿Qué significa eso?
Que dos síntesis del mismo texto, del mismo modelo, puntuaban **49.5 sobre 100** al
compararse entre sí.

O sea: un estudiante que pronunciara la frase **perfectamente** obtenía 49.5,
porque la referencia es otra emisión distinta. **La mitad de la escala se consumía
antes del primer error.** Con un sintetizador determinista ese suelo desaparece.

[Avanzar]

### Diapositiva 13 · El tutor bilingüe

La última es mi favorita, porque la solución costó cero.

Un principiante recurre al español cuando todavía no consigue armar la frase en
inglés, y esa es la barrera que queremos bajar. Así que el tutor tenía que
entenderlo.

La respuesta obvia era traer un modelo de chat multilingüe. Lo trajimos, lo
medimos en la aplicación desplegada, y tardaba **entre 7 y 16 segundos por
respuesta**. Inutilizable para conversar.

Y entonces cayó la pregunta correcta: **¿el tutor necesita saber español, o
necesita recibir en inglés lo que el estudiante quiso decir?**

Necesita lo segundo. Y Whisper, el reconocedor que ya teníamos cargado, tiene una
tarea de traducción que devuelve inglés desde cualquiera de sus idiomas.

Entonces: turno en español, segunda pasada del reconocedor sobre el mismo audio, y
al tutor le llega inglés. **De 7 a 16 segundos, a segundo y medio. Sigue siendo
bilingüe. Peso adicional: cero.**

La lección: antes de sumar un modelo, conviene inventariar lo que saben hacer los
que ya están cargados.

Te dejo, José Pablo.

---

## Bloque 4 · José Pablo Monestel — diapositivas 14 a 16

### Diapositiva 14 · Latencia

Gracias, Isaac.

Estos números no están estimados. **Están cronometrados en la aplicación
desplegada**, en cuatro turnos seguidos: 397, 749, 777 y 1 282 milisegundos, contra
un presupuesto de dos segundos.

Y lo que permite cumplirlo no es que los modelos sean rápidos: **es el orden**.

La transcripción y la corrección gramatical se envían a la pantalla **en cuanto
están listas**, sin esperar a nada más. Esa es la retroalimentación que el
estudiante necesita de inmediato. La respuesta conversacional del tutor llega
después, alrededor de segundo y medio, y las sugerencias de reformulación se
calculan en segundo plano y aparecen cuando terminan.

Vale la pena notar dónde **no** está el costo: el procesamiento de señales son 67
milisegundos de ese presupuesto de dos mil. **El factor limitante son los modelos,
no la cadena de señales.**

[Avanzar]

### Diapositiva 15 · Limitaciones declaradas

Y antes de la demostración, queremos declarar los límites, porque son decisiones
conscientes y no omisiones.

El puntaje acústico depende más de quién habla que de cómo pronuncia. Está
cuantificado, y es lo que motivó el rediseño hacia el modo práctica.

Un error de un solo fonema se diluye en el puntaje global de la frase: en una
frase de cinco palabras, la vocal alterada son unas pocas tramas de un centenar.
Por eso hay también puntaje por palabra.

El tutor no mantiene el hilo entre turnos. El modelo que usamos transforma frases,
no dialoga. La memoria conversacional existe, pero exige un modelo de chat y su
latencia: es un **compromiso explícito**, no un descuido.

Y no probamos Firefox ni Safari en un dispositivo real, porque el entorno
disponible solo tiene un navegador basado en Chromium.

[Avanzar]

### Diapositiva 16 · Demostración

Vamos a la aplicación. Está en línea, y lo que van a ver corre en este navegador.

[Abrir humanoidcat.github.io/mpet]

Primero un turno hablado en inglés. Fíjense en dos cosas: la corrección gramatical
aparece resaltada sobre la frase, y las sugerencias son **reescrituras** de lo que
dije, no respuestas a lo que dije.

[Turno en inglés]

Ahora un turno en español, para mostrar lo que explicó Isaac.

[Turno en español]

Y por último el modo práctica, que es donde sí se evalúa la pronunciación, contra
una frase del banco.

[Modo práctica]

Para cerrar: **0.115 hercios de error en frecuencia fundamental. 0.009 por ciento
en los coeficientes cepstrales. 655 pruebas automatizadas en integración continua.
Y cero llamadas a servicios externos** — todo lo que acaban de ver ocurrió en este
navegador.

Gracias. Quedamos atentos a sus preguntas.

---

## Notas de ensayo

- **Los relevos son el punto frágil.** Cada uno cierra su bloque nombrando al
  siguiente, y el siguiente arranca con «gracias». Conviene ensayar solo los
  cuatro relevos, seguidos, hasta que salgan sin pausa.
- **Si van sobrados de tiempo**, el material para estirar está en las diapositivas
  6 y 15: los cinco niveles de verificación y las limitaciones admiten detalle.
- **Si van cortos**, la diapositiva 11 se puede reducir a dos frases —el peso bajó
  un 26 por ciento cargando el sintetizador bajo demanda— sin perder el hilo.
- **La cifra que más se va a preguntar** es la de 14 tomas correctas marcadas de
  30. La respuesta corta: las tomas se grabaron lo mejor que se pudo, no con
  pronunciación nativa; que el reconocedor oiga *chip* donde se dijo *ship* es
  información real sobre esa emisión, no un fallo del método. Por eso se reporta
  como «tomas correctas marcadas» y no como «falsas alarmas».
- **Si preguntan por el modo sin conexión**: los modelos quedan en la caché del
  navegador y la aplicación es instalable; la segunda carga no vuelve a
  descargarlos.
