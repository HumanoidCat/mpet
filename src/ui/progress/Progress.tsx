import { Clock, Mic, MessageSquareText, TrendingUp, TrendingDown, Volume2, History } from 'lucide-react';
import type { ChatMessage } from '@shared/contracts';
import { resumirSesion, type SessionSummary } from '@core/sessionStore';

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
 * `history` (S9-T1, RF-23) trae `SessionStore.list()` desde `App.tsx`: la
 * evolución entre sesiones ya no es una línea de tiempo inventada, es la
 * lista real de sesiones guardadas en IndexedDB por `sessionStore.ts`.
 */

interface Props {
  messages?: ChatMessage[];
  /** `SessionStore.list()`, más reciente primero. Incluye la sesión actual. */
  history?: SessionSummary[];
  sessionId?: string;
}

function formatFecha(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

function MetricCard({
  icon: Icon, label, value, color, trend,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color: string;
  /** Diferencia real contra la sesión anterior, o null si no hay con qué comparar. */
  trend?: number | null;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col gap-2 sm:gap-3">
      <div className="flex items-center justify-between">
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center" style={{ background: color + '15' }}>
          <Icon className="w-4 h-4 sm:w-4.5 sm:h-4.5" style={{ color }} />
        </div>
        {trend != null && trend !== 0 && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full ${trend > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend > 0 ? '+' : ''}{trend}
          </div>
        )}
      </div>
      <div>
        <p className="text-xs text-slate-500 mb-1">{label}</p>
        <p className="font-[var(--font-display)] font-extrabold text-xl sm:text-2xl" style={{ color }}>{value}</p>
      </div>
    </div>
  );
}

export default function SummaryScreen({ messages = [], history = [], sessionId }: Props) {
  const resumen = resumirSesion(sessionId ?? 'sesion-actual', messages);

  if (!resumen) {
    return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
        <div className="max-w-4xl mx-auto flex flex-col gap-4 sm:gap-5">
          <div>
            <h2 className="font-[var(--font-display)] font-bold text-base sm:text-lg text-slate-900">Resumen de tu sesión</h2>
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

  // Sesiones anteriores a esta, mas reciente primero (SessionStore.list() ya
  // viene ordenado asi). La actual se muestra aparte, con datos en vivo.
  const previas = history.filter((s) => s.id !== sessionId);
  const anterior = previas[0];
  const delta =
    resumen.pronunciationAvg != null && anterior?.pronunciationAvg != null
      ? Math.round(resumen.pronunciationAvg - anterior.pronunciationAvg)
      : null;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
      <div className="max-w-4xl mx-auto flex flex-col gap-4 sm:gap-5">
        <div>
          <h2 className="font-[var(--font-display)] font-bold text-base sm:text-lg text-slate-900">Resumen de tu sesión</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Resumen de la sesión en curso</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <MetricCard icon={Clock} label="Duración" value={`${durationMin.toFixed(1)} min`} color="#2563EB" />
          <MetricCard icon={Mic} label="Palabras dichas" value={String(resumen.words)} color="#7C3AED" />
          <MetricCard icon={MessageSquareText} label="Turnos" value={String(resumen.userTurns)} color="#0891B2" />
          <MetricCard icon={TrendingUp} label="Frases sin errores" value={`${cleanPct}%`} color="#EA580C" />
          <MetricCard icon={Volume2} label="Pronunciación promedio" value={pronunciationLabel} color="#16A34A" trend={delta} />
          <MetricCard icon={Volume2} label="Mejor / peor" value={bestWorstLabel} color="#16A34A" />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <History className="w-4 h-4 text-slate-500" />
            <h3 className="font-[var(--font-display)] font-bold text-sm text-slate-700">Sesiones anteriores</h3>
            <span className="ml-1 bg-slate-200 text-slate-600 text-xs font-semibold px-2 py-0.5 rounded-full">
              {previas.length}
            </span>
          </div>

          {previas.length === 0 ? (
            <p className="text-xs sm:text-sm text-slate-500">
              Esta es tu primera sesión registrada. La próxima vez que vuelvas vas a poder comparar tu progreso aquí.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {previas.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    <span className="text-xs sm:text-sm text-slate-600 font-mono flex-shrink-0">{formatFecha(s.startedAt)}</span>
                    <span className="text-xs text-slate-400 truncate">{s.userTurns} turnos · {s.words} palabras</span>
                  </div>
                  <span className="font-mono text-xs sm:text-sm font-semibold text-slate-700 flex-shrink-0">
                    {s.pronunciationAvg != null ? `${Math.round(s.pronunciationAvg)}%` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
