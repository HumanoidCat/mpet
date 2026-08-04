import { useEffect, useMemo, useState } from 'react';
import { createOrchestrator, type OrchestratorState } from '@core/orchestrator';
import { createEventBus } from '@core/eventBus';
import { createMockAudioEngine } from '@mocks/mockAudioEngine';
import { createMockAIPipeline } from '@mocks/mockAIPipeline';
import { createAIPipeline } from '@ai/createAIPipeline';
import { createDspAudioEngine } from '@core/audioEngineAdapter';
import { createPronunciationScorer } from '@audio/comparator/scorer';
import { createMockScorer } from '@mocks/mockScorer';
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
import { SAMPLE_RATE } from '@shared/constants';
import type { AIPipeline, ChatMessage } from '@shared/contracts';

/**
 * S3-T5 · Integracion de modulos reales. Duenio: Alejandro.
 *
 * MODO DE EJECUCION, elegible por URL sin recompilar:
 *   (por defecto)  pipeline de IA REAL — Whisper-tiny + T5 cuantizado en workers
 *   ?mock=1        pipeline simulado — sin descargas, respuestas fijas
 *
 * El modo simulado es el plan de contingencia de la demostracion: la primera
 * carga descarga ~279 MB de modelos y en una red lenta puede no completarse.
 * Con `?mock=1` la aplicacion se muestra igual con datos de ejemplo. Es una
 * decision declarada, no un maquillaje: el badge de la cabecera lo indica.
 *
 * AUDIO: en modo normal usa el modulo DSP real (captura con AudioWorklet,
 * decimacion con anti-aliasing, pasa-banda de voz, normalizacion y FFT propia)
 * a traves de `createDspAudioEngine`. En modo simulado usa el motor simulado de
 * `mocks/`, que genera una senal sintetica y no pide permisos de microfono.
 */
/** Velocidad de la reproduccion lenta: suficiente para distinguir fonemas. */
const SLOW_RATE = 0.7;

function useMockMode(): boolean {
  return new URLSearchParams(window.location.search).get('mock') === '1';
}

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
  const mockMode = useMockMode();

  const { bus, orch, audio, ai } = useMemo(() => {
    const bus = createEventBus();
    const audio = mockMode ? createMockAudioEngine() : createDspAudioEngine();
    const ai: AIPipeline = mockMode ? createMockAIPipeline() : createAIPipeline();
    const scorer = mockMode ? createMockScorer() : createPronunciationScorer();
    const orch = createOrchestrator({ audio, ai, bus, scorer });
    return { bus, orch, audio, ai };
  }, [mockMode]);

  // ── Carga de modelos (Splash) ──────────────────────────────────
  const [models, setModels] = useState<Record<string, number>>({});
  const [modelsReady, setModelsReady] = useState(false);
  const [screen, setScreen] = useState<Screen>('splash');

  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const off = bus.on('model-progress', (e) => {
      setModels((m) => ({ ...m, [e.model]: e.progress }));
    });
    setLoadError(null);
    orch
      .init()
      .then(() => setModelsReady(true))
      // Si la descarga falla (red caida, cuota de almacenamiento), la aplicacion
      // no puede quedarse colgada en la pantalla de carga: se informa y se ofrece
      // el modo simulado, que no requiere descargas.
      .catch((err: unknown) =>
        setLoadError(err instanceof Error ? err.message : String(err))
      );
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
  const [playError, setPlayError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    // El puntaje de pronunciacion llega despues del turno y vuelve a emitir el
    // mismo mensaje con el mismo `id`. Por eso se actualiza en vez de agregar:
    // si no, cada mensaje puntuado aparecería dos veces en el chat.
    const offMsg = bus.on('message', (e) =>
      setMessages((m) => {
        const i = m.findIndex((msg) => msg.id === e.message.id);
        if (i === -1) return [...m, e.message];
        const next = m.slice();
        next[i] = e.message;
        return next;
      })
    );
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

  /**
   * Reproduce una frase con la voz sintetizada (S5-T5, Isaac).
   *
   * POR QUE `slow` NO TOCA EL CONTRATO
   * `AIPipeline.speak(text)` devuelve el PCM de referencia y no recibe velocidad,
   * a proposito: la velocidad de reproduccion es una decision de presentacion, no
   * del modelo. Se resuelve aqui cambiando `playbackRate` del nodo de audio, que
   * ademas conserva el mismo PCM que consumira el comparador de pronunciacion.
   * Asi no hace falta un `shared-change` sobre los contratos congelados.
   *
   * El PCM viene a 16 kHz mono, que es el rate de todo el proyecto.
   */
  async function onPlay(text: string, slow: boolean) {
    setPlayError(null);
    try {
      const pcm = await ai.speak(text);
      if (pcm.length === 0) return;

      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      const buffer = ctx.createBuffer(1, pcm.length, SAMPLE_RATE);
      // `getChannelData().set()` en vez de `copyToChannel()`: el PCM del worker
      // puede venir respaldado por un SharedArrayBuffer y la firma de
      // `copyToChannel` solo acepta ArrayBuffer.
      buffer.getChannelData(0).set(pcm);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = slow ? SLOW_RATE : 1;
      source.connect(ctx.destination);
      source.onended = () => void ctx.close();
      source.start();
    } catch (err) {
      setPlayError(
        err instanceof Error ? err.message : 'No se pudo reproducir la frase.'
      );
    }
  }

  function handleNavigate(s: Screen) {
    setScreen(s);
    setSidebarOpen(false);
  }

  if (screen === 'splash') {
    // Fallo de carga: se informa y se ofrece el modo simulado, que no descarga
    // modelos. Es la salida de emergencia de la demostracion.
    if (loadError) {
      return (
        <div className="h-screen w-screen flex flex-col items-center justify-center gap-4 p-8 text-center">
          <h2 className="text-lg font-semibold text-red-600">
            No se pudieron cargar los modelos
          </h2>
          <p className="text-sm text-slate-600 max-w-md">{loadError}</p>
          <p className="text-sm text-slate-500 max-w-md">
            Requiere conexion la primera vez para descargar los modelos desde
            Hugging Face (unos 279 MB). Despues funciona sin conexion.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-full bg-blue-600 text-white text-sm"
            >
              Reintentar
            </button>
            <a
              href="?mock=1"
              className="px-4 py-2 rounded-full border border-slate-300 text-slate-700 text-sm"
            >
              Abrir en modo demostracion
            </a>
          </div>
        </div>
      );
    }

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
          {(micError || playError) && (
            <p className="text-[var(--color-danger)] text-xs px-4 py-2 bg-[var(--color-danger-light)]">
              {micError ?? playError}
            </p>
          )}

          {screen === 'chat' && (
            <Chat
              messages={messages}
              state={state}
              onMicClick={onMicClick}
              audio={audio}
              onPlay={onPlay}
            />
          )}
          {screen === 'visualizer' && <VisualizerScreen audio={audio} />}
          {screen === 'pronunciation' && <PronunciationScreen />}
          {screen === 'grammar' && <GrammarScreen messages={messages} />}
          {screen === 'suggestions' && <SuggestionsScreen />}
          {screen === 'summary' && <SummaryScreen />}
          {screen === 'models' && <ModelsScreen />}
        </main>
      </div>

      <Footer currentScreen={screen} onNavigate={handleNavigate} />
    </div>
  );
}
