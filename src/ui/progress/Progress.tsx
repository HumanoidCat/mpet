import { Clock, Mic, MessageSquareText, TrendingUp, Volume2 } from 'lucide-react';
import type { ChatMessage } from '@shared/contracts';
import { resumirSesion } from '@core/sessionStore';

/**
 * Pantalla standalone de Session Summary (limpieza de datos falsos, S6-T3+).
 * Dueño: Monestel (UI).
 *
 * Muestra el resumen REAL de la sesión en curso con `resumirSesion`
 * (Alejandro, S5-T6) — la misma función pura que ya usa `sessionStore` para
 * persistir en IndexedDB. Ya no usa el ejemplo fijo del prototipo de Figma
 * Make: título/fecha inventados, "Grammar/Fluency/Vocabulary %" que no
 * existen como métricas reales, errores más comunes, línea de tiempo de la
 * sesión y recomendaciones de IA — nada de eso tiene un dato real detrás hoy.
 *
 * La evolución del puntaje ENTRE sesiones (S9-T1, RF-23) queda pendiente:
 * requiere que `App.tsx` exponga `SessionStore.list()` a esta pantalla, y
 * hoy solo se guarda al cerrar sin leerse de vuelta. Aquí solo se cubre la
 * sesión actual, que sí tiene datos reales completos vía `messages`.
 */

interface Props {
  messages?: ChatMessage[];
}

function MetricCard({
  icon: Icon, label, value, color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col gap-2 sm:gap-3">
      <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center" style={{ background: color + '15' }}>
        <Icon className="w-4 h-4 sm:w-4.5 sm:h-4.5" style={{ color }} />
      </div>
      <div>
        <p className="text-xs text-slate-500 mb-1">{label}</p>
        <p className="font-[var(--font-display)] font-extrabold text-xl sm:text-2xl" style={{ color }}>{value}</p>
      </div>
    </div>
  );
}

export default function SummaryScreen({ messages = [] }: Props) {
  const resumen = resumirSesion('sesion-actual', messages);

  if (!resumen) {
    return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
        <div className="max-w-4xl mx-auto flex flex-col gap-4 sm:gap-5">
          <div>
            <h2 className="font-[var(--font-display)] font-bold text-base sm:text-lg text-slate-900">Session Summary</h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Resumen de tu sesión actual</p>
          </div>
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
            <MessageSquareText className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-500">Todavía no hay nada que resumir</p>
            <p className="text-xs text-slate-400 mt-1">Habla en la pestaña Chat para ver aquí el resumen real.</p>
          </div>
        </div>
      </div>
    );
  }

  const durationMin = Math.max(0, (resumen.endedAt - resumen.startedAt) / 60000);
  const cleanTurns = resumen.userTurns - resumen.correctedTurns;
  const cleanPct = Math.round((cleanTurns / resumen.userTurns) * 100);
  const pronunciationLabel =
    resumen.pronunciationAvg != null ? `${Math.round(resumen.pronunciationAvg)}%` : '—';
  const bestWorstLabel =
    resumen.pronunciationBest != null
      ? `${Math.round(resumen.pronunciationBest)} / ${Math.round(resumen.pronunciationWorst!)}`
      : '—';

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
      <div className="max-w-4xl mx-auto flex flex-col gap-4 sm:gap-5">
        <div>
          <h2 className="font-[var(--font-display)] font-bold text-base sm:text-lg text-slate-900">Session Summary</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Resumen de la sesión en curso</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <MetricCard icon={Clock} label="Duration" value={`${durationMin.toFixed(1)} min`} color="#2563EB" />
          <MetricCard icon={Mic} label="Words Spoken" value={String(resumen.words)} color="#7C3AED" />
          <MetricCard icon={MessageSquareText} label="Turns" value={String(resumen.userTurns)} color="#0891B2" />
          <MetricCard icon={TrendingUp} label="Clean Sentences" value={`${cleanPct}%`} color="#EA580C" />
          <MetricCard icon={Volume2} label="Pronunciation Avg" value={pronunciationLabel} color="#16A34A" />
          <MetricCard icon={Volume2} label="Best / Worst" value={bestWorstLabel} color="#16A34A" />
        </div>

        <div className="bg-slate-50 rounded-2xl border border-dashed border-slate-300 p-4 sm:p-5 text-center">
          <p className="text-xs sm:text-sm text-slate-500">
            Próximamente: la evolución de tu puntaje entre sesiones, con el historial de conversaciones anteriores.
          </p>
        </div>
      </div>
    </div>
  );
}
