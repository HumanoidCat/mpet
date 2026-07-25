import { useEffect, useMemo, useState } from 'react';
import { createOrchestrator, type OrchestratorState } from '@core/orchestrator';
import { createEventBus } from '@core/eventBus';
import { createDemoMicEngine } from '@mocks/demoMicEngine';
import { createMockAIPipeline } from '@mocks/mockAIPipeline';
import { Chat } from '@ui/chat/Chat';
import { VisualizerScreen } from '@ui/visualizer/VisualizerScreen';
import SplashScreen, { type ModelStatus } from '@ui/shell/Splash';
import Header from '@ui/shell/Header';
import Sidebar from '@ui/shell/Sidebar';
import Footer from '@ui/shell/Footer';
import PronunciationScreen from '@ui/feedback/Pronunciation';
import GrammarScreen from '@ui/feedback/Grammar';
import SuggestionsScreen from '@ui/chat/Suggestions';
import SummaryScreen from '@ui/progress/Progress';
import ModelsScreen from '@ui/shell/Models';
import type { ChatMessage } from '@shared/contracts';

export type Screen =
  | 'splash'
  | 'chat'
  | 'visualizer'
  | 'pronunciation'
  | 'grammar'
  | 'suggestions'
  | 'summary'
  | 'models';

export function App() {
  const { bus, orch, audio } = useMemo(() => {
    const bus = createEventBus();
    const audio = createDemoMicEngine();
    const ai = createMockAIPipeline();
    const orch = createOrchestrator({ audio, ai, bus });
    return { bus, orch, audio };
  }, []);

  // ── Carga de modelos (Splash) ──────────────────────────────────
  const [models, setModels] = useState<Record<string, number>>({});
  const [modelsReady, setModelsReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('splash');

  useEffect(() => {
    const off = bus.on('model-progress', (e) => {
      setModels((m) => ({ ...m, [e.model]: e.progress }));
    });
    orch.init().then(() => setModelsReady(true));
    return off;
  }, [bus, orch]);

  const modelList: ModelStatus[] = Object.entries(models).map(([name, progress]) => ({
    name,
    size: '', // el AIPipeline real (Isaac) todavía no reporta tamaño; se agrega cuando exista
    progress,
  }));
  const overallProgress = modelList.length
    ? modelList.reduce((sum, m) => sum + m.progress, 0) / modelList.length
    : 0;

  // ── Chat / orquestador ──────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<OrchestratorState>('idle');
  const [micError, setMicError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

  function handleNavigate(s: Screen) {
    setScreen(s);
    setSidebarOpen(false);
  }

  if (screen === 'splash') {
    return (
      <SplashScreen
        models={modelList}
        overallProgress={overallProgress}
        ready={modelsReady}
        onReady={() => setScreen('chat')}
      />
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-[var(--color-surface)]">
      <Header
        micActive={state === 'recording'}
        processingState={state === 'recording' ? 'listening' : state === 'processing' ? 'processing' : 'idle'}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar: drawer en mobile/tablet, fija en desktop (lg+) */}
        <div
          className={`fixed inset-y-0 left-0 z-50 lg:static lg:z-auto transition-transform duration-200 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          <Sidebar active={screen} onNavigate={handleNavigate} />
        </div>
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 flex flex-col overflow-hidden">
          {micError && (
            <p className="text-[var(--color-danger)] text-xs px-4 py-2 bg-[var(--color-danger-light)]">
              {micError}
            </p>
          )}

          {screen === 'chat' && <Chat messages={messages} state={state} onMicClick={onMicClick} />}
          {screen === 'visualizer' && <VisualizerScreen audio={audio} />}
          {screen === 'pronunciation' && <PronunciationScreen />}
          {screen === 'grammar' && <GrammarScreen />}
          {screen === 'suggestions' && <SuggestionsScreen />}
          {screen === 'summary' && <SummaryScreen />}
          {screen === 'models' && <ModelsScreen />}
        </main>
      </div>

      <Footer currentScreen={screen} onNavigate={handleNavigate} />
    </div>
  );
}
