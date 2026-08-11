# My Personal English Teacher (MPET)
## Documento Técnico Final

- **Curso:** Señales y Sistemas
- **Equipo:** Alejandro Zamora (Project Manager, Núcleo e Integración) · Fabrizio Espinoza (Procesamiento Digital de Señales) · Isaac Morum (Inteligencia Artificial) · José Pablo Monestel (Interfaz y Visualización)
- **Repositorio:** https://github.com/HumanoidCat/mpet
- **Demo desplegada:** https://humanoidcat.github.io/mpet/

---

## 1. Descripción del problema

Aprender inglés conversacional es, para un hispanohablante, un problema distinto al
de aprender su gramática o su vocabulario. La dificultad central no es de
conocimiento sino de **producción oral**: el estudiante sabe la regla, pero no
consigue pronunciar de forma inteligible ni sostener una conversación con fluidez.

Este problema tiene tres causas identificables.

**Barrera fonética.** El inventario fonológico del español tiene cinco vocales; el
del inglés supera las once, además de contrastes consonánticos inexistentes en
español. Pares mínimos como *ship*/*sheep* o *bad*/*bed* se colapsan en un mismo
sonido para el oído no entrenado. El estudiante no puede corregir lo que no
distingue, y sin retroalimentación externa el error se fosiliza.

**Falta de práctica conversacional accesible.** La práctica oral efectiva exige un
interlocutor que corrija en el momento. Las alternativas reales —tutorías privadas,
academias, intercambios— son costosas, dependen de horarios y requieren conexión
estable. En zonas con conectividad limitada o para estudiantes con restricciones
económicas, esa práctica simplemente no ocurre.

**Retroalimentación tardía o inexistente.** Las aplicaciones masivas de idiomas
evalúan mayoritariamente comprensión y gramática escrita. Cuando incorporan
reconocimiento de voz, devuelven un veredicto binario sin explicar *qué* falló.

### El problema desde la perspectiva de Señales y Sistemas

Evaluar pronunciación automáticamente es, en el fondo, un problema de análisis de
señales. La voz es una señal continua que debe muestrearse respetando el criterio
de Nyquist, filtrarse para eliminar ruido y componentes fuera de la banda de
interés, y transformarse al dominio de la frecuencia para extraer las
características que distinguen un fonema de otro.

Las dificultades técnicas son concretas y medibles:

- **Ruido ambiental y variabilidad del canal.** El micrófono captura ruido de fondo,
  reverberación y distorsiones del dispositivo. Sin preprocesamiento, ese ruido
  contamina toda medición posterior.
- **Variabilidad acústica entre hablantes.** La misma palabra pronunciada por dos
  personas produce señales muy distintas en amplitud, duración y frecuencia
  fundamental. La comparación no puede ser muestra a muestra: requiere
  características robustas a esa variabilidad y alineamiento temporal.
- **Restricción de tiempo real.** El análisis debe ocurrir mientras el usuario habla,
  sin bloquear la interfaz, y con retroalimentación en menos de dos segundos.

Este documento sostiene, con mediciones propias, que **la tercera dificultad se
resolvió, la primera también, y la segunda resultó ser más profunda de lo que el
planteamiento inicial suponía.** La sección 7 lo desarrolla en detalle: el efecto
del hablante sobre la comparación espectral pesa aproximadamente seis veces más que
el error de pronunciación que se quería medir. Ese hallazgo, y lo que se hizo con
él, es la aportación técnica más significativa del proyecto.

---

## 2. Justificación

**Valor educativo.** La retroalimentación inmediata y específica es el factor que
más acelera la adquisición de una segunda lengua. Una herramienta que señale qué
palabra se pronunció mal, frente a qué referencia, ataca el problema de la
fosilización de errores que las aplicaciones existentes dejan sin resolver.

**Accesibilidad y costo.** Al ejecutarse íntegramente en el navegador del usuario,
la aplicación tiene costo de operación cero: no hay servidores de inferencia, no
hay cuotas por uso de API, no hay límite de sesiones. Tras la descarga inicial de
los modelos funciona sin conexión, lo que la vuelve utilizable en contextos de
conectividad intermitente o costosa.

**Privacidad.** La voz es un dato biométrico. En una arquitectura cliente el audio
nunca sale del dispositivo: no se transmite, no se almacena en terceros, no se
utiliza para entrenar modelos ajenos. La privacidad no depende de una política sino
de la arquitectura.

**Pertinencia con el curso.** El proyecto aplica de forma no decorativa los
contenidos de Señales y Sistemas: teorema de muestreo, aliasing, filtrado digital,
transformada discreta de Fourier y espectrogramas, extracción de características,
detección de periodicidad y comparación de señales. Cada concepto resuelve un
problema concreto de la aplicación, y su correctitud se verifica contra la
definición matemática y contra señales sintéticas de parámetros conocidos.

**Pertinencia con la industria.** La combinación de aplicaciones web progresivas con
inferencia en el borde reduce costos de infraestructura, elimina latencia de red y
resuelve requisitos de privacidad. Trabajar con transformers.js, ONNX Runtime Web y
cuantización de modelos corresponde a competencias vigentes en el mercado.

---

## 3. Arquitectura

### 3.1 Decisión estructural: contratos antes que código

La decisión de mayor impacto del proyecto fue definir las interfaces entre módulos
en TypeScript **antes de escribir código funcional**, congelarlas al cierre de la
primera semana y dotar a cada módulo de una implementación simulada que respeta su
contrato.

Los cuatro contratos son `AudioEngine` (captura y análisis de señal),
`AIPipeline` (reconocimiento, corrección, síntesis, tutor y sugerencias),
`PronunciationScorer` (comparación acústica) y `EventBus` (comunicación
desacoplada).

Esta decisión produjo tres efectos verificables:

1. **Desarrollo paralelo real.** La interfaz se construyó contra un generador de
   señal sintética antes de que existiera la captura de micrófono. El canal de
   inteligencia artificial se probó con audio pregrabado sin depender del módulo de
   procesamiento de señales. Ningún integrante esperó el código de otro.
2. **Sustitución sin refactorización.** El orquestador recibe sus dependencias por
   inyección: cambiar una implementación simulada por la real es una línea en el
   punto de composición.
3. **Verificación aislada.** Cada módulo se prueba contra su contrato, de modo que
   la suite completa se ejecuta en integración continua sin micrófono, sin descargar
   modelos y sin intervención manual.

### 3.2 Flujo de un turno de conversación

```
microfono 48 kHz
  → FIR anti-aliasing (corte 7 200 Hz) + decimacion x3      → 16 kHz
  → pasa-banda 80–8 000 Hz + normalizacion RMS
  → deteccion de actividad de voz (energia + periodicidad)
  → ventana de Hann + FFT radix-2 → STFT                    → espectrograma
  → YIN                                                     → contorno de tono
  → reconocimiento (Whisper-tiny.en)                        → transcripcion
  → correccion gramatical (T5)                              → ediciones
  ────────────────────────────────────────── hasta aqui, dentro de 2 s
  → respuesta del tutor (LaMini-Flan-T5)                    → texto
  ────────────────────────────────────────── fuera del turno:
  → sugerencias de mejora                                   → texto
  → en modo practica: sintesis de la frase objetivo
                      + MFCC + alineamiento temporal        → puntaje acustico
```

### 3.3 Modos de ejecución

La aplicación tiene dos modos de conversación, y la distinción es la consecuencia
directa del hallazgo descrito en la sección 7.

**Conversación libre.** El estudiante habla de lo que quiera. Recibe transcripción,
corrección gramatical, respuesta del tutor y sugerencias. **No recibe puntaje de
pronunciación**, porque no existe una pronunciación correcta contra la que comparar:
el sistema no sabe qué quiso decir.

**Modo práctica.** La aplicación propone una frase de un banco cerrado, el
estudiante la repite, y el sistema compara lo que dijo contra esa frase. Aquí sí hay
referencia, y por tanto sí hay evaluación de pronunciación.

### 3.4 Estrategia de carga de modelos

El conjunto completo pesa unos 676 MiB, pero la aplicación no los descarga de una
vez:

| Momento | Modelos | Peso |
|---|---|---:|
| Arranque | Reconocedor, corrector y runtime | 302.6 MiB |
| Primer turno | Modelo del tutor | 264.8 MiB |
| Primera reproducción de audio | Sintetizador de voz | 109.0 MiB |

Diferir no reduce el total: reduce la espera antes de que la aplicación sea
utilizable. La caché persistente evita repetir cualquiera de las tres descargas.

---

## 4. Objetivos

### Objetivo general

Construir una aplicación web progresiva que permita practicar inglés conversacional
con retroalimentación automática de pronunciación y gramática, ejecutando todo el
procesamiento en el navegador del usuario, sin servidores de inferencia y con
capacidad de operar sin conexión.

### Objetivos específicos

1. **Implementar la cadena de adquisición y acondicionamiento de la señal de voz**
   aplicando el teorema de muestreo: decimación por factor entero con filtro
   anti-aliasing de fase lineal, filtrado en banda de voz y normalización de nivel.
2. **Implementar el análisis espectral propio** —transformada rápida de Fourier y
   transformada de tiempo corto— verificado contra la definición matemática y no
   contra otra implementación.
3. **Extraer características robustas a la variabilidad entre hablantes**:
   coeficientes cepstrales en escala mel y frecuencia fundamental por el método YIN.
4. **Comparar la pronunciación del estudiante contra una referencia** mediante
   alineamiento temporal dinámico, y determinar experimentalmente el alcance y los
   límites de esa comparación.
5. **Integrar modelos de reconocimiento, corrección y síntesis** ejecutados
   localmente sobre WebAssembly, con carga diferida y caché persistente.
6. **Entregar una aplicación instalable y funcional sin conexión**, verificando cada
   requisito con mediciones reproducibles.

El objetivo 4 se cumplió en un sentido distinto al previsto, y esa diferencia está
documentada y medida. No se alcanzó la métrica original; se determinó por qué no
puede alcanzarse con el método planteado y se implementó una alternativa. La
sección 7 lo desarrolla.

---

## 5. Marco teórico

Cada apartado corresponde a una etapa real de la aplicación. No hay teoría
decorativa: si un concepto aparece aquí es porque resuelve un problema concreto y su
implementación está verificada.

### 5.1 Muestreo, Nyquist y aliasing

El micrófono entrega 48 000 muestras por segundo. Los modelos de reconocimiento y la
extracción de características trabajan a 16 000. El paso entre ambas frecuencias no
es una simple selección de una muestra de cada tres.

El teorema de muestreo establece que una señal puede reconstruirse sin pérdida si se
muestrea a una frecuencia superior al doble de su componente de mayor frecuencia:

> f_s > 2 · f_max

A 16 kHz, la frecuencia de Nyquist es 8 kHz. Cualquier contenido por encima de ese
límite que llegue a la señal decimada **no desaparece: reaparece plegado** sobre
frecuencias más bajas, indistinguible del contenido legítimo. Una sibilante de
9 kHz se convertiría en un componente de 7 kHz que nadie pronunció.

Por eso la decimación exige filtrar **antes** de descartar muestras. El proyecto
aplica un filtro FIR de fase lineal de 127 coeficientes con corte en 7 200 Hz,
diseñado por ventana de Hann.

La elección de fase lineal no es indiferente: un filtro de fase lineal retarda todas
las frecuencias por igual, de modo que no deforma la envolvente temporal de la
señal. Como el análisis posterior mide precisamente cuándo ocurre cada sonido, una
distorsión de fase alteraría lo que se quiere medir.

**Medición:** 73.8 dB de supresión del plegamiento frente a decimación directa, con
un retardo de 1.31 ms introducido por el filtro.

### 5.2 Filtrado en banda de voz

Fuera del rango de 80 a 8 000 Hz no hay información fonética útil: solo componente
continua del micrófono, zumbido de la red eléctrica, golpes y retumbe de baja
frecuencia.

El filtro se implementa como cascada de secciones biquad de segundo orden con
respuesta de Butterworth, elegida porque su respuesta en la banda de paso es
máximamente plana: no introduce ondulación que altere las amplitudes relativas entre
armónicos, que es lo que el análisis posterior mide.

Una observación de diseño que aparece al implementarlo: **a 16 kHz el borde superior
de 8 000 Hz coincide exactamente con la frecuencia de Nyquist**, y ahí un biquad es
degenerado porque sus polos caen sobre el círculo unitario. Pero el filtro no hace
falta: por definición del muestreo, una señal a 16 kHz no puede contener nada por
encima de 8 kHz. El pasa-banda se reduce, correctamente, a un pasa-altas de 80 Hz.

**Medición:** −3.01 dB en la frecuencia de corte, el valor teórico esperado.

### 5.3 Valor eficaz y detección de actividad de voz

El valor eficaz mide la energía de un tramo de señal:

> RMS = √( (1/N) · Σ x[n]² )

Tiene dos usos. El primero es la **normalización de nivel**: dos personas que dicen
la misma frase a distinto volumen deben obtener el mismo resultado, o el sistema
mediría qué tan fuerte habla el estudiante en lugar de cómo pronuncia.

El segundo es la **detección de actividad de voz**. Un umbral de energía adaptado al
ruido de fondo separa los tramos hablados de los silencios, lo que reduce en un 58 %
las muestras que llegan al reconocedor.

La energía sola resultó insuficiente al medirla con ruido ambiental real: confundía
ruido con habla a cualquier nivel de umbral. Se añadió un criterio de
**periodicidad**: un tramo se acepta como habla si además contiene una fracción
mínima de tramas con tono detectable. El ruido de banda ancha no es periódico, así
que ese criterio lo rechaza donde la energía no podía.

### 5.4 Transformada discreta de Fourier

La DFT de una señal de N muestras se define como:

> X[k] = Σ(n=0..N−1) x[n] · e^(−j2πkn/N)

Su cálculo directo cuesta O(N²) operaciones. El algoritmo radix-2 de Cooley–Tukey lo
reduce a O(N log N) descomponiendo recursivamente la transformada en las
subsecuencias de índices pares e impares.

**Decisión de verificación.** El plan inicial preveía validar la implementación
contra una biblioteca de referencia. Se descartó, por una razón que conviene
explicitar: comparar dos implementaciones no demuestra que ninguna sea correcta,
solo que coinciden. Si ambas compartieran un error de criterio, la comparación no lo
detectaría.

En su lugar se verifica contra **la definición directa** y contra propiedades que
deben cumplirse de forma exacta: teorema de Parseval, linealidad, simetría conjugada,
teorema del desplazamiento y casos analíticos de resultado conocido.

**Medición:** error relativo máximo de 1.45 × 10⁻¹³ frente al cálculo directo,
dentro de la precisión de un flotante de doble precisión, y 1 145 veces más rápido.

### 5.5 Ventanas y fuga espectral

La DFT asume que la señal es periódica con periodo igual a la ventana de análisis.
Cuando no lo es —lo habitual—, la discontinuidad entre el final y el principio
introduce componentes espurios: la energía de una frecuencia se derrama sobre las
vecinas.

La ventana de Hann atenúa suavemente los extremos del bloque:

> w[n] = 0.5 · (1 − cos(2πn / (N−1)))

Reduce la fuga a costa de ensanchar el lóbulo principal. Pero atenuar la señal
reduce también su amplitud medida, así que hay que corregir por la **ganancia
coherente** de la ventana, que es su valor medio. Para Hann vale 0.5.

Esa corrección tiene un alcance preciso, y confundirlo costó un defecto real
documentado en la sección 7: sirve para leer del espectro la amplitud física de un
tono, pero **no debe aplicarse en la cadena de coeficientes cepstrales**, donde la
convención es el espectro de potencia sin normalizar.

### 5.6 Transformada de tiempo corto

La voz no es estacionaria: sus propiedades cambian en decenas de milisegundos. Una
única transformada sobre toda la señal promediaría fonemas distintos y perdería
justamente lo que interesa.

La transformada de tiempo corto divide la señal en tramas solapadas y transforma cada
una:

> X[m, k] = Σ(n) x[n + m·H] · w[n] · e^(−j2πkn/N)

donde H es el salto entre tramas. El proyecto usa tramas de 512 muestras con salto
de 256, es decir 50 % de solape, sobre una transformada de 1 024 puntos.

El solape existe porque la ventana atenúa los extremos de cada trama: sin él, la
información situada en los bordes se perdería. Con 50 % de solape, lo que una ventana
atenúa lo recoge la siguiente.

El resultado es el **espectrograma**, que la aplicación dibuja en tiempo real: el eje
horizontal es tiempo, el vertical frecuencia y el color la energía.

### 5.7 Coeficientes cepstrales en escala mel

El espectro crudo no sirve para comparar pronunciación entre personas: contiene la
frecuencia fundamental del hablante, que depende de su laringe y no de lo que dijo.

**Escala mel.** La percepción humana de la altura no es lineal en frecuencia: se
distinguen mejor los cambios en frecuencias bajas. La escala mel modela esa relación:

> mel(f) = 2595 · log₁₀(1 + f / 700)

**Banco de filtros triangulares.** Se reparten 26 filtros triangulares uniformemente
espaciados en el eje mel —y por tanto estrechos en frecuencias bajas y anchos en
altas— y se calcula la energía del espectro de potencia dentro de cada uno. Se pasa
así de 513 valores a 26.

**Logaritmo.** La percepción de intensidad también es logarítmica, y además el
logaritmo convierte en suma la multiplicación entre la fuente glotal y el filtro del
tracto vocal, que es lo que permite separarlas en el paso siguiente.

**Transformada del coseno.** Aplicar la DCT-II ortonormal a las 26 energías
logarítmicas decorrela los coeficientes y concentra la información en los primeros.
Se conservan 13.

**Por qué esto resuelve el problema.** El coeficiente cero recoge la energía global,
es decir el volumen, y por eso el comparador lo descarta. Los coeficientes bajos
describen la envolvente espectral —la forma del tracto vocal, que es lo que
distingue una vocal de otra— y los altos la estructura fina asociada al tono del
hablante.

**Medición:** invariancia al volumen de 1.4 × 10⁻⁶ en un rango de ganancia de 1000×,
y error máximo de 0.009 % frente a librosa 0.11.0, con criterio de 5 %.

### 5.8 Estimación de la frecuencia fundamental

La entonación es parte de la pronunciación, y depende de cómo evoluciona la
frecuencia fundamental a lo largo de la frase.

El punto de partida es la **autocorrelación**: una señal periódica se parece a sí
misma desplazada un periodo.

> r[τ] = Σ(n) x[n] · x[n + τ]

Su limitación es conocida y se midió: cuando el primer armónico tiene más energía que
el fundamental, el máximo de la autocorrelación aparece en la mitad del periodo real
y el método reporta el doble de la frecuencia. Es el **error de octava**.

El algoritmo **YIN** lo corrige con la función de diferencia acumulada normalizada,
que penaliza los desplazamientos pequeños y elimina el máximo espurio en el origen.
Sobre ella se elige el primer mínimo por debajo de un umbral, y se refina la posición
con **interpolación parabólica** entre las tres muestras vecinas, lo que da
resolución por debajo del intervalo de muestreo.

**Decisión de diseño medida.** El umbral de YIN cumple dos funciones incompatibles:
decidir *si hay* periodicidad y decidir *cuál es* la frecuencia. Con voz real, un
umbral estricto de 0.02 —correcto para el valor del tono— rechazaba tanto habla que
dos de cada cuatro grabaciones no detectaban ni un segundo de voz. Se separó en dos
umbrales: 0.15 para la decisión de sonoridad y 0.02 para el valor. Aflojar el primero
no tiene costo, y se comprobó midiendo: el ruido de banda ancha da 0 % de tramas
sonoras a cualquier umbral entre 0.02 y 0.3.

**Medición:** peor error de 0.115 Hz en tonos puros, con criterio de 3 Hz.

### 5.9 Alineamiento temporal dinámico

Dos personas que dicen la misma frase no la dicen a la misma velocidad. Comparar
trama contra trama penalizaría el ritmo en lugar de la pronunciación.

El alineamiento temporal dinámico busca la correspondencia entre las dos secuencias
que minimiza el costo acumulado, permitiendo que una trama de la primera corresponda
a varias de la segunda:

> D[i, j] = d(i, j) + min( D[i−1, j], D[i, j−1], D[i−1, j−1] )

donde d(i, j) es la distancia entre los vectores de coeficientes cepstrales de las
tramas i y j. Se aplica una **banda de Sakoe–Chiba** que restringe la desviación
máxima del camino, lo que evita alineamientos degenerados y reduce el costo de
cálculo.

**Normalización cepstral por media.** Antes de comparar se resta a cada secuencia su
propia media cepstral. Esto elimina el sesgo constante que introduce el canal —el
micrófono, la sala— y parte de la diferencia entre las dos voces.

**Y aquí está el límite del método.** La normalización cepstral reduce el efecto del
hablante pero no lo elimina, porque la longitud del tracto vocal desplaza los
formantes en los mismos coeficientes que distinguen una vocal de otra. La sección 7
cuantifica ese efecto y explica qué se hizo al respecto.

---

## 6. Matriz de trazabilidad de requerimientos

La matriz completa, con columnas de prioridad, fuente, módulo, estado, prueba de
verificación y métrica, se mantiene como documento vivo en
`docs/07-matriz-trazabilidad.md` y se actualiza al integrar cada cambio. Resumen del
estado por requerimiento:

| ID | Requerimiento | Estado | Métrica alcanzada |
|---|---|---|---|
| RF-01 | Captura de micrófono | Implementado | 48 kHz detectado, decimación ×3 exacta |
| RF-02 | Preprocesamiento y filtrado | Implementado | 73.8 dB de supresión de alias; −3.01 dB en corte |
| RF-03 | Forma de onda en tiempo real | Implementado | 62.5 tramas/s |
| RF-04 | Reconocimiento de voz local | Implementado | Factor de tiempo real 0.28–0.31 |
| RF-05 | Corrección gramatical | Implementado | 320 ms de latencia media |
| RF-06 | Interfaz de conversación | Implementado | Máquina de estados verificada |
| RF-07 | Espectrograma en tiempo real | Implementado | Error de FFT 1.45 × 10⁻¹³ |
| RF-08 | Frecuencia fundamental | Implementado | Error de 0.115 Hz, criterio 3 Hz |
| RF-09 | Coeficientes cepstrales | Implementado y verificado | 0.009 % frente a librosa, criterio 5 % |
| RF-10 | Evaluación de pronunciación | **Replanteado** | Ver sección 7.4 |
| RF-11 | Síntesis de voz | Implementado | 109 MiB, salida a 16 kHz |
| RF-12 | Sugerencias de mejora | Implementado | Modelo elegido por medición |
| RF-13 | Conversación completa | Implementado | Contrato sin etapas pendientes |
| RF-14 | Aplicación instalable sin conexión | Implementado · verificación pendiente | — |
| RF-15 | Caché de modelos | Implementado · verificación pendiente | — |
| RF-16 | Procesamiento íntegro en el cliente | Implementado | Cero llamadas a servicios externos |
| RF-17 | Retroalimentación visual | Implementado | Verde ≥80, amarillo 60–79, rojo <60 |
| RF-21 | Verificación con métricas | Parcial | Suite automatizada en 42 archivos |
| RF-23 | Análisis de progreso | Implementado | Evolución entre sesiones |

---

## 7. Desarrollo y verificación

### 7.1 Método de trabajo

El proyecto se desarrolló con un método que conviene explicitar, porque explica la
naturaleza de los resultados que siguen.

**Toda decisión técnica se tomó midiendo, y el criterio se fijó antes de medir.**
Cuando hubo que elegir entre alternativas —cuantización de 8 o 4 bits, un
sintetizador u otro, un modelo de tutor grande o pequeño— se definió primero qué
resultado decidiría qué, y después se midió. Esto evita la tentación de interpretar
un resultado a conveniencia.

**Ningún número de este documento procede de una estimación.** Todos se obtuvieron
ejecutando. Cuando algo no se ha medido, se dice que no se ha medido.

**Cada decisión y cada incidencia quedó registrada** en una bitácora
(`docs/10-bitacora-decisiones.md`) con su contexto, las alternativas evaluadas, la
justificación y el resultado observado. Contiene 16 decisiones y 8 incidencias.

### 7.2 Decisiones tomadas por medición

**Cuantización de 8 bits frente a 4 bits.** Se buscaba reducir el peso del corrector
gramatical. La variante de 4 bits resultó **3.8 veces más lenta** (1 209 ms frente a
320 ms) **y más pesada en caché** (303.9 MB frente a 238 MB). La causa es que ONNX
Runtime sobre WebAssembly carece de núcleos para enteros de 4 bits y descuantiza en
cada inferencia. Consecuencia: reducir la cuantización no es una vía válida para
aligerar la descarga en este entorno.

**Elección del sintetizador de voz.** Se compararon cinco configuraciones de dos
familias. SpeechT5 quedó descartado: solo es inteligible sin cuantizar, y así pesa
613 MB. Se adoptó MMS-TTS, con 109 MiB y salida a 16 kHz, la misma frecuencia del
proyecto, lo que evita un remuestreo.

**Elección del modelo del tutor.** Se compararon un modelo de 77 millones de
parámetros (93 MiB) y uno de 248 millones (265 MiB). El pequeño **no ejecuta la
instrucción: la parafrasea.** Ante «reescribe esta frase como lo diría un
angloparlante nativo» devolvió «el angloparlante nativo diría que es una comida
favorita». Y dos de cuatro respuestas de tutor fueron negativas de seguridad ante
frases sobre comida y sobre películas. No es una alternativa más barata: es
inservible para la tarea, de modo que la comparación de peso no llega a plantearse.

### 7.3 Defectos encontrados midiendo

Tres defectos reales aparecieron al ejecutar mediciones, y ninguno era visible
leyendo el código. Se documentan porque el método que los encontró importa tanto
como los defectos.

**Pérdida de amplitud del espectro.** El bloque que entrega el micrófono, tras la
decimación, no divide de forma exacta al tamaño de trama de análisis. El adaptador
completaba la diferencia con ceros y aplicaba la ventana sobre la trama ya rellena,
mientras la corrección por ganancia coherente dividía por la ventana completa. El
espectro salía un 20 % por debajo. Se detectó midiendo la amplitud de un tono de
amplitud conocida.

**Escala del espectro en los coeficientes cepstrales.** La verificación cruzada
contra librosa, preparada semanas antes y nunca ejecutada, arrojó un 5.02 % de error
al correrla. La causa: se aplicaba al espectro de potencia la corrección de amplitud
descrita en 5.5, que divide por 65 536 y hundía las bandas mel por debajo del piso
del logaritmo. Con un tono puro, **24 de las 26 bandas quedaban fijadas en el piso**,
y una banda fijada deja de responder a la señal. Corregido, el error pasa a 0.009 %.

Lo relevante de este defecto es *por qué* la verificación por etapas no lo detectó:
**cada etapa era correcta por separado; el fallo estaba en la escala con que se
encadenaban.** Es el argumento de por qué verificar bloque a bloque es necesario pero
no suficiente.

**Divergencia de generadores pseudoaleatorios entre lenguajes.** Tras corregir lo
anterior, el caso de ruido seguía dando 4.79 % de error. La causa no estaba en los
coeficientes sino en las señales: el generador congruencial usaba un multiplicador
cuyo producto supera 2⁵³, y Python, con enteros de precisión arbitraria, y
JavaScript, con dobles, divergen **desde la segunda muestra**. Se comparaban señales
distintas. Con un generador exacto en ambos lenguajes el caso queda en 0.000 %.

### 7.4 El hallazgo principal: los límites de la comparación espectral

Este apartado documenta el resultado técnico más importante del proyecto.

#### Lo que se planteó

RF-10 exigía que el sistema distinguiera una pronunciación correcta de una
incorrecta con una separación de al menos 20 puntos en la escala de puntuación. Con
señales sintéticas —vocales generadas por código con formantes fijos— la separación
medida fue de **31 puntos**, y el requisito se dio por encaminado.

#### Lo que ocurrió al medir con voz real

Se grabaron 40 muestras: cinco frases, cuatro versiones de cada una, dos hablantes.
El resultado:

| Escenario | Errores detectados |
|---|---|
| Referencia de la **misma** voz del usuario | 9 o 10 de 10 |
| Referencia de **otra** voz | **6 de 10** |

La aplicación compara contra la voz del sintetizador, así que el caso real es el
segundo. En cuatro de cada diez casos **la pronunciación incorrecta puntuaba mejor
que la correcta**.

#### Por qué ocurre

El puntaje depende más de quién habla que de cómo pronuncia:

| Situación | Distancia |
|---|---:|
| Frase **bien** pronunciada, con otra voz | 20.12 |
| Frase **mal** pronunciada, con la voz de referencia | 14.24 |

**Cambiar de voz cuesta +7.08. Pronunciar mal cuesta +1.20.** Casi seis veces menos.

Dicho de otro modo: decir correctamente la frase con otra voz queda tan lejos de la
referencia como decir una frase completamente distinta con la propia.

**No es un defecto de implementación.** Los coeficientes están verificados contra
librosa con 0.009 % de error. Es una limitación del método: comparar espectros mide
parecido acústico, y la longitud del tracto vocal desplaza los formantes en los
mismos coeficientes que distinguen una vocal de otra.

Se probaron **ocho vías** para superarlo, todas medidas: reescalado de la puntuación,
estadísticos localizados, coeficientes delta, dos variantes de normalización
cepstral, normalización de la longitud del tracto vocal, doble referencia
contrastiva y eliminación del recorte por actividad de voz. Ninguna alcanza el
umbral.

#### La segunda causa, en la integración

Al revisar cómo se invocaba al comparador apareció un defecto de diseño
independiente y más grave.

La referencia que se sintetizaba era **la transcripción de lo que el estudiante
acababa de decir**. Si dice *sheep* donde iba *ship*, el reconocedor transcribe
*sheep*, el sintetizador dice *sheep*, y el estudiante se compara contra su propio
error.

**El puntaje no podía detectar una palabra mal pronunciada por construcción.** Lo que
medía era cuánto se parece la voz del estudiante a la del sintetizador diciendo sus
mismas palabras: acento y timbre.

El razonamiento que llevó a esa decisión —no sintetizar la frase corregida para no
comparar secuencias de palabras distintas— es válido para la corrección gramatical,
pero se extendió a toda la referencia sin advertir que la transcripción ya contiene
el error de pronunciación.

#### La salida

La conclusión inicial era que evaluar pronunciación con independencia del hablante
exige un modelo acústico entrenado con miles de voces, fuera del alcance del
proyecto. **Pero el proyecto ya tiene uno: el reconocedor de voz.**

Si se compara la **transcripción** contra una frase objetivo, el error aparece en el
texto y la voz deja de importar. Medido sobre las mismas 40 grabaciones:

| Se pidió | El reconocedor entendió | |
|---|---|---|
| *ship* | «I need a new **sheep**» | detecta |
| *bed* | «She had a **bit late**» | detecta |
| *seat* | «Please **see it** down here» | detecta |
| *ship* (bien pronunciado) | «I need a new **chip**» | falsa alarma |

**6 de 10 errores detectados con 4 falsas alarmas.** No basta por sí sola, pero es la
única señal **independiente del hablante** disponible: las ocho vías anteriores
seguían operando sobre el espectro, y ninguna alcanzó el umbral.

Eso exige una frase objetivo contra la que comparar, y en conversación libre no
existe. De ahí el **modo práctica**: la aplicación propone una frase de un banco
cerrado, el estudiante la repite, y se comparan las dos señales —la de transcripción
como principal y la acústica como secundaria—.

#### Cómo se presenta al estudiante

Las cuatro falsas alarmas de cada diez aciertos determinan la redacción. Decirle a
alguien que pronunció mal cuando pronunció bien desmotiva y además es falso. Por eso
la interfaz dice **«no entendí bien»** y nunca «lo dijiste mal», y el campo interno
se llama `noReconocida` y no `incorrecta`.

En conversación libre **no se muestra puntaje alguno**. Es preferible no dar un
número a dar uno que en realidad mide otra cosa.

### 7.5 Verificación automatizada

La suite comprende **42 archivos de prueba** que se ejecutan en integración continua
en cada incorporación, sin micrófono, sin descargar modelos y sin intervención
manual.

La estrategia por módulo:

- **Procesamiento de señales:** todas las señales se generan por código —senos,
  chirps, deltas, vocales sintéticas con formantes— de modo que el resultado
  esperado se conoce analíticamente.
- **Núcleo:** el orquestador se prueba contra implementaciones simuladas de los
  cuatro contratos, incluyendo casos de fallo que solo aparecen con hardware real.
- **Interfaz:** la lógica se extrajo del código de presentación a módulos puros
  —umbrales de color, mensajes de error de micrófono, cálculo de racha— que sí se
  pueden verificar.

Dos pruebas merecen mención aparte porque nacieron de incidentes:

**Equivalencia entre las dos rutas de análisis.** Tras el defecto de amplitud, se
añadió una prueba que compara muestra a muestra el espectro que produce el adaptador
con el que produce la transformada de tiempo corto, de modo que las dos rutas del
proyecto no puedan divergir.

**Ausencia de lenguaje interno en la interfaz.** Durante semanas la aplicación mostró
al usuario final frases escritas dentro del código de presentación en lugar de en un
comentario, del tipo «esto lo arregla Fulano cuando entregue tal tarea». Ninguna
prueba lo detectó porque ninguna miraba el texto que llega a pantalla. Ahora hay una
que lee cada archivo de interfaz, descarta los comentarios y falla si el texto
renderizable contiene un código de tarea, el nombre de un integrante o una marca de
trabajo pendiente.

### 7.6 Rendimiento

**Reparto del turno.** El compromiso de dos segundos se aplica a la
retroalimentación —transcripción más corrección gramatical—, que es lo que pierde
valor si tarda: una corrección que llega tarde ya no se conecta con lo que el
estudiante acaba de decir. La respuesta conversacional del tutor llega después y
admite más tiempo, porque una pausa de segundo y medio antes de contestar es lo
normal en una conversación humana.

El turno emite la transcripción y la corrección **antes** de solicitar la respuesta
del tutor, y calcula el puntaje y las sugerencias fuera del turno.

**Costo del procesamiento de señales.** La cadena completa de análisis consume el
2.14 % de un núcleo, tras dos optimizaciones medidas: caché de los planes de la
transformada, que redujo el costo de la estimación de tono en 29.7 %, y decimación
polifásica, con una mejora de 3.00×.

**Peso de la descarga.** El conjunto asciende a 676.4 MiB, de los cuales 302.6 se
pagan al arrancar. La carga diferida no reduce el total: reduce la espera antes de
que la aplicación sea utilizable.

### 7.7 Limitaciones declaradas

1. **El puntaje acústico no discrimina pronunciación entre hablantes distintos.**
   Cuantificado en 7.4. Se mitiga con el modo práctica y la señal de transcripción.
2. **La señal de transcripción produce falsas alarmas.** 4 de cada 10 aciertos. Se
   mitiga con la redacción de la retroalimentación.
3. **El sintetizador no pronuncia bien todas las palabras.** Siete fallos de catorce
   palabras difíciles, y también dos palabras corrientes de control. Se mitiga
   curando el banco de frases de práctica.
4. **El sintetizador no sabe decir cifras.** Ante un precio no se oye un número
   equivocado: no se oye nada. Se mitiga excluyendo cifras del banco.
5. **La referencia sintetizada no es reproducible entre sesiones.** Un banco cerrado
   permite sintetizar cada frase una sola vez y conservarla.
6. **El recorte por actividad de voz es sensible al ruido con voz real.** La fracción
   de tramas sonoras cae entre 0.11 y 0.41 frente a un umbral de 0.10.
7. **La verificación sin conexión no se ha ejecutado.** La aplicación instalable y la
   caché de modelos están implementadas, pero no se han ejercido en modo avión.

---

## 8. Anexos

### Anexo A · Conceptos de Señales y Sistemas aplicados

| Concepto | Dónde se aplica | Verificación |
|---|---|---|
| Teorema de muestreo y aliasing | Decimación de 48 a 16 kHz por factor entero 3 | 73.8 dB de supresión de plegamiento |
| Filtro FIR de fase lineal | Anti-aliasing previo a la decimación, 127 coeficientes | Retardo de 1.31 ms, respuesta medida |
| Filtro IIR biquad (Butterworth) | Banda de voz de 80 a 8 000 Hz | −3.01 dB en la frecuencia de corte |
| Valor eficaz | Normalización de nivel y detección de voz | 58 % de reducción de muestras al reconocedor |
| DFT y FFT radix-2 | Análisis espectral | Error de 1.45 × 10⁻¹³ frente a la definición |
| Ventanas y fuga espectral | Ventana de Hann con ganancia coherente | Amplitud unitaria ante tono conocido |
| Transformada de tiempo corto | Espectrograma en tiempo real | Equivalencia entre las dos rutas de análisis |
| Detección de periodicidad (YIN) | Frecuencia fundamental y entonación | Error de 0.115 Hz en tonos puros |
| Banco mel y transformada del coseno | Características independientes del volumen | 0.009 % frente a librosa |
| Alineamiento temporal dinámico | Comparación contra la referencia | Invariante a velocidad; límite cuantificado |

### Anexo B · Evidencias experimentales

Cada tarea con medición asociada produjo un documento de evidencia con el
procedimiento, los datos crudos, el resultado y sus limitaciones declaradas. Se
encuentran en `docs/evidencias/`, organizados por semana:

| Evidencia | Contenido |
|---|---|
| `s1/captura-audio-spike.md` | Frecuencias de muestreo disponibles y decisión de decimación explícita |
| `s1/whisper-tiny-spike.md` | Viabilidad del reconocedor: peso, carga y factor de tiempo real |
| `s2/s2-t1-remuestreo.md` | Diseño del filtro anti-aliasing y supresión de plegamiento |
| `s2/s2-t2-preprocesamiento.md` | Respuesta del pasa-banda y estabilidad del nivel |
| `s2/s2-t3-vad.md` | Umbral adaptativo y error de los límites del habla |
| `s3/s3-t1-fft-stft.md` | Verificación de la transformada contra la definición |
| `s3/grammar-worker.md` | Comparación de cuantización de 8 y 4 bits |
| `s4/s4-t4-pitch-autocorrelacion.md` | Autocorrelación y el error de octava que justifica YIN |
| `s4/s4-t5-tts-spike.md` | Cinco configuraciones de síntesis de voz comparadas |
| `s5/s5-t1-yin.md` | Exactitud de la estimación de tono |
| `s5/s5-t2-mfcc.md` | Verificación cruzada de los coeficientes cepstrales |
| `s6/s6-t1-t2-comparador.md` | Alineamiento temporal y curva de puntuación |
| `s6/s6-t4-modelo-tutor.md` | Elección del modelo conversacional |
| `s7/s7-t4-pronunciacion-tts.md` | Conteo de inteligibilidad del sintetizador |
| `s7/s7-t4-carga-bajo-demanda.md` | Reducción de la descarga inicial |
| `s7/s7-t4-latencia-dsp.md` | Costo computacional y optimizaciones |
| `s8/s8-t2-t3-casos-limite.md` | Ruido ambiental, frases largas y silencios |
| `s9/s9-t3-calibracion-voz-real.md` | Calibración con voz real y límites de la comparación |

### Anexo C · Bitácora de decisiones e incidencias

`docs/10-bitacora-decisiones.md` registra cronológicamente las decisiones técnicas y
las incidencias, cada una con su contexto, alternativas evaluadas, justificación y
resultado observado. Contiene 16 decisiones y 8 incidencias.

Las decisiones más relevantes para la evaluación del proyecto:

- **D-02** · Decimación propia en lugar de delegar el remuestreo al navegador
- **D-05** · Cuantización de 8 bits frente a 4 bits, descartada por medición
- **D-07** · Verificación de la transformada contra la definición, sin dependencia
- **D-09** · El estado de acondicionamiento de la señal como parte del contrato
- **D-14** · Un solo modelo para sugerencias y respuesta del tutor
- **D-15** · Alcance del presupuesto de dos segundos
- **D-16** · Modo práctica con frase objetivo

### Anexo D · Reproducibilidad

```bash
git clone https://github.com/HumanoidCat/mpet
cd mpet
npm install
npm test          # suite completa
npm run dev       # aplicación en local
```

Modos de ejecución por parámetro en la dirección, sin recompilar:

| Parámetro | Efecto |
|---|---|
| *(ninguno)* | Modelos reales |
| `?mock=1` | Módulos simulados, sin descargas ni micrófono |
| `?medir=1` | Vuelca el reparto de tiempos de cada turno |
| `?grabar=1` | Descarga el audio del turno para calibración |

Las grabaciones de voz utilizadas en la calibración **no se versionan**: son voces de
personas reales y no corresponde incorporarlas al historial del repositorio. El
protocolo para reproducir la calibración está en `tests/audio/fixtures/README.md`.

---

## 9. Estado y trabajo pendiente

### Lo que está terminado

El ciclo completo funciona: el estudiante habla, la aplicación transcribe, corrige la
gramática, responde como tutor y sugiere mejoras; en modo práctica, además, compara
la pronunciación contra una frase objetivo. Todo en el navegador, sin servidores.

### Lo que falta, por orden de importancia

| Pendiente | Qué decide |
|---|---|
| **Medir la combinación de las dos señales de pronunciación** | Si RF-10 se presenta como cumplido con su limitación o como limitación declarada |
| **Verificar el arranque sin conexión** | RF-14 y RF-15, que sostienen el argumento de accesibilidad |
| **Medir la latencia del turno con todo integrado** | Confirma el presupuesto de dos segundos |
| Normalizar cifras antes de sintetizar | Un tutor que enmudece ante un precio |
| Medir la tasa de error de palabra del reconocedor | Métrica del reconocimiento |
| Aligerar el corrector gramatical | Es el único modelo que no se comparó con alternativas |
| Corregir la sensibilidad del recorte por voz | Afecta a una de cada cinco frases |

### Cómo se juzga este proyecto

El resultado más valioso no es el que estaba planeado. Se propuso evaluar
pronunciación por comparación espectral, se implementó, se verificó cada etapa
contra su definición matemática, y al medir con voz real se determinó que el método
**no puede** cumplir el objetivo: el efecto del hablante pesa seis veces más que el
error que se quería medir.

Ese resultado está cuantificado, con la causa explicada, ocho alternativas
descartadas con medición, una vía distinta implementada y sus límites declarados.

Un requisito que se declara cumplido sin comprobarlo es una afirmación. Uno que se
declara incumplido con las cifras que lo demuestran es un resultado.
