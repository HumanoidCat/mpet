# S6-T5, S6-T6, S8-T5 y R06 · Verificación en ejecución

**Responsable:** Alejandro Zamora · **Fecha:** _(rellenar)_
**Cierra:** RF-14 (PWA sin conexión), RF-15 (caché de modelos), R06 (latencia)

> Las cuatro verificaciones se hacen en una sola sesión porque comparten el
> arranque: hay que esperar la descarga una vez y a partir de ahí todo se mide
> sobre el mismo estado.

---

## 1. Latencia del turno (R06)

`npm run dev` y abrir `http://localhost:5173/?medir=1`. Cinco turnos hablando
normal, de tres a cinco segundos cada uno. La consola del navegador (F12 →
Console) imprime una línea por turno.

| Turno | Audio (s) | ASR | Gramática | **Retroalimentación** | Tutor | Total |
|---|---:|---:|---:|---:|---:|---:|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |
| **Mediana** | | | | | | |

**Criterio.** Lo que hay que defender es **`Retroalimentación` por debajo de
2 000 ms**: es la transcripción más la corrección, y es lo que pierde valor si
tarda, porque una corrección que llega tarde ya no se conecta con lo que el
estudiante acaba de decir.

El **total puede pasarse** y no incumple nada: la respuesta del tutor no está en
ese presupuesto. Una pausa de segundo y medio antes de contestar es lo normal en
una conversación humana. Está razonado en **D-15**.

**Resultado:** _(cumple / no cumple, con el número)_

---

## 2. Arranque sin conexión (RF-14, S6-T5 y S6-T6)

Sobre la aplicación desplegada, no sobre `npm run dev`: el service worker solo
trabaja en producción.

1. Abrir <https://humanoidcat.github.io/mpet/> y esperar la descarga completa.
2. **Hablar una vez** para forzar la carga del modelo del tutor (265 MiB) y del
   sintetizador (109 MiB), que van bajo demanda y no llegan con el arranque.
3. Instalar la aplicación desde el navegador.
4. **Modo avión.**
5. Abrir la aplicación instalada y hacer un turno completo: hablar, ver la
   corrección, oír la respuesta.
6. Entrar al modo práctica y repetir una frase.

| Qué | Funciona sin red |
|---|---|
| Arranca sin pantalla de error | |
| Transcribe lo que se dice | |
| Corrige la gramática | |
| El tutor responde | |
| Reproduce la frase de referencia | |
| El modo práctica puntúa | |
| El historial de sesiones se conserva | |

**Resultado:** _(rellenar)_

> Si algo falla, ese fallo **es** la evidencia. Anotarlo con lo que se vio en
> pantalla vale más que una tabla toda en verde sin detalle.

---

## 3. Caché de modelos (RF-15)

Con la red de vuelta, abrir las herramientas de desarrollo en la pestaña de red y
recargar la aplicación.

| Medición | Valor |
|---|---|
| Peticiones a Hugging Face | _(el criterio es **cero**)_ |
| Peticiones totales | |
| Tiempo hasta que la aplicación es usable | |

**Resultado:** _(rellenar)_

---

## 4. Máquina limpia (S8-T5)

Lo mismo que la sección 2, en un equipo que nunca haya abierto la aplicación. Si
no hay un segundo equipo, sirve un perfil nuevo del navegador o una ventana de
invitado: lo que importa es que la caché empiece vacía.

| Medición | Valor |
|---|---|
| Tiempo de la descarga inicial | |
| Peso descargado hasta poder hablar | _(esperado ≈ 303 MiB)_ |
| Peso total tras el primer turno | _(esperado ≈ 568 MiB con el tutor)_ |
| Funciona sin conexión después | |

**Resultado:** _(rellenar)_

---

## 5. Conclusión

_(Rellenar tras la sesión: qué requisitos quedan cumplidos, cuáles no y por qué.
Un requisito que no se cumple, medido y explicado, vale más que uno que se declara
cumplido sin haberlo comprobado.)_
