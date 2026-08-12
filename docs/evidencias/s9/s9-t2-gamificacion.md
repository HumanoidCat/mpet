# Evidencia S9-T2 — Gamificación ligera (racha y frases dominadas)

> Jose Pablo Monestel (UI) · Opcional
> Reproducible con `npx vitest run tests/ui/gamification.test.ts`.

## Resumen

Tarea opcional del plan semanal, implementada a pedido con dos métricas
derivadas de datos que ya existían — sin agregar ningún campo nuevo a
`sessionStore.ts` (Alejandro, fuera de `src/ui/`).

## 1. Qué se construyó

`src/ui/progress/gamification.ts`:

- **`computeStreak(sessions, ahora)`** — días consecutivos con al menos una
  sesión guardada, contando hacia atrás desde hoy sobre
  `SessionStore.list()` (ya cableado por S9-T1). Con período de gracia
  hasta medianoche: si hoy todavía no se practicó pero ayer sí, la racha
  sigue viva en vez de romperse apenas cambia el día.
- **`countMasteredPhrases(messages)`** — turnos del estudiante con puntaje
  de pronunciación en el nivel "good" (`scoreTier(...) === 'good'`, mismo
  umbral ≥80 de siempre, reutilizado de `pronunciationColor.ts` en vez de
  duplicar el número).

`Progress.tsx` (pantalla Summary) muestra ambas al principio, en una fila de
dos tarjetas (`GamificationRow`), **incluso en el estado vacío** (sin
mensajes todavía en la sesión actual): si el estudiante ya tiene racha de
días anteriores, verla apenas abre la app es justamente el punto de esta
funcionalidad.

## 2. Por qué el total de frases dominadas no vive solo en `messages`

La sesión actual se cuenta en vivo desde `messages` (exacto, sin esperar a
que el guardado en IndexedDB termine). El total de sesiones **anteriores**
no está en `SessionSummary` — esa interfaz deliberadamente no trae los
mensajes completos (S9-T1: "list() no tiene que traer ni recorrer los
mensajes de cada una"). Se agrega con `SessionStore.get(id)` — que **ya
existía** en el contrato, no se agregó nada — pidiendo cada sesión anterior
una por una, y **solo cuando la pantalla Summary está visible**, no en cada
turno del chat. Es la forma de mantenerlo "ligero" como pide el plan: cero
costo mientras se conversa, cálculo una sola vez al mirar el progreso.

## 3. Qué se descartó y por qué

- **Racha récord (mejor racha histórica):** requeriría encontrar la racha
  más larga de todo el historial, no solo la actual — más cálculo por poco
  valor motivacional adicional frente a la racha en curso. Se dejó fuera.
- **Insignias / niveles:** no hay ningún dato real que los respalde sin
  inventar un sistema de puntos arbitrario. El plan pide "ligera"; esto
  hubiera sido lo opuesto.

## 4. Verificación

- `tests/ui/gamification.test.ts` (10 pruebas): racha en cero sin sesiones,
  racha de 1 con una sesión hoy, racha de 3 con tres días seguidos, varias
  sesiones el mismo día cuentan una sola vez, período de gracia (sesión solo
  ayer sigue viva), racha rota (sesión de hace 2+ días sin nada después),
  frases dominadas por umbral y por rol (solo el estudiante).
- Manual, en navegador, modo `?mock=1`: antes del primer turno la pantalla
  mostraba "0 días · Practicá hoy para empezar tu racha" y "0 frases
  dominadas"; tras guardar la primera sesión del día, la racha pasó a "1
  día" y las frases dominadas se mantuvieron en 0 porque el puntaje del
  turno (78) no llega al umbral de 80 — el número no se infla, refleja
  exactamente el dato real.
