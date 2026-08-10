# S8-T4 · Compatibilidad de navegadores

**Responsable:** Jose Pablo Monestel (`src/ui/`) · **Fecha:** 10 de agosto de 2026

## 1. Qué se verificó y cómo

**Verificado en ejecución (Chromium):** flujo completo — splash/carga de modelos,
chat con captura de mic simulada, corrección de gramática, puntaje de
pronunciación por palabra, sugerencias, modelos y resumen de sesión — sin errores
de consola, en modo `?mock=1` y con el flujo de guardado en `sessionStore`
(IndexedDB) activo.

**Edge:** no se abrió una instancia real. Se documenta como equivalente a Chrome
porque comparte el mismo motor (Chromium/Blink + V8) y no hay en este proyecto
ninguna API exclusiva de Chrome que Edge no implemente igual.

**Firefox y Safari:** no se probaron en un dispositivo real — este entorno solo
tiene disponible un navegador basado en Chromium. Lo que sigue es una auditoría
del código fuente contra las APIs de plataforma que usa cada módulo, contrastada
con el soporte documentado públicamente de cada motor. **Pendiente: repetir el
flujo de arriba en Firefox y Safari reales** antes de dar esta tarea por cerrada
al 100%.

## 2. APIs de plataforma que usa la aplicación

| API | Dónde | Uso |
|---|---|---|
| `getUserMedia` | `src/audio/capture/micCapture.ts` | Captura de mic a 48 kHz |
| `AudioWorklet` | `micCapture.ts` + `captureProcessor.js` | Bloques de 1024 muestras en el hilo de audio |
| `Worker` con `{ type: 'module' }` | `asrClient.ts`, `grammarClient.ts`, `ttsClient.ts` | Los tres workers de IA (ASR, gramática, TTS) |
| `IndexedDB` | `src/core/sessionStore.ts` | Persistencia de sesiones (S5-T6, S9-T1) |
| WebAssembly SIMD (`ort-wasm-simd-threaded.jsep.wasm`) | onnxruntime-web, vía `@huggingface/transformers` | Inferencia de los cuatro modelos |
| Service Worker + Cache API | `vite-plugin-pwa` (Workbox) | PWA offline (RF-14, RF-15) |
| `AudioContext.createBuffer` / `playbackRate` | `App.tsx` (`onPlay`) | Reproducción de la referencia sintetizada |

## 3. Hallazgo concreto: Workers de módulo ES sin fallback

Los tres workers de IA se instancian con `{ type: 'module' }`:

```ts
new Worker(new URL('./asrWorker.ts', import.meta.url), { type: 'module' })
```

Es la forma correcta y la que recomienda Vite, pero **no es universal**: los
workers de tipo módulo (a diferencia de los workers clásicos) llegaron después a
cada motor —

| Motor | Soporte de `Worker({type:'module'})` desde |
|---|---|
| Chrome/Edge | Chrome 80 (2020) |
| Safari | Safari 15 (2021) |
| Firefox | **Firefox 114 (junio 2023)** |

Antes de esas versiones el `new Worker(...)` no lanza una excepción síncrona: el
worker se crea pero falla al cargar el módulo, así que el turno se quedaría
colgado en "Analizando tu frase..." sin un error claro para el usuario. Como
`onMicClick` (S7-T3, ver más abajo) sí captura errores de `getUserMedia`, pero
la falla de un worker ocurre después y por otra vía (dentro de la promesa que
resuelve el orquestador), en un navegador desactualizado el error terminaría en
el mismo mensaje genérico del turno, no en uno que explique la causa real.

**No se cambia nada en `src/ai/` para esto**: los workers son de Isaac, y esta
tarea es de auditoría de `src/ui/`, no un `shared-change`. Se deja documentado
para que quien lo decida (probablemente junto con RF-21/WER) evalúe si vale la
pena un mensaje de error distinto para navegadores sin soporte, o si el corte
(Firefox 114+, ya de 2023) es aceptable para el curso.

## 4. Otras limitaciones documentadas (sin verificar en dispositivo real)

- **WASM SIMD** (`ort-wasm-simd-threaded.jsep.wasm`): soporte en Safari desde la
  versión 16.4 (marzo 2023). En una versión anterior, la carga de modelos
  fallaría durante `AIPipeline.init()`, mostrando la pantalla de error de carga
  que ya existe en `App.tsx` (con el botón "Abrir en modo demostración" como
  salida).
- **Hilos WASM / `SharedArrayBuffer`**: requieren cabeceras `Cross-Origin-Opener-Policy`
  y `Cross-Origin-Embedder-Policy`, que **este proyecto no configura** (ni en
  `vite.config.ts` ni en el despliegue de GitHub Pages). Esto es igual en los
  tres motores, no una diferencia entre navegadores: sin esas cabeceras,
  `crossOriginIsolated` es `false` y onnxruntime-web cae solo a ejecución de un
  hilo. No es un error visible, es más lento de lo que podría ser. Queda fuera
  del alcance de esta tarea (es configuración de despliegue, no de `src/ui/`).
- **PWA instalable (RF-14):** Firefox de escritorio no ofrece instalación de
  PWA vía manifest de la misma forma que Chrome/Edge; Safari/iOS usa su propio
  flujo de "Añadir a pantalla de inicio" en vez del prompt estándar. La app
  sigue siendo usable como página normal en ambos casos — lo que cambia es
  la instalabilidad, no la funcionalidad.
- **IndexedDB en modo privado de Safari:** Safari ha limitado o vaciado
  IndexedDB en navegación privada en distintas versiones. `sessionStore.ts` ya
  cae a un almacén en memoria si `indexedDB` no está disponible (ver
  `createSessionStore()`), así que la sesión en curso funciona igual; solo se
  perdería el historial entre sesiones (S9-T1) al cerrar la pestaña.

## 5. Conclusión

Sin acceso a Firefox/Safari reales en este entorno, la compatibilidad **con
Chrome/Edge queda verificada**; la de Firefox/Safari queda **documentada por
auditoría de código**, no probada. El punto que más vale la pena confirmar
manualmente antes de la entrega es el de la sección 3 (workers de módulo),
porque es el único que podría producir un fallo silencioso en vez de un mensaje
de error legible.
