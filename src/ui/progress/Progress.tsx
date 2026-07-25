/**
 * SCAFFOLD portado de Figma Make — NO usar tal cual.
 * Pendiente (S9-T1, con Alejandro): conectar a historial real de
 * PronunciationResult por sesion en vez del array estatico de ejemplo.
 */

import {
  Download, RefreshCw, Clock, Mic, BookOpen, Volume2,
  Zap, Brain, TrendingUp, TrendingDown, AlertTriangle,
} from 'lucide-react'

function MetricCard({
  icon: Icon, label, value, unit, color, trend,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  unit?: string
  color: string
  trend?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col gap-2 sm:gap-3">
      <div className="flex items-center justify-between">
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center" style={{ background: color + '15' }}>
          <Icon className="w-4 h-4 sm:w-4.5 sm:h-4.5" style={{ color }} />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-full ${trend.startsWith('+') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {trend.startsWith('+') ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend}
          </div>
        )}
      </div>
      <div>
        <p className="text-xs text-slate-500 mb-1">{label}</p>
        <p className="font-display font-800 text-xl sm:text-2xl" style={{ color }}>
          {value}
          {unit && <span className="text-sm sm:text-base font-medium text-slate-400 ml-1">{unit}</span>}
        </p>
      </div>
    </div>
  )
}

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="flex items-center gap-3 sm:gap-4">
      <span className="text-xs sm:text-sm text-slate-600 w-28 sm:w-36 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="font-mono text-xs sm:text-sm font-semibold w-9 text-right" style={{ color }}>{score}%</span>
    </div>
  )
}

const MISTAKES = [
  { text: 'Irregular past tense (go → went, buy → bought)', frequency: 3, level: 'high' },
  { text: "Mispronunciation of /ɔː/ vowel ('bought', 'thought')", frequency: 2, level: 'high' },
  { text: "Missing plural '-s' on countable nouns", frequency: 2, level: 'medium' },
  { text: 'Hesitation pauses mid-clause', frequency: 4, level: 'medium' },
  { text: "Article omission ('the' before unique nouns)", frequency: 1, level: 'low' },
]

const RECOMMENDATIONS = [
  'Practice 20 common irregular verbs daily using flashcards.',
  "Focus on the /ɔː/ and /æ/ vowel pair — minimal pairs: 'bought' vs 'bat'.",
  'Read a short paragraph aloud, recording yourself each morning.',
  'Use shadowing technique: listen and repeat native speaker audio.',
]

export default function SummaryScreen() {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
      <div className="max-w-4xl mx-auto flex flex-col gap-4 sm:gap-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="font-display font-700 text-base sm:text-lg text-slate-900">Conversation Summary</h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Job Interview Practice · July 21, 2026 · 09:00 – 09:18
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-50 active:bg-slate-100 transition-colors shadow-sm">
              <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Download Report</span>
              <span className="sm:hidden">Export</span>
            </button>
            <button className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-xs sm:text-sm font-semibold text-white transition-colors shadow-sm">
              <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">New Session</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>
        </div>

        {/* Metrics: 2-col mobile → 3-col tablet → 6-col desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          <MetricCard icon={Clock}   label="Duration"     value="18"  unit="min" color="#2563EB" trend="+3 min" />
          <MetricCard icon={Mic}     label="Words Spoken" value="247"           color="#7C3AED" trend="+31" />
          <MetricCard icon={BookOpen}label="Grammar"      value="72"  unit="%"  color="#EA580C" trend="+8%" />
          <MetricCard icon={Volume2} label="Pronunciation"value="76"  unit="%"  color="#16A34A" trend="+12%" />
          <MetricCard icon={Zap}     label="Fluency"      value="68"  unit="%"  color="#0891B2" trend="-2%" />
          <MetricCard icon={Brain}   label="Vocabulary"   value="81"  unit="%"  color="#DB2777" trend="+5%" />
        </div>

        {/* Score bars + mistakes: stack on mobile, side-by-side on md+ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
            <h3 className="font-display font-700 text-sm text-slate-700 mb-4">Performance Breakdown</h3>
            <div className="flex flex-col gap-3 sm:gap-3.5">
              <ScoreBar label="Grammar Accuracy" score={72} color="#EA580C" />
              <ScoreBar label="Pronunciation"    score={76} color="#16A34A" />
              <ScoreBar label="Fluency"          score={68} color="#0891B2" />
              <ScoreBar label="Vocabulary"       score={81} color="#DB2777" />
              <ScoreBar label="Naturalness"      score={64} color="#7C3AED" />
              <ScoreBar label="Overall Score"    score={72} color="#2563EB" />
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
            <h3 className="font-display font-700 text-sm text-slate-700 mb-4">Most Common Mistakes</h3>
            <div className="flex flex-col gap-2.5">
              {MISTAKES.map((m, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${m.level === 'high' ? 'text-red-500' : m.level === 'medium' ? 'text-yellow-500' : 'text-slate-400'}`} />
                  <p className="text-xs sm:text-sm text-slate-700 leading-snug flex-1">{m.text}</p>
                  <span className={`font-mono text-xs font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${m.level === 'high' ? 'bg-red-50 text-red-700' : m.level === 'medium' ? 'bg-yellow-50 text-yellow-700' : 'bg-slate-100 text-slate-500'}`}>
                    ×{m.frequency}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Recommendations */}
        <div className="bg-gradient-to-br from-blue-50 to-violet-50 rounded-2xl border border-blue-200 p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-4 h-4 text-blue-600" />
            <h3 className="font-display font-700 text-sm text-blue-900">AI Recommendations</h3>
            <span className="ml-auto text-xs text-blue-500">For your next session</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {RECOMMENDATIONS.map((rec, i) => (
              <div key={i} className="bg-white rounded-xl px-4 py-3 flex items-start gap-3 border border-blue-100 shadow-sm">
                <span className="font-display font-700 text-lg text-blue-600 flex-shrink-0 leading-none mt-0.5">{i + 1}</span>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{rec}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <h3 className="font-display font-700 text-sm text-slate-700 mb-4">Session Timeline</h3>
          <div className="flex items-center gap-1 h-7 sm:h-8 rounded-xl overflow-hidden">
            {[
              { w: 12, color: '#EFF6FF', label: 'Intro', dark: false },
              { w: 28, color: '#DBEAFE', label: 'Warm-up', dark: false },
              { w: 35, color: '#3B82F6', label: 'Practice', dark: true },
              { w: 15, color: '#7C3AED', label: 'Correction', dark: true },
              { w: 10, color: '#10B981', label: 'Wrap-up', dark: true },
            ].map((seg, i) => (
              <div key={i} className="h-full flex items-center justify-center text-xs font-medium"
                style={{ width: `${seg.w}%`, background: seg.color, color: seg.dark ? 'white' : '#64748B' }}
                title={seg.label}>
                {seg.w > 14 && seg.label}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-slate-400 mt-1.5 font-mono">
            {['09:00','09:05','09:09','09:15','09:18'].map((t) => <span key={t}>{t}</span>)}
          </div>
        </div>
      </div>
    </div>
  )
}
