import type { ChatMessage } from '@shared/contracts';
import type { OrchestratorState } from '@core/orchestrator';
import { buildSegments } from './highlight';

/**
 * Chat de conversacion (S2-T6 + S3-T4).
 * Duenio actual: Alejandro (modulo UI asumido por baja del integrante).
 *
 * Componente presentacional: recibe mensajes y estado por props,
 * no conoce al orquestador ni a los modulos de audio/IA.
 */

const MIC_LABEL: Record<OrchestratorState, string> = {
  idle: 'Hablar',
  recording: 'Detener y corregir',
  processing: 'Procesando...',
};

const MIC_COLOR: Record<OrchestratorState, string> = {
  idle: '#2563eb',
  recording: '#dc2626',
  processing: '#9ca3af',
};

interface Props {
  messages: ChatMessage[];
  state: OrchestratorState;
  onMicClick: () => void;
}

export function Chat({ messages, state, onMicClick }: Props) {
  return (
    <section aria-label="Conversacion">
      <ul style={{ listStyle: 'none', padding: 0, minHeight: 120 }}>
        {messages.map((m) => (
          <li
            key={m.id}
            style={{ margin: '0.5rem 0', textAlign: m.role === 'user' ? 'right' : 'left' }}
          >
            <span
              style={{
                display: 'inline-block',
                padding: '0.5rem 0.75rem',
                borderRadius: 12,
                maxWidth: '85%',
                background: m.role === 'user' ? '#dbeafe' : '#dcfce7',
              }}
            >
              <strong>{m.role === 'user' ? 'Tu' : 'Tutor'}:</strong>{' '}
              {m.role === 'user' && m.correction && m.correction.edits.length > 0
                ? buildSegments(m.text, m.correction.edits).map((s, i) => {
                    if (s.kind === 'error')
                      return (
                        <s key={i} style={{ color: '#dc2626', marginRight: 4 }}>
                          {s.text}
                        </s>
                      );
                    if (s.kind === 'fix')
                      return (
                        <b key={i} style={{ color: '#16a34a', marginRight: 4 }}>
                          {s.text}
                        </b>
                      );
                    return (
                      <span key={i} style={{ marginRight: 4 }}>
                        {s.text}
                      </span>
                    );
                  })
                : m.text}
            </span>
          </li>
        ))}
      </ul>
      <button
        onClick={onMicClick}
        disabled={state === 'processing'}
        style={{
          padding: '0.75rem 1.5rem',
          fontSize: '1rem',
          borderRadius: 999,
          border: 'none',
          color: 'white',
          cursor: state === 'processing' ? 'wait' : 'pointer',
          background: MIC_COLOR[state],
        }}
      >
        {MIC_LABEL[state]}
      </button>
    </section>
  );
}
