# Avance 2 — Sección de Interfaz de Usuario

> **Material preparado por Jose Pablo Monestel para integrar en `avance-2.md`.**
>
> No es el documento de la entrega: es el aporte del módulo `src/ui/`, redactado
> en el mismo registro que el Avance 1 y que la sección de DSP de Fabrizio
> (`avance-2-seccion-dsp.md`), lista para insertar. Este módulo no aporta
> desarrollo teórico nuevo — el trabajo del período fue de implementación y
> verificación, no de matemática — así que este documento solo cubre la
> sección 7 y el Anexo B.
>
> Todo lo afirmado aquí es reproducible con `npx vitest run tests/ui` y con la
> aplicación corriendo en `?mock=1`. El desarrollo completo de cada pieza está
> en `docs/evidencias/`.

---

# → Para la sección 7 · Etapa de desarrollo y verificación

## 7.z Resultados del módulo de interfaz (UI)

### De dónde parte este período

La interfaz nació en dos etapas bien distintas, y es importante que quede
documentado porque explica por qué había tanto por limpiar:

1. **Andamio funcional mínimo** (S2-T6, S3-T2, S3-T4): chat con estados de
   micrófono, forma de onda en vivo y resaltado de correcciones, construido
   por Alejandro contra los mocks para no bloquear la integración del núcleo
   mientras el resto del equipo maduraba sus contratos.
2. **Prototipo de Figma Make portado casi íntegro** (24 de julio): todas las
   pantallas restantes —Suggestions, Grammar, Pronunciation, Progress, Models,
   Splash, Header, Sidebar, Footer— entraron de una vez desde un diseño
   visual externo. Cada archivo quedó marcado explícitamente como
   `SCAFFOLD — NO usar tal cual`, con contenido de ejemplo escrito a mano
   donde el contrato real todavía no existía.

Esa decisión fue correcta para avanzar rápido en el diseño visual sin esperar
a nadie —coherente con la regla del equipo de "nunca esperes a los demás,
desarrolla contra `mocks/`"—, pero dejó una deuda declarada: pantallas que
parecían terminadas pero mostraban datos que no salían de ningún contrato.
Cerrar esa deuda, a medida que cada contrato real fue quedando disponible, es
la columna vertebral del trabajo de este período.

### Cronología de cierre, contrato por contrato

| Semana | Qué se cableó | Contrato que lo desbloqueó |
|---|---|---|
| S5 | Espectrograma real, overlay de pitch, pantalla Grammar con datos reales, play/slow/explanation | FFT (S3-T1) y YIN (S5-T1) de Fabrizio |
| S6 | Puntaje de pronunciación por palabra en el chat y en la pantalla Pronunciation | `PronunciationResult` real del comparador DTW (Fabrizio, S6-T1/T2) |
| S6 | Limpieza de Suggestions, Models y Progress: fuera el catálogo de modelos inventado (incluido un "Phoneme Analyzer, 124 MB" que no existe) y las métricas de sesión sin respaldo | `ChatMessage.suggestions`, evento `model-progress`, `resumirSesion()` (Alejandro) |
| S7 | Mensajes de error de micrófono por causa real + reintentar/cerrar | — (brecha de UX, no de contrato) |
| S8 | Auditoría de compatibilidad Chrome/Edge/Firefox/Safari | — |
| S9 | Historial real entre sesiones en la pantalla de progreso | `SessionStore.list()` (Alejandro, S5-T6), expuesto por primera vez a la UI |

El detalle de cada una está en las evidencias del Anexo B. El patrón se repite
en las tres últimas: la pieza de infraestructura ya existía del lado de quien
la construyó, y lo que faltaba era exclusivamente el cableado hacia la
interfaz — coherente con el principio de desacoplamiento por contratos de la
sección 3.1 del Avance 1.

### Un incidente real: notas de equipo visibles en producción

El 4 de agosto, Alejandro encontró que `VisualizerScreen.tsx` mostraba al
usuario final, en producción, frases escritas como comentario informal dentro
del JSX en vez de en un comentario real: `"FFT real (S3-T1, Fabrizio) OK"`,
`"pitchHz siempre es null hasta el detector real de pitch de Fabrizio (S5-T1)"`.
Además habían quedado **falsas**: ambas piezas llevaban semanas integradas
cuando el texto seguía anunciándolas como pendientes.

Ninguna de las pruebas existentes lo detectó porque ninguna miraba el texto
que efectivamente llega a pantalla. La corrección agregó
`tests/ui/sinNotasDeEquipo.test.ts`: lee el código fuente de todo `src/ui/` y
`App.tsx`, descarta los comentarios reales, y falla si el texto renderizable
contiene un código de tarea (`S\d+-T\d+`), el nombre de un integrante, un
`TODO`/`FIXME`, o vocabulario del proceso interno. Es la prueba con más casos
del módulo (16, una por archivo `.tsx`) y corre en cada cambio, incluidos los
de este período.

### Métricas del módulo

| Métrica | Valor |
|---|---:|
| Pruebas del módulo UI | 39, de 445 en todo el proyecto |
| Archivos `.tsx`/`.ts` cubiertos por `sinNotasDeEquipo` | 16 |
| Pantallas reescritas de datos falsos a datos reales este período | 3 (Suggestions, Models, Progress) |
| Umbrales de color de puntaje (RF-17) | Verde ≥80 · Amarillo 60–79 · Rojo <60 |

### Estrategia de verificación

Cada pieza de este módulo se verificó en dos niveles, igual que exige el resto
del proyecto:

1. **Unitario**, sobre funciones puras extraídas de los componentes: mapeo de
   color por puntaje (`pronunciationColor.ts`), emparejamiento de palabras con
   su puntaje (`buildPronunciationSegments`), estadísticas de gramática
   (`grammarStats.ts`), mensajes de error de micrófono
   (`micErrorMessage.ts`). El patrón de extraer la lógica calculable a un
   módulo sin JSX —ya usado desde `highlight.ts` en S3-T4— es lo que permite
   probar estas piezas sin DOM.
2. **Manual, en navegador**, con el modo `?mock=1`: flujo completo de un turno
   de conversación observado pantalla por pantalla (chat, visualizador,
   pronunciación, gramática, sugerencias, modelos, resumen), confirmando tanto
   que los datos mostrados son los que efectivamente produjo el turno como que
   no aparecen errores en consola.

Ningún caso de este módulo requiere hablar de verdad ni usar un micrófono
real para pasar en integración continua — el modo `?mock=1` (o los mocks
directamente en las pruebas) cubre todo el camino feliz.

### Incidencias del período

| Incidencia | Resolución |
|---|---|
| Tres pantallas mostraban un catálogo de modelos, sugerencias y métricas de sesión inventados, incluyendo un modelo de IA que nunca existió | Cableadas a `ChatMessage.suggestions`, al evento `model-progress` y a `resumirSesion()`; donde el contrato real no entrega un dato (fluidez, vocabulario), el dato se retira en vez de simularse |
| El chat mostraría dos esquemas de color superpuestos (corrección de gramática y puntaje de pronunciación) si un mensaje tuviera ambos | Regla explícita: el puntaje de pronunciación se colorea en el chat solo cuando no hay corrección de gramática que mostrar en esa burbuja |
| Notas internas del equipo, y falsas además, visibles en producción en el visualizador | Corregido por Alejandro; prueba de guardia agregada para que no vuelva a pasar en ningún archivo del módulo |
| Un solo mensaje genérico para cualquier fallo de micrófono, sin forma de reintentar desde el aviso | `micErrorMessage.ts` distingue la causa real; el banner de error suma reintentar y cerrar |

### Limitaciones declaradas

**Suggestions queda vacía en modo real.** `AIPipeline.suggest()` real
(Isaac, pendiente S6-T4) siempre devuelve `[]` hoy. La pantalla ya está
cableada al contrato correcto; se llenará sola cuando esa pieza se implemente,
sin tocar la UI.

**El historial entre sesiones (S9-T1) no se verificó con datos reales
múltiples.** El cableado a `SessionStore.list()` está hecho y probado con el
caso vacío (primera sesión); el criterio de verificación de RF-23 pide datos
de tres o más sesiones, que requieren abrir la aplicación varias veces en
modo real (no `?mock=1`) para acumular historial en IndexedDB. Detalle en
`docs/evidencias/s9/s9-t1-progreso-entre-sesiones.md`.

**Compatibilidad de Firefox y Safari no se probó en un dispositivo real** — el
entorno de desarrollo disponible solo tiene un navegador basado en Chromium.
El hallazgo más concreto de la auditoría de código (los tres workers de IA
usan `Worker({type:'module'})`, sin soporte en Firefox hasta la versión 114 de
2023) queda pendiente de confirmar a mano. Detalle en
`docs/evidencias/s8/s8-t4-compatibilidad-navegadores.md`.

**El error de permiso de micrófono denegado no se probó en pantalla, solo por
prueba unitaria de la función de mensajes** — este entorno no tiene micrófono
ni diálogo de permisos real que forzar.

---

# → Para el Anexo B · Evidencias experimentales

Documentos nuevos de este período, todos con procedimiento reproducible:

- `docs/evidencias/s3/ui-chat-waveform.md` — Andamio inicial: chat con estados de micrófono, forma de onda en Canvas, resaltado de correcciones. (Período anterior, referenciado por continuidad.)
- `docs/evidencias/s6/s6-t3-feedback-ui.md` — Puntaje de pronunciación por palabra (RF-17) y limpieza de Suggestions/Models/Progress.
- `docs/evidencias/s7/s7-t3-ux-errores-mic.md` — Mensajes de error de micrófono por causa real y reintentos.
- `docs/evidencias/s8/s8-t4-compatibilidad-navegadores.md` — Auditoría de compatibilidad Chrome/Edge/Firefox/Safari.
- `docs/evidencias/s9/s9-t1-progreso-entre-sesiones.md` — Historial real entre sesiones en la pantalla de progreso (RF-23).

---

# Notas para la coordinación

1. **Sin sección de marco teórico.** A diferencia del módulo de DSP, este
   período no produjo desarrollo teórico nuevo de UI — es implementación y
   cierre de deuda técnica declarada. Si el documento final requiere una
   sección 5.x de todos modos, sugiero un párrafo breve sobre el principio de
   componentes presentacionales desacoplados por contrato (ya mencionado en la
   sección 3.1 del Avance 1) en vez de forzar contenido nuevo.

2. **RF-17 y RF-23 en la matriz de trazabilidad** (`docs/07-matriz-trazabilidad.md`)
   siguen marcados como "Pendiente" a la fecha de este documento. No se editó
   ese archivo desde este módulo por ser un documento compartido de todo el
   equipo — queda señalado aquí para que se actualice en la próxima revisión.

3. **Video de respaldo de la demo (S9-T7)** y **la sección de gamificación
   opcional (S9-T2)** no se abordaron en este período: el primero es una
   grabación manual, no una tarea de código; el segundo está marcado como
   opcional en el plan semanal.

4. **Deck de la sección UI para S7-T6** no está incluido en este documento —
   es un archivo `.pptx` aparte, como `MPET-Avance1.pptx`. Queda pendiente de
   decidir si se genera a partir de este mismo contenido o si se coordina con
   el deck general del equipo.
