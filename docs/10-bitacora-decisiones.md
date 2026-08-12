# 10 · Bitácora de decisiones e incidencias

Registro cronológico de las decisiones técnicas y de gestión del proyecto, con su
justificación y evidencia. Complementa la matriz de riesgos (`06`) y la matriz de
trazabilidad (`07`). Mantenida por el Project Manager.

---

## D-01 · Arquitectura desacoplada por contratos (Semana 1)

**Decisión.** Definir las interfaces entre módulos en TypeScript
(`src/shared/contracts.ts`) antes de escribir código funcional, congelarlas al
cierre de la Semana 1, y dotar a cada módulo de una implementación simulada.

**Justificación.** Permitir desarrollo paralelo real entre los integrantes, sin
que ninguno dependa del código de otro.

**Resultado observado.** La interfaz se desarrolló contra señales sintéticas antes
de que existiera la captura; el pipeline de IA se probó con audio pregrabado sin
depender del módulo de audio. Cada módulo se verifica además contra su contrato
sin depender de los demás, de modo que la suite completa corre en integración
continua sin micrófono ni intervención manual.

---

## D-02 · Decimación explícita en lugar de delegar el remuestreo al navegador (Semana 1)

**Contexto.** El spike S1-T6 midió que el micrófono entrega exclusivamente
48 000 Hz y que `AudioContext` acepta forzar 16 kHz, es decir, el navegador ya
remuestrea internamente.

**Decisión.** Implementar el remuestreo propio (decimación entera por factor 3 con
filtro anti-aliasing con corte en 7 200 Hz).

**Justificación.** El remuestreador del navegador no documenta su filtro, y ese
filtro es precisamente el contenido de Señales y Sistemas que el proyecto debe
evidenciar. Adicionalmente, Safari ignora históricamente el parámetro de
frecuencia de muestreo, por lo que la ruta explícita es necesaria para
portabilidad.

**Evidencia.** `docs/evidencias/s1/captura-audio-spike.md`

---

## D-03 · Fijado de versión del motor de inferencia (Semana 3)

**Contexto.** Solicitud de cambio compartido (`shared-change`) para incorporar
`@huggingface/transformers`, requerida por el módulo de IA.

**Decisión.** Aprobar la dependencia fijándola en la rama `^3.8.1`, pese a existir
una versión mayor (4.x) disponible.

**Justificación.** Todas las mediciones del spike S1-T7 —41 MB en caché, 0.54 s de
carga en caliente, factor de tiempo real 0.3— se obtuvieron con la versión 3. Fijar
esa rama preserva la correspondencia entre el código entregado y la evidencia
documentada. Una migración a la versión 4 requeriría repetir las mediciones.

---

## D-04 · Caché en tiempo de ejecución para el runtime WebAssembly (Semana 3)

**Contexto.** Al empaquetar el worker de reconocimiento, ONNX Runtime emite un
archivo WebAssembly independiente de 21.6 MB que no quedaba cubierto por la
configuración de precaché.

**Alternativas evaluadas.** (a) Elevar el límite de tamaño del precaché por encima
de 22 MB; (b) definir una regla de caché en tiempo de ejecución para archivos
`.wasm`.

**Decisión.** Opción (b), estrategia `CacheFirst` sobre `.wasm`.

**Justificación.** Los modelos (~279 MB) ya se cachean en tiempo de ejecución, de
modo que precachear el runtime no habría producido capacidad offline por sí solo.
Además, el precaché de Workbox es todo-o-nada: descargar 22 MB durante la
instalación del service worker introduce un punto de fallo y penaliza la primera
carga de todos los usuarios. Se constató también que el archivo no habría entrado
al precaché por el patrón de archivos configurado, con independencia del límite de
tamaño.

---

## D-05 · Cuantización de 8 bits frente a 4 bits (Semana 3)

**Contexto.** Búsqueda de una vía para reducir los 238 MB del modelo de corrección
gramatical.

**Decisión.** Conservar la cuantización de 8 bits.

**Justificación.** La medición comparativa mostró que la variante de 4 bits es 3.8
veces más lenta (1 209 ms frente a 320 ms por frase), ocupa más espacio en caché
(303.9 MB frente a 238 MB) y no mejora la calidad de corrección. La causa es que
ONNX Runtime sobre WebAssembly carece de núcleos optimizados para enteros de 4 bits
en CPU y descuantiza en cada inferencia.

**Consecuencia para el proyecto.** Reducir la cuantización no es una vía válida
para aligerar la descarga inicial en este entorno; la variable a modificar sería el
modelo.

**Evidencia.** `docs/evidencias/s3/grammar-worker.md`

---

## D-06 · Ignorar mayúsculas y puntuación en el diferenciador de correcciones (Semana 3)

**Decisión.** El diferenciador que genera las marcas de corrección no señala
diferencias de capitalización ni de puntuación.

**Justificación.** El texto que llega al corrector gramatical procede de la
transcripción automática, no del usuario: la capitalización y los signos los genera
el modelo de reconocimiento. Marcarlos como error atribuiría al hablante una falta
que no cometió. El propio spike S1-T7 evidenció esta inestabilidad: la misma frase
transcrita dos veces produjo puntuación distinta.

**Revisión futura.** Reevaluar si se incorpora entrada de texto escrita por el
usuario.

---

## D-07 · Verificación de la FFT contra la definición, sin biblioteca externa (Semana 3)

**Contexto.** El plan preveía validar la transformada propia contra una
biblioteca de referencia (Meyda). Incorporarla implicaba añadir una dependencia
al manifiesto del proyecto, es decir, una solicitud `shared-change`, para un uso
exclusivo de pruebas.

**Decisión.** No incorporar la dependencia. La transformada se verifica contra la
definición matemática directa de la DFT y contra propiedades que deben cumplirse
de forma exacta: teorema de Parseval, linealidad, simetría conjugada, teorema del
desplazamiento y casos analíticos de resultado conocido (delta, constante,
sinusoide centrada en un bin).

**Justificación.** La verificación contra la definición es más fuerte que la
comparación con otra implementación, porque no traslada la confianza a un tercero:
si ambas implementaciones compartieran un error de criterio, la comparación no lo
detectaría. Además evita una dependencia cuyo único propósito sería la prueba.

**Resultado observado.** 27 pruebas de la transformada, con un error relativo
máximo de 1.45 × 10⁻¹³ frente al cálculo directo, dentro de la precisión de un
`float64`.

---

## D-08 · Priorización por ruta crítica en lugar de por semana de calendario (Semana 5)

**Contexto.** Hasta el Avance 1 el equipo trabajó estrictamente por semana del
plan, sin tomar tareas futuras, para concentrar el esfuerzo antes de la entrega.
Tras el Avance, el profesor autorizó adelantar todo el trabajo posible.

**Decisión.** Sustituir el orden por número de semana por un orden por
dependencia: cualquier tarea que no esté bloqueada puede iniciarse. Las reglas de
proceso —trabajo por módulo, solicitudes de incorporación con verificación en
verde, `shared-change` para archivos compartidos y evidencia escrita al completar
cada tarea— se mantienen sin cambio.

**Justificación.** Con la arquitectura desacoplada por contratos, el orden de
calendario dejó de aportar protección: cada módulo se desarrolla y verifica
contra su contrato con independencia del avance de los demás. Lo que sí sigue
condicionando el orden son las dependencias reales, y la única que hoy bloquea a
más de una persona es la síntesis de voz.

**Efecto.** El plan de trabajo resultante queda en `11-plan-post-avance-1.md`,
que tiene precedencia sobre el orden de tareas de `04-plan-semanal.md`.

---

## I-01 · Corrección del calendario de entregas (Semana 3)

**Incidencia.** La planificación interna situaba el primer avance una semana
después de la fecha real de la semana 4.

**Acción.** Verificación contra el documento del curso —que fija los hitos por
número de semana, no por fecha— y corrección del calendario completo en el
roadmap, el plan semanal y las guías del equipo.

---

## I-02 · Solicitud de integración que comprometía la compilación (Semana 3)

**Incidencia.** Una solicitud de integración falló la verificación automática. El
análisis determinó que la rama, pese a partir de un punto correcto de la rama de
integración, eliminaba en su commit la dependencia
`@huggingface/transformers` del manifiesto del proyecto y revertía la
configuración de caché del runtime WebAssembly. La causa fue la regeneración
completa de `package.json` y `vite.config.ts` por una herramienta de andamiaje, que
sobrescribió el contenido existente.

**Acción.** No se integró con la verificación en rojo, para no comprometer la rama
de integración compartida. Se reconstruyeron ambos archivos combinando el estado
de la rama de integración con las dependencias legítimamente añadidas por el
cambio, y se verificó la compilación completa antes de integrar.

**Aprendizaje registrado.** Los archivos compartidos (`package.json`,
`vite.config.ts`, `src/shared/`) no deben ser regenerados por herramientas
automáticas. Se refuerza la regla de solicitud `shared-change` y se añade la
comprobación local `npm run typecheck && npm test && npm run build` como paso
previo obligatorio a toda solicitud de integración.

---

## Riesgo abierto · Volumen de la descarga inicial

**Cifra cerrada el 7 de agosto, con el desglose medido por Isaac.** Circulaban
tres números distintos, y media confusión venía de las unidades: los «21.6 MB»
del runtime y los «20.6 MiB» eran el mismo archivo contado de dos formas.
**Convención adoptada para todo el proyecto: MiB.**

| Pieza | Bytes | MiB |
|---|---:|---:|
| ASR `whisper-tiny.en` q8 | 42 985 755 | 41.0 |
| Gramática `t5-base-grammar-correction` q8 | 252 557 916 | 240.9 |
| TTS `mms-tts-eng` fp32 | 114 263 006 | 109.0 |
| Runtime ONNX/WASM | ≈21 600 000 | 20.6 |
| **Total** | | **≈411** |

El desglose del reconocedor y del sintetizador está verificado leyendo la caché
del navegador tras una descarga real. El del corrector está calculado con el
mismo método, que acertó en los otros dos, pero no verificado empíricamente.

Se descartó la reducción de cuantización como solución (D-05). Medidas adoptadas:
carga bajo demanda del corrector, de modo que la primera interacción dependa
únicamente del reconocedor, y evaluación de un modelo de corrección de menor
tamaño durante la fase de optimización. **Queda pendiente la carga bajo demanda
del sintetizador (S7-T4)**, que no se necesita hasta después del primer turno de
conversación y es la vía de mayor efecto sobre la descarga inicial.

---

## I-03 · Pérdida de amplitud en el espectro del adaptador de audio (Semana 5)

**Incidencia.** El espectro que consume el visualizador salía aproximadamente un
20 % por debajo de la amplitud real, y la tasa de frames era de 46 por segundo en
lugar de 62.5. Detectado por medición del responsable del módulo de audio al
revisar el código que consume su módulo.

**Causa.** El AudioWorklet entrega bloques de 1024 muestras a 48 kHz, que tras la
decimación por factor 3 equivalen a 341 muestras a 16 kHz, frente a un tamaño de
transformada de 512. El adaptador completaba la diferencia con 171 ceros, de modo
que un tercio de cada frame era relleno, y aplicaba la ventana de Hann sobre el
frame ya completado. La señal quedaba multiplicada solo por el tramo inicial de
la ventana, mientras que la corrección por ganancia coherente dividía por la
ganancia de la ventana completa. Además se emitía un frame por bloque recibido en
lugar de uno por salto de análisis.

**Acción.** Sustituir el rellenado por `StreamingStft`, que acumula las muestras
recibidas y emite un espectro por cada frame completo, conservando el sobrante
entre llamadas, de modo que las tramas dejan de depender de dónde caigan los
límites de bloque.

**Resultado.** Corregido en `src/core/audioEngineAdapter.ts` con
`FrameAccumulator`, que acumula las muestras y analiza tramas completas de 512
con salto de 256, sin relleno. Se acumula la trama y no el espectro porque el
tono y los MFCC necesitan la señal en el dominio del tiempo, sin enventanar. La
amplitud del espectro vuelve a 1.0 y la tasa pasa de 46 a 62.5 tramas por
segundo. El instante de cada trama se asigna al emitirla, no al cerrar el
bloque, porque una sola llegada puede producir varias tramas.

**Aprendizaje registrado.** El tamaño de bloque del AudioWorklet no divide de
forma exacta al tamaño de trama de análisis tras la decimación, y ese desajuste
no es visible por inspección del código: solo aparece al medir la amplitud de
una señal de referencia. Se añadieron cinco pruebas al adaptador para fijar la
condición: amplitud unitaria ante un tono de amplitud conocida, independencia
del número de tramas respecto al tamaño de bloque de entrada, conservación del
sobrante entre llamadas, tiempo de trama por salto, y equivalencia del espectro
con `StreamingStft` muestra a muestra, de modo que las dos rutas de análisis del
proyecto no puedan divergir.

---

## D-09 · Declarar el estado de acondicionamiento al analizar audio (Semana 6)

**Contexto.** Al conectar el comparador de pronunciación al orquestador, las dos
señales que entran a la métrica de distancia no recorrían la misma cadena. El PCM
del estudiante sale de `AudioEngine.stop()` y ya viene acondicionado con el
pasa-altas de 80 Hz y la normalización RMS de S2-T2. El de referencia sale de
`AIPipeline.speak()` y viene crudo. La distancia medía, además de la
pronunciación, la diferencia entre las dos rutas.

**Medición.** Sobre una vocal sintética comparada contra sí misma, donde el
resultado correcto es 100:

| Referencia | Antes | Después |
|---|---:|---:|
| Limpia | 99.28 | 100.00 |
| Con offset de continua | 96.56 | 99.99 |
| Con retumbe de 40 Hz | 89.30 | 96.98 |

El peor caso se comía 10.7 de los 31 puntos de margen que RF-10 exigía. Los dos
últimos casos son escenarios construidos para acotar el efecto, no mediciones de
lo que entrega el sintetizador real.

**Decisión.** `AudioEngine.analyze` recibe un segundo parámetro opcional,
`AnalyzeOptions`, con el que el llamador declara si el PCM ya está acondicionado.
Por defecto `analyze` acondiciona. Se descartó acondicionar siempre porque **el
acondicionamiento no es idempotente**: aplicar el pasa-altas dos veces cuesta 0.72
puntos sobre la misma señal, de modo que habría cambiado un sesgo por otro.

Al ser opcional, ningún implementador del contrato tuvo que cambiar.

**Aprendizaje.** Cuando dos señales alimentan una métrica de distancia, la etapa
en la que se encuentran es parte del contrato y no puede quedar implícita.

---

## D-10 · Persistencia de sesiones sobre IndexedDB, sin dependencias (Semana 6)

**Contexto.** La pantalla de progreso (RF-23, S9-T1) necesita el historial de
sesiones y hasta ahora mostraba un arreglo escrito a mano.

**Alternativas.** `localStorage` es síncrono, bloquea el hilo principal mientras
corre el análisis de audio, guarda solo cadenas y tiene una cuota de unos 5 MB;
una sesión con puntaje por palabra crece rápido. La biblioteca `idb` es cómoda
pero aquí solo hacen falta un almacén de objetos y un índice, lo que no justifica
sumar un paquete ni el `shared-change` que arrastraría (D-03).

**Decisión.** IndexedDB directo en `src/core/sessionStore.ts`. El resumen de cada
sesión se calcula al guardar y se almacena junto a los mensajes: es
denormalización deliberada, porque la pantalla de progreso lista muchas sesiones
y no necesita cargar la conversación de cada una. Cuando no hubo puntajes el
promedio se guarda como `null` y no como cero, porque cero significaría mala
pronunciación y lo cierto es que no se midió.

Si IndexedDB no está disponible —navegación privada— se cae a un almacén en
memoria: se pierde el historial, no la sesión en curso.

**Verificación.** La lógica pura se prueba entera en Node; la parte de base de
datos se verifica en el navegador, con el mismo criterio que la captura de
micrófono.

---

## I-04 · Barra de progreso de carga detenida en el 100 % (Semana 5)

**Detección.** Isaac, verificando el worker de TTS con descargas reales. No se
veía leyendo el código: solo aparece con una descarga de verdad.

**Causa.** Los archivos pequeños, como `config.json` de 1656 bytes, llegan
completos en un único evento y antes de que empiece el archivo grande de pesos.
El agregador los contaba, calculaba 1656/1656 = 100 % y, como la barra es
monótona por diseño, se quedaba en el 100 % durante toda la descarga real. Con
MMS-TTS eran 109 MB de espera con la barra llena. Afectaba a los tres modelos, no
solo al TTS.

**Acción.** En `createProgressAggregator.handle`
(`src/ai/model-cache/progress.ts`), un archivo cuyo **primer** evento ya viene
completo se descarta y no se registra, de modo que su cierre posterior tampoco
cuenta:

```ts
const known = files.get(event.file);
if (!known && event.loaded >= event.total) return;
```

La regla no depende de ningún tamaño umbral, solo de cómo llega el archivo: uno
que se descarga de verdad llega troceado, así que su primer evento siempre trae
`loaded < total`.

**Resultado**, medido con `Xenova/mms-tts-eng` fp32, caché fría, a través del
worker y el cliente reales:

- Antes: 1928 eventos recibidos → **1 reporte emitido**.
- Después: **1690 reportes graduales**.

El número de eventos varía entre corridas porque el troceado de la descarga
varía; el «1 reporte» no.

**Aprendizaje.** Un indicador de progreso no se puede validar con datos
simulados: el patrón de llegada de los eventos es el problema, no el cálculo.

---

## I-05 · Escala del espectro en la cadena de MFCC (Semana 6)

**Detección.** Fabrizio, al correr por primera vez la verificación cruzada contra
librosa que estaba preparada desde S5-T2 y nunca se había ejecutado. Primera
corrida: **5.02 % de error, con 49 % de diferencia en el coeficiente cero**.

**Causa.** El extractor aplicaba al espectro de potencia la misma corrección de
amplitud que usa `spectrumOf` para leer la amplitud física de un tono. Esa
corrección divide la potencia por 65 536, y eso hundía las bandas mel por debajo
del piso que evita `log(0)`: con un tono puro, **24 de las 26 bandas quedaban
fijadas en el piso**. Una banda fijada deja de responder a la señal, así que la
información se perdía antes de llegar a la DCT.

Es exactamente la limitación que la evidencia de S5-T2 declaraba como caso
límite —«la invariancia se rompe si alguna banda toca el piso»— ocurriendo en una
señal perfectamente normal.

**Acción.** Quitar la corrección en la cadena de MFCC. Los valores quedan en
rango sano, ninguna banda toca el piso, y es además la convención de HTK y
librosa, de modo que los coeficientes resultan comparables con la literatura.

**Resultado.** Error contra librosa de **5.02 % a 0.009 %**, frente al 5 % que
exige la métrica de RF-09.

**Hallazgo secundario.** Tras el arreglo, el caso de ruido seguía en 4.79 %. La
causa no estaba en los MFCC sino en las señales: el generador congruencial usaba
el multiplicador 1103515245 y el producto supera 2⁵³, así que Python, con enteros
de precisión arbitraria, y JavaScript, con dobles, divergen desde la segunda
muestra. La comparación enfrentaba señales distintas. Ambos generadores pasan a
Park–Miller (16807), exacto en los dos lenguajes, y el caso queda en 0.000 %.

**Aprendizaje registrado.** La validación por etapas no lo detectó porque **cada
etapa era correcta por separado; el fallo estaba en la escala con que se
encadenaban**. Es el argumento de por qué verificar cada bloque contra su
definición es necesario pero no suficiente, y por qué una verificación cruzada
contra una implementación de referencia, aunque no se adopte como dependencia
(D-07), sigue teniendo valor.

---

## I-06 · Notas internas del equipo visibles en la aplicación (Semana 6)

**Detección.** Alejandro, mirando la pantalla del visualizador en la aplicación
desplegada.

**Causa.** Tres frases escritas dentro del JSX en vez de en un comentario, por lo
que se renderizaban al usuario final: «FFT real (S3-T1, Fabrizio) ✅ — esta señal
ya viene del micrófono de verdad», «pitchHz siempre es null hasta el detector real
de pitch de Fabrizio (S5-T1)» y una nota sobre métricas que se agregarían «cuando
el FFT esté listo». Las tres habían quedado además desactualizadas: anunciaban
como pendiente lo que se entregó semanas antes.

**Por qué no se detectó.** Ninguna de las pruebas del proyecto miraba el texto que
llega a pantalla. La suite garantizaba que la aplicación compila, no lo que
muestra.

**Acción.** Los textos se sustituyen por la descripción de la técnica de señales
correspondiente y las notas pasan a comentarios. Se añade
`tests/ui/sinNotasDeEquipo.test.ts`, que lee cada `.tsx`, descarta los
comentarios y falla si el código renderizable contiene un código de tarea, el
nombre de un integrante, un `TODO` o vocabulario del proceso interno.

**Aprendizaje.** Una nota para el equipo dentro de código que se renderiza es
indistinguible de contenido del producto. El lugar de esa información es el
comentario, y hace falta una prueba que lo obligue.

---

## Riesgo cerrado · Pruebas omitidas en la suite

Las tres pruebas que la suite omitía correspondían al fixture de librosa de
RF-09. Se generaron y se ejecutaron en la Semana 6, y destaparon I-05. **La suite
ya no omite ninguna prueba.**

---

## D-11 · Carga bajo demanda del sintetizador (Semana 7)

**Contexto.** S7-T4 buscaba reducir la descarga inicial de unos 411 MiB. La
cuantización quedó descartada por medición (D-05), así que la vía abierta era
diferir modelos.

**Decisión.** El sintetizador deja de cargarse en `init()` y se carga la primera
vez que se pide audio. La primera descarga baja de **411.5 a 302.6 MiB, un 26 %**,
sin tocar ningún modelo ni ninguna cuantización.

**Justificación.** Un turno empieza con el estudiante hablando: el reconocedor y
el corrector hacen falta desde el primer instante, el sintetizador no.

**Lo que la implementación resuelve y no se ve leyendo el código.** «Cargar la
primera vez que se use» tiene tres trampas, y `src/ai/lazy.ts` las cubre con
pruebas: dos llamadas simultáneas descargarían el modelo dos veces si no
comparten la misma promesa; una promesa rechazada guardada dejaría la función
inutilizable durante toda la sesión tras un corte de red momentáneo; y el
callback de progreso solo llega en `init()`, así que hay que conservarlo o la
descarga tardía ocurre sin que la interfaz pueda avisar.

**Verificado en ejecución**, no compilando: `speak()` sin `init()` previo devolvió
27 904 muestras de audio correcto.

**Corrección posterior, del lado del núcleo.** La justificación original decía que
hay usuarios que nunca pulsan «escuchar». Dejó de ser cierto al conectar el
comparador: el orquestador llama a `speak()` en cada turno para sintetizar la
referencia del puntaje. Los 109 MiB se descargan igual en el primer turno, y el
progreso se reportaba a una pantalla de carga que ya no existe. Se añadió en
`App.tsx` un indicador de descarga visible fuera del arranque.

La decisión sigue siendo correcta: la espera inicial baja de verdad y la descarga
se solapa con el estudiante hablando, en vez de bloquear el arranque. Pero el
beneficio es ese y no el que se enunció.

---

## D-12 · Kokoro aprobado y diferido a la entrega final (Semana 7)

**Contexto.** El umbral se cerró antes de medir: *«1 o 2 fallos, se queda MMS-TTS;
3 o 4, se curan las frases de práctica; 5 o más, se abre el `shared-change`, y
siempre junto con la carga bajo demanda del TTS»*.

**Medición.** **7 fallos de 14**, cruzando la vía automática y la escucha a
ciegas. La carga bajo demanda está entregada (D-11).

**El dato que decidió no está en las 14.** Fallan también `water` y `book`, que
eran palabras de **control** —triviales, sin trampas de escritura, incluidas para
detectar si los fallos venían del reconocedor— y fallan en las dos vías. Eso
desarma la mitigación barata: se puede curar un conjunto de frases que evite
*vegetables*, no se puede enseñar inglés con un tutor que no sabe decir *water*.

**Decisión.** El umbral se disparó y se honra: **Kokoro queda aprobado**. Pero se
programa **después del Avance 2**, para la entrega final del 8 de septiembre.

**Justificación de la fecha, que es distinta de la justificación de la decisión.**
La entrega se adelantó del 18 al 11 de agosto. Incorporar 216 MiB y una
dependencia nueva a seis días de una entrega es imprudente; hacerlo con un mes es
razonable. Se deja escrita la distinción para que quede claro que no se movió el
criterio al ver el resultado, que es exactamente lo que cerrarlo de antemano
pretendía evitar.

**Condición previa a fijarlo.** Kokoro no está medido, está leído: hay ficha del
modelo, no mediciones propias. Antes de incorporarlo hay que pasarle **el mismo
banco de 14 palabras trampa y 5 de control** y comparar los conteos. Si no mejora,
no se adopta. Lo que se aprueba es evaluar el modelo, no el modelo.

**Pendiente para cerrar formalmente el conteo.** Falta el segundo oyente que exige
el protocolo; el 7 es de una sola persona.

---

## I-07 · El sintetizador no sabe decir cifras (Semana 7)

**Detección.** Isaac, durante el conteo de pronunciación de S7-T4.

**Síntoma.** Con `$25` el reconocedor no oyó un número equivocado: no oyó **nada**
donde iba la cifra, en las tres repeticiones («sake is», «sait as», «say this»).

**Causa.** MMS-TTS trabaja carácter a carácter y nunca aprendió a convertir
dígitos en palabras.

**Por qué importa más de lo que parece.** Precios, horas y fechas son contenido
básico de una clase de inglés conversacional. Un tutor que enmudece ante un número
falla en el uso más corriente del idioma.

**Acción.** Normalizar los números a letras antes de sintetizar («$25» → «twenty
five dollars»). Cabe entero en `src/ai/`, no depende de Kokoro y **se prioriza por
delante de él**: es una tarde de trabajo con efecto visible, frente a 216 MiB con
efecto por medir.

---

## D-13 · Interfaz en español, contenido en inglés (Semana 7)

**Contexto.** La interfaz mezclaba jerga técnica en inglés —«Synthesizing
Speech…» en cada turno— con instrucciones en español.

**Decisión.** Se traduce y simplifica todo el texto de navegación y de proceso.
Queda en inglés solo lo que es material de aprendizaje: lo que dice el
estudiante, la respuesta del tutor, las correcciones y las sugerencias.

**Justificación.** El usuario es un estudiante hispanohablante que está
aprendiendo inglés. Obligarle a descifrar la interfaz añade una dificultad que no
es la que vino a practicar, y en un principiante compite con el contenido. La
frontera queda clara: el envoltorio en su idioma, el ejercicio en el que
practica.

**Añadido.** Una línea de ánimo por nivel de puntaje (`TIER_ENCOURAGEMENT`), para
que un puntaje bajo se lea como retroalimentación y no como un veredicto. Es
coherente con la mitigación prevista para R03.

**Registro.** La decisión la tomó el módulo de interfaz durante S7-T3. Se anota
aquí porque afecta al producto entero, no solo a `src/ui/`.

---

## D-14 · Un solo modelo para las sugerencias y la respuesta del tutor (Semana 7)

**Contexto.** S6-T4 y S7-T2 piden dos cosas distintas —sugerir mejoras y responder
como tutor— que podrían salir de dos modelos. Cargar dos T5 duplicaría cientos de
MB sin ganar nada, así que se decide con una sola elección.

**Alternativas medidas.** Un modelo pequeño de 77M (93 MiB) y uno de 248M
(265 MiB), los dos cuantizados a 8 bits.

**El pequeño no es la opción barata: es inservible.** No ejecuta la instrucción,
la parafrasea. Pedirle reescribir «My favorite food is rice with chicken» devuelve
«The native English speaker would say it is a favorite food». Y dos de las cuatro
respuestas de tutor fueron negativas del tipo «I cannot provide a response… it goes
against my programming to provide inappropriate or offensive content», ante frases
sobre arroz con pollo y sobre películas de terror. Es ruido heredado de la
destilación, no una decisión sobre el contenido.

**Decisión.** LaMini-Flan-T5-248M q8. La comparación de peso no llega a plantearse:
93 MiB no valen nada si lo que devuelven no se puede enseñar a un estudiante.

**Consecuencia declarada.** Una sesión completa pasa a descargar **676.4 MiB**:
302.6 al arrancar, 264.8 del tutor en el primer turno y 109 del sintetizador la
primera vez que se pide audio. La carga bajo demanda evita que la pantalla inicial
espere por ellos, no los ahorra. La vía que queda para adelgazar es el **corrector
de gramática (241 MiB)**, el único de los cuatro modelos que nunca se comparó
contra alternativas.

**Evidencia.** `docs/evidencias/s6/s6-t4-modelo-tutor.md`

---

## D-15 · Qué cubre el presupuesto de 2 segundos (Semana 7)

**Contexto.** El modelo del tutor tiene una latencia mediana de 1751 ms y máxima de
2285 ms. Leído sin contexto parece que rompe el compromiso de responder en menos de
dos segundos, y el riesgo R06 quedaría materializado.

**Aclaración.** No lo rompe, porque el turno no es una sola espera. El orquestador
emite el mensaje del estudiante **con su transcripción y su corrección antes** de
pedir la respuesta del tutor, y calcula el puntaje de pronunciación y las
sugerencias **fuera del turno**.

Reparto real de un turno:

| Qué | Cuándo llega |
|---|---|
| Transcripción y corrección gramatical | dentro del presupuesto de 2 s |
| Respuesta del tutor | ~1.75 s después |
| Puntaje de pronunciación y sugerencias | asíncronos, sin bloquear |

**Decisión.** El presupuesto de dos segundos se aplica a la **retroalimentación**,
que es lo que pierde valor si tarda: una corrección que llega tarde ya no se
conecta con lo que el estudiante acaba de decir. La respuesta conversacional del
tutor admite más, porque una pausa de un segundo y medio antes de contestar es lo
normal en una conversación humana.

**Pendiente.** La medición de punta a punta con todo integrado. Los 1751 ms vienen
del spike, medidos además con la pestaña en segundo plano, donde el navegador
limita el procesamiento: son pesimistas.

---

## D-16 · Modo práctica con frase objetivo (Semana 7)

**Contexto.** La calibración con voz real (S9-T3) demostró que el puntaje acústico
no puede cumplir RF-10, por dos causas encadenadas. La primera, en el comparador:
el efecto del hablante pesa unas seis veces más que el error de pronunciación. La
segunda, en la integración: el orquestador sintetizaba la transcripción, es decir
**la propia equivocación del estudiante**, así que el puntaje no podía detectar
una palabra mal dicha por construcción.

**Decisión.** El puntaje solo se calcula contra una **frase objetivo**, y en
conversación libre no se calcula. La razón de fondo es que en conversación libre
no existe una pronunciación correcta contra la que comparar: no sabemos qué quiso
decir el estudiante. Mejor ningún número que uno que en realidad mide cuánto se
parece su voz a la del sintetizador.

**Cómo se implementa, y por qué así.** Sobre el chat que ya existe, sin pantalla
nueva: la aplicación propone una frase, el estudiante la repite con el mismo botón
de micrófono, y el color por palabra que ya pintaba la interfaz sirve igual. La
alternativa —una pantalla de práctica aparte— habría duplicado el flujo de captura
para no aportar nada que el chat no hiciera ya.

**La señal que decide.** `targetMatch` compara lo transcrito contra el objetivo. Es
la única señal independiente del hablante que tiene el proyecto: el reconocedor
está entrenado con miles de voces, así que el error aparece en el texto, donde el
timbre no influye. El puntaje acústico pasa a dato secundario.

**Limitación declarada.** Esa señal detecta 6 de cada 10 errores y produce 4 falsas
alarmas. Por eso se redacta como «no entendí bien» y **nunca** como «lo dijiste
mal»: acusar a quien pronunció bien desmotiva y además es falso. El campo se llama
`noReconocida` y no `incorrecta` por lo mismo.

**Efecto secundario buscado.** Un banco cerrado de frases resuelve también **R16**:
cada referencia se sintetiza una sola vez, así que deja de cambiar entre sesiones.
Y permite curar el conjunto para esquivar las palabras que el sintetizador
pronuncia mal (S7-T4) y las cifras que no sabe decir (I-07). `cumpleCriterio()` lo
verifica sobre todo el banco en la suite.

**Pendiente.** Medir si la combinación de las dos señales supera los 6 de 10 de la
señal sola. Es lo que decide cómo queda RF-10 en la entrega final.

---

## I-08 · Un cambio de contrato entró sin revisión (Semana 7)

**Incidencia.** Los campos `target` y `targetMatch` de `ChatMessage`, más los tipos
`PalabraObjetivo` y `ComparacionObjetivo`, entraron a `dev` en los commits
`08a64ee` y `3a8e94b` **sin solicitud de incorporación y sin revisión**, pese a que
el proceso exige ambas para `src/shared/`.

**Causa.** Se indicó abrir la solicitud con la etiqueta `shared-change` y acto
seguido se entregó una secuencia de comandos que confirmaba y empujaba
directamente a `dev`. La instrucción contradecía a la regla y se siguió la
instrucción.

**Efecto real.** Ninguno técnico: los dos campos son opcionales, ningún campo
existente cambió y la integración continua quedó en verde. Pero la regla no existe
para evitar daño técnico, sino para que quien consume el contrato se entere, y el
módulo de interfaz consume `ChatMessage`.

**Acción.** No se revierte: revertir y rehacer por solicitud no añadiría revisión
sobre un cambio ya integrado y probado. Se declara la etiqueta `shared-change` en
la siguiente incorporación a `main`, de modo que quede el registro aunque el
cambio ya esté dentro.

**Aprendizaje.** Una regla de proceso no sobrevive a una instrucción que la
contradice, por muy explicada que esté la regla. Al indicar los pasos hay que
mirar si coinciden con lo que se acaba de exigir.

---

## I-09 · El tutor devolvía una negativa memorizada de otro sistema (Semana 7)

**Detección.** Probando la aplicación desplegada el 11 de agosto. Ante la entrada
más trivial posible —«Hi, how are you?»— el tutor respondió:

> I'm sorry, but I cannot respond to this prompt as it goes against OpenAI's use
> case policy on generating inappropriate or offensive content.

**Causa.** LaMini-Flan-T5-248M se destiló a partir de salidas de GPT-3.5, así que
las negativas de ese sistema quedaron dentro de su corpus de entrenamiento. Ante
una entrada que no sabe continuar, el modelo devuelve una de esas negativas
memorizadas en vez de generar una respuesta propia. No es un fallo del prompt ni
del código: es texto copiado del entrenamiento, y lo delata que se dispare con un
saludo.

D-14 ya había registrado el mismo fenómeno en el modelo pequeño de 77M durante el
spike S6-T4 —dos de cuatro respuestas fueron negativas de ese tipo, ante frases
sobre arroz con pollo y películas de terror— y fue parte de por qué se descartó.
Lo que no se anticipó es que el modelo grande, el elegido, también lo hiciera,
con una entrada mucho más simple que las del spike.

**Acción.** `cleanTutorReply` (`src/ai/suggestions/cleanup.ts`) ya limpiaba
comillas y saltos de línea de la salida del modelo. Se le añadió
`esRechazoMemorizado(texto)`, que reconoce las huellas de una negativa
memorizada —mención a otro proveedor, «as an AI language model», «I cannot
respond», «content policy» y variantes— y la sustituye por
`RESPUESTA_DE_RESERVA`, una frase que cumple el mismo contrato que le pide
`TUTOR_INSTRUCTION` al modelo: una oración corta terminada en pregunta, para que
la conversación no se muera.

**Resultado.** `tests/ai/cleanup.test.ts` sube a 27 casos, con la salida literal
del modelo como caso de regresión. Verificado en `dev` y en `main`
(PR #74, commit `0813cb3`).

**Aprendizaje.** Un spike que descarta una opción por un defecto no garantiza que
la opción elegida esté libre de ese mismo defecto en otras condiciones. D-14 midió
el fenómeno con frases de vocabulario cotidiano; el defecto reapareció en el
modelo ganador ante un saludo, la entrada más simple posible.

---

## I-10 · El tutor repetía siempre la misma respuesta (Semana 7)

**Detección.** Al probar I-09 ya corregido: tres turnos seguidos de una
conversación real recibieron la **misma respuesta exacta**, sin importar lo que
dijera el estudiante.

| El estudiante dice | El tutor responde |
|---|---|
| How are you doing? | I'm doing well, thanks for asking. |
| Well, I need to practice my English. | I'm doing well, thanks for asking. |
| Can you help me please? | I'm doing well, thanks for asking. |

**Causa.** `buildTutorPrompt` armaba el prompt intercalando los turnos del
estudiante y del tutor, terminando en una línea `Tutor:` vacía para que el modelo
la completara:

```
Student: How are you doing?
Tutor: I'm doing well, thanks for asking.
Student: Well, I need to practice my English.
Tutor:
```

A partir del segundo turno, el modelo **copiaba la línea `Tutor:` que ya tenía
delante** en vez de generar una nueva. La evidencia de que copiaba y no razonaba:
la respuesta dejó de terminar en pregunta, que es justo lo que exige
`TUTOR_INSTRUCTION`. Es comportamiento conocido de un T5 pequeño ante un
transcript multi-turno: LaMini-Flan está afinado para instrucciones sueltas
(D-14), y darle sus propias respuestas anteriores como parte del prompt le da
algo que copiar en vez de algo que continuar.

**Acción.** `buildTutorPrompt` deja de incluir las líneas `Tutor:` en el prompt.
Se conservan los turnos del estudiante dentro de la ventana de `HISTORY_TURNS`,
sin ninguna respuesta previa del tutor de por medio, así que no queda nada que
copiar.

**Resultado.** `tests/ai/suggestionsProtocol.test.ts` gana un caso de regresión
que falla si alguien vuelve a incluir las líneas del tutor en el prompt, y otro
que comprueba que dos preguntas distintas producen prompts distintos. Verificado
con `tsc --noEmit` y con la lógica ejecutada directamente (`vitest` no corre en
el entorno donde se escribió el arreglo); falta la corrida de la suite completa y
el PR — ver `docs/pendiente-tutor-repite.md`.

**Aprendizaje.** El contexto conversacional que parecía una mejora —darle al
modelo sus propias respuestas anteriores— era la causa del defecto. Un modelo
afinado para instrucciones sueltas no necesariamente se comporta mejor con más
contexto; a veces se comporta peor.
