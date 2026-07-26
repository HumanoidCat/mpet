# Evidencia S2-T3 — Detección de actividad de voz (VAD)

> Fabrizio (DSP) · Semana 2 · Código en `src/audio/dsp/vad.ts`
> Reproducible con `npx vitest run tests/audio/vad.test.ts` (20 pruebas).

## 1. Qué resuelve

Decide dónde empieza y dónde termina el habla dentro de la grabación. Sirve para
dos cosas concretas:

- **Recortar el silencio antes del ASR.** Whisper procesa en bloques de 30 s;
  cada muestra de silencio que se le manda es latencia regalada.
- **Delimitar el tramo que el comparador de la Semana 6 alineará** contra la
  referencia del TTS.

La señal se trocea en frames de 32 ms con 50 % de solape (`FRAME_SIZE` 512,
`HOP_SIZE` 256) y de cada uno se calcula la energía:

$$E[m] = 20 \log_{10}\left( \text{RMS}(\text{frame } m) \right)$$

## 2. Por qué un umbral fijo no sirve

El nivel de ruido depende del micrófono y del cuarto. El umbral se calcula
**relativo al ruido de fondo medido en la propia grabación**: se estima como el
percentil 10 de las energías por frame (se asume que al menos una décima parte
de la grabación es silencio).

| Cuarto | Ruido de fondo | Umbral de entrada | Umbral de salida |
|---|---:|---:|---:|
| Silencioso | −64.8 dB | −50.0 dB | −54.0 dB |
| Normal | −50.8 dB | −40.8 dB | −44.8 dB |
| Ruidoso (20× más ruido) | −41.9 dB | −31.9 dB | −35.9 dB |

Los umbrales se mueven 23 dB entre el cuarto silencioso y el ruidoso. Un umbral
fijo calibrado para uno fallaría en el otro.

**Caso contrario:** si la grabación es casi toda habla, el percentil 10 caería
dentro de la voz y el umbral quedaría tan alto que no se detectaría nada. Por
eso el piso está topado a 25 dB por debajo del frame más fuerte. Verificado con
una señal de 2 s de habla continua.

## 3. Los tres mecanismos contra los errores típicos

| Mecanismo | Qué evita | Parámetro |
|---|---|---|
| **Histéresis** | Que la decisión oscile cuando la energía ronda el umbral | Entrar cuesta +10 dB sobre el piso; salir, +6 dB |
| **Confirmación** | Que un clic o un golpe de mesa abra un segmento | 48 ms seguidos por encima del umbral |
| **Hangover** | Cortar la frase en cada oclusiva (/p/, /t/, /k/), que son silencios reales de hasta 100 ms dentro de una palabra | 200 ms de tolerancia antes de cerrar |

## 4. Precisión de los bordes

Señal de prueba: habla construida exactamente de 500 a 1300 ms.

| Cuarto | Inicio detectado | Error | Fin detectado | Error |
|---|---:|---:|---:|---:|
| Silencioso | 480 ms | −20 ms | 1328 ms | +28 ms |
| Normal | 480 ms | −20 ms | 1328 ms | +28 ms |
| Ruidoso | 480 ms | −20 ms | 1328 ms | +28 ms |

**El error es idéntico en los tres cuartos**, pese a que el ruido de fondo varía
20×. Es la prueba de que la adaptación funciona: cambia el umbral, no la
precisión.

Los errores son de cuantización por frame y están acotados por el troceado: el
inicio se retrocede hasta el primer frame que superó el umbral (hasta 32 ms
antes) y el fin incluye el último frame completo (hasta 32 ms después). Ambos
sesgos son hacia afuera — **el VAD nunca recorta habla, en el peor caso deja un
poco de silencio**, que es el error correcto a cometer.

## 5. Casos de robustez

| Caso | Segmentos detectados | Esperado |
|---|---:|---:|
| Clic de 10 ms sobre silencio | 0 | 0 |
| Pausa de 80 ms dentro de la frase (oclusiva) | 1 | 1 |
| Pausa de 700 ms entre dos frases | 2 | 2 |
| Silencio puro (2 s) | 0 | 0 |

Los dos del medio son el punto fino: distinguir una pausa *dentro* de una
palabra de una pausa *entre* frases. Lo resuelve el hangover de 200 ms.

## 6. Recorte para el ASR

| | Duración |
|---|---:|
| Grabación completa | 2000 ms |
| Tras `trimToSpeech` | 848 ms |
| **Reducción** | **58 % menos muestras al ASR** |

Si el VAD no detecta habla, `trimToSpeech` devuelve el audio intacto: más vale
mandar silencio al ASR que perder la frase del usuario por una decisión del
detector.

## 7. Versión en vivo

La diferencia esencial con la versión offline: **el ruido de fondo no puede
calcularse sobre toda la grabación porque todavía no existe**. Se estima con los
primeros 300 ms — el instante en que el usuario acaba de pulsar el micrófono y
aún no habló — y después se sigue adaptando, pero solo hacia arriba y solo
durante el silencio, para que la voz no contamine la estimación.

Emite eventos `speech-start` / `speech-end` con la muestra y el segundo exactos.
Una prueba verifica que el resultado es **idéntico procesando en bloques de 128
o de 1024**, incluidos los números de muestra de cada evento.

## 8. Archivos

| Archivo | Rol |
|---|---|
| `src/audio/dsp/vad.ts` | Energía por frame, estimación del piso, máquina de estados, versión offline y en vivo |
| `tests/audio/vad.test.ts` | 20 pruebas |

## 9. Limitación conocida

Es un VAD **por energía**: un ruido fuerte y sostenido (un ventilador cerca del
micrófono, música de fondo) supera el umbral y se detecta como habla. Distinguir
voz de ruido con la misma energía requiere mirar la estructura espectral —
tasa de cruces por cero, o la periodicidad que el detector de pitch de la
Semana 5 va a calcular de todas formas. Queda anotado para S8-T2 (edge cases:
ruido ambiental), que es donde el plan lo contempla.
