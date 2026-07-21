import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@shared/contracts';
import type { OrchestratorState } from '@core/orchestrator';
import { buildSegments } from './highlight';

/**
 * Chat de conversacion (S2-T6 + S3-T4).
 * Duenio actual: Alejandro (modulo UI asumido).
 * Componente presentacional: recibe todo por props.
 */

const HINT: Record<OrchestratorState, string> = {
  idle: 'Presiona y habla en ingles',
  recording: 'Escuchando... presiona de nuevo para corregir',
  processing: 'Analizando tu frase...',
};

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3z" />
      <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-2.08A7 7 0 0 0 19 11z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

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
    <section aria-label="Conversacion">
      <div className="chat-scroll" ref={scrollRef}>
        <ul className="chat-list">
          {messages.length === 0 && (
            <li className="chat-empty">
              Tu conversacion aparecera aqui. Presiona el microfono para empezar.
            </li>
          )}
          {messages.map((m) => (
            <li key={m.id} className={`msg ${m.role}`}>
              <span className="bubble">
                <span className="who">{m.role === 'user' ? 'Tu' : 'Tutor'}</span>
                {m.role === 'user' && m.correction && m.correction.edits.length > 0
                  ? buildSegments(m.text, m.correction.edits).map((s, i) => {
                      if (s.kind === 'error')
                        return (
                          <s key={i} className="word-error">
                            {s.text}
                          </s>
                        );
                      if (s.kind === 'fix')
                        return (
                          <b key={i} className="word-fix">
                            {s.text}
                          </b>
                        );
                      return <span key={i}>{s.text} </span>;
                    })
                  : m.text}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="mic-row">
        <button
          className={`mic-btn ${state === 'recording' ? 'recording' : ''}`}
          onClick={onMicClick}
          disabled={state === 'processing'}
          aria-label={HINT[state]}
        >
          {state === 'recording' ? <StopIcon /> : <MicIcon />}
        </button>
        <span className="mic-hint">{HINT[state]}</span>
      </div>
    </section>
  );
}
