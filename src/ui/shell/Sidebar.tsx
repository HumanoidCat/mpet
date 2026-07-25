import {
  MessageSquare,
  Activity,
  Mic2,
  BookOpen,
  Lightbulb,
  BarChart3,
  HardDrive,
  Settings,
  ChevronRight,
  Plus,
} from 'lucide-react'
// TODO: cuando se conecte a App.tsx real, importar Screen desde ahi.
type Screen = 'splash' | 'chat' | 'visualizer' | 'pronunciation' | 'grammar' | 'suggestions' | 'summary' | 'models'

interface SidebarProps {
  active: Screen
  onNavigate: (screen: Screen) => void
}

const NAV_ITEMS: { id: Screen; icon: React.ElementType; label: string; badge?: string }[] = [
  { id: 'chat', icon: MessageSquare, label: 'Chat' },
  { id: 'visualizer', icon: Activity, label: 'Visualizer' },
  { id: 'pronunciation', icon: Mic2, label: 'Pronunciation' },
  { id: 'grammar', icon: BookOpen, label: 'Grammar' },
  { id: 'suggestions', icon: Lightbulb, label: 'Suggestions', badge: '3' },
  { id: 'summary', icon: BarChart3, label: 'Summary' },
  { id: 'models', icon: HardDrive, label: 'Offline Models' },
]

const RECENT = ['Job Interview Practice', 'Daily Conversation', 'Travel Phrases', 'Business Email']

export default function Sidebar({ active, onNavigate }: SidebarProps) {
  return (
    <aside className="w-[220px] bg-white border-r border-slate-200 flex flex-col h-full shadow-xl lg:shadow-none">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Mic2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-display font-700 text-sm text-slate-900 leading-tight">My Personal</p>
            <p className="font-display font-700 text-sm text-blue-600 leading-tight">English Teacher</p>
          </div>
        </div>
      </div>

      {/* New conversation */}
      <div className="px-3 pt-3 pb-2 flex-shrink-0">
        <button
          onClick={() => onNavigate('chat')}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Conversation
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-1 overflow-y-auto">
        <p className="text-xs font-semibold text-slate-400 px-2 py-2 uppercase tracking-wider">
          Screens
        </p>
        {NAV_ITEMS.map(({ id, icon: Icon, label, badge }) => {
          const isActive = active === id
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`sidebar-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 text-sm font-medium group transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100'
              }`}
            >
              <Icon
                className={`w-4 h-4 flex-shrink-0 transition-colors ${
                  isActive ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'
                }`}
              />
              <span className="flex-1 text-left">{label}</span>
              {badge && (
                <span className="bg-blue-600 text-white text-xs font-semibold px-1.5 py-0.5 rounded-full">
                  {badge}
                </span>
              )}
              {isActive && <ChevronRight className="w-3.5 h-3.5 text-blue-500" />}
            </button>
          )
        })}

        {/* Recent sessions */}
        <p className="text-xs font-semibold text-slate-400 px-2 py-2 mt-3 uppercase tracking-wider">
          Recent Sessions
        </p>
        {RECENT.map((session, i) => (
          <button
            key={i}
            className="sidebar-item w-full flex items-center gap-2 px-3 py-2 rounded-xl mb-0.5 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700 active:bg-slate-100 text-left transition-colors"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
            <span className="truncate">{session}</span>
          </button>
        ))}
      </nav>

      {/* Settings */}
      <div className="px-3 py-3 border-t border-slate-100 flex-shrink-0">
        <button className="sidebar-item w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100 transition-colors">
          <Settings className="w-4 h-4 text-slate-400" />
          Settings
        </button>
      </div>
    </aside>
  )
}
