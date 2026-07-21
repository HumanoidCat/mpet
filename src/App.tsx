import { useEffect, useMemo, useState } from 'react';
import { createOrchestrator, type OrchestratorState } from '@core/orchestrator';
import { createEventBus } from '@core/eventBus';
import { createMockAudioEngine } from '@mocks/mockAudioEngine';
import { createMockAIPipeline } from '@mocks/mockAIPipeline';
import { Chat } from '@ui/chat/Chat';
import { Waveform } from '@ui/visualizer/Waveform';
import type { ChatMessage } from '@shared/contracts';

/**
 * Composicion de la app (Semanas 2-3).
 * Los modulos de audio e IA siguen siendo mocks; se sustituyen por los
 * reales en la integracion S3-T5 cambiando solo estas dos factory calls.
 */

export function App() {
  const { bus, orch, audio } = useMemo(() => {
    const bus = createEventBus();
    const audio = createMockAudioEngine();
    const ai = createMockAIPipeline();
    const orch = createOrchestrator({ audio, ai, bus });
    return { bus, orch, audio };
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<OrchestratorState>('idle');

  useEffect(() => {
    const offMsg = bus.on('message', (e) => setMessages((m) => [...m, e.message]));
    const offErr = bus.on('error', (e) => console.error(`[${e.stage}] ${e.error}`));
    return () => {
      offMsg();
      offErr();
    };
  }, [bus]);

  async function onMicClick() {
    const turn = orch.toggleMic();
    setState(orch.getState() === 'idle' ? 'processing' : orch.getState());
    await turn;
    setState(orch.getState());
  }

  return (
    <main style={{ fontFamily: 'system-ui', maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
      <h1>My Personal English Teacher</h1>
      <p><em>Semana 3: UI + orquestador con mocks. Ver docs/ para el plan.</em></p>
      <Waveform audio={audio} />
      <Chat messages={messages} state={state} onMicClick={onMicClick} />
    </main>
  );
}
