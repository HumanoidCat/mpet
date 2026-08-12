import { BookOpen, ChevronDown, ChevronUp, CheckCircle2, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import type { ChatMessage, Edit } from '@shared/contracts';
import { buildSegments } from '../chat/highlight';
import { computeGrammarStats } from './grammarStats';
import { TYPE_LABEL } from './editTypeLabel';

/**
 * Pantalla standalone de Grammar (S3-T4 shell). Dueño: Monestel (UI).
 *
 * Conectado al historial REAL de correcciones (`ChatMessage.correction`,
 * que ya llena el T5 real de Isaac vía el orquestador). Ya no usa el
 * ejemplo fijo del prototipo de Figma Make: si todavía no hay
 * correcciones en la sesión, se muestra un estado vacío honesto en vez
 * de datos inventados.
 *
 * Nota: el `Edit` real no trae una explicación de regla gramatical ni
 * frases de ejemplo (eso no existe en el contrato) — por eso esta
 * version solo muestra original -> corregido + tipo, sin inventar
 * explicaciones que el modelo no dio.
 */

interface Props {
  messages?: ChatMessage[];
}

const TYPE_COLOR: Record<Edit['type'], string> = {
  grammar: '#DC2626',
  spelling: '#D97706',
  'word-choice': '#2563EB',
};

function OriginalText({ text, edits }: { text: string; edits: Edit[] }) {
  const segments = buildSegments(text, edits);
  return (
    <p className="text-base sm:text-lg leading-relaxed text-slate-700 font-medium">
      {segments.map((s, i) => {
        if (s.kind === 'fix') return null; // el "Original" solo muestra lo dicho, no la correccion
        return s.kind === 'error' ? (
          <span key={i} className="bg-red-100 text-red-700 px-1 rounded underline decoration-red-400 decoration-wavy">
            {s.text}{' '}
          </span>
        ) : (
          <span key={i}>{s.text}{' '}</span>
        );
      })}
    </p>
  );
}

function CorrectedText({ text, edits }: { text: string; edits: Edit[] }) {
  const segments = buildSegments(text, edits);
  return (
    <p className="text-base sm:text-lg leading-relaxed text-slate-800 font-medium">
      {segments.map((s, i) => {
        if (s.kind === 'error') return null; // el "Corrected" solo muestra el resultado final
        return s.kind === 'fix' ? (
          <span key={i} className="bg-green-100 text-green-800 px-1 rounded font-semibold">
            {s.text}{' '}
          </span>
        ) : (
          <span key={i}>{s.text}{' '}</span>
        );
      })}
    </p>
  );
}

function CorrectionCard({ edit }: { edit: Edit }) {
  const [expanded, setExpanded] = useState(false);
  const color = TYPE_COLOR[edit.type];
  return (
    <div className="rounded-2xl border overflow-hidden transition-all" style={{ borderColor: color + '40' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 sm:py-4 text-left hover:opacity-90 transition-opacity active:opacity-80"
        style={{ background: color + '0d' }}
      >
        <div className="flex-1 flex items-center gap-2 sm:gap-4 min-w-0 flex-wrap">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full flex-shrink-0"
            style={{ background: color + '20', color }}
          >
            {TYPE_LABEL[edit.type]}
          </span>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium text-red-700 line-through">{edit.original}</span>
            <span className="text-slate-400">→</span>
            <span className="font-mono text-sm font-semibold text-green-700">{edit.corrected}</span>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-slate-500 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />}
      </button>

      {/* Sin "Grammar Rule" / "Example Sentences" inventados: el contrato
          real no trae esa explicacion. Si Isaac la agrega en el futuro
          (shared-change), este panel es donde se mostraria. */}
      {expanded && (
        <div className="px-4 sm:px-5 py-3 bg-white border-t text-sm text-slate-500" style={{ borderColor: color + '40' }}>
          Corrección de tipo <span className="font-medium">{TYPE_LABEL[edit.type]}</span> detectada automáticamente por el modelo de gramática.
        </div>
      )}
    </div>
  );
}

export default function GrammarScreen({ messages = [] }: Props) {
  const { corrected, totalEdits, totalUserMsgs, cleanMsgs, score } = computeGrammarStats(messages);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
      <div className="max-w-4xl mx-auto flex flex-col gap-4 sm:gap-5">
        <div>
          <h2 className="font-[var(--font-display)] font-bold text-base sm:text-lg text-slate-900">Corrección de gramática</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {corrected.length} {corrected.length === 1 ? 'frase con corrección' : 'frases con corrección'} en esta sesión
          </p>
        </div>

        {corrected.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
            <BookOpen className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-500">Todavía no hay correcciones en esta sesión</p>
            <p className="text-xs text-slate-400 mt-1">Habla en la pestaña Chat para ver aquí las correcciones reales.</p>
          </div>
        ) : (
          <>
            {/* Antes / Después de la corrección más reciente */}
            {(() => {
              const last = corrected[corrected.length - 1];
              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-white rounded-2xl border border-red-200 p-4 sm:p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-xs font-semibold text-red-600 uppercase tracking-wider">Dijiste</p>
                    </div>
                    <OriginalText text={last.text} edits={last.correction!.edits} />
                  </div>
                  <div className="bg-white rounded-2xl border border-green-200 p-4 sm:p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                      <p className="text-xs font-semibold text-green-600 uppercase tracking-wider">Corregido</p>
                    </div>
                    <CorrectedText text={last.text} edits={last.correction!.edits} />
                  </div>
                </div>
              );
            })()}

            {/* Todas las correcciones de la sesion, mas recientes primero */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-slate-500" />
                <h3 className="font-[var(--font-display)] font-bold text-sm text-slate-700">Correcciones detalladas</h3>
                <span className="ml-1 bg-slate-200 text-slate-600 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {totalEdits}
                </span>
              </div>
              {corrected
                .slice()
                .reverse()
                .flatMap((m) => m.correction!.edits.map((e, i) => <CorrectionCard key={`${m.id}-${i}`} edit={e} />))}
            </div>

            {/* Assessment: SOLO metricas calculables de datos reales */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-sm">
              <h3 className="font-[var(--font-display)] font-bold text-sm text-slate-700 mb-4">Evaluación de gramática</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Metric label="Puntaje" value={score != null ? `${score}%` : '—'} color="#2563EB" />
                <Metric label="Errores encontrados" value={String(totalEdits)} color="#DC2626" />
                <Metric label="Frases sin errores" value={`${cleanMsgs}/${totalUserMsgs}`} color="#16A34A" />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-slate-50 rounded-xl p-3 text-center">
      <p className="text-xs text-slate-500 mb-1.5">{label}</p>
      <p className="font-[var(--font-display)] font-extrabold text-lg sm:text-xl" style={{ color }}>
        {value}
      </p>
    </div>
  );
}
