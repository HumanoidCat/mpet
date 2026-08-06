# S7-T4 · Carga bajo demanda del sintetizador

**Responsable:** Isaac Morum (módulo `src/ai/`) · **Fecha:** 4 de agosto de 2026
**Código:** `src/ai/lazy.ts`, `src/ai/createAIPipeline.ts`

## 1. El problema

La aplicación descargaba **411 MiB antes de dejar hacer nada**:

| Pieza | MiB |
|---|---|
| Reconocedor (`whisper-tiny.en` q8) | 41.0 |
| Corrector de gramática (`t5-base-grammar-correction` q8) | 240.9 |
| Sintetizador (`mms-tts-eng` fp32) | 109.0 |
| Runtime ONNX/WASM | 20.6 |
| **Total** | **411.5** |

La vía de reducir peso por cuantización quedó **descartada por medición** (D-05 en
gramática, y otra vez en el spike de TTS: bajar bits salió más lento *y* peor). La vía
que queda es no descargar lo que todavía no hace falta.

## 2. La observación que lo hace posible

Un turno de conversación no necesita los cuatro modelos a la vez. El estudiante
**primero habla** —ahí hacen falta el reconocedor y el corrector— y solo después pulsa
"escuchar", que es cuando entra el sintetizador. Hay usuarios que no lo pulsan nunca.

| | Antes | Ahora |
|---|---|---|
| Primera carga (`init()`) | 411.5 MiB | **302.6 MiB** |
| Al pulsar "escuchar" por primera vez | — | 109.0 MiB |

**Un 26 % menos de espera inicial**, sin tocar ningún modelo ni ninguna cuantización.

## 3. Las tres trampas que tiene "cargar la primera vez que se use"

Se resolvieron en `src/ai/lazy.ts`, que es lógica pura y por eso se puede testear:

1. **Llamadas simultáneas.** Si se piden dos frases seguidas antes de terminar la
   carga, dos `init()` a la vez descargarían el modelo dos veces y dejarían dos copias
   en memoria. Se comparte la misma promesa.
2. **Errores que se quedan pegados.** Guardar la promesa rechazada dejaría el botón de
   escuchar inutilizable durante toda la sesión tras un corte de red momentáneo. Un
   fallo se olvida y el siguiente intento vuelve a probar.
3. **El progreso se queda sin destinatario.** El contrato solo entrega el callback de
   progreso en `init()`. Como el modelo se carga más tarde, ese callback se guarda al
   iniciar y se reutiliza; si no, la descarga de 109 MB ocurriría sin que la interfaz
   pudiera avisar de nada.

## 4. Verificación

- 6 tests de `lazy.ts`, incluidos el de carga compartida entre llamadas simultáneas y
  el de reintento tras fallo. **304 tests** en total, `tsc` 0 errores.
- **Probado en ejecución**, no solo compilado: en
  `src/ai/spike-s4-t5/verificacion-worker.html` hay un botón que crea un
  `AIPipeline` completo y llama a `speak()` **sin llamar antes a `init()`**. Devolvió
  27 904 muestras de audio correcto. Antes de este cambio habría lanzado *"El modelo de
  TTS no está cargado: llama a init() primero"*.

## 5. Lo que falta

- **Avisar en la interfaz de la espera diferida.** Hoy la primera pulsación de
  "escuchar" tarda lo que tarde la descarga, y el progreso se reporta por el callback,
  pero quien decide cómo mostrarlo es el módulo de interfaz. Hay que hablarlo con
  Alejandro y José Pablo.
- **El corrector de gramática son 241 MiB**, el 80 % de lo que queda. Es el siguiente
  objetivo obvio: o se evalúa un modelo más liviano, o se carga también bajo demanda
  (no hace falta hasta que el estudiante termina de hablar).
- Esta pieza es además **condición previa** para adoptar Kokoro como sintetizador, tal
  como lo puso Alejandro: sin carga bajo demanda, ese cambio subiría la primera
  descarga a unos 604 MiB.
