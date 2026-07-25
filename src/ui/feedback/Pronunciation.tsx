/**
 * SCAFFOLD portado de Figma Make — NO usar tal cual.
 * Pendiente (S6-T3): reemplazar datos falsos por PronunciationResult /
 * WordScore de @shared/contracts (mockScorer mientras Fabrizio+Isaac
 * entregan el real). Colores por palabra: verde >=80, amarillo 60-79,
 * rojo <60 (WordScore.score), según docs/04-plan-semanal.md.
 */

import { useState } from 'react'
import { Play, Volume2, Mic, Target, TrendingUp } from 'lucide-react'

type WordRating = 'excellent' | 'good' | 'needs' | 'incorrect'

interface WordData {
  word: string
  rating: WordRating
  ipa_expected: string
  ipa_user: string
  confidence: number
  suggestion: string
}

const WORDS: WordData[] = [
  { word: 'Yesterday', rating: 'excellent', ipa_expected: '/ˈjɛs.tə.deɪ/', ipa_user: '/ˈjɛs.tə.deɪ/', confidence: 97, suggestion: 'Perfect pronunciation!' },
  { word: 'I', rating: 'excellent', ipa_expected: '/aɪ/', ipa_user: '/aɪ/', confidence: 99, suggestion: 'Excellent.' },
  { word: 'went', rating: 'good', ipa_expected: '/wɛnt/', ipa_user: '/wɛnd/', confidence: 82, suggestion: "Final /t/ is slightly voiced. Keep the 't' crisp." },
  { word: 'to', rating: 'excellent', ipa_expected: '/tə/', ipa_user: '/tə/', confidence: 94, suggestion: 'Natural reduction. Great.' },
  { word: 'the', rating: 'good', ipa_expected: '/ðə/', ipa_user: '/də/', confidence: 78, suggestion: "The 'th' sound /ð/ needs more tongue contact." },
  { word: 'market', rating: 'needs', ipa_expected: '/ˈmɑːr.kɪt/', ipa_user: '/ˈmær.kɪt/', confidence: 61, suggestion: "Vowel in 'mar' should be /ɑː/ (open, back), not /æ/ (front)." },
  { word: 'and', rating: 'excellent', ipa_expected: '/ænd/', ipa_user: '/ænd/', confidence: 96, suggestion: 'Clear and natural.' },
  { word: 'bought', rating: 'incorrect', ipa_expected: '/bɔːt/', ipa_user: '/baʊt/', confidence: 38, suggestion: "The vowel in 'bought' is /ɔː/ — a rounded back vowel. Avoid /aʊ/." },
  { word: 'some', rating: 'good', ipa_expected: '/sʌm/', ipa_user: '/sɒm/', confidence: 74, suggestion: "Use schwa /ʌ/ instead of /ɒ/." },
  { word: 'vegetables', rating: 'needs', ipa_expected: '/ˈvɛdʒ.tə.bəlz/', ipa_user: '/ˈvɛ.dʒɪ.tə.bəlz/', confidence: 55, suggestion: "Often reduced to 3 syllables: 'vej-tuh-blz'." },
]

const RATING_CONFIG: Record<WordRating, { label: string; chipClass: string; color: string }> = {
  excellent: { label: 'Excellent', chipClass: 'chip-excellent', color: '#16A34A' },
  good: { label: 'Good', chipClass: 'chip-good', color: '#2563EB' },
  needs: { label: 'Needs Work', chipClass: 'chip-needs', color: '#D97706' },
  incorrect: { label: 'Incorrect', chipClass: 'chip-incorrect', color: '#DC2626' },
}

function ScoreGauge({ score }: { score: number }) {
  const radius = 72
  const stroke = 9
  const norm = radius - stroke / 2
  const circ = 2 * Math.PI * norm
  const offset = circ * (1 - score / 100)
  const color =
    score >= 85 ? '#16A34A' : score >= 70 ? '#2563EB' : score >= 50 ? '#D97706' : '#DC2626'

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <svg width={radius * 2} height={radius * 2} className="-rotate-90">
          <circle cx={radius} cy={radius} r={norm} fill="none" stroke="#E2E8F0" strokeWidth={stroke} />
          <circle
            cx={radius} cy={radius} r={norm} fill="none"
            stroke={color} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            className="transition-all duration-1000"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display font-800 text-2xl" style={{ color }}>{score}</span>
          <span className="text-xs text-slate-500 font-medium">/ 100</span>
        </div>
      </div>
      <div className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: color + '20', color }}>
        {score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Needs Work' : 'Keep Practicing'}
      </div>
    </div>
  )
}

function WordChip({ word, onSelect, selected }: { word: WordData; onSelect: () => void; selected: boolean }) {
  const cfg = RATING_CONFIG[word.rating]
  return (
    <button
      onClick={onSelect}
      className={`px-2.5 py-1.5 rounded-xl text-sm font-semibold transition-all active:scale-95 touch-manipulation ${cfg.chipClass} ${selected ? 'ring-2 ring-offset-2 ring-blue-400' : ''}`}
    >
      {word.word}
    </button>
  )
}

function WordDetail({ word, onClose }: { word: WordData; onClose: () => void }) {
  const cfg = RATING_CONFIG[word.rating]
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-lg">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="font-display font-700 text-base sm:text-lg text-slate-900">"{word.word}"</h4>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.chipClass}`}>{cfg.label}</span>
        </div>
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1">✕</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div className="bg-green-50 rounded-xl p-3 border border-green-100">
          <p className="text-xs font-semibold text-green-700 mb-1.5">Expected pronunciation</p>
          <p className="font-mono text-sm sm:text-base text-green-800 font-medium">{word.ipa_expected}</p>
          <button className="mt-2 flex items-center gap-1 text-xs text-green-600 hover:text-green-700">
            <Play className="w-3 h-3" />Replay correct
          </button>
        </div>
        <div className={`rounded-xl p-3 border ${word.rating === 'excellent' ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
          <p className={`text-xs font-semibold mb-1.5 ${word.rating === 'excellent' ? 'text-green-700' : 'text-red-700'}`}>Your pronunciation</p>
          <p className={`font-mono text-sm sm:text-base font-medium ${word.rating === 'excellent' ? 'text-green-800' : 'text-red-800'}`}>{word.ipa_user}</p>
          <button className={`mt-2 flex items-center gap-1 text-xs ${word.rating === 'excellent' ? 'text-green-600' : 'text-red-600'}`}>
            <Mic className="w-3 h-3" />Replay yours
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <p className="text-xs text-slate-500 flex-shrink-0">Confidence</p>
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${word.confidence}%`, background: cfg.color }} />
        </div>
        <span className="font-mono text-xs font-medium flex-shrink-0" style={{ color: cfg.color }}>{word.confidence}%</span>
      </div>

      <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
        <p className="text-xs font-semibold text-slate-700 mb-1">Suggestion</p>
        <p className="text-sm text-slate-600 leading-relaxed">{word.suggestion}</p>
      </div>
    </div>
  )
}

export default function PronunciationScreen() {
  const [selected, setSelected] = useState<WordData | null>(null)
  const score = 76

  const counts = {
    excellent: WORDS.filter((w) => w.rating === 'excellent').length,
    good: WORDS.filter((w) => w.rating === 'good').length,
    needs: WORDS.filter((w) => w.rating === 'needs').length,
    incorrect: WORDS.filter((w) => w.rating === 'incorrect').length,
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
      <div className="max-w-4xl mx-auto flex flex-col gap-4 sm:gap-5">
        {/* Header */}
        <div>
          <h2 className="font-display font-700 text-base sm:text-lg text-slate-900">Pronunciation Analysis</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Phoneme-level analysis · click any word for details</p>
        </div>

        {/* Score + sentence: stack on mobile, side-by-side on md+ */}
        <div className="flex flex-col md:grid md:grid-cols-3 gap-4">
          {/* Score gauge */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col items-center gap-4 md:col-span-1">
            <h3 className="font-display font-700 text-sm text-slate-700">Overall Score</h3>
            <ScoreGauge score={score} />
            <div className="w-full flex flex-col gap-1.5">
              {Object.entries(counts).map(([rating, count]) => {
                const cfg = RATING_CONFIG[rating as WordRating]
                return (
                  <div key={rating} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                    <span className="text-xs text-slate-600 flex-1">{cfg.label}</span>
                    <span className="text-xs font-mono font-semibold text-slate-700">{count}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Word analysis */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 md:col-span-2">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h3 className="font-display font-700 text-sm text-slate-700">Analyzed Sentence</h3>
              <div className="flex gap-1.5 flex-wrap">
                <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors active:bg-blue-200">
                  <Volume2 className="w-3 h-3" />Play correct
                </button>
                <button className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200 transition-colors active:bg-slate-300">
                  <Mic className="w-3 h-3" />Play yours
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {WORDS.map((word, i) => (
                <WordChip
                  key={i}
                  word={word}
                  selected={selected?.word === word.word}
                  onSelect={() => setSelected(selected?.word === word.word ? null : word)}
                />
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-3 flex-wrap">
              {Object.entries(RATING_CONFIG).map(([rating, cfg]) => (
                <div key={rating} className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: cfg.color }} />
                  <span className="text-xs text-slate-500">{cfg.label}</span>
                </div>
              ))}
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Accuracy</p>
                  <p className="font-display font-700 text-sm text-slate-900">76%</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">vs Last</p>
                  <p className="font-display font-700 text-sm text-green-600">+8%</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-600 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Words</p>
                  <p className="font-display font-700 text-sm text-slate-900">{WORDS.length}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Word detail */}
        {selected && <WordDetail word={selected} onClose={() => setSelected(null)} />}
      </div>
    </div>
  )
}
