import { useEffect, useMemo, useState } from 'react';
import { createOrchestrator, type OrchestratorState } from '@core/orchestrator';
import { createEventBus } from '@core/eventBus';
import { createMockAudioEngine } from '@mocks/mockAudioEngine';
import { createMockAIPipeline } from '@mocks/mockAIPipeline';
import type { ChatMessage } from '@shared/contracts';

/**
 * App shell (Semana 1-2). Usa el orquestador v0 con mocks:
 * los modulos reales (audio de Fabrizio, IA de Isaac, chat de Monestel)
 * lo iran sustituyendo sin cambiar el flujo.
 */

const LABEL: Record<OrchestratorState, string> = {
  idle: 'Iniciar grabacion (mock)',
  recording: 'Detener y procesar',
  processing: 'Procesando...',
};

export function App() {
  const { bus, orch } = useMemo(() => {
    const bus = createEventBus();
    const orch = createOrchestrator({
      audio: createMockAudioEngine(),
      ai: createMockAIPipeline(),
      bus,
    });
    return { bus, orch };
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<OrchestratorState>('idle');

  useEffect(() => {
    const offMsg = bus.on('message', (e) =>
      setMessages((m) => [...m, e.message])
    );
    const offErr = bus.on('error', (e) =>
      console.error(`[${e.stage}] ${e.error}`)
    );
    return () => {
      offMsg();
      offErr();
    };
  }, [bus]);

  async function onMicClick() {
    const p = orch.toggleMic();
    setState(orch.getState() === 'idle' ? 'processing' : orch.getState());
    await p;
    setState(orch.getState());
  }

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>My Personal English Teacher</h1>
      <p><em>Semana 1-2: orquestador v0 con mocks. Ver docs/ para el plan.</em></p>
      <button onClick={onMicClick} disabled={state === 'processing'}>
        {LABEL[state]}
      </button>
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {messages.map((m) => (
          <li key={m.id} style={{ margin: '0.5rem 0', textAlign: m.role === 'user' ? 'right' : 'left' }}>
            <span style={{
              display: 'inline-block', padding: '0.5rem 0.75rem', borderRadius: 12,
              background: m.role === 'user' ? '#dbeafe' : '#dcfce7',
            }}>
              <strong>{m.role === 'user' ? 'Tu' : 'Tutor'}:</strong> {m.text}
              {m.correction && m.correction.edits.length > 0 && (
                <div style={{ fontSize: '0.85em', marginTop: 4 }}>
                  <s>{m.correction.edits[0].original}</s> {'->'} <b>{m.correction.edits[0].corrected}</b>
                </div>
              )}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
