# Plan de trabajo tras el Avance 1

> **Vigente desde el 28 de julio de 2026 (Semana 5).** Este documento tiene
> precedencia sobre el orden de tareas de `04-plan-semanal.md`. El contenido de
> las tareas no cambia: cambia cuándo se hacen y en qué orden.

---

## 1. Cambio de modalidad: se levanta la restricción de calendario

El profesor autorizó al equipo a adelantar todo el trabajo que pueda: entre más
rápido se termine, antes se cierra el proyecto.

Hasta el Avance 1 la regla era que nadie tomara tareas de semanas futuras, para
no dispersar el esfuerzo antes de una entrega. **Esa regla queda sin efecto.**
A partir de ahora el trabajo se toma por dependencia, no por número de semana:
si una tarea no está bloqueada, se puede empezar.

Lo que **no** cambia, y sigue siendo obligatorio:

- Cada integrante trabaja solo en su carpeta, en su rama, con solicitud de
  incorporación a `dev` y la verificación automática en verde.
- `src/shared/` y `package.json` solo se modifican por solicitud etiquetada
  `shared-change`, aprobada por el líder técnico y por el responsable del
  módulo afectado.
- La evidencia se escribe en `docs/evidencias/sX/` **en el momento en que se
  completa la tarea**, no después. La evidencia reconstruida semanas más tarde
  pierde los datos de medición y es una parte sustancial de la calificación.

Adelantar no significa saltarse el proceso. Significa no esperar.

Registrado como decisión D-08 en `10-bitacora-decisiones.md`.

---

## 2. Estado al cierre del Avance 1

| Módulo | Responsable | Estado |
|---|---|---|
| Audio | Fabrizio Espinoza | Cadena completa: captura, remuestreo, preprocesamiento, VAD, STFT, pitch y MFCC |
| Inteligencia artificial | Isaac Morum | Reconocimiento de voz y corrección gramatical operativos; síntesis de voz pendiente |
| Interfaz | José Pablo Monestel | Chat, forma de onda, espectrograma y contorno de pitch |
| Núcleo | Alejandro Zamora | Orquestador e integración del motor de audio real; persistencia y modo sin conexión pendientes |

---

## 3. El cuello de botella

La aplicación transcribe, corrige gramática y visualiza la señal. **El puntaje
de pronunciación todavía no existe**, y es la funcionalidad que distingue al
proyecto y la que aplica de forma más directa los contenidos del curso:
extracción de características, comparación de señales y alineamiento temporal.

Para producirlo hacen falta cuatro piezas encadenadas:

| Pieza | Responsable | Estado |
|---|---|---|
| MFCC de la voz del usuario | Fabrizio Espinoza | Implementado |
| Audio de referencia sintetizado | Isaac Morum | **Pendiente — bloquea el resto** |
| Comparación por alineamiento temporal dinámico | Fabrizio Espinoza | Depende del anterior |
| Retroalimentación visual por palabra | José Pablo Monestel | Depende del anterior |

La síntesis de voz (S5-T5) es hoy **la única tarea de la ruta crítica**. Sin
audio de referencia no hay contra qué comparar, y sin comparación no hay
puntaje. Tiene prioridad sobre cualquier otra tarea del proyecto.

---

## 4. Bloque 1 — Destrabar la integración

**Objetivo.** Dejar en `dev` todo lo que ya está construido, integrado y
verificado en ejecución.

| # | Tarea | Responsable |
|---|---|---|
| 1 | Incorporar S4-T4, S5-T1 y S5-T2 con su evidencia en `docs/evidencias/s5/` | Fabrizio Espinoza |
| 2 | Correcciones del PR #51 y ajuste de rendimiento del visualizador | José Pablo Monestel |
| 3 | Corregir el adaptador con `StreamingStft` y añadir sus dos pruebas | Alejandro Zamora |
| 4 | Conectar `detectPitchYin` y `MfccExtractor` al adaptador | Alejandro Zamora |
| 5 | **Verificación de la aplicación completa en ejecución** | Todo el equipo |
| 6 | Fijar el conteo definitivo de pruebas y actualizar la matriz de trazabilidad | Alejandro Zamora |

### Sobre el punto 5

La aplicación **nunca se ha recorrido de extremo a extremo** con micrófono real
y modelos reales. Cada módulo tiene sus pruebas automatizadas y todas pasan, pero
la integración completa no se ha ejercido nunca de forma manual.

Es el riesgo de mayor exposición del proyecto en este momento, por encima de
cualquier tarea pendiente. Se ejecuta como sesión conjunta, cada integrante en su
equipo, recorriendo el flujo completo y registrando cada fallo. El resultado de
esa sesión tiene precedencia sobre el resto de este plan.

Registrado como riesgo R15 en `06-matriz-riesgos.md`.

### Sobre el punto 3

El adaptador `src/core/audioEngineAdapter.ts` rellena con ceros un tercio de cada
frame, porque el bloque del AudioWorklet (1024 muestras a 48 kHz) equivale a 341
muestras a 16 kHz frente a un tamaño de transformada de 512. La ventana de Hann
se aplica sobre el frame relleno, lo que reduce la amplitud del espectro
alrededor de un 20 % y limita la tasa a 46 frames por segundo en lugar de 62.5.

`StreamingStft` resuelve exactamente eso: acumula las muestras y emite un
espectro por frame completo, conservando el sobrante entre llamadas. El campo `t`
del frame debe pasar a calcularse con `stft.currentTime`.

Registrado como incidencia I-03 en `10-bitacora-decisiones.md`.

---

## 5. Bloque 2 — Cerrar el puntaje de pronunciación

**Objetivo.** Completar la funcionalidad principal del producto. Todo el equipo
converge aquí en cuanto el bloque 1 esté cerrado.

| # | Tarea | Responsable | Depende de |
|---|---|---|---|
| 7 | S5-T5 · Worker de síntesis de voz: reproducir y exponer el PCM de referencia | Isaac Morum | — |
| 8 | S6-T1 · Alineamiento temporal dinámico sobre secuencias de MFCC | Fabrizio Espinoza | 7 |
| 9 | S6-T2 · Puntaje global y por palabra con las marcas temporales del reconocedor | Fabrizio Espinoza + Isaac Morum | 8 |
| 10 | S6-T3 · Retroalimentación visual: color por palabra según puntaje | José Pablo Monestel | 9 |
| 11 | Integrar el comparador en el orquestador | Alejandro Zamora | 9 |
| 12 | S6-T7 · Casos de prueba con pares mínimos (ship/sheep, bad/bed) | Todo el equipo | 10 |

### Advertencia de diseño sobre el punto 8

Comparar los MFCC de una voz humana contra los de una voz sintetizada equivale a
comparar un hablante con un sistema de síntesis. Es esperable que produzca
puntajes bajos incluso ante pronunciación correcta, por diferencias de timbre y
de tracto vocal que no son errores de pronunciación.

La mitigación planificada es calibrar con las cuatro voces del equipo antes de
dar el puntaje por válido, y considerar normalización cepstral por media. Está
recogido como riesgo R03 en la matriz.

---

## 6. Bloque 3 — Trabajo paralelo sin dependencias

Estas tareas no bloquean a nadie y pueden tomarse en cualquier momento por quien
tenga disponibilidad.

| # | Tarea | Responsable |
|---|---|---|
| 13 | S5-T6 · Persistencia de sesiones en IndexedDB | Alejandro Zamora |
| 14 | S6-T5 y S6-T6 · PWA completa y verificación del arranque sin conexión | Alejandro Zamora |
| 15 | S6-T4 · Worker de sugerencias del tutor | Isaac Morum |
| 16 | S5-T7 · Marco teórico: MFCC, YIN y STFT con sus ecuaciones | Fabrizio Espinoza + Alejandro Zamora |
| 17 | S7-T4 · Reducción del peso de la descarga inicial | Isaac Morum |
| 18 | S9-T1 · Pantalla de progreso por sesión | José Pablo Monestel |

El punto 16 no es trabajo accesorio: el marco teórico es evidencia directa de la
aplicación de los contenidos del curso. Las ecuaciones de YIN y del banco de
filtros mel deben redactarse mientras la implementación está reciente.

El punto 17 responde al riesgo abierto de la descarga inicial de unos 300 MB. La
reducción de cuantización quedó descartada por medición (D-05), de modo que las
vías son la carga bajo demanda del corrector y la evaluación de un modelo de
menor tamaño.

---

## 7. Después del bloque 2

Con el bloque 2 cerrado el producto queda funcionalmente completo, y el trabajo
restante es de medición y consolidación: tasa de error de palabra sobre cincuenta
frases con cuatro hablantes, casos límite, compatibilidad de navegadores, y el
documento y la presentación finales.

Los hitos de calendario (Avance 2 el 18 de agosto, entrega final el 8 de
septiembre) se mantienen como fechas límite, no como fechas objetivo.
