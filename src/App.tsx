import { useEffect, useMemo, useState } from 'react';
import { createOrchestrator, type OrchestratorState } from '@core/orchestrator';
import { createEventBus } from '@core/eventBus';
import { createDemoMicEngine } from '@mocks/demoMicEngine';
import { createMockAIPipeline } from '@mocks/mockAIPipeline';
import { Chat } from '@ui/chat/Chat';
import { Waveform } from '@ui/visualizer/Waveform';
import type { ChatMessage } from '@shared/contracts';

/**
 * Composicion de la app (Semanas 2-3).
 * Audio: microfono real (adaptador de demo) — el modulo DSP completo de
 * Fabrizio lo sustituye en S3-T5. IA: mock — el pipeline real de Isaac
 * lo sustituye en S3-T5. Solo cambian estas factory calls.
 */

export function App() {
  const { bus, orch, audio } = useMemo(() => {
    const bus = createEventBus();
    const audio = createDemoMicEngine();
    const ai = createMockAIPipeline();
    const orch = createOrchestrator({ audio, ai, bus });
    return { bus, orch, audio };
  }, []);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<OrchestratorState>('idle');
  const [micError, setMicError] = useState<string | null>(null);

  useEffect(() => {
    const offMsg = bus.on('message', (e) => setMessages((m) => [...m, e.message]));
    const offErr = bus.on('error', (e) => console.error(`[${e.stage}] ${e.error}`));
    return () => {
      offMsg();
      offErr();
    };
  }, [bus]);

  async function onMicClick() {
    setMicError(null);
    try {
      const turn = orch.toggleMic();
      setState(orch.getState() === 'idle' ? 'processing' : orch.getState());
      await turn;
    } catch {
      setMicError('No se pudo acceder al microfono. Revisa los permisos del navegador.');
    } finally {
      setState(orch.getState());
    }
  }

  return (
    <div className="app">
      <div className="card">
        <header className="app-header">
          <h1>My Personal English Teacher</h1>
          <span className="badge">Avance 1 - en desarrollo</span>
        </header>
        <p className="tagline">
          Practica ingles conversacional con correccion de pronunciacion y gramatica.
          Todo el procesamiento ocurre en tu navegador.
        </p>
        <div className="wave-panel">
          <p className="wave-label">Senal del microfono - dominio del tiempo</p>
          <Waveform audio={audio} />
        </div>
        {micError && <p style={{ color: '#dc2626', fontSize: '0.85rem' }}>{micError}</p>}
        <Chat messages={messages} state={state} onMicClick={onMicClick} />
      </div>
    </div>
  );
}
