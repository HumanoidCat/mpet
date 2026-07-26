# Evidencia S2-T2 — Preprocesamiento: pasa-banda y normalización RMS

> Fabrizio (DSP) · Semana 2 · Código en `src/audio/dsp/biquad.ts` y `preprocess.ts`
> Reproducible con `npx vitest run tests/audio` (25 pruebas de esta tarea).

## 1. Qué hace y en qué orden

```
PCM 16 kHz (de S2-T1)
  → pasa-banda de voz 80–8000 Hz   (biquad, Butterworth Q = 1/√2)
  → normalización RMS a 0.1        (≈ −20 dBFS)
  → PCM listo para ASR y análisis
```

**El orden no es arbitrario: primero filtrar, después normalizar.** Al revés, un
zumbido de red inflaría el RMS y la normalización bajaría la voz para compensar
un ruido que el filtro iba a eliminar igual. La sección 4 lo mide.

## 2. Por qué biquad aquí y FIR en S2-T1

| | FIR (S2-T1, anti-aliasing) | Biquad (S2-T2, pasa-banda) |
|---|---|---|
| Coeficientes | 127 | 5 |
| Fase | lineal (retardo igual para todas las frecuencias) | no lineal |
| Estabilidad | siempre estable | depende de los polos |
| Pendiente | muy abrupta | −12 dB/octava |

En el remuestreo la fase lineal es obligatoria: ese PCM alimenta al comparador
de la Semana 6 y una distorsión de fase desalinearía la forma de onda. En el
preprocesamiento solo interesa quitar energía fuera de la banda de voz, así que
conviene el filtro barato: 5 coeficientes en vez de 127.

## 3. Respuesta en frecuencia del pasa-banda (16 kHz)

| Frecuencia | Ganancia | dB | Qué es |
|---:|---:|---:|---|
| 0 Hz | 0.00000 | −∞ | offset de continua del micrófono |
| 20 Hz | 0.06237 | −24.10 | retumbe, golpes de mesa |
| 50 Hz | 0.36382 | −8.78 | zumbido de red (Europa) |
| 60 Hz | 0.49023 | −6.19 | zumbido de red (América) |
| **80 Hz** | 0.70711 | **−3.01** | frecuencia de corte |
| 100 Hz | 0.84229 | −1.49 | F0 grave |
| 150 Hz | 0.96188 | −0.34 | F0 masculina |
| 200 Hz | 0.98746 | −0.11 | F0 femenina |
| 300 Hz | 0.99749 | −0.02 | F0 / primer formante |
| 1 000 Hz | 0.99998 | −0.00 | formantes |
| 3 400 Hz | 1.00000 | −0.00 | formantes altos |
| 7 000 Hz | 1.00000 | −0.00 | fricativas |

Los −3.01 dB exactos en el corte confirman el diseño Butterworth. La continua
se elimina por completo, y la banda fonética a partir de 150 Hz queda con menos
de 0.35 dB de alteración.

### Hallazgo: a 16 kHz el pasa-banda tiene una sola etapa

El borde superior de la banda (8 000 Hz) **coincide exactamente con el Nyquist**
de 16 kHz. Ahí un biquad es degenerado: sus polos caen sobre el círculo unitario
(z = −1) y el filtro deja de ser estable. Pero tampoco hace falta, por dos
razones que se refuerzan:

1. Por definición del muestreo, una señal a 16 kHz **no puede contener** nada
   por encima de 8 kHz — no hay qué filtrar.
2. El filtro anti-aliasing de S2-T1 ya dejó −44.6 dB en ese punto.

**El límite superior de la banda lo impone el propio sample rate.** Así que a
16 kHz el pasa-banda 80–8000 Hz se reduce, correctamente, a un pasa-altas de
80 Hz. El código construye la etapa pasa-bajas solo cuando el borde superior
queda genuinamente por debajo del Nyquist (`designVoiceBandpass`), y una prueba
verifica que a 16 kHz sale 1 etapa y a 48 kHz salen 2.

### Nota sobre la pendiente cerca de Nyquist

La asíntota de −12 dB/octava de un filtro de segundo orden solo se cumple lejos
de Nyquist. Medido con corte en 1 kHz y fs = 16 kHz, entre 2 y 4 kHz la caída
es de −15.1 dB/octava, no −12. Es el *warping* de la transformada bilineal: el
diseño comprime todo el eje de frecuencias analógico dentro de [0, Nyquist], y
la respuesta se anula exactamente en Nyquist en vez de seguir una asíntota.
Verificado en `tests/audio/biquad.test.ts`.

## 4. Normalización RMS

### Mismo nivel de salida sin importar el volumen de entrada

| Amplitud de entrada | RMS de salida | Pico |
|---:|---:|---:|
| 0.01 | 0.10000 | 0.156 |
| 0.05 | 0.10000 | 0.156 |
| 0.20 | 0.10000 | 0.156 |
| 0.60 | 0.10000 | 0.156 |

Un rango de entrada de 60× produce salidas idénticas. Es lo que permite que el
comparador de la Semana 6 mida **pronunciación y no volumen**: dos personas que
dicen la misma frase a distinto volumen deben puntuar igual.

### El zumbido no altera el nivel de la voz

Voz de 300 Hz con un zumbido de 60 Hz **tres veces más fuerte**:

| | RMS |
|---|---:|
| Entrada limpia | 0.07071 |
| Entrada contaminada | 0.22361 (inflado 3.2×) |
| **Salida limpia** | **0.10000** |
| **Salida contaminada** | **0.10000** |

El zumbido infla el RMS de entrada 3.2×, pero ambas salidas quedan en 0.10000 —
idénticas hasta la quinta cifra. Si se normalizara antes de filtrar, la voz
contaminada saldría 3.2× más baja que la limpia.

### Protecciones

| Riesgo | Medida |
|---|---|
| Amplificar silencio y convertir ruido de fondo en señal (el VAD de S2-T3 lo leería como habla) | Ganancia máxima de 20× (`MAX_NORMALIZATION_GAIN`) |
| Saturar al normalizar, introduciendo armónicos que ensuciarían el espectro de S3-T1 | Ganancia acotada además por el pico: nunca sale de [−1, 1] |
| Silencio absoluto (RMS = 0) | Ganancia 1, se deja tal cual |

### En vivo: por qué no se normaliza bloque a bloque

Durante la captura no se conoce el enunciado completo, y normalizar cada bloque
por separado haría saltar la ganancia en cada pausa (efecto de *bombeo*). Se usa
un RMS con memoria — media móvil exponencial con α = 0.9, unos 10 bloques de
respuesta — de modo que la ganancia varíe suavemente. Una prueba verifica que el
cambio entre bloques consecutivos se mantiene por debajo del 25 %.

## 5. Archivos

| Archivo | Rol |
|---|---|
| `src/audio/dsp/biquad.ts` | Diseño (cookbook RBJ), forma directa II transpuesta, cascada, \|H(e^{jω})\| |
| `src/audio/dsp/preprocess.ts` | Pasa-banda de voz, RMS, normalización, versión en vivo |
| `tests/audio/biquad.test.ts` | 9 pruebas |
| `tests/audio/preprocess.test.ts` | 16 pruebas |

La respuesta en frecuencia se verifica por dos caminos independientes: la
fórmula analítica |H(e^{jω})| y el filtrado de senos reales. Que ambos coincidan
confirma que los coeficientes y la implementación están de acuerdo.
