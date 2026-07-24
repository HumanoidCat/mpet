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

## Resultados (rellenar)

| Medida | Valor |
|---|---|
| Carga fría (s) | |
| Carga cacheada (s) | |
| Caché (MB) | |
| Latencia media por frase (ms) | |
| Latencia máxima (ms) | |
| Frases donde el prefijo cambió el resultado | / 8 |
| Heap JS (MB) | |

**Calidad de las correcciones (rellenar):** ¿cuántas de las 8 frases quedaron bien
corregidas? ¿Alguna quedó peor que el original? ¿Los `Edit` del diff señalan las
palabras correctas?

**Conclusión (rellenar):** ¿sirve para el Avance? ¿Hay que cambiar de modelo o de
cuantización? ¿Se mantiene el prefijo?
