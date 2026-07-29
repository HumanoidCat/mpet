# Evidencia S5-T2 — MFCC: coeficientes cepstrales en escala mel

> Fabrizio Espinoza (DSP) · Semana 5 · Código en `src/audio/features/mel.ts` y `mfcc.ts`
> Reproducible con `npx vitest run tests/audio/mfcc.test.ts` (28 pruebas).

## 1. Qué son y para qué

Son las características con las que el comparador de la Semana 6 decide si dos
pronunciaciones se parecen. La cadena es:

```
frame → ventana → FFT → |X|² → banco mel (26) → log → DCT → 13 coeficientes
```

Cada paso descarta algo que **no** debería influir en la comparación:

| Paso | Qué descarta | Por qué |
|---|---|---|
| Banco mel | Los armónicos individuales | Dependen del tono de quien habla, no del fonema |
| Logaritmo | El factor de volumen | Convierte producto en suma: separa fuente glotal de tracto vocal, y un cambio de volumen pasa a ser un desplazamiento constante |
| DCT | La correlación entre bandas | Las bandas mel vecinas se solapan; tras la DCT la información se concentra y bastan 13 de 26 |

## 2. La escala mel

El oído no percibe la frecuencia de forma lineal: distinguimos con facilidad 200
de 300 Hz, pero 5000 y 5100 Hz suenan casi igual. La escala mel refleja eso:

$$m = 2595 \log_{10}\left(1 + \frac{f}{700}\right)$$

Se usa la fórmula de **HTK**, la del estándar de reconocimiento de voz. (librosa
la implementa con `htk=True`; su valor por defecto usa la variante de Slaney, que
da un banco distinto.)

El efecto se ve en el ancho de las bandas resultantes:

| Banda | Ancho |
|---|---:|
| Primera (centro 68 Hz) | 75 Hz |
| Última (centro 7225 Hz) | 706 Hz |

Centros: 68, 144, 226, 317, 416 … 5875, 6519, 7225 Hz. Equiespaciados en mel,
cada vez más separados en Hz. Así se gasta resolución donde el oído la tiene.

## 3. Validación por etapas

Cada pieza se comprueba contra su definición, la misma estrategia de S3-T1 y
S5-T1:

| Etapa | Comprobación |
|---|---|
| Escala mel | `hzToMel` y `melToHz` son inversas exactas; coincide con la fórmula en puntos conocidos |
| Banco de filtros | Centros crecientes y equiespaciados **en mel**; pesos en [0,1]; solapamiento sin huecos entre el primer y el último centro; aplicar el banco reproduce Σₖ w[k]·P[k] |
| DCT-II | Coincide con su definición; es lineal; una señal constante activa solo c₀; la normalización ortonormal **conserva la energía** |
| Logaritmo | 10·log₁₀ sobre potencia; con piso, de modo que el silencio no dé −∞ |

La conservación de energía de la DCT no es un detalle: es lo que hace que la
distancia entre dos vectores de MFCC signifique lo mismo que en el dominio
original, condición necesaria para que la DTW de la Semana 6 tenga sentido
métrico.

## 4. El resultado que justifica usar MFCC

**Los coeficientes c₁…c₁₂ no cambian con el volumen.** Misma vocal sintética,
ganancia de 0.1 a 100 — un rango de mil veces:

| Ganancia | c₀ | Mayor cambio en c₁…c₁₂ |
|---:|---:|---:|
| ×0.1 | −160.25 | 1.91 × 10⁻⁶ |
| ×1 | −58.27 | — |
| ×5 | 13.01 | 1.91 × 10⁻⁶ |
| ×20 | 74.41 | 1.91 × 10⁻⁶ |
| ×100 | 145.69 | 3.81 × 10⁻⁶ |

El cambio es del orden de la precisión de un `float32`: **invariancia exacta**,
no aproximada. El volumen queda encerrado en c₀, y en la cantidad que predice la
teoría — multiplicar la señal por *g* multiplica la potencia por *g²*, lo que
suma 20·log₁₀(g) dB a todas las bandas por igual, y la DCT manda una constante a
c₀.

Es lo que hace que el puntaje mida **pronunciación y no intensidad**.

## 5. Discriminación entre fonemas

Distancias euclídeas ignorando c₀, sobre vocales sintéticas con formantes
distintos:

| Par | Distancia |
|---|---:|
| /a/ vs /i/ | 53.23 |
| /a/ vs /u/ | 36.50 |
| /i/ vs /u/ | 35.73 |
| **/a/ contra sí misma, ×20 de volumen** | **3.66 × 10⁻⁶** |

### El banco mel borra el tono, conserva el fonema

| Comparación | Distancia |
|---|---:|
| /a/ a 100 Hz vs /a/ a 180 Hz (mismo fonema, otro tono) | 21.96 |
| /a/ a 100 Hz vs /i/ a 100 Hz (otro fonema, mismo tono) | 53.57 |

Cambiar de fonema aleja **2.4 veces más** que cambiar de tono. Es exactamente lo
que se busca: el agrupamiento en bandas anchas borra los armónicos individuales
—que se mueven con el tono— y conserva la envolvente, que define el fonema.

## 6. Costo

**0.0287 ms por trama.** A 62.5 tramas por segundo son 1.79 ms por segundo de
audio: **0.18 % de un núcleo**, sumado al 0.06 % de la FFT.

La DCT se calcula por definición, sin optimizar: con N = 26 son 338
multiplicaciones por trama, tres órdenes de magnitud por debajo de la FFT que ya
se hizo. No compensa complicarla.

## 7. Limitación encontrada

**La invariancia al volumen se rompe si alguna banda mel toca el piso.** El piso
`MEL_FLOOR` evita evaluar log(0), pero una banda fijada en el piso no se
desplaza al cambiar el volumen mientras que las demás sí; el desplazamiento deja
de ser uniforme y se filtra a c₁…c₁₂.

Ocurre con señales de banda limitada o muy flojas. Se detectó al escribir las
pruebas: la primera versión de la vocal sintética generaba solo 20 armónicos, que
para f₀ = 120 Hz se quedan en 2.4 kHz, así que las bandas superiores recibían
energía nula y la invariancia fallaba. **El defecto estaba en la señal de prueba,
no en la implementación**, pero la limitación es real y queda documentada con una
prueba propia.

En voz real no es un problema: el habla tiene energía repartida por toda la banda
y la normalización RMS de S2-T2 la sitúa muy por encima del piso. Anotado para
S8-T2 (casos límite) por si aparece con voz muy floja.

## 8. Validación cruzada contra librosa

Pendiente de ejecutar, con el procedimiento ya preparado en
`tests/audio/fixtures/generar_referencia_librosa.py`.

Sigue la resolución del PM sobre dependencias: **no se agrega librosa al
proyecto**. El script se corre una vez fuera del repositorio, exporta los
coeficientes de referencia a `mfcc-librosa.json`, y ese archivo se versiona. Las
pruebas comparan contra él, de modo que ni el proyecto ni el navegador
incorporan nada nuevo.

Los parámetros que tienen que coincidir están documentados en el script; cuatro
son fáciles de pasar por alto:

| Parámetro | Valor | Por qué |
|---|---|---|
| `htk=True` | fórmula de HTK | El defecto de librosa es Slaney, que da otro banco |
| `norm=None` | sin normalizar filtros | El defecto escala cada filtro por su ancho |
| `top_db=None` | sin recorte | `power_to_db` recorta a 80 dB bajo el máximo por defecto |
| `center=False` | sin relleno simétrico | El proyecto trocea desde la muestra 0 |

Mientras tanto, la validación entregada es contra la definición de cada etapa y
contra las propiedades analíticas, que es la referencia más fuerte. La
comparación con librosa verificará **interoperabilidad** —que nuestros
coeficientes sean intercambiables con los de la literatura—, no corrección.

## 9. Archivos

| Archivo | Rol |
|---|---|
| `src/audio/features/mel.ts` | Escala mel y banco de filtros triangulares |
| `src/audio/features/mfcc.ts` | DCT-II ortonormal, logaritmo y extractor completo |
| `tests/audio/mfcc.test.ts` | 28 pruebas |
| `tests/audio/fixtures/generar_referencia_librosa.py` | Generador del fixture de referencia |

## 10. Estado de `AudioFrame`

Con S5-T1 y S5-T2 quedan cubiertos los dos campos que el adaptador de
integración declaraba vacíos:

| Campo | Antes | Ahora |
|---|---|---|
| `pitchHz` | `null` | `detectPitchYin` (S5-T1) |
| `mfcc` | ceros | `MfccExtractor.process` (S5-T2) |

Conectarlos corresponde a integración (`src/core/audioEngineAdapter.ts`).
