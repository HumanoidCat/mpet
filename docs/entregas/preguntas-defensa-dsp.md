# Preguntas de defensa — Procesamiento de señales (S10-T6)

> Fabrizio Espinoza · Preparación para la entrega final.
>
> Cada pregunta tiene **una respuesta corta** —lo que se dice de entrada— y
> **material de respaldo** por si el profesor sigue preguntando. La respuesta
> corta debería tomar entre veinte y cuarenta segundos.
>
> Regla general: dar primero el porqué, después el número. Un número sin
> explicación no demuestra que se entendió.

---

## 1. Muestreo y Nyquist

### "¿Por qué 16 000 Hz y no más?"

**Corta.** Porque el teorema de muestreo dice que la frecuencia de muestreo debe
ser más del doble de la frecuencia más alta que se quiera representar. A 16 000
el techo son 8 000 Hz, y la información que distingue un fonema de otro está por
debajo de eso: el tono de la voz va de 85 a 255 Hz, y los formantes que
diferencian las vocales están bajo los 4 000. Muestrear más alto sería guardar
datos sin información adicional. Además el modelo de reconocimiento exige
exactamente 16 000.

**Si insisten.** Las fricativas —la ese, la efe— llegan hasta 8 000, o sea justo
al límite. Es un compromiso consciente: el filtro que aplicamos empieza a atenuar
desde 6 500, así que las fricativas más agudas pierden algo. Se aceptó porque su
energía dominante está por debajo de 7 000, y está documentado.

### "¿Qué es el aliasing y cómo lo evitaron?"

**Corta.** Si una señal contiene una frecuencia más alta que la mitad del
muestreo, esa frecuencia no se pierde: se pliega hacia adentro y aparece como
otra distinta. El micrófono entrega 48 000 y necesitábamos 16 000, o sea quedarse
con una de cada tres muestras. Si eso se hace directamente, todo lo que está entre
8 000 y 24 000 se pliega sobre la banda de la voz.

**El ejemplo concreto.** Se probó con un tono de 9 000 Hz. Al decimar sin filtrar,
reaparece en 7 000 —que es una frecuencia normal en el habla, ahí están las eses—
con toda su amplitud. O sea que al audio le aparece un sonido que nadie pronunció,
y que ya no se puede separar de uno real.

**La solución.** Filtrar antes de decimar, con corte en 7 200 Hz. Medido, ese tono
falso baja 73.8 decibelios: pasa de amplitud 1.0 a 0.0002.

**Si preguntan por qué 7 200 y no 8 000.** Porque un filtro real no corta en seco;
necesita una banda de transición. Se puso en el 90 % del límite para que en 8 000
ya esté 44 decibelios abajo.

### "¿Por qué no dejaron que el navegador hiciera la conversión?"

**Corta.** El navegador acepta que le pidan 16 000 y convierte solo, pero no
documenta qué filtro usa. Ese filtro es justamente el contenido del curso que hay
que evidenciar. Y hay una razón práctica: Safari históricamente ignora ese
parámetro, así que la conversión explícita hace falta igual para que la
aplicación funcione en cualquier navegador.

---

## 2. Por qué MFCC

### "¿Por qué usan MFCC y no el espectro directamente?"

**Corta.** Porque el espectro contiene mucha información que no tiene que ver con
la pronunciación. Si dos personas dicen la misma vocal, sus espectros son
completamente distintos: cada una tiene su propio tono, y los armónicos caen en
lugares diferentes. Los MFCC descartan eso y conservan la envolvente, que es lo
que define el fonema.

**Cómo lo hacen.** Tres pasos, y cada uno descarta algo a propósito:

- El **banco de filtros mel** agrupa los 257 valores del espectro en 26 bandas
  repartidas según cómo oye el oído. Eso borra los armónicos individuales, que se
  mueven con el tono de quien habla.
- El **logaritmo** convierte productos en sumas. La voz es la fuente de la
  garganta filtrada por la boca, y en el espectro eso es un producto; con el
  logaritmo se separan en sumandos.
- La **transformada del coseno** descorrelaciona las bandas, que se solapan entre
  sí, y concentra la información en los primeros coeficientes. Por eso bastan 13
  de los 26.

### "¿Y cómo saben que eso funciona?"

**Corta.** Hay una propiedad que se puede demostrar y medir: **el volumen queda
encerrado en un solo coeficiente**. Multiplicar la señal por un factor suma una
constante a todas las bandas por igual, y la transformada del coseno manda
cualquier constante al coeficiente cero. Así que los coeficientes del uno al doce
no cambian.

**Lo medido.** Con la misma señal a volúmenes que se diferencian mil veces, esos
coeficientes cambian en la sexta cifra decimal, que es la precisión del tipo de
dato. Y comparando vocales: cambiar de fonema aleja 2.4 veces más que cambiar de
tono, que es exactamente lo que se busca.

### "¿Por qué la escala mel y no lineal?"

**Corta.** Porque el oído no percibe la frecuencia de forma lineal. La diferencia
entre 200 y 300 Hz se distingue con facilidad; entre 5 000 y 5 100 es
prácticamente inaudible. La escala mel modela eso, y el resultado es que las
bandas son angostas donde el oído tiene resolución y anchas donde no la tiene: la
primera mide 75 Hz de ancho y la última 706.

---

## 3. YIN

### "¿Cómo detectan el tono de la voz?"

**Corta.** El punto de partida es buscar cada cuánto se repite la onda. Si la
señal es periódica y se la compara consigo misma desplazada exactamente un
periodo, coincide. Eso es la autocorrelación, y funciona muy bien: da un error de
ocho milésimas de hertz en tonos generados por computadora.

**El problema.** La onda también se repite cada dos periodos, y cada tres. Si el
tono grave de la voz es débil frente a su primer armónico —cosa común en voz
real— el método contesta el doble de la frecuencia. Y lo hace con la confianza al
máximo, así que el error no se puede detectar desde su propia respuesta.

### "¿Y qué hace YIN diferente?"

**Corta.** Tres cosas. Primero mide la **diferencia** en vez del parecido, lo que
evita un sesgo hacia los desplazamientos cortos. Segundo, y es lo decisivo,
**normaliza cada desplazamiento contra el promedio de los anteriores**: cuando
llega al doble del periodo, ese promedio ya incluye el mínimo profundo del
periodo verdadero, así que los múltiplos dejan de competir en igualdad. Y tercero
se queda con el **primero** que baja de un umbral, no con el más profundo.

**El resultado.** El error baja a una décima de hertz, cuando el requisito pedía
menos de tres.

### "¿Cómo verificaron esa precisión?"  ← *pregunta probable*

**Corta.** Se generan tonos por computadora con frecuencia exacta conocida —70,
100, 150, y así hasta 390 Hz—, se le pide al sistema que diga qué frecuencia oye,
y se resta de la real. La mayor diferencia en todo ese rango es de 0.115 Hz. No
hay medición ambigua: la frecuencia de entrada la fijamos nosotros.

### "¿Usaron el algoritmo tal cual está publicado?"  ← *si preguntan, es buena señal*

**Corta.** Casi. El artículo propone un umbral de 0.1 y nosotros usamos 0.02, y la
diferencia está medida, no elegida a ojo.

**Por qué.** En el caso donde el tono grave es muy débil, la normalización de YIN
sí funciona: separa el valle correcto del valle falso por varios órdenes de
magnitud. Lo que perdía la estimación era el umbral, porque con 0.1 el valle falso
también califica y la regla dice quedarse con el primero. Se midió dónde estaba
realmente la separación y se ajustó: el valor nuevo queda 26 veces por encima del
peor caso de señal limpia y 2.2 veces por debajo del valle falso.

**El costo, si lo preguntan.** Baja la tolerancia al ruido. Se aceptó porque es
preferible que el sistema diga "acá no hay tono" a que dé una octava equivocada
con confianza alta, que contaminaría el puntaje sin dejar rastro.

---

## 4. DTW

### "¿Cómo comparan dos pronunciaciones?"

**Corta.** El problema es que nadie habla al mismo ritmo. Si se comparan las dos
grabaciones instante contra instante, están corridas y da que son distintas aunque
digan lo mismo.

DTW busca la correspondencia que mejor calce entre las dos líneas de tiempo. En
cada punto puede avanzar en una, en la otra, o en las dos: eso representa que el
hablante alargó, acortó o mantuvo el ritmo. Se queda con el camino de menor costo
total.

**Lo medido.** La misma frase dicha tres veces más lenta da distancia cero.
Comparada instante contra instante, daría un valor grande.

### "¿Y el puntaje de dónde sale?"

**Corta.** El costo medio del camino es la distancia entre las dos
pronunciaciones. Esa distancia se convierte a un puntaje de 0 a 100 con una curva
exponencial, que tiene dos ventajas: nunca se sale del rango por construcción, y
distingue mejor cerca del cero, que es donde importa.

**La verificación.** Se tomaron grabaciones de la misma frase bien pronunciada y
con la vocal cambiada a propósito. La peor de las buenas saca 72 y la mejor de las
malas 41: 31 puntos de separación, sobre los 20 que exigía el requisito.

### "¿Qué pasa si el usuario tiene una voz muy distinta a la referencia?"  ← *la mejor pregunta que les pueden hacer*

**Corta.** Fue el problema más serio del módulo, y vale la pena contarlo porque
casi arruina el evaluador sin que se notara.

La referencia la genera una voz sintética, así que el usuario **siempre** es una
voz distinta. Al medir las primeras distancias, cambiar el tono de voz costaba
casi lo mismo que cambiar de vocal. Medido sobre frases completas, el resultado
era el contrario del correcto: **alguien pronunciando bien con otra voz quedaba
más lejos de la referencia que alguien pronunciando mal con la misma voz.**

**La solución.** Se resta a cada grabación su propio promedio. Lo que diferencia a
dos personas que dicen lo mismo es algo constante a lo largo de toda la frase —el
tamaño de la garganta, el tono, el micrófono— y algo constante se puede restar. Lo
que queda es la secuencia de sonidos.

Con eso las dos clases se separan por un factor de casi tres.

**Si preguntan por la limitación.** No se puede aplicar a un sonido sostenido: si
la grabación es una sola vocal mantenida, el promedio *es* la señal y restarlo
borra todo. Para palabras y frases, que es el caso de uso, funciona.

---

## 5. Preguntas transversales

### "¿Por qué implementaron todo a mano si existen bibliotecas?"

**Corta.** Porque el procesamiento de señales es el contenido evaluable del curso.
Para lo que no es evaluable —ejecutar los modelos de inteligencia artificial— sí
se usan bibliotecas.

### "¿Cómo saben que su implementación es correcta?"

**Corta.** Se verificó contra la teoría, no contra otra biblioteca. Cuatro
niveles, de más fuerte a menos:

1. **Casos con solución conocida en papel.** Una senoidal centrada en un bin debe
   dar exactamente N sobre 2; un impulso, espectro plano; una señal constante,
   todo en el primer valor.
2. **La definición como referencia.** La transformada lenta, la que sale
   directamente de la fórmula, se implementó dentro de las pruebas y se compara
   contra la versión rápida.
3. **Propiedades que la caracterizan.** Conservación de la energía, linealidad,
   que la inversa deshaga la directa.
4. **Señales sintéticas de parámetros conocidos**, para los filtros y el
   comparador.

**Por qué así.** Si uno compara su implementación contra otra biblioteca y
coinciden, lo único que demostró es que las dos hacen lo mismo, y queda la
pregunta de quién validó esa biblioteca. Contra la teoría, la comprobación se
cierra.

**El número.** El error de la transformada rápida frente a la definición es de 10
elevado a la menos 13, que es el límite de precisión de los números del
computador.

### "¿Cuánto consume esto?"

**Corta.** El análisis de señales usa el 2 % de un procesador. Procesar una frase
de tres segundos cuesta unos 67 milisegundos, contra un presupuesto de 2 000 por
turno. **El procesamiento de señales no es lo que hace lenta la aplicación**; eso
son los modelos de inteligencia artificial.

**Si preguntan por optimización.** Se hicieron dos, y las dos por desperdicio
identificable, no por lentitud. Una era que se reconstruía una tabla de constantes
en cada trama, 62 veces por segundo. La otra era que se filtraban todas las
muestras para después descartar dos de cada tres; calcular solo las que se
conservan da exactamente tres veces más rápido, que es el factor de decimación.

### "¿Encontraron errores en su propio código?"

**Corta.** Varios, y todos aparecieron midiendo, no leyendo. Vale la pena
mencionar dos:

- **La interpolación tenía el signo cambiado.** Corría el resultado hacia el lado
  contrario. Era lo bastante pequeño como para pasar por imprecisión del método en
  vez de por defecto. Al corregirlo el error pasó de 4.3 Hz a 0.008.
- **El detector de voz confundía ruido con habla.** Y la causa era una protección
  que yo mismo había puesto semanas antes para otro caso: resolvía un problema y
  creaba otro. Se detectó probando la cadena con señales distintas a las de las
  pruebas unitarias.

---

## 6. Las preguntas incómodas

*(Las que conviene tener preparadas porque la respuesta honesta es "todavía no".)*

### "¿Esto funciona con voz real o solo con señales de prueba?"

**Respuesta honesta.** Toda la verificación se hizo con señales generadas por
computadora. La matemática está comprobada y las pruebas son rigurosas, pero dos
valores de ajuste —la escala del puntaje y el umbral del detector de tono— se
eligieron midiendo sobre esas señales, y con voz real pueden cambiar.

El procedimiento para recalibrarlos está preparado: el lector de audio, el
análisis y el protocolo de grabación. Falta grabar. Está declarado como pendiente
en la matriz de trazabilidad, no presentado como resuelto.

**Por qué no se hizo antes.** Porque para calibrar hace falta grabar a varias
personas diciendo las mismas frases bien y mal, y eso depende de coordinar al
equipo.

### "El requisito de MFCC pide comparar contra librosa. ¿Lo hicieron?"

**Respuesta honesta.** No. Está declarado como pendiente en la matriz.

**Lo que sí se hizo.** Cada etapa se validó contra su propia definición
matemática, que es una referencia más fuerte. La comparación con librosa
verificaría que nuestros coeficientes son intercambiables con los de la
literatura, no que sean correctos.

**Estado.** El generador del archivo de referencia está escrito. Se corre una vez
fuera del proyecto y se versiona el resultado, para no agregar dependencias.

### "¿Qué no funciona todavía?"

**Tres cosas, declaradas.**

- Un **pitido constante** dentro de la banda de voz engaña al detector, porque un
  pitido sí es periódico como una vocal. El ruido de banda ancha —el caso
  realista— sí quedó resuelto.
- La invariancia al volumen **se degrada con señales muy flojas**, porque algunas
  bandas quedan en el piso que evita el logaritmo de cero.
- El costo del comparador **crece con el cuadrado de la duración**. Para frases de
  conversación no es problema; para grabaciones de un minuto habría que cambiar
  cómo se reserva la memoria.

---

## Cómo usar esto

- **No memorizar.** Entender el porqué de cada respuesta corta alcanza; los
  números están en las diapositivas y en las evidencias.
- **Dar el porqué antes del número.** "Filtramos antes de decimar porque si no,
  un tono de 9 kHz reaparece como una ese que nadie dijo" vale más que "el filtro
  atenúa 73.8 dB".
- **Las preguntas incómodas se responden de frente.** Decir "eso está pendiente y
  así está declarado" es mucho mejor que improvisar. Un pendiente reconocido y
  documentado suma; uno tapado, si lo descubren, resta el doble.
