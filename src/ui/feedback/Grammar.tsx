/**
 * SCAFFOLD portado de Figma Make — NO usar tal cual.
 * Pendiente (S3-T4/S6): reemplazar datos falsos por Edit[] real de
 * @shared/contracts (correctGrammar de AIPipeline / mockAIPipeline).
 * Reutilizar buildSegments de ./chat/highlight.ts si aplica en vez de
 * duplicar la logica de resaltado rojo/verde.
 */

import { useState } from 'react'
import { BookOpen, ChevronDown, ChevronUp, CheckCircle2, AlertCircle } from 'lucide-react'

interface Correction {
  id: number
  original: string
  correct: string
  rule: string
  category: string
  example: string
  color: string
  bgColor: string
  borderColor: string
}

const CORRECTIONS: Correction[] = [
  {
    id: 1,
    original: 'goed',
    correct: 'went',
    rule: "'Go' is an irregular verb. Its simple past tense is 'went', not 'goed'. Irregular verbs do not follow the standard '-ed' suffix pattern.",
    category: 'Irregular Verb',
    example: 'She went to the store yesterday. / They went hiking last weekend.',
    color: '#DC2626', bgColor: '#FEF2F2', borderColor: '#FECACA',
  },
  {
    id: 2,
    original: 'buyed',
    correct: 'bought',
    rule: "'Buy' is an irregular verb. Its simple past tense is 'bought'. This verb completely changes its form in the past tense.",
    category: 'Irregular Verb',
    example: 'He bought a new phone last week. / I bought groceries this morning.',
    color: '#DC2626', bgColor: '#FEF2F2', borderColor: '#FECACA',
  },
  {
    id: 3,
    original: 'some vegetable',
    correct: 'some vegetables',
    rule: "Countable nouns like 'vegetable' require the plural '-s' when referring to more than one. Use plural when the quantity is unspecified but likely multiple.",
    category: 'Countable Nouns',
    example: 'She bought some vegetables. / They have some books on the shelf.',
    color: '#D97706', bgColor: '#FFFBEB', borderColor: '#FCD34D',
  },
]

function HighlightedText({ original, corrections }: { original: string; corrections: Correction[] }) {
  const words = original.split(' ')
  return (
    <p className="text-base sm:text-lg leading-relaxed text-slate-700 font-medium">
      {words.map((word, i) => {
        const correction = corrections.find((c) =>
          word.toLowerCase().includes(c.original.toLowerCase())
        )
        return (
          <span key={i}>
            {correction ? (
              <span className="bg-red-100 text-red-700 px-1 rounded underline decoration-red-400 decoration-wavy">
                {word}
              </span>
            ) : (
              word
            )}
            {i < words.length - 1 ? ' ' : ''}
          </span>
        )
      })}
    </p>
  )
}

function CorrectedText({ original, corrections }: { original: string; corrections: Correction[] }) {
  let corrected = original
  corrections.forEach((c) => {
    corrected = corrected.replace(new RegExp(c.original, 'gi'), `__${c.correct}__`)
  })
  const parts = corrected.split(/__/)
  const isHighlighted = (s: string) => corrections.some((c) => c.correct === s)

  return (
    <p className="text-base sm:text-lg leading-relaxed text-slate-800 font-medium">
      {parts.map((part, i) =>
        isHighlighted(part) ? (
          <span key={i} className="bg-green-100 text-green-800 px-1 rounded font-semibold">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </p>
  )
}

function CorrectionCard({ correction }: { correction: Correction }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="rounded-2xl border overflow-hidden transition-all" style={{ borderColor: correction.borderColor }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 sm:py-4 text-left hover:opacity-90 transition-opacity active:opacity-80"
        style={{ background: correction.bgColor }}
      >
        <div className="flex-1 flex items-center gap-2 sm:gap-4 min-w-0 flex-wrap">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
            style={{ background: correction.color + '20', color: correction.color }}>
            {correction.category}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium text-red-700 line-through">{correction.original}</span>
            <span className="text-slate-400">→</span>
            <span className="font-mono text-sm font-semibold text-green-700">{correction.correct}</span>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-500 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 sm:px-5 py-4 bg-white border-t" style={{ borderColor: correction.borderColor }}>
          <div className="flex flex-col sm:grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Grammar Rule</p>
              <p className="text-sm text-slate-700 leading-relaxed">{correction.rule}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Example Sentences</p>
              <p className="text-sm text-slate-600 leading-relaxed italic">{correction.example}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function GrammarScreen() {
  const original = "Yesterday I goed to the market and buyed some vegetable."

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
      <div className="max-w-4xl mx-auto flex flex-col gap-4 sm:gap-5">
        <div>
          <h2 className="font-display font-700 text-base sm:text-lg text-slate-900">Grammar Correction</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{CORRECTIONS.length} corrections found</p>
        </div>

        {/* Before / After: stack on mobile, side-by-side on sm+ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white rounded-2xl border border-red-200 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">Original</p>
            </div>
            <HighlightedText original={original} corrections={CORRECTIONS} />
          </div>
          <div className="bg-white rounded-2xl border border-green-200 p-4 sm:p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
              <p className="text-xs font-semibold text-green-600 uppercase tracking-wider">Corrected</p>
            </div>
            <CorrectedText original={original} corrections={CORRECTIONS} />
          </div>
        </div>

        {/* Corrections list */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-slate-500" />
            <h3 className="font-display font-700 text-sm text-slate-700">Detailed Corrections</h3>
            <span className="ml-1 bg-slate-200 text-slate-600 text-xs font-semibold px-2 py-0.5 rounded-full">{CORRECTIONS.length}</span>
          </div>
          {CORRECTIONS.map((c) => <CorrectionCard key={c.id} correction={c} />)}
        </div>

        {/* Assessment */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
          <h3 className="font-display font-700 text-sm text-slate-700 mb-4">Grammar Assessment</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Grammar Score', value: '72%', color: '#2563EB' },
              { label: 'Errors Found', value: '3', color: '#DC2626' },
              { label: 'Correct Words', value: '7/10', color: '#16A34A' },
              { label: 'Improvement', value: '+12%', color: '#16A34A' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-xs text-slate-500 mb-1.5">{label}</p>
                <p className="font-display font-800 text-lg sm:text-xl" style={{ color }}>{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
