# R03 · El comparador con contenido garantizado

**Responsable:** Isaac Morum (módulo `src/ai/`) · **Fecha:** 7 de agosto de 2026
**Código:** `src/ai/spike-r03/`
**Complementa:** `docs/evidencias/s9/s9-t3-calibracion-voz-real.md` (Fabrizio)

## 1. Qué pregunta responde

La calibración con voz real midió una separación de **1.05** donde RF-10 exige 20, y
dejó una hipótesis sin verificar: que los tramos comparados **no contienen el mismo
contenido**, porque cada grabación tiene varias tomas y el detector de habla las parte
por pausas. No se pudo comprobar sin escuchar las grabaciones.

Este experimento quita esa variable. Usa audio **sintetizado**: emisiones completas,
sin pausas intermedias, con el contenido exacto conocido de antemano y sin detector de
habla de por medio. Analizado con `createDspAudioEngine().analyze()` y puntuado con
`createPronunciationScorer()`, los reales de la aplicación.

## 2. Resultados

| Comparación | Papel | Distancia DTW | Puntaje |
|---|---|---:|---:|
| Una toma contra sí misma | control de cordura | **0.00** | 100.0 |
| Mismo texto, **dos síntesis distintas** | el suelo | **1 895.93** | **49.5** |
| `ship` contra `sheep` | lo que hay que detectar | 2 839.97 | 36.0 |
| Frase completamente distinta | el techo | 4 371.87 | 18.1 |

## 3. Qué dicen estos números

### 3.1 El comparador ordena bien

El orden es el correcto y es monótono: idéntico < mismo texto < un fonema distinto <
frase distinta. **El comparador no está roto ni ciego**, y el control de cordura da
exactamente 0.00, igual que en la calibración de Fabrizio. Mi propia página emite un
veredicto binario de "no discrimina" por no llegar a 20 puntos, y eso se queda corto:
lo que ocurre es más específico.

### 3.2 El problema es el suelo, y es enorme

> **Dos síntesis del mismo texto, del mismo sintetizador, puntúan 49.5 sobre 100.**

Eso significa que un estudiante que pronuncie la frase **perfectamente** obtiene 49.5,
porque la referencia contra la que se compara es *otra emisión* del mismo texto. La
mitad de la escala se consume antes de que el estudiante cometa un solo error.

Y con ese suelo, la separación entre pronunciar bien (49.5) y cambiar un fonema
—`ship` contra `sheep`, el caso de prueba que el equipo eligió para S6-T7— es de
**13.5 puntos**, por debajo de los 20 que exige RF-10.

### 3.3 De dónde sale el suelo

De que MMS-TTS es **estocástico**: lleva un predictor de duración que muestrea ruido
para variar la prosodia, y no se puede desactivar (el grafo ONNX solo acepta
`input_ids` y `attention_mask`, comprobado en S4-T5). Las dos tomas de este
experimento midieron 27 904 y 30 976 muestras para el mismo texto: **11 % de diferencia
de duración**. El alineamiento temporal absorbe parte de eso, pero no todo.

## 4. Consecuencia directa: la referencia no puede re-sintetizarse

Si la aplicación sintetiza la referencia una vez para calibrar y otra para puntuar, el
mismo estudiante diciendo lo mismo obtiene puntajes que se mueven en el orden de esos
50 puntos. **El audio de referencia tiene que ser el mismo objeto durante toda la vida
del puntaje.**

Dentro de una sesión ya está resuelto: `src/ai/tts/pcmCache.ts` fija el PCM por frase
(S5-T5). Lo que **no** está resuelto es entre sesiones: al recargar la página la caché
se vacía y la frase se vuelve a sintetizar distinta. Persistir ese audio es trabajo del
almacenamiento en IndexedDB (S5-T6, Alejandro) y hasta ahora nadie sabía que hacía
falta.

## 5. Qué NO prueba este experimento

- **Es voz sintética contra voz sintética.** Mide el comparador y el suelo del
  sintetizador, no el caso real de un humano contra la referencia. El caso real solo
  puede ser **peor**, porque añade la diferencia de tracto vocal que R03 anticipaba
  desde el principio.
- **Las distancias no son comparables con las de la calibración** (25–33 allí, ~1 900
  aquí): aquellas son por tramo segmentado y estas por emisión completa, y la distancia
  DTW cruda se acumula con la longitud. Lo comparable son los **puntajes**, que sí están
  normalizados.
- **Un solo par mínimo y una sola frase.** Suficiente para mostrar que el suelo existe
  y cuánto vale; no para caracterizar el comparador en general.
- No dice nada sobre la hipótesis de la segmentación en las grabaciones humanas: puede
  seguir siendo cierta **además** de esto.

## 6. Qué propongo, para que lo decida Fabrizio

1. **Calibrar la escala contra el suelo, no contra cero.** Si dos emisiones correctas
   del mismo texto dan 49.5, ese valor es el "100 real" de esta cadena. Normalizar por
   el suelo recupera rango útil sin tocar el comparador. Es su módulo y su decisión;
   yo puedo dar el suelo medido para cualquier frase.
2. **Acotar por las marcas temporales del reconocedor** en vez de por las pausas del
   detector. Mi ASR ya las expone y su puntaje por palabra (S6-T2) ya las usa: aplicar
   el mismo criterio al recorte del audio ataca directamente su hipótesis.
3. **Persistir el audio de referencia** entre sesiones, o volver a calibrar cada vez
   que se sintetice de nuevo.
4. Repetir este mismo experimento **con Kokoro** si entra: si su sintetizador es
   determinista, el suelo desaparece y con él la mitad del problema.
