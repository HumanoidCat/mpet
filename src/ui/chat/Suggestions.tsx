import { Lightbulb, MessageCircle } from 'lucide-react';
import type { ChatMessage } from '@shared/contracts';

/**
 * Pantalla standalone de Suggestions (limpieza de datos falsos, S6-T3+).
 * Dueño: Monestel (UI).
 *
 * Conectada a `ChatMessage.suggestions` real (`AIPipeline.suggest()` vía el
 * orquestador). Ya no usa las sugerencias con categoría/prioridad/ejemplos
 * escritas a mano del prototipo de Figma Make: ese detalle no existe en el
 * contrato, que solo trae texto libre por turno.
 *
 * `suggest()` real (Isaac, pendiente S6-T4) hoy devuelve `[]` siempre, así
 * que el estado vacío es lo normal por ahora y no un error: en cuanto se
 * implemente, esta pantalla se llena sola sin cambios aquí.
 */

interface Props {
  messages?: ChatMessage[];
}

export default function SuggestionsScreen({ messages = [] }: Props) {
  const withSuggestions = messages.filter(
    (m): m is ChatMessage & { suggestions: string[] } =>
      m.role === 'user' && !!m.suggestions && m.suggestions.length > 0
  );
  const total = withSuggestions.reduce((n, m) => n + m.suggestions.length, 0);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
      <div className="max-w-3xl mx-auto flex flex-col gap-4 sm:gap-5">
        <div>
          <h2 className="font-[var(--font-display)] font-bold text-base sm:text-lg text-slate-900">Sugerencias</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {total} {total === 1 ? 'sugerencia' : 'sugerencias'} en esta sesión
          </p>
        </div>

        {withSuggestions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
            <Lightbulb className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-500">Todavía no hay sugerencias en esta sesión</p>
            <p className="text-xs text-slate-400 mt-1">Habla en la pestaña Chat para ver aquí sugerencias reales.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {withSuggestions
              .slice()
              .reverse()
              .map((m) => (
                <div key={m.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
                  <div className="flex items-start gap-2 mb-3">
                    <MessageCircle className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-slate-700 italic">"{m.text}"</p>
                  </div>
                  <ul className="flex flex-col gap-2">
                    {m.suggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 rounded-xl px-3 py-2.5 bg-blue-50 border border-blue-100">
                        <Lightbulb className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-600" />
                        <p className="text-sm text-slate-700">{s}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
