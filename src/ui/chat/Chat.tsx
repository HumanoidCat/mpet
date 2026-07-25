import { useEffect, useRef } from 'react';
import { Mic, Square, Clock, AlertCircle } from 'lucide-react';
import type { ChatMessage } from '@shared/contracts';
import type { OrchestratorState } from '@core/orchestrator';
import { buildSegments } from './highlight';

/**
 * Chat de conversacion (S2-T6 + S3-T4).
 * Dueño: Monestel (UI). Diseño visual portado desde Figma Make;
 * la logica (props, buildSegments) viene del contrato real — NO usa
 * datos falsos ni simula el mic con setTimeout como el prototipo original.
 */

const HINT: Record<OrchestratorState, string> = {
  idle: 'Presiona el microfono para empezar',
  recording: 'Escuchando... presiona de nuevo para corregir',
  processing: 'Analizando tu frase...',
};

interface Props {
  messages: ChatMessage[];
  state: OrchestratorState;
  onMicClick: () => void;
}

export function Chat({ messages, state, onMicClick }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  return (
    <section aria-label="Conversacion" className="flex flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-5 flex flex-col gap-3 sm:gap-4">
        {messages.length === 0 && (
          <p className="text-sm text-[var(--color-muted)] text-center mt-8">
            Tu conversacion aparecera aqui. Presiona el microfono para empezar.
          </p>
        )}

        {messages.map((m) => {
          const isUser = m.role === 'user';
          const hasCorrection = isUser && !!m.correction && m.correction.edits.length > 0;

          return (
            <div key={m.id} className={`flex gap-2 sm:gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
              {!isUser && (
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0 mt-1">
                  <span className="text-white text-[10px] font-bold">AI</span>
                </div>
              )}

              <div className={`flex flex-col gap-1.5 max-w-[80%] sm:max-w-[72%] ${isUser ? 'items-end' : 'items-start'}`}>
                <div
                  className={`rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 text-sm leading-relaxed ${
                    isUser ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-slate-100 text-slate-800 rounded-tl-sm'
                  }`}
                >
                  {/* Highlights de gramatica (S3-T4): usa los edits reales, no negritas fijas */}
                  {hasCorrection
                    ? buildSegments(m.text, m.correction!.edits).map((s, i) => {
                        if (s.kind === 'error')
                          return (
                            <s key={i} className="text-red-200 decoration-red-200">
                              {s.text}{' '}
                            </s>
                          );
                        if (s.kind === 'fix')
                          return (
                            <b key={i} className="font-semibold text-emerald-100">
                              {s.text}{' '}
                            </b>
                          );
                        return <span key={i}>{s.text} </span>;
                      })
                    : m.text}
                </div>

                {hasCorrection && (
                  <div className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-lg border border-orange-200">
                    <AlertCircle className="w-3 h-3" />
                    Correccion de gramatica disponible
                  </div>
                )}

                {!isUser && Array.isArray(m.suggestions) && m.suggestions.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {m.suggestions.map((s, i) => (
                      <span key={i} className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                        {s}
                      </span>
                    ))}
                  </div>
                )}

                <div className={`flex items-center gap-1 text-xs text-slate-400 ${isUser ? 'flex-row-reverse' : ''}`}>
                  <Clock className="w-3 h-3" />
                  {new Date(m.ts).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          );
        })}

        {state === 'processing' && (
          <div className="flex gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[10px] font-bold">AI</span>
            </div>
            <div className="bg-slate-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
              {[0, 150, 300].map((d) => (
                <div key={d} className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Controles: onMicClick real, sin simulacion */}
      <div className="px-3 sm:px-6 py-4 sm:py-5 border-t border-slate-200 bg-white flex flex-col items-center gap-3 sm:gap-4">
        <p className="text-xs sm:text-sm font-medium text-slate-500 text-center">
          {state === 'recording' ? (
            <span className="text-red-600 flex items-center gap-2 justify-center">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
              {HINT[state]}
            </span>
          ) : (
            HINT[state]
          )}
        </p>

        <div className="relative">
          {state === 'recording' && (
            <>
              <div className="absolute inset-0 rounded-full bg-red-400 pulse-ring" />
              <div className="absolute inset-0 rounded-full bg-red-300 pulse-ring" style={{ animationDelay: '0.6s' }} />
            </>
          )}
          <button
            onClick={onMicClick}
            disabled={state === 'processing'}
            aria-label={HINT[state]}
            className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 ${
              state === 'recording'
                ? 'bg-red-500 hover:bg-red-600 shadow-red-200'
                : state === 'processing'
                  ? 'bg-slate-300 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 hover:scale-105 shadow-blue-200'
            }`}
          >
            {state === 'recording' ? (
              <Square className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
            ) : (
              <Mic className="w-7 h-7 sm:w-8 sm:h-8 text-white" />
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
