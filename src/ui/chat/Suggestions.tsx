/**
 * SCAFFOLD portado de Figma Make — NO usar tal cual.
 * Pendiente: usar AIPipeline.suggest() / mockAIPipeline en vez de
 * las frases fijas. Evaluar si va embebido en Chat.tsx o aparte.
 */

import { useState } from 'react'
import {
  BookOpen, Zap, Wind, Shuffle, Volume2, MessageCircle,
  ChevronDown, ChevronUp, Play, Star, ArrowRight,
} from 'lucide-react'

type Category = 'vocabulary' | 'naturalness' | 'fluency' | 'alternatives' | 'pronunciation' | 'continuation'

interface Suggestion {
  id: number
  category: Category
  title: string
  body: string
  examples?: string[]
  badge?: string
  priority: 'high' | 'medium' | 'low'
}

const CATEGORY_CONFIG: Record<Category, { icon: React.ElementType; label: string; color: string; bg: string; border: string }> = {
  vocabulary:   { icon: BookOpen,     label: 'Vocabulary',   color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
  naturalness:  { icon: Zap,          label: 'Naturalness',  color: '#0891B2', bg: '#ECFEFF', border: '#A5F3FC' },
  fluency:      { icon: Wind,         label: 'Fluency',      color: '#059669', bg: '#F0FDF4', border: '#A7F3D0' },
  alternatives: { icon: Shuffle,      label: 'Alternatives', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  pronunciation:{ icon: Volume2,      label: 'Pronunciation',color: '#EA580C', bg: '#FFF7ED', border: '#FED7AA' },
  continuation: { icon: MessageCircle,label: 'Continue',     color: '#DB2777', bg: '#FDF2F8', border: '#FBCFE8' },
}

const PRIORITY_BADGE: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-slate-100 text-slate-600',
}

const SUGGESTIONS: Suggestion[] = [
  {
    id: 1, category: 'vocabulary', title: "Use 'purchased' for formal contexts", badge: 'Word Choice', priority: 'low',
    body: "'Bought' is perfectly correct but consider 'purchased' for business or formal writing.",
    examples: ["I purchased the items at the local market.", "She purchased a new laptop for the office."],
  },
  {
    id: 2, category: 'naturalness', title: "Consider 'picked up' for casual speech", badge: 'Colloquial', priority: 'medium',
    body: "Native English speakers often say 'I picked up some vegetables' instead of 'I bought'. It sounds more natural.",
    examples: ["I picked up some groceries on my way home.", "Can you pick up some milk later?"],
  },
  {
    id: 3, category: 'fluency', title: 'Reduce pausing between content words', badge: 'Pacing', priority: 'high',
    body: 'Your speech had 3 notable pauses between clauses. Practice linking words like "and", "but", "so" without stopping.',
    examples: ["Practice: 'I went↗to the market↗and bought↗some vegetables' (no breaks)"],
  },
  {
    id: 4, category: 'alternatives', title: 'Alternative ways to say this sentence', badge: 'Variety', priority: 'medium',
    body: 'Here are 3 alternative expressions with the same meaning, ranging from casual to formal:',
    examples: [
      "Casual: 'I grabbed some veggies from the market yesterday.'",
      "Neutral: 'I stopped by the market to get vegetables.'",
      "Formal: 'Yesterday I visited the market and purchased several vegetables.'",
    ],
  },
  {
    id: 5, category: 'pronunciation', title: "Work on the /ɔː/ vowel in 'bought'", badge: 'Phoneme', priority: 'high',
    body: "Your biggest challenge was the vowel in 'bought' /bɔːt/. Practice by saying 'aw' as in 'law' or 'saw', then add /t/.",
    examples: ["Practice: law, saw, draw, ball, call, fall, bought, thought, caught"],
  },
  {
    id: 6, category: 'continuation', title: 'Practice expanding this topic', badge: 'Practice', priority: 'medium',
    body: "Keep the conversation going! Try these follow-up prompts to build shopping vocabulary:",
    examples: ['"What kind of vegetables did you buy?"', '"How often do you go to the market?"', '"Tell me about your favorite vegetable."'],
  },
]

function SuggestionCard({ suggestion }: { suggestion: Suggestion }) {
  const [expanded, setExpanded] = useState(suggestion.priority === 'high')
  const cfg = CATEGORY_CONFIG[suggestion.category]
  const Icon = cfg.icon

  return (
    <div className="bg-white rounded-2xl border overflow-hidden shadow-sm" style={{ borderColor: cfg.border }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 text-left active:opacity-80"
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
          <Icon className="w-4 h-4" style={{ color: cfg.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-xs font-semibold" style={{ color: cfg.color }}>{cfg.label}</span>
            {suggestion.badge && (
              <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: cfg.bg, color: cfg.color }}>
                {suggestion.badge}
              </span>
            )}
            <span className={`ml-auto text-xs px-1.5 py-0.5 rounded font-semibold ${PRIORITY_BADGE[suggestion.priority]}`}>
              {suggestion.priority}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-900 line-clamp-2 sm:truncate">{suggestion.title}</p>
        </div>

        {expanded ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 pb-4 sm:pb-5 border-t" style={{ borderColor: cfg.border }}>
          <p className="text-sm text-slate-600 leading-relaxed mt-4 mb-4">{suggestion.body}</p>
          {suggestion.examples && (
            <div className="flex flex-col gap-2">
              {suggestion.examples.map((ex, i) => (
                <div key={i} className="flex items-start gap-3 rounded-xl px-3 py-2.5"
                  style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                  {suggestion.category === 'continuation'
                    ? <ArrowRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: cfg.color }} />
                    : <Play className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" style={{ color: cfg.color }} />}
                  <p className="text-sm text-slate-700 italic">{ex}</p>
                </div>
              ))}
            </div>
          )}
          {suggestion.category === 'pronunciation' && (
            <button className="mt-3 flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-colors active:opacity-80"
              style={{ background: cfg.bg, color: cfg.color }}>
              <Volume2 className="w-3.5 h-3.5" />Listen to correct pronunciation
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function SuggestionsScreen() {
  const [activeFilter, setActiveFilter] = useState<Category | 'all'>('all')

  const filtered = activeFilter === 'all'
    ? SUGGESTIONS
    : SUGGESTIONS.filter((s) => s.category === activeFilter)

  const highCount = SUGGESTIONS.filter((s) => s.priority === 'high').length

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
      <div className="max-w-3xl mx-auto flex flex-col gap-4 sm:gap-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display font-700 text-base sm:text-lg text-slate-900">AI Suggestions</h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{SUGGESTIONS.length} suggestions · {highCount} high priority</p>
          </div>
          <div className="flex items-center gap-1.5 bg-yellow-50 px-3 py-2 rounded-xl border border-yellow-200 flex-shrink-0">
            <Star className="w-3.5 h-3.5 text-yellow-500" />
            <span className="text-xs sm:text-sm font-semibold text-yellow-700">{highCount} Priority</span>
          </div>
        </div>

        {/* Filters: horizontally scrollable on mobile */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap scrollbar-hide">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex-shrink-0 ${
              activeFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            All ({SUGGESTIONS.length})
          </button>
          {Object.entries(CATEGORY_CONFIG).map(([key, cfg]) => {
            const count = SUGGESTIONS.filter((s) => s.category === key).length
            if (!count) return null
            const Icon = cfg.icon
            return (
              <button
                key={key}
                onClick={() => setActiveFilter(key as Category)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex-shrink-0 ${
                  activeFilter === key ? 'text-white' : 'bg-white border border-slate-200 text-slate-600'
                }`}
                style={activeFilter === key ? { background: cfg.color } : {}}
              >
                <Icon className="w-3.5 h-3.5" />{cfg.label} ({count})
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-3">
          {filtered.map((s) => <SuggestionCard key={s.id} suggestion={s} />)}
        </div>
      </div>
    </div>
  )
}
