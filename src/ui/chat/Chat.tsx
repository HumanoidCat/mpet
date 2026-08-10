import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Clock, AlertCircle, Play, Gauge, ChevronDown } from 'lucide-react';
import type { AudioEngine, ChatMessage } from '@shared/contracts';
import type { OrchestratorState } from '@core/orchestrator';
import { buildSegments, buildPronunciationSegments } from './highlight';
import { scoreColor } from '@ui/feedback/pronunciationColor';
import { TYPE_LABEL } from '@ui/feedback/editTypeLabel';
import { Waveform } from '@ui/visualizer/Waveform';

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
  /**
   * Motor de audio real, opcional — solo para mostrar la onda en vivo
   * mientras se graba. Si App.tsx (Alejandro) todavía no lo pasa, el
   * Chat funciona igual, solo sin esa onda.
   */
  audio?: AudioEngine;
  /**
   * Reproduce texto con AIPipeline.speak(). Opcional: si App.tsx no lo
   * conecta todavia, los botones Play/Slow quedan deshabilitados en vez
   * de simular audio falso.
   */
  onPlay?: (text: string, slow: boolean) => void;
}

export function Chat({ messages, state, onMicClick, audio, onPlay }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [openExplanation, setOpenExplanation] = useState<string | null>(null);

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
          // El puntaje colorea palabra por palabra, pero solo cuando no hay
          // correccion de gramatica que mostrar: los segmentos de correccion
          // pueden reemplazar palabras (largo distinto al original), y mezclar
          // los dos esquemas de color en la misma burbuja confundiria mas de lo
          // que informa.
          const hasPronunciation =
            isUser && !hasCorrection && !!m.pronunciation && m.pronunciation.words.length > 0;
          const explanationOpen = openExplanation === m.id;

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
                    : hasPronunciation
                      ? /* Puntaje de pronunciacion (S6-T3): subrayado por palabra,
                           verde/amarillo/rojo segun WordScore.score. */
                        buildPronunciationSegments(m.text, m.pronunciation!.words).map((s, i) => (
                          <span
                            key={i}
                            className="underline decoration-2 underline-offset-2"
                            style={{
                              textDecorationColor: s.score != null ? scoreColor(s.score) : 'transparent',
                            }}
                          >
                            {s.text}{' '}
                          </span>
                        ))
                      : m.text}
                </div>

                {hasPronunciation && (
                  <div
                    className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border"
                    style={{
                      color: scoreColor(m.pronunciation!.overall),
                      background: scoreColor(m.pronunciation!.overall) + '15',
                      borderColor: scoreColor(m.pronunciation!.overall) + '40',
                    }}
                  >
                    Puntaje de pronunciación: {Math.round(m.pronunciation!.overall)}
                  </div>
                )}

                {/* Play / Slow: llaman a AIPipeline.speak() real via onPlay. Si no hay
                    onPlay (TTS aun no integrado a la UI), quedan deshabilitados en vez
                    de simular audio. */}
                <div className="flex items-center gap-3 px-1">
                  <button
                    onClick={() => onPlay?.(m.text, false)}
                    disabled={!onPlay}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 disabled:opacity-40 disabled:hover:text-slate-500"
                  >
                    <Play className="w-3 h-3" /> Escuchar
                  </button>
                  <button
                    onClick={() => onPlay?.(m.text, true)}
                    disabled={!onPlay}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 disabled:opacity-40 disabled:hover:text-slate-500"
                  >
                    <Gauge className="w-3 h-3" /> Despacio
                  </button>

                  {hasCorrection && (
                    <button
                      onClick={() => setOpenExplanation(explanationOpen ? null : m.id)}
                      className="flex items-center gap-1 text-xs text-blue-600 font-medium"
                    >
                      Ver explicación
                      <ChevronDown className={`w-3 h-3 transition-transform ${explanationOpen ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                </div>

                {hasCorrection && (
                  <div className="flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-lg border border-orange-200">
                    <AlertCircle className="w-3 h-3" />
                    Correccion de gramatica disponible
                  </div>
                )}

                {/* Detalle de la correccion: cada Edit real del contrato, sin datos inventados */}
                {hasCorrection && explanationOpen && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-xs text-slate-700 flex flex-col gap-1 max-w-full">
                    <p className="font-medium text-slate-800">{m.correction!.corrected}</p>
                    {m.correction!.edits.map((e, i) => (
                      <p key={i} className="text-slate-500">
                        <span className="line-through text-red-500">{e.original}</span>
                        {' → '}
                        <span className="font-medium text-emerald-600">{e.corrected}</span>
                        <span className="text-slate-400"> ({TYPE_LABEL[e.type]})</span>
                      </p>
                    ))}
                  </div>
                )}

                {/* Las sugerencias las adjunta el orquestador al mensaje del
                    ESTUDIANTE (userMsg en orchestrator.ts), no al del tutor:
                    son sobre lo que el estudiante dijo. Antes este chip
                    comprobaba !isUser y nunca se mostraba con datos reales. */}
                {isUser && Array.isArray(m.suggestions) && m.suggestions.length > 0 && (
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

      {/* Onda en vivo (real, via AudioEngine.onFrame) mientras se graba —
          solo si App.tsx conecta el motor de audio real */}
      {state === 'recording' && audio && (
        <div className="px-3 sm:px-6 pb-2">
          <div className="rounded-xl overflow-hidden bg-[#0b1220]">
            <Waveform audio={audio} width={640} height={64} />
          </div>
        </div>
      )}

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
