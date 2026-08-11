import { Mic, WifiOff, Sun, Moon, Loader2, Menu, X, ChevronRight } from 'lucide-react'

type ProcessingState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'transcribing'
  | 'correcting'
  | 'generating'
  | 'synthesizing'
  | 'finished'

// Traducidos y simplificados para un estudiante, no un desarrollador: antes
// decian cosas como "Synthesizing Speech" — jerga tecnica del pipeline que no
// le dice nada util a alguien practicando ingles.
const PROCESSING_LABELS: Record<ProcessingState, string> = {
  idle: '',
  listening: 'Escuchando...',
  processing: 'Procesando audio...',
  transcribing: 'Transcribiendo...',
  correcting: 'Revisando gramática...',
  generating: 'Buscando sugerencias...',
  synthesizing: 'Preparando el audio...',
  finished: 'Listo',
}

const PIPELINE_STAGES: ProcessingState[] = [
  'listening', 'processing', 'transcribing', 'correcting', 'generating', 'synthesizing',
]

interface HeaderProps {
  micActive?: boolean
  processingState?: ProcessingState
  isDark?: boolean
  onToggleTheme?: () => void
  sidebarOpen?: boolean
  onToggleSidebar?: () => void
}

export default function Header({
  micActive = false,
  processingState = 'idle',
  isDark = false,
  onToggleTheme,
  sidebarOpen = false,
  onToggleSidebar,
}: HeaderProps) {
  const isProcessing = processingState !== 'idle' && processingState !== 'finished'

  return (
    <header
      className="h-14 flex-shrink-0 bg-white border-b border-slate-200 flex items-center justify-between px-3 sm:px-5 z-40"
      style={{ '--header-h': '56px' } as React.CSSProperties}
    >
      {/* Left: hamburger + logo + state */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        {/* Hamburger — always visible, sidebar is drawer on all sizes < lg */}
        <button
          onClick={onToggleSidebar}
          className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 transition-colors lg:hidden"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? (
            <X className="w-5 h-5 text-slate-600" />
          ) : (
            <Menu className="w-5 h-5 text-slate-600" />
          )}
        </button>

        {/* Logo mark */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <Mic className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-display font-700 text-sm text-slate-900 hidden sm:block">
            My English Teacher
          </span>
        </div>

        {/* Processing indicator */}
        <div className="hidden md:flex items-center gap-2 pl-2 border-l border-slate-200">
          {isProcessing ? (
            <>
              <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
              <span className="text-xs font-medium text-blue-700">
                {PROCESSING_LABELS[processingState]}
              </span>
            </>
          ) : processingState === 'finished' ? (
            <>
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-xs font-medium text-green-700">Análisis completo</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-slate-300" />
              <span className="text-xs text-slate-400">Listo</span>
            </>
          )}
        </div>
      </div>

      {/* Center: pipeline — desktop only */}
      <div className="hidden xl:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
        {PIPELINE_STAGES.map((stage, i) => (
          <div key={stage} className="flex items-center gap-1">
            <div
              className={`px-2 py-1 rounded text-xs font-medium transition-all ${
                processingState === stage
                  ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300'
                  : 'bg-slate-100 text-slate-400'
              }`}
            >
              {PROCESSING_LABELS[stage].replace('...', '')}
            </div>
            {i < PIPELINE_STAGES.length - 1 && (
              <ChevronRight className="w-3 h-3 text-slate-300" />
            )}
          </div>
        ))}
      </div>

      {/* Right: status row */}
      <div className="flex items-center gap-1.5 sm:gap-3">
        {/* Mic status */}
        <div
          className={`flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold ${
            micActive
              ? 'bg-red-50 text-red-600 ring-1 ring-red-200'
              : 'bg-slate-100 text-slate-500'
          }`}
        >
          <Mic className={`w-3.5 h-3.5 ${micActive ? 'text-red-500' : 'text-slate-400'}`} />
          <span className="hidden sm:inline">{micActive ? 'Grabando' : 'Apagado'}</span>
        </div>

        {/* Offline badge */}
        <div className="flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 rounded-lg bg-green-50 ring-1 ring-green-200 text-xs font-semibold text-green-700">
          <WifiOff className="w-3.5 h-3.5 text-green-600" />
          <span className="hidden sm:inline">Sin conexión</span>
        </div>

        {/* Theme toggle */}
        <button
          onClick={onToggleTheme}
          className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-slate-500" />
          ) : (
            <Moon className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          JD
        </div>
      </div>
    </header>
  )
}
