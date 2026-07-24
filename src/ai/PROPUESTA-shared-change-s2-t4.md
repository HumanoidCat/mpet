# Propuesta `shared-change` — dependencia de transformers.js (S2-T4)

**Solicita:** Isaac (IA/ML, `src/ai/`) · **Aprueba:** Alejandro (dueño de `src/shared/` y raíz)
**Etiqueta de PR:** `shared-change`

## Qué pido

Agregar **una** dependencia de producción a `package.json`:

> **✅ APROBADO E INTEGRADO** por Alejandro en la rama `chore/shared-change-transformers`
> (commit `9ec77af`), fijado en **`^3.8.1`**. Este documento queda como registro.

```diff
   "dependencies": {
+    "@huggingface/transformers": "^3.8.1",
     "react": "^18.3.1",
     "react-dom": "^18.3.1"
   }
```

Comando equivalente:

```bash
npm install @huggingface/transformers@^3.8.1
```

> ⚠️ **Corrección** (error en la primera versión de esta propuesta): NO usar
> `npm install @huggingface/transformers` a secas — hoy instala la **v4.2.0**, que es un
> salto de versión mayor con API distinta. El proyecto se queda en **v3** para que el
> código coincida con las mediciones documentadas del spike S1-T7 (validado con v3).
> Migrar a v4 sería una decisión aparte, con su propio spike y mediciones nuevas.

## Por qué

Es el motor de inferencia del proyecto: corre los modelos de Hugging Face en el
navegador sobre ONNX Runtime Web (WASM). Sin él no existe el pipeline de IA — ni
ASR, ni gramática, ni TTS. La tarea **S2-T4** (worker de ASR) lo requiere, y el plan
del equipo ya lo tenía previsto para esta semana (ver `src/ai/README.md` y
`guias/isaac.md`).

**No se agregó antes a propósito:** el spike S1-T7 lo cargó vía CDN justo para no
tocar `package.json` fuera de tiempo.

## Impacto

| Aspecto | Detalle |
|---|---|
| Alcance | Solo la usa `src/ai/`. Ningún otro módulo la importa. |
| Peso del bundle | La librería es pequeña; el volumen real son los **modelos**, que NO van en el bundle: se descargan del Hub y se cachean en el navegador (41 MB medidos para whisper-tiny.en). |
| Offline / PWA | Compatible: `vite.config.ts` ya documenta que los modelos se cachean solos en Cache API y el precache de Workbox cubre solo el app shell. |
| Riesgo | Bajo. Ya validada en el spike S1-T7 corriendo en Chrome. |
| Alternativa | Ninguna viable: es la única vía de inferencia client-side del enunciado. |

## Posible ajuste adicional en `vite.config.ts` (también tuyo)

Si al empaquetar aparecen problemas con los binarios WASM de ONNX Runtime, suele
bastar con excluir la librería del pre-bundling de dependencias:

```ts
optimizeDeps: { exclude: ['@huggingface/transformers'] }
```

Lo dejo señalado, **no lo aplico**. Si hace falta, dime y lo verificamos juntos.

## Qué queda desbloqueado al aprobarlo

`src/ai/asr/asrWorker.ts` ya está escrito e importa la librería. Con la dependencia
instalada, quedan operativos `transcribe(pcm)` (S2-T4) y el reporte de progreso de
carga (S2-T5), que el orquestador ya consume vía `ai.init(onProgress)`.
