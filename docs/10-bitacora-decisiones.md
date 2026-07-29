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

El conjunto necesario para operar sin conexión asciende a unos 300 MB (41 MB del
reconocedor, 238 MB del corrector, 21.6 MB del runtime). Se descartó la reducción
de cuantización como solución (D-05). Medidas adoptadas: carga bajo demanda del
corrector, de modo que la primera interacción dependa únicamente del reconocedor, y
evaluación de un modelo de corrección de menor tamaño durante la fase de
optimización.

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
