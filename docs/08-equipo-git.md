# Equipo, División de Trabajo y Flujo Git

## 1. Asignación (sin dependencias cruzadas)

| Integrante | Rol | Módulo (carpeta propia) | Épicas | % del código |
|---|---|---|---|---|
| **Alejandro Zamora** | PM + Integración/PWA | `src/core/` | E1, coordina E5/E6 | ~20% + gestión |
| **Fabrizio** | Ingeniero DSP | `src/audio/` | E2 | ~30% (ruta crítica) |
| **Isaac Morum** | Ingeniero IA/ML | `src/ai/` | E3 | ~30% |
| **Monestel** | Frontend/Visualización | `src/ui/` | E4 | ~20% + QA de UI |

**Cómo se logra que nadie dependa de nadie:**

1. Los contratos de `src/shared/contracts.ts` se definen en la Semana 1 entre los 4 y se congelan. Cambiarlos requiere PR aprobado por Alejandro + el afectado.
2. Cada módulo tiene su mock en `mocks/`. Ejemplos: Monestel desarrolla el espectrograma con frames sintéticos (chirp generado por código) sin esperar el DSP real; Isaac prueba su pipeline con archivos WAV pregrabados sin esperar la captura; Fabrizio valida MFCC con señales sintéticas sin necesitar UI.
3. La integración real la hace Alejandro al final de cada sprint (tareas de orquestador), sustituyendo mocks por módulos reales uno a uno.
4. Documento de entregas: cada quien escribe la sección de su módulo; Alejandro integra y homogeneiza.

## 2. Flujo Git

- **Ramas:** `main` (protegida, solo por PR con CI verde) ← `dev` ← `feat/<modulo>-<descripcion>` (ej. `feat/audio-yin-pitch`).
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`). Push diario mínimo (mitiga R13).
- **PRs:** revisor asignado (rotativo), CI obligatorio (lint + tests + build). Nadie mergea su propio PR sin revisión.
- **Reglas anticonflicto:** cada quien toca solo su carpeta; `src/shared/` y `package.json` solo vía PR etiquetado `shared-change` aprobado por Alejandro.
- **Tablero:** GitHub Projects con columnas Backlog → Sprint → In Progress → Review → Done; issues etiquetados por semana (`sprint-1`…`sprint-10`).

## 3. Ritmo de trabajo (clase: martes 1:00 pm, se muestra avance semanal)

- **Lunes (noche):** `dev` estable + mini-ensayo de lo que se muestra el martes en clase; reunión de sprint (30 min): asignar tareas, actualizar riesgos.
- **Martes (después de clase):** retro de 15 min — feedback del profesor entra al backlog y, si aplica, se ajustan documentos.
- **Jueves:** check-in corto (15 min, chat): bloqueos y ruta crítica.
- **Viernes de semanas 3, 6 y 9:** code freeze parcial para preparar entregas (Avances son martes 4 ago, 25 ago y 15 sep).
- Carga objetivo: ~7–8 h/persona/semana (pico ~9 h en semanas de entrega).

## 4. Definition of Done (por tarea)

Código en PR mergeado con CI verde + prueba unitaria si aplica + mock actualizado si cambió el contrato + entrada en matriz de trazabilidad si completa un requisito + evidencia (captura/video/tabla) guardada en `docs/evidencias/sX/`.
