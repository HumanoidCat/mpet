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

**Nota de cierre (12-ago).** Isaac llegó a un arreglo distinto para el mismo
incidente, en paralelo y sin ver este (su rama partió de antes de que este PR
llegara a `dev`). El suyo está medido contra el modelo real —tres formulaciones
de prompt comparadas— y encontró además que el problema no era solo la copia:
el modelo, al ser un T5 de instrucciones, convertía cualquier frase del
estudiante en una pregunta sobre lo mismo, incluso con el prompt ya arreglado.
Su solución (reescribir la instrucción, sacar el rol de "tutor", y `esEco()` en
`cleanup.ts` como red que funciona sin importar el modelo) reemplazó a la de
este registro al mergear PR #81. Queda esta entrada por el diagnóstico y el
aprendizaje, que siguen siendo válidos; el código descrito en **Acción** ya no
está en `dev`.

---

## D-17 · Kokoro medido y aprobado para adopción (Semana 8)

**Contexto.** D-12 dejó el umbral cruzado (7/14 con MMS-TTS) pero la adopción
diferida a después del Avance 2, por prudencia de calendario, no por duda sobre
el resultado. Condición previa declarada: medir Kokoro con el mismo banco antes
de adoptarlo, no adoptar la ficha del modelo sin medir.

**Medición.** Isaac corrió el banco de 14 palabras trampa + 5 de control sobre
Kokoro-82M cuantizado, con la misma frase portadora y el mismo criterio que se
usó para MMS-TTS.

| | MMS-TTS (producción) | Kokoro-82M q8 |
|---|---|---|
| Fallos, palabras trampa | 7 de 14 | **1 de 14** |
| Fallos, palabras de control | 2 de 5 | **0 de 5** |
| Determinista | No (suelo de 49.5 en R03) | **Sí**, verificado bit a bit |
| Descarga cuantizada | 109.0 MiB | **88.1 MiB** |
| Convierte cifras | No (necesitaba I-07) | **Sí, integrado** |

Evidencia: `docs/evidencias/s7/d12-kokoro-decision-final.md`.

**Decisión.** Se aprueba el `shared-change`: agregar `kokoro-js` y `phonemizer`
a `package.json`, y reemplazar MMS-TTS por Kokoro en `ttsWorker.ts`. La
condición de calendario de D-12 ya se cumplió —el Avance 2 se entregó— y la
diferencia entre modelos es demasiado grande para que quede en duda.

**Limitación declarada, no resuelta.** El 7/14 de MMS-TTS que disparó todo el
proceso nunca tuvo el segundo oyente que exige el protocolo (ya señalado en
D-12, sigue así). No se exige cerrarlo antes de aprobar: la distancia a 1/14 es
mayor que cualquier sesgo razonable de un solo oyente. Pero debe quedar escrita
en el PR del `shared-change`, no solo aquí.

**Registro.** `package.json` y `src/shared/` los aprueba Alejandro (regla
existente desde S1). Isaac abre el PR con la etiqueta `shared-change`;
mensaje de contexto en `docs/MENSAJE-isaac-kokoro-aprobado.md`.

---

## D-18 · Tutor bilingüe con modelo de chat (Semana 8)

**Contexto.** Tras cerrar I-09 e I-10 el tutor dejó de romperse, pero seguía sin
conversar: no recuerda nada entre turnos ni responde preguntas de contenido. Y la
aplicación entera era monolingüe, con `whisper-tiny.en` — la variante **solo
inglés**, que no reconoce español en absoluto.

Las dos cosas apuntan al mismo problema de fondo. Un principiante que todavía no
consigue armar la frase en inglés se queda mudo, y esa es exactamente la barrera
que el proyecto existe para bajar.

**Dos causas independientes, no una.**

*El modelo.* LaMini-Flan-T5 es un T5 de instrucciones: recibe una cadena y
devuelve una cadena. No tiene dónde recibir un historial, así que **por
construcción** no puede recordar. Tampoco sabe español. Se sustituye por
`onnx-community/Qwen2.5-0.5B-Instruct`, modelo de chat multilingüe que recibe la
conversación con papeles.

*La decodificación, que es la causa que faltaba probar.* Las dos tareas generaban
con decodificación voraz (`do_sample: false`), que toma siempre el token más
probable y por tanto es determinista: ante entradas parecidas produce salidas
idénticas. Eso explica las respuestas repetidas de I-10 y también las que Isaac
midió con SmolLM2, donde 4 de 6 salieron iguales carácter por carácter. Él lo
dejó anotado como sospecha —*«reconsiderar si el límite es la decodificación
voraz en sí y no el modelo»*— y probó `repetition_penalty` y
`no_repeat_ngram_size`, que penalizan repetir sin quitar el determinismo.
**Muestrear sí lo quita.**

**Decisión.** Las dos tareas dejan de generar igual, a propósito:

| | Decodificación | Por qué |
|---|---|---|
| `suggest()` | Voraz | Una corrección que cambia en cada intento confunde |
| `reply()` | Muestreo (`temperature` 0.7, `top_p` 0.9) | Una respuesta que nunca cambia deja de ser conversación |

**Qué hace el tutor con el español.** No corrige al estudiante por recurrir a él:
le da la frase en inglés que intentaba decir y sigue conversando desde ahí. En un
turno en español se saltan además la corrección gramatical y las sugerencias,
porque los dos modelos son de solo inglés y aplicarlos a una frase en español no
produce una corrección mala, produce basura.

**Alcance del bilingüe.** Solo la conversación libre. El **modo práctica fuerza
inglés** en el reconocedor: ahí se sabe que la frase objetivo está en inglés, y
dejar dudar al detector ante una palabra mal pronunciada solo añadiría una forma
de fallar. El puntaje de pronunciación sigue siendo de inglés, como debe ser.

**Lo que está sin medir, y es lo que decide si esto se queda.**

1. **El peso del modelo nuevo.** Del anterior se sabía que ocupaba 265 MiB
   medidos; del nuevo solo se conoce la ficha del Hub. Este proyecto ya se llevó
   un susto con eso (D-12: Kokoro se estimó en 325 MB y cuantizado medía 88), así
   que la cifra de `expectedMB` es una referencia para decidir si vale la pena
   medir, no un dato.
2. **La latencia del turno** contra el presupuesto de D-15.
3. **Si el muestreo basta** por sí solo para que las respuestas dejen de
   repetirse. Es barato de comprobar: hablar tres veces y ver si difieren.
4. **La precisión en inglés** de `whisper-tiny` multilingüe frente a
   `whisper-tiny.en`, que está afinado para un solo idioma. Se cierra con el WER
   de S8-T1. Si la diferencia es grande, la alternativa es `whisper-base`.

**La vuelta atrás es una constante.** `DEFAULT_SUGGESTIONS_CONFIG` en
`suggestions/suggestionsProtocol.ts` vuelve al modelo anterior; el worker soporta
las dos familias y el resto de la cadena no se entera. Tener la marcha atrás a
una línea de distancia es lo que permite probar un cambio de esta talla a tres
semanas de la entrega sin arriesgarla.

**Contrato.** `Transcription` gana `language?`, y `transcribe()` y `reply()`
ganan un parámetro opcional del mismo tipo. Es aditivo: nada de lo que existía
cambia de forma, y ausente se comporta como antes del bilingüe.

---

## D-19 · Kokoro implementado en producción (Semana 8)

**Contexto.** D-17 aprobó el `shared-change` con los números medidos, pero la
adopción quedó sin hacer: `package.json` no tenía la dependencia y el worker
seguía cargando MMS-TTS. Aprobado no es lo mismo que implementado.

**Qué cambia.** `kokoro-js@^1.2.1` entra en `package.json` —la versión que usó el
spike de D-12, así que es la que produjo las mediciones— y el worker de TTS gana
un tercer motor. `DEFAULT_TTS_CONFIG` pasa a `'F-kokoro-q8'`.

**Las dos diferencias de tratamiento, ninguna opcional.**

1. **Remuestreo de 24 a 16 kHz.** Kokoro no sintetiza a la frecuencia del
   proyecto. Sin remuestrear, la referencia sonaría con el tono alterado y sus
   MFCC no serían comparables con los del estudiante: el puntaje mediría la
   diferencia de frecuencia de muestreo en vez de la de pronunciación. Se usa
   `resample()` del módulo de audio —con filtro antisolapamiento y pruebas
   propias— en vez de escribir remuestreo nuevo, como sugirió Fabrizio al revisar
   la propuesta original.
2. **Hay que nombrar la voz** en cada síntesis: en Kokoro la voz es un vector
   aparte, no está en los pesos como en MMS-TTS. Se fija `af_heart`, la única con
   calificación A en la tabla oficial y **la que se usó para medir el banco**.
   Cambiarla sin volver a medir invalidaría la evidencia de D-17.

**Lo que cierra.** R16 (la referencia no era reproducible entre sesiones) y la
mitad de R03 (el suelo de 49.5 que MMS-TTS le imponía al puntaje), las dos por
ser Kokoro determinista. La normalización de números de I-07 se conserva aunque
Kokoro traiga su propio conversor: no estorba, y así el texto que se sintetiza no
depende de qué modelo esté cargado, que es lo que permite comparar mediciones
entre los dos.

**Lo que NO cambia, y conviene decirlo porque se planteó al revés.** El tutor
bilingüe responde **en inglés** aunque el estudiante hable español —le da la
frase en inglés y sigue conversando— así que las voces españolas de Kokoro no
hacen falta. El cambio es de calidad y determinismo, no de idioma.

**Riesgo de instalación, sin verificar.** `kokoro-js` trae su propia dependencia
de transformers.js. El spike lo cargaba desde CDN y anotó que así **convivían dos
copias**; con npm deberían unificarse, pero si la versión que pide choca con el
`^3.8.1` fijado en D-03, `npm install` lo dirá. Es lo primero que hay que mirar
al instalar.

**Vuelta atrás.** `DEFAULT_TTS_CONFIG` a `'D-vits-fp32'`. MMS-TTS sigue
implementado y probado en el mismo worker.

---

## I-11 · El turno se volvió lento tras el cambio de modelo (Semana 8)

**Detección.** Al probar la aplicación el mismo día del cambio: el turno tardaba
notoriamente más que antes. Sin error, sin traza — solo lento.

**Dos causas independientes, las dos introducidas por D-18.**

### 1. Cuantización de 4 bits, que este proyecto ya había descartado midiendo

El modelo de chat se configuró en **q4** por peso, sin mirar **D-05**, que había
medido exactamente eso en este mismo motor: la variante de 4 bits resultó **3.8
veces más lenta y encima más pesada en caché**, porque ONNX Runtime sobre
WebAssembly no tiene núcleos para enteros de 4 bits y descuantiza en cada
inferencia. La conclusión de D-05 estaba escrita: *«reducir la cuantización no es
una vía válida para aligerar la descarga inicial en este entorno»*.

**Y en un modelo de chat el castigo es peor que donde se midió.** El corrector
gramatical descuantizaba una vez por frase; un modelo de chat genera **token a
token**, así que paga esa penalización en cada uno de los hasta 96 tokens de la
respuesta.

**Acción.** `dtype` a `q8`. Prueba de regresión en
`tests/ai/suggestionsProtocol.test.ts` que falla si alguna configuración vuelve a
usar 4 bits, con el motivo escrito en el caso.

### 2. La respuesta del tutor iba detrás de las sugerencias

`suggest()` y `reply()` salen del **mismo worker y el mismo modelo**, así que se
atienden una detrás de otra. El orquestador lanzaba primero las sugerencias —dos
generaciones, una por instrucción de `SUGGESTION_PROMPTS`— y después pedía la
respuesta. Es decir: **lo que el estudiante espera quedaba en la cola detrás de
dos generaciones que nadie espera**, porque las sugerencias llegan tarde y
actualizan el mensaje cuando estén.

Con el modelo anterior el efecto existía pero era pequeño. Con uno que genera
token a token, se nota en cada turno.

**Acción.** Invertir el orden: primero `reply()`, después `suggest()` en segundo
plano. El contrato no cambia — las sugerencias siguen siendo opcionales y siguen
llegando tarde. Prueba de regresión en `tests/core/orchestrator.test.ts` que
comprueba el orden de las llamadas.

**Lo que el cambio NO resuelve, declarado.** Las sugerencias ahora terminan
después del turno, así que si el estudiante habla de nuevo enseguida, las del
turno anterior pueden seguir en la cola del worker y retrasar la respuesta del
turno nuevo. Es estrictamente mejor que antes —donde el retraso era **seguro en
todos los turnos**, no ocasional— pero no es cero. Resolverlo del todo exigiría
poder cancelar una generación en curso, que transformers.js no expone, o un
segundo worker con otra copia del modelo, que costaría cientos de MB. Se deja
así y se anota.

**Efecto secundario en las pruebas.** Las del núcleo esperaban 50 ms tras el
turno para que llegaran puntaje y sugerencias, y bastaban porque las sugerencias
se solapaban con los 400 ms de la respuesta. Al invertir el orden dejaron de
bastar y cuatro pruebas fallaron. No era un fallo del código: la espera pasa a
400 ms, con el número justificado desde el retardo del mock y no elegido a ojo.

**Aprendizaje.** El primero es el que duele: la decisión estaba medida, escrita y
razonada en la bitácora del propio proyecto, y aun así se repitió el error que
esa entrada existía para evitar. Una bitácora solo sirve si se consulta **antes**
de elegir, no después de que el síntoma aparezca.

El segundo es más sutil y vale como criterio general: **cuando dos tareas
comparten un recurso que las serializa, el orden en que se piden es una decisión
de latencia**, aunque el código no lo parezca. Ninguna prueba de contenido lo
habría detectado.

---

## D-20 · Turno escrito, junto al hablado (Semana 8)

**Contexto.** La aplicación solo aceptaba voz. Pero la corrección gramatical, las
sugerencias y el tutor operan sobre **texto**: el reconocedor solo estaba ahí para
producirlo. Exigir el micrófono para practicar gramática deja fuera tres
situaciones normales —estar donde no se puede hablar, no tener micrófono, o
querer trabajar la escritura— sin ninguna ganancia a cambio.

**Decisión.** Se añade `submitText()` al orquestador y un campo de texto en el
chat. **La voz no se toca y sigue siendo la vía principal.**

**Qué distingue a un turno escrito, y las dos cosas son deliberadas.**

1. **No pasa por el reconocedor.** Es la etapa más cara del turno (~1.5 s
   medidos), y no hay nada que reconocer.
2. **No puntúa pronunciación.** No hay audio que comparar. Es la misma regla que
   ya rige la conversación libre: sin algo contra qué comparar, no se inventa un
   número. La interfaz lo dice explícitamente debajo del campo.

Todo lo demás es idéntico, y para garantizarlo el flujo común se extrajo a
`completarTurno()`: corrección, comparación con la frase objetivo, respuesta del
tutor, sugerencias y orden de las llamadas son literalmente el mismo código. Sin
esa extracción, los dos caminos se habrían separado en cuanto alguien tocara uno.

**Detección de idioma sin modelo.** El turno hablado lo detecta con Whisper, que
ya está cargado. En el escrito no hay audio, y cargar un modelo de detección para
elegir entre dos idiomas pesaría más que la funcionalidad entera. Se cuentan
indicios ortográficos (`ñ`, tildes, signos de apertura) y palabras muy frecuentes
que no se comparten entre los dos idiomas (`src/core/idiomaEscrito.ts`).

**El sesgo hacia el inglés es intencionado.** Ante la duda se responde inglés,
porque las dos formas de equivocarse no cuestan lo mismo: marcar inglés como
español **apaga la corrección en silencio** y el estudiante no sabe por qué no le
corrigieron; marcar español como inglés hace que el corrector devuelva algo raro,
que se ve. Se prefiere el error que se nota.

**Jerarquía en la interfaz.** El campo de texto va debajo del micrófono, más
pequeño, separado por una línea que dice «o escribe para practicar gramática». No
es simetría visual: hablar es lo que esta aplicación enseña, y escribir es la
alternativa.

---

## I-12 · La compilación falló con las pruebas en verde (Semana 8)

**Detección.** Integración continua, commit `bfc80b1`. El paso `npm run build`
falló con código 1. En local: `tsc` limpio y 618 pruebas verdes.

**Dos causas encadenadas.** Al arreglar la primera apareció la segunda, que
estaba detrás y no podía verse antes.

### Causa 1 · Módulos de Node en una dependencia de navegador

`kokoro-js` importa `path` y `fs/promises` en su compilado. Son
módulos de Node que no existen en el navegador, así que Rollup no puede
resolverlos y aborta.

El paquete lo tiene previsto: declara `"browser": { "path": false, "fs/promises": false }`
porque solo los usa en la ruta de Node —cargar los vectores de voz desde disco— y
en el navegador nunca llega ahí. Vite honra ese campo al resolver desde el grafo
de la aplicación, pero **el import ocurre dentro de un Web Worker**, que Rollup
empaqueta como entrada aparte, y ahí no se aplica.

**Por qué no lo vio nada de lo que sí se ejecutó.** Ni `tsc` ni Vitest empaquetan:
el primero comprueba tipos y el segundo resuelve módulos en Node, donde `path`
existe de verdad. **La única etapa que lo detecta es la que produce el artefacto
que se despliega**, y es la última de las tres.

**Acción.** Alias de `path` y `fs/promises` a un módulo vacío
(`src/shared/emptyModule.ts`), activo solo fuera de Vitest: cuatro pruebas usan
`node:path` para leer ficheros de apoyo, y aunque hoy ese especificador es
distinto y no colisiona, dejar el alias activo bajo las pruebas convertiría un
futuro cambio de `node:path` a `path` en un fallo difícil de entender.

El módulo vacío no simula métodos a propósito. Si alguna vez se alcanzara esa
ruta de verdad, un `join()` que devuelve una cadena inventada fallaría más tarde
y lejos de la causa.

### Causa 2 · Formato de salida de los Web Workers

Resuelta la primera, la compilación llegó a transformar 1 571 módulos y falló al
empaquetar: *«UMD and IIFE output formats are not supported for code-splitting
builds»*.

El worker de TTS carga `kokoro-js` con un `import()` **dinámico**, para que el
paquete no entre en el fragmento inicial. Un import dinámico obliga a dividir el
código, y Vite compila los workers en formato IIFE por defecto, que no admite
división.

**Acción.** `worker: { format: 'es' }`. No añade ningún requisito de navegador:
los cuatro workers del proyecto ya se instancian con `{ type: 'module' }` desde
sus clientes, así que la compatibilidad mínima ya era la de los workers de módulo
—Chrome 80, Safari 15, Firefox 114, documentada en S8-T4—. El ajuste solo alinea
el formato de salida con cómo se cargan de verdad.

**Resultado, y confirma que el import dinámico cumple su función:** Kokoro sale
en su propio fragmento de **1.33 MB**, separado del código de la aplicación
(254 kB) y de los otros tres workers. Quien nunca pida audio no lo descarga.

**Aprendizaje.** Una dependencia nueva no está verificada hasta que **compila**,
no hasta que pasan los tipos y las pruebas. Las tres etapas comprueban cosas
distintas, y la de empaquetado es la única que ejerce las condiciones reales del
navegador — incluidos los límites de los Web Workers, que no se parecen a los del
grafo principal.

Que las dos causas estuvieran encadenadas lo refuerza: arreglar la primera no
daba ninguna garantía sobre la segunda, y **la única forma de saberlo era volver
a compilar**. Un cambio de dependencia se da por bueno cuando `npm run build`
termina, no cuando el razonamiento parece correcto.

**Nota adicional, verificada al investigar.** `phonemizer` —la otra dependencia
que entró con Kokoro— lleva eSpeak embebido en su propio bundle de 1.3 MB, sin
`fetch` ni ficheros externos. No compromete el funcionamiento sin conexión
(RF-14), que era la duda razonable al ver que usaba WASM.
