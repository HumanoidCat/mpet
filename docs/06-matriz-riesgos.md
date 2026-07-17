# Matriz de Riesgos

Probabilidad/Impacto: Alta · Media · Baja. Exposición = P × I. Revisión semanal en la reunión de sprint (dueño: Alejandro).

| ID | Riesgo | Prob. | Impacto | Exposición | Mitigación | Dueño |
|---|---|---|---|---|---|---|
| R01 | Modelos demasiado pesados/lentos en laptops del equipo (inferencia > 5 s) | Media | Alto | 🔴 Alta | Spike en Semana 1 con hardware real; usar variantes quantized (q4/q8); Whisper-tiny en vez de base; WebGPU con fallback WASM | Isaac |
| R02 | Implementación propia de MFCC/YIN incorrecta (base del puntaje de pronunciación) | Media | Alto | 🔴 Alta | Validación contra librosa/Meyda con señales sintéticas conocidas (seno, chirp); pruebas unitarias desde S5 | Fabrizio |
| R03 | Puntaje de pronunciación no correlaciona con percepción real | Alta | Medio | 🔴 Alta | Calibrar con 4 voces del equipo; presentarlo como feedback educativo relativo, no veredicto; documentar limitaciones | Fabrizio |
| R04 | Un integrante se atrasa y bloquea a los demás | Media | Alto | 🔴 Alta | Arquitectura por contratos + mocks (nadie depende del código de otro); revisión de avance 2×/semana; ruta crítica monitoreada | Alejandro |
| R05 | Demo en vivo falla el día de la presentación (permisos mic, red, cache) | Media | Alto | 🔴 Alta | Checklist pre-demo; modelos pre-cacheados; probar en el equipo/aula real; video de respaldo grabado siempre | Todos |
| R06 | Latencia end-to-end del pipeline > 2 s | Alta | Medio | 🟡 Media | Paralelizar etapas; medir por etapa desde S7; si no se logra, documentar métricas y análisis (transparencia técnica) | Isaac |
| R07 | Documento de entrega hecho a última hora, baja calidad (30% de la nota) | Media | Alto | 🔴 Alta | El documento es tarea del sprint con horas asignadas; se inicia el lunes de la semana de entrega −1; revisión cruzada | Alejandro |
| R08 | WER alto con acentos hispanohablantes | Alta | Medio | 🟡 Media | Set de pruebas propio; documentar variabilidad acústica como análisis del curso; frases de práctica guiadas | Isaac |
| R09 | Incompatibilidad de navegador (Safari/Firefox sin WebGPU o AudioWorklet limitado) | Media | Bajo | 🟢 Baja | Chrome como target oficial (lo recomienda el profesor); documentar soporte | Monestel |
| R10 | Conflictos de merge / repo desordenado con 4 personas | Media | Medio | 🟡 Media | Módulos en carpetas separadas, `shared/` solo por PR aprobado por Alejandro, ramas por feature, CI obligatorio | Alejandro |
| R11 | Alcance crece (feature creep) y compromete entregas | Media | Medio | 🟡 Media | Clasificación MVP/V1/Final estricta; feature freeze en S9; toda idea nueva va al backlog, no al sprint | Alejandro |
| R12 | TTS SpeechT5 de baja calidad o pesado para audio de referencia | Media | Medio | 🟡 Media | Spike S4; plan B: grabaciones de referencia pregeneradas para frases de práctica (banco fijo de frases) | Isaac |
| R13 | Pérdida de trabajo (disco, laptop) | Baja | Alto | 🟡 Media | Todo en GitHub, push diario obligatorio; documentos en la nube | Todos |
| R14 | Exámenes/carga académica en semanas de entrega | Media | Medio | 🟡 Media | Buffer integrado (S4 y S10 son semanas ligeras); entregables listos 2 días antes | Todos |
