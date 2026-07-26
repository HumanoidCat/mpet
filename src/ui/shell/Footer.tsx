import {
  MessageSquare,
  Activity,
  Mic2,
  BookOpen,
  Lightbulb,
  BarChart3,
  HardDrive,
  Radio,
  Clock,
  WifiOff,
  Zap,
} from 'lucide-react'
// TODO: cuando se conecte a App.tsx real, importar Screen desde ahi.
type Screen = 'splash' | 'chat' | 'visualizer' | 'pronunciation' | 'grammar' | 'suggestions' | 'summary' | 'models'

interface FooterProps {
  currentScreen?: Screen
  onNavigate?: (screen: Screen) => void
}

const MOBILE_NAV: { id: Screen; icon: React.ElementType; label: string }[] = [
  { id: 'chat', icon: MessageSquare, label: 'Chat' },
  { id: 'visualizer', icon: Activity, label: 'Visualizer' },
  { id: 'pronunciation', icon: Mic2, label: 'Pronun.' },
  { id: 'grammar', icon: BookOpen, label: 'Grammar' },
  { id: 'suggestions', icon: Lightbulb, label: 'Tips' },
  { id: 'summary', icon: BarChart3, label: 'Summary' },
  { id: 'models', icon: HardDrive, label: 'Models' },
]

export default function Footer({ currentScreen, onNavigate }: FooterProps) {
  return (
    <>
      {/* Mobile bottom nav bar */}
      <nav className="lg:hidden flex-shrink-0 bg-white border-t border-slate-200 safe-bottom">
        <div className="flex overflow-x-auto scrollbar-hide">
          {MOBILE_NAV.map(({ id, icon: Icon, label }) => {
            const active = currentScreen === id
            return (
              <button
                key={id}
                onClick={() => onNavigate?.(id)}
                className={`flex-shrink-0 flex flex-col items-center justify-center gap-1 px-3 py-2.5 min-w-[64px] transition-colors ${
                  active ? 'text-blue-600' : 'text-slate-500'
                }`}
              >
                <Icon className={`w-5 h-5 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                <span className="text-[10px] font-semibold leading-tight">{label}</span>
                {active && (
                  <div className="absolute bottom-0 w-6 h-0.5 bg-blue-600 rounded-full" />
                )}
              </button>
            )
          })}
        </div>
      </nav>

      {/* Desktop status bar */}
      <footer className="hidden lg:flex h-8 flex-shrink-0 bg-slate-50 border-t border-slate-200 items-center justify-between px-5">
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <Radio className="w-3 h-3 text-slate-400" />
            <span className="font-mono text-xs text-slate-500">16,000 Hz</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-slate-400" />
            <span className="font-mono text-xs text-slate-500">Latency: 42ms</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
            <span className="text-xs text-slate-500">Browser OK</span>
          </div>
          <div className="flex items-center gap-1.5">
            <WifiOff className="w-3 h-3 text-green-600" />
            <span className="text-xs text-green-700 font-medium">Offline Mode</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Zap className="w-3 h-3 text-blue-500" />
            <span className="text-xs text-slate-500">AI Engine: Ready</span>
          </div>
        </div>
      </footer>
    </>
  )
}
