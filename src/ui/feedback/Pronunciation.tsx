import { useState } from 'react';
import { Mic2, Volume2, Target, ListChecks } from 'lucide-react';
import type { ChatMessage, WordScore } from '@shared/contracts';
import { buildPronunciationSegments } from '../chat/highlight';
import { scoreColor, scoreTier, TIER_COLOR, TIER_LABEL, type ScoreTier } from './pronunciationColor';

/**
 * Pantalla standalone de Pronunciation (S6-T3). Dueño: Monestel (UI).
 *
 * Conectada al `PronunciationResult` real que deja el comparador DTW en
 * `ChatMessage.pronunciation` (ver `src/core/orchestrator.ts`). Ya no usa el
 * ejemplo fijo del prototipo de Figma Make.
 *
 * A proposito NO muestra `ipa_expected` / `ipa_user`: el comparador mide
 * distancia acustica entre MFCC con DTW, no reconoce fonemas, asi que ese dato
 * no existe en el contrato y no se puede inventar. Lo unico que hay por palabra
 * es un puntaje 0-100 y sus marcas de tiempo (`WordScore`).
 */

interface Props {
  messages?: ChatMessage[];
  /** Reproduce la frase de referencia sintetizada. Opcional, como en Chat.tsx. */
  onPlay?: (text: string, slow: boolean) => void;
}

function ScoreGauge({ score }: { score: number }) {
  const radius = 72;
  const stroke = 9;
  const norm = radius - stroke / 2;
  const circ = 2 * Math.PI * norm;
  const offset = circ * (1 - score / 100);
  const color = scoreColor(score);

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
          <span className="font-[var(--font-display)] font-extrabold text-2xl" style={{ color }}>{Math.round(score)}</span>
          <span className="text-xs text-slate-500 font-medium">/ 100</span>
        </div>
      </div>
      <div className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: color + '20', color }}>
        {TIER_LABEL[scoreTier(score)]}
      </div>
    </div>
  );
}

function WordChip({ word, selected, onSelect }: { word: WordScore; selected: boolean; onSelect: () => void }) {
  const color = scoreColor(word.score);
  return (
    <button
      onClick={onSelect}
      className={`px-2.5 py-1.5 rounded-xl text-sm font-semibold transition-all active:scale-95 touch-manipulation ${selected ? 'ring-2 ring-offset-2 ring-blue-400' : ''}`}
      style={{ background: color + '20', color, border: `1px solid ${color}40` }}
    >
      {word.word}
    </button>
  );
}

function WordDetail({ word, onClose }: { word: WordScore; onClose: () => void }) {
  const color = scoreColor(word.score);
  const duration = Math.max(0, word.end - word.start);
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-lg">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h4 className="font-[var(--font-display)] font-bold text-base sm:text-lg text-slate-900">"{word.word}"</h4>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: color + '20', color }}>
            {TIER_LABEL[scoreTier(word.score)]}
          </span>
        </div>
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1">✕</button>
      </div>

      <div className="flex items-center gap-3 mb-3">
        <p className="text-xs text-slate-500 flex-shrink-0">Score</p>
        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, Math.max(0, word.score))}%`, background: color }} />
        </div>
        <span className="font-mono text-xs font-medium flex-shrink-0" style={{ color }}>{Math.round(word.score)}</span>
      </div>

      <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs text-slate-500 font-mono">
        {word.start.toFixed(2)}s – {word.end.toFixed(2)}s · {duration.toFixed(2)}s
      </div>
    </div>
  );
}

export default function PronunciationScreen({ messages = [], onPlay }: Props) {
  const scored = messages.filter(
    (m): m is ChatMessage & { pronunciation: NonNullable<ChatMessage['pronunciation']> } =>
      m.role === 'user' && !!m.pronunciation
  );

  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedWord, setSelectedWord] = useState<number | null>(null);

  if (scored.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
        <div className="max-w-4xl mx-auto flex flex-col gap-4 sm:gap-5">
          <div>
            <h2 className="font-[var(--font-display)] font-bold text-base sm:text-lg text-slate-900">Pronunciation Analysis</h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Puntaje por palabra sobre lo que dijiste</p>
          </div>
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
            <Mic2 className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-500">Todavía no hay puntaje de pronunciación en esta sesión</p>
            <p className="text-xs text-slate-400 mt-1">Habla en la pestaña Chat para ver aquí el análisis real.</p>
          </div>
        </div>
      </div>
    );
  }

  const active = scored.find((m) => m.id === activeId) ?? scored[scored.length - 1];
  const segments = buildPronunciationSegments(active.text, active.pronunciation.words);
  const counts = active.pronunciation.words.reduce(
    (acc, w) => {
      acc[scoreTier(w.score)]++;
      return acc;
    },
    { good: 0, ok: 0, bad: 0 } as Record<ScoreTier, number>
  );
  const selected =
    selectedWord != null ? active.pronunciation.words[selectedWord] : undefined;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
      <div className="max-w-4xl mx-auto flex flex-col gap-4 sm:gap-5">
        <div>
          <h2 className="font-[var(--font-display)] font-bold text-base sm:text-lg text-slate-900">Pronunciation Analysis</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {scored.length} {scored.length === 1 ? 'frase analizada' : 'frases analizadas'} en esta sesión · toca una palabra para ver el detalle
          </p>
        </div>

        {scored.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
            {scored.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setActiveId(m.id);
                  setSelectedWord(null);
                }}
                className={`flex-shrink-0 max-w-[220px] truncate px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  m.id === active.id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'
                }`}
                title={m.text}
              >
                {m.text}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col md:grid md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col items-center gap-4 md:col-span-1">
            <h3 className="font-[var(--font-display)] font-bold text-sm text-slate-700">Overall Score</h3>
            <ScoreGauge score={active.pronunciation.overall} />
            <div className="w-full flex flex-col gap-1.5">
              {(Object.keys(counts) as ScoreTier[]).map((tier) => (
                <div key={tier} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: TIER_COLOR[tier] }} />
                  <span className="text-xs text-slate-600 flex-1">{TIER_LABEL[tier]}</span>
                  <span className="text-xs font-mono font-semibold text-slate-700">{counts[tier]}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 md:col-span-2">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
              <h3 className="font-[var(--font-display)] font-bold text-sm text-slate-700">Analyzed Sentence</h3>
              {onPlay && (
                <button
                  onClick={() => onPlay(active.text, false)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium hover:bg-blue-100 transition-colors active:bg-blue-200"
                >
                  <Volume2 className="w-3 h-3" />Play reference
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2 mb-4">
              {active.pronunciation.words.map((w, i) => (
                <WordChip
                  key={i}
                  word={w}
                  selected={selectedWord === i}
                  onSelect={() => setSelectedWord(selectedWord === i ? null : i)}
                />
              ))}
            </div>

            <div className="flex items-center gap-3 flex-wrap mb-4">
              {(Object.keys(TIER_LABEL) as ScoreTier[]).map((tier) => (
                <div key={tier} className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: TIER_COLOR[tier] }} />
                  <span className="text-xs text-slate-500">{TIER_LABEL[tier]}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Overall</p>
                  <p className="font-[var(--font-display)] font-bold text-sm text-slate-900">{Math.round(active.pronunciation.overall)}%</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <ListChecks className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-violet-600 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-500">Words</p>
                  <p className="font-[var(--font-display)] font-bold text-sm text-slate-900">{active.pronunciation.words.length}</p>
                </div>
              </div>
            </div>

            {/* Frase resaltada con el mismo color por palabra que el chat (S6-T3) */}
            <p className="text-sm text-slate-500 leading-relaxed mt-4 pt-4 border-t border-slate-100">
              {segments.map((s, i) => (
                <span
                  key={i}
                  className="underline decoration-2 underline-offset-2"
                  style={{ textDecorationColor: s.score != null ? scoreColor(s.score) : 'transparent' }}
                >
                  {s.text}{' '}
                </span>
              ))}
            </p>
          </div>
        </div>

        {selected && <WordDetail word={selected} onClose={() => setSelectedWord(null)} />}
      </div>
    </div>
  );
}
