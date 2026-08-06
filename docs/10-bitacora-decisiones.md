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

El conjunto necesario para operar sin conexión ascendía a unos 300 MB (41 MB del
reconocedor, 238 MB del corrector, 21.6 MB del runtime). **Con la incorporación
del sintetizador de voz en la Semana 5 la cifra sube a unos 388 MB**, pendiente
de confirmar el desglose exacto medido.

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

**Acción.** Los archivos que llegan completos en un solo evento dejan de contar
para el agregado, en `src/ai/model-cache/progress.ts`.

**Resultado.** De **1 reporte de progreso a 1690 graduales**, verificado con
descarga real.

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
