# 🎓 My Personal English Teacher (MPET)

PWA **offline** para practicar inglés conversacional aplicando **Señales y Sistemas**:
el usuario habla → la app transcribe (Whisper), corrige gramática (T5), evalúa
pronunciación con análisis de señales (MFCC, pitch YIN, DTW) y responde con voz (TTS).
Toda la IA corre en el navegador con transformers.js (Hugging Face).

**Curso:** Señales y Sistemas · **Clase:** martes 1:00 pm
**Hitos:** Avance 1 → mar 4 ago · Avance 2 → mar 25 ago · Final → mar 15 sep

## Equipo y módulos

| Integrante | Módulo | Carpeta |
|---|---|---|
| Alejandro Zamora | PM + Core/PWA/Integración | `src/core/` |
| Fabrizio | DSP (señales) | `src/audio/` |
| Isaac Morum | IA/ML (transformers.js) | `src/ai/` |
| Monestel | UI/Visualización | `src/ui/` |

👉 **Tu guía personal está en `guias/<tu-nombre>.md`. Léela antes de empezar.**

## Arranque rápido

```bash
git clone <URL-del-repo>
cd mpet
npm install
npm run dev        # abre http://localhost:5173
npm test           # pruebas
```

## Reglas de oro

1. Trabaja SOLO en tu carpeta (`src/<tu-modulo>/`) en tu rama `feat/<modulo>-<tarea>`.
2. `src/shared/` y `package.json` solo se tocan vía PR `shared-change`.
3. Si el módulo de otro no existe aún, usa su mock de `mocks/`.
4. PR a `dev` con CI verde + 1 revisión. Nunca push directo a `main` o `dev`.
5. Push diario aunque esté incompleto (en tu rama).

## Documentación

Toda la planificación está en [`docs/`](docs/README.md): backlog, WBS, plan semanal,
roadmap, matriz de riesgos y matriz de trazabilidad.
