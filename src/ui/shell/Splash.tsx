/**
 * Splash / carga de modelos (S1-T8 shell). Dueño: Monestel (UI).
 * Conectado al progreso REAL de AIPipeline.init() via el event bus
 * (evento 'model-progress'), no a un timer simulado como en el
 * prototipo original de Figma Make.
 */

import { Mic2, WifiOff, CheckCircle2 } from 'lucide-react'

export interface ModelStatus {
  name: string
  size: string
  progress: number // 0-1
}

interface Props {
  models: ModelStatus[]
  overallProgress: number // 0-1
  ready: boolean
  onReady: () => void
}

export default function SplashScreen({ models, overallProgress, ready, onReady }: Props) {
  const pct = Math.round(overallProgress * 100)

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-5 sm:px-8">
      {/* Background subtle pattern */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at center, #BFDBFE 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative z-10 max-w-[420px] w-full flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-24 h-24 rounded-3xl bg-blue-600 flex items-center justify-center shadow-xl shadow-blue-200">
              <Mic2 className="w-12 h-12 text-white" />
            </div>
            {/* Pulse rings */}
            <div className="absolute inset-0 rounded-3xl border-2 border-blue-400 pulse-ring" />
            <div
              className="absolute inset-0 rounded-3xl border-2 border-blue-300 pulse-ring"
              style={{ animationDelay: '0.5s' }}
            />
          </div>
          <div className="text-center">
            <h1 className="font-display font-800 text-2xl text-slate-900 leading-tight">
              My Personal
            </h1>
            <h1 className="font-display font-800 text-2xl text-blue-600 leading-tight">
              English Teacher
            </h1>
            <p className="text-sm text-slate-500 mt-1.5">
              Tu entrenador de conversación con IA · 100% sin conexión
            </p>
          </div>
        </div>

        {/* Loading state */}
        <div className="w-full flex flex-col gap-5">
          {/* Main progress */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">Preparando los modelos de IA...</span>
              <span className="font-mono font-medium text-blue-600">{pct}%</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-150"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Current model */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Cargando modelos
            </p>
            <div className="flex flex-col gap-2.5">
              {models.map((model) => {
                const modelDone = model.progress >= 1
                const modelStarted = model.progress > 0
                return (
                  <div key={model.name} className="flex items-center gap-3">
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        modelDone ? 'bg-green-500' : modelStarted ? 'bg-blue-600 animate-pulse' : 'bg-slate-200'
                      }`}
                    />
                    <span className={`text-sm flex-1 ${modelStarted ? 'text-slate-800 font-medium' : 'text-slate-400'}`}>
                      {model.name}
                    </span>
                    <span className="font-mono text-xs text-slate-400">{model.size}</span>
                    {modelDone && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Offline availability */}
          <div className="flex items-center gap-2.5 bg-green-50 rounded-xl px-4 py-3 border border-green-200">
            <WifiOff className="w-4 h-4 text-green-600 flex-shrink-0" />
            <p className="text-sm text-green-700 font-medium">
              Una vez instalada, funciona 100% sin conexión — no necesitás internet.
            </p>
          </div>

          {/* CTA button */}
          {ready && (
            <button
              onClick={onReady}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors text-sm"
            >
              Empezar a practicar →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
