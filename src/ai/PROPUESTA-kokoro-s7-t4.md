# Propuesta de `shared-change`: evaluar Kokoro-82M como voz del tutor

**Autor:** Isaac Morum (módulo `src/ai/`) · **Fecha:** 3 de agosto de 2026
**Para:** Alejandro Zamora (líder técnico, dueño de `package.json`)
**Estado:** propuesta, **no** solicitud inmediata. No he tocado `package.json`.
**Encaja en:** S7-T4 (reducción de peso y calidad de los modelos), no en S5-T5.

> Esto **no bloquea nada**. S5-T5 ya está entregado y funcionando con MMS-TTS, así que
> el comparador de pronunciación puede arrancar. Esta propuesta es para decidir, con
> calma, si la voz del tutor se queda como está o se mejora.

## 1. El problema medido

El spike S4-T5 evaluó cinco configuraciones de dos familias de modelos
(`docs/evidencias/s4/s4-t5-tts-spike.md`). El resultado:

- **SpeechT5 quedó descartado.** Solo es inteligible sin cuantizar, y así descarga
  613 MB: el triple de todo lo que baja la aplicación hoy. Además falló al cargar tres
  veces seguidas.
- **MMS-TTS (el que está en producción) funciona**: 109 MB, salida a 16 kHz —la misma
  del proyecto, sin remuestrear—, carga cacheada en 0.86 s y el mejor tiempo de
  síntesis de los cinco.
- **Pero pronuncia mal algunas palabras.** En la escucha, *vegetables* sonó como
  "veyitables". El modelo trabaja carácter a carácter y no tiene un conversor fonético
  de verdad. **No se corrige por configuración**: el grafo ONNX solo acepta
  `input_ids` y `attention_mask`, comprobado leyendo sus entradas en ejecución.

**Por qué esto importa más en nuestro producto que en otro:** el audio sintetizado no
es decorativo, es la **referencia contra la que se puntúa al estudiante**. Si la
referencia pronuncia mal una palabra, pasan dos cosas malas a la vez: el estudiante
imita el error, y el comparador penaliza a quien la pronuncie bien.

Falta medir cuán frecuente es el fallo. El spike ya trae un botón con 14 frases
preparadas para contarlo (`src/ai/spike-s4-t5/`, botón *Cargar frases de pronunciación
difícil*). Esta propuesta cobra sentido solo si esa cuenta sale alta.

## 2. Qué pediría

Añadir a `dependencies` de `package.json`:

```json
"kokoro-js": "^1.2.1"
```

Arrastra una dependencia transitiva, `phonemizer`, que es justamente la pieza que falta:
convierte el texto inglés a fonemas antes de sintetizar, que es la razón por la que
Kokoro no comete el error de *vegetables*.

**Compatibilidad verificada:** `kokoro-js` 1.2.1 declara `@huggingface/transformers`
`^3.5.1`, así que reutiliza la 3.8.1 que ya tenemos fijada. No hay salto de versión
mayor ni duplicación del motor de inferencia.

## 3. Lo que cuesta

| | MMS-TTS (hoy en producción) | Kokoro-82M |
|---|---|---|
| Descarga sin cuantizar | 109 MB | 325 MB |
| Descarga cuantizada | 36.6 MB | 92 MB |
| Frecuencia de salida | **16 kHz** | 24 kHz → hay que remuestrear |
| Dependencias nuevas | ninguna | `kokoro-js` + `phonemizer` |
| Velocidad del habla | fija | configurable |
| Pronunciación | falla en algunas palabras | conversor fonético real |

Tres costes concretos, además del peso:

1. **Remuestreo de 24 kHz a 16 kHz.** Es código nuevo mío, con sus pruebas. Es una
   relación 3:2, así que sale limpio, pero hay que filtrar antes de diezmar para no
   meter solapamiento espectral. **Nota:** Fabrizio ya tiene remuestreo con
   antisolapamiento en `src/audio/dsp/sampling.ts`. Antes de duplicarlo, prefiero
   preguntar si conviene exponerlo por el contrato en vez de que yo escriba otro.
2. **La cuantización sigue siendo mala idea.** El proyecto ya la midió tres veces
   (D-05 en gramática, y A contra C y D contra E en el spike de TTS): en WASM sobre
   CPU siempre salió más lenta. Así que el número realista de Kokoro es **325 MB**,
   no los 92 MB de la variante cuantizada.
3. **Sube la descarga inicial.** Hoy son ~388 MB con el TTS incluido. Con Kokoro
   pasarían a ~604 MB. Eso choca de frente con S7-T4, que existe para bajar ese
   número, así que la decisión sensata sería adoptarlo **junto con carga bajo demanda
   del TTS**, no antes.

## 4. Mi recomendación

**No hacerlo todavía.** Primero contar los fallos de pronunciación con las 14 frases
del spike. Si falla en una o dos de catorce, no compensa: se documenta como limitación
conocida y se sigue con MMS-TTS. Si falla en cinco o más, la voz del tutor no sirve
para enseñar pronunciación y entonces sí vale la pena pagar el precio, junto con la
carga bajo demanda.

## 5. Un hallazgo aparte que sí te afecta ya

Verificando el worker de TTS con descargas reales encontré que **la barra de progreso
de carga de modelos estaba rota para los tres modelos**, no solo para el TTS.

Los archivos pequeños (`config.json`, 1656 bytes) llegan completos en un único evento
*antes* de que empiece el archivo grande de pesos. El agregador los contaba, calculaba
1656/1656 = 100 % y, como la barra es monótona por diseño, se quedaba clavada en el
100 % durante toda la descarga real. Con MMS-TTS eran 109 MB de espera con la barra
llena.

Ya está corregido en `src/ai/model-cache/progress.ts` —los archivos que llegan
completos de una sola vez no cuentan— y verificado con descarga real: pasó de **1
reporte a 1690 graduales**. Es mi archivo, así que no hace falta `shared-change`, pero
te lo digo porque cambia lo que ve el usuario en la pantalla de carga de la aplicación.
