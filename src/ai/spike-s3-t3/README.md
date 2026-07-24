# Spike S3-T3 — validación del worker de gramática

Spike **desechable** (Isaac). Valida en el navegador lo que S3-T3 dejó escrito pero
sin ejecutar, antes del Avance 1.

## Qué responde

1. **¿Corrige de verdad?** Frases con errores típicos de hispanohablantes.
2. **¿Cuánto tarda?** Carga del modelo (fría y cacheada) y latencia por frase.
3. **¿El prefijo `"grammar: "` cambia algo?** El modelo base (`vennify`) se entrenó con
   él, pero la ficha de la conversión ONNX de Xenova lo omite en su ejemplo. El spike
   corre cada frase **con y sin** prefijo y cuenta en cuántas cambia el resultado.

> A diferencia del spike S1-T7 (que cargaba la librería por CDN porque la dependencia
> aún no estaba aprobada), este importa la **misma versión que usa el proyecto** (3.8.1)
> y el **`diff.ts` real**. O sea: valida el código que va a producción, no una copia.

## Cómo correrlo

Desde la raíz del repo:

```bash
npm run dev
```

Abre <http://localhost:5173/src/ai/spike-s3-t3/index.html> en Chrome.

Pasos en la página: **1)** Cargar modelo + medir · **2)** Corregir todas + medir.
Para medir la carga **cacheada**, recarga la página y vuelve a cargar.

## Resultados (medidos en la laptop de Isaac · Chrome · q8)

| Medida | Valor |
|---|---|
| Carga fría (s) | **52.49** |
| Caché (MB) | **238.0** |
| Latencia media por frase (ms) | **320** |
| Latencia máxima (ms) | **456** |
| Frases donde el prefijo cambió el resultado | **1 de 8** |
| Heap JS (MB) | N/A (no expuesto en esta corrida) |

### Calidad: 6 de 8 corregidas

| Frase | Resultado | |
|---|---|---|
| I have 25 years old. | I am 25 years old. | ✅ |
| She don't like the coffee. | She doesn't like the coffee. | ✅ |
| Yesterday I go to the store and buyed some breads. | Yesterday I went to the store and bought some bread. | ✅ (3 errores) |
| I am agree with you. | I agree with you. | ✅ |
| He is more tall than me. | *(sin cambios)* | ❌ falta "taller" |
| I recieve your message yesterday. | I received your message yesterday. | ✅ |
| Do you can help me? | *(sin cambios)* | ❌ falta "Can you help me?" |
| There is many people in the party. | There are many people in the party. | ⚠️ parcial ("at the party") |

### El prefijo SÍ importa

Cambió el resultado en 1 de 8 frases, y **a favor**: con prefijo corrigió
`breads → bread`; sin prefijo dejó `breads` sin tocar. **Se mantiene el prefijo.**

### Bug encontrado y corregido

El diff clasificaba `don't → doesn't` como `spelling` porque las palabras se parecen
(similitud 0.71), cuando es concordancia sujeto-verbo. Igual con `breads → bread`. Se
añadieron dos reglas previas a la similitud: palabras de clase cerrada → `grammar`, y
diferencia solo por `-s/-es` → `grammar`. Tests: 12 → 14.

## Conclusión

**Sirve para el Avance.** La latencia es excelente (320 ms de media, muy por debajo del
objetivo de 2 s) y acierta en 6 de 8 frases difíciles, incluida una con tres errores
simultáneos.

**Dos reservas a vigilar:**

1. **Peso: 238 MB en caché**, casi 6× el ASR (41 MB). Sumando el runtime WASM (21.6 MB),
   la primera corrida descarga **~300 MB**. Conviene probar `q4` y comparar tamaño
   contra calidad antes de dar por cerrada la elección.
2. **Cobertura del modelo:** falla en comparativos ("more tall" → "taller") y en el orden
   de preguntas con modal ("Do you can" → "Can you"). Son errores frecuentes en
   hispanohablantes, así que hay que decidir si se acepta o se documenta como limitación
   conocida en la demo.
