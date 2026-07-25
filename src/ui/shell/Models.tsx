import { useState } from 'react'
import {
  HardDrive, Download, Trash2, RefreshCw,
  CheckCircle2, WifiOff, AlertTriangle, Database, Cpu, Package,
} from 'lucide-react'

type ModelStatus = 'installed' | 'downloading' | 'available' | 'update'

interface AIModel {
  id: string
  name: string
  description: string
  size: string
  sizeBytes: number
  version: string
  status: ModelStatus
  category: string
  progress?: number
  lastUsed?: string
}

const MODELS: AIModel[] = [
  { id: 'whisper-medium', name: 'Whisper Medium', description: 'OpenAI speech recognition. Transcribes English speech with high accuracy.', size: '467 MB', sizeBytes: 467, version: 'v3.0.1', status: 'installed', category: 'ASR', lastUsed: '2 hours ago' },
  { id: 'llama-grammar', name: 'LLaMA 3.2 Grammar', description: 'Quantized LLM fine-tuned for English grammar correction and explanation.', size: '1.2 GB', sizeBytes: 1228, version: 'v1.4.0', status: 'installed', category: 'LLM', lastUsed: 'Just now' },
  { id: 'phoneme-analyzer', name: 'Phoneme Analyzer', description: 'IPA-based pronunciation scoring with per-word confidence scores.', size: '124 MB', sizeBytes: 124, version: 'v2.1.3', status: 'update', category: 'Pronunciation', lastUsed: '1 day ago' },
  { id: 'kokoro-tts', name: 'Kokoro TTS', description: 'High-quality text-to-speech synthesis. Natural British and American voices.', size: '312 MB', sizeBytes: 312, version: 'v0.9.2', status: 'installed', category: 'TTS', lastUsed: '2 hours ago' },
  { id: 'whisper-large', name: 'Whisper Large v3', description: 'Highest accuracy speech recognition. Requires more memory.', size: '1.5 GB', sizeBytes: 1536, version: 'v3.0.0', status: 'available', category: 'ASR' },
  { id: 'pitch-tracker', name: 'YIN Pitch Tracker', description: 'Real-time fundamental frequency detection for pitch visualization.', size: '18 MB', sizeBytes: 18, version: 'v1.0.5', status: 'downloading', progress: 63, category: 'DSP' },
  { id: 'fluency-scorer', name: 'Fluency Scorer', description: 'Measures speech rate, pause distribution, and filler word frequency.', size: '89 MB', sizeBytes: 89, version: 'v1.2.0', status: 'available', category: 'Analysis' },
]

const STATUS_CONFIG: Record<ModelStatus, { label: string; color: string; bg: string; border: string }> = {
  installed:   { label: 'Installed',         color: '#16A34A', bg: '#F0FDF4', border: '#A7F3D0' },
  downloading: { label: 'Downloading',       color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE' },
  available:   { label: 'Available',         color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0' },
  update:      { label: 'Update Available',  color: '#D97706', bg: '#FFFBEB', border: '#FCD34D' },
}

const CATEGORY_COLORS: Record<string, string> = {
  ASR: '#7C3AED', LLM: '#2563EB', Pronunciation: '#EA580C',
  TTS: '#0891B2', DSP: '#059669', Analysis: '#DB2777',
}

function ModelCard({ model }: { model: AIModel }) {
  const [progress, setProgress] = useState(model.progress ?? 0)
  const [isDownloading, setIsDownloading] = useState(model.status === 'downloading')

  const effectiveStatus: ModelStatus = isDownloading ? 'downloading' : model.status
  const cfg = STATUS_CONFIG[effectiveStatus]
  const catColor = CATEGORY_COLORS[model.category] || '#64748B'

  const handleDownload = () => {
    setIsDownloading(true)
    setProgress(0)
    const iv = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) { clearInterval(iv); return 100 }
        return p + 2
      })
    }, 80)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 flex flex-col gap-3 sm:gap-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: catColor + '15' }}>
          <Package className="w-5 h-5" style={{ color: catColor }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-display font-700 text-sm text-slate-900">{model.name}</h3>
                <span className="text-xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                  style={{ background: catColor + '15', color: catColor }}>{model.category}</span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{model.description}</p>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold flex-shrink-0"
              style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
              {effectiveStatus === 'installed' && <CheckCircle2 className="w-3 h-3" />}
              {effectiveStatus === 'downloading' && <RefreshCw className="w-3 h-3 animate-spin" />}
              {effectiveStatus === 'update' && <AlertTriangle className="w-3 h-3" />}
              <span className="hidden sm:inline">{cfg.label}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex items-center gap-3 text-xs text-slate-500 font-mono flex-wrap">
        <div className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{model.size}</div>
        <div className="flex items-center gap-1"><Database className="w-3 h-3" />{model.version}</div>
        {model.lastUsed && <div className="flex items-center gap-1"><Cpu className="w-3 h-3" />Used {model.lastUsed}</div>}
      </div>

      {/* Download progress */}
      {effectiveStatus === 'downloading' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-xs">
            <span className="text-blue-600 font-medium">Downloading...</span>
            <span className="font-mono text-blue-700">{Math.round(progress)}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all duration-100" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        {(model.status === 'available' || model.status === 'update') && (
          <button onClick={handleDownload} disabled={isDownloading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-semibold transition-colors disabled:opacity-60">
            <Download className="w-3.5 h-3.5" />
            {model.status === 'update' ? 'Update' : 'Download'}
          </button>
        )}
        {model.status === 'installed' && (
          <>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-50 text-green-700 text-xs font-semibold border border-green-200">
              <WifiOff className="w-3.5 h-3.5" />Ready Offline
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-red-50 hover:text-red-600 active:bg-red-100 text-slate-600 text-xs font-medium transition-colors">
              <Trash2 className="w-3.5 h-3.5" />Delete
            </button>
          </>
        )}
      </div>
    </div>
  )
}

export default function ModelsScreen() {
  const installed = MODELS.filter((m) => m.status === 'installed' || m.status === 'update')
  const totalSize = installed.reduce((acc, m) => acc + m.sizeBytes, 0)

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
      <div className="max-w-4xl mx-auto flex flex-col gap-4 sm:gap-5">
        <div>
          <h2 className="font-display font-700 text-base sm:text-lg text-slate-900">Offline Models</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Manage AI models · Works 100% offline after installation</p>
        </div>

        {/* Storage summary */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
          {/* Metrics: 2-col mobile → 4-col sm+ */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-4">
            {[
              { label: 'Installed', value: installed.length, icon: Package, color: '#2563EB' },
              { label: 'Storage Used', value: `${(totalSize / 1024).toFixed(1)} GB`, icon: HardDrive, color: '#7C3AED' },
              { label: 'Available', value: '4.2 GB', icon: Database, color: '#16A34A' },
              { label: 'Updates', value: '1', icon: RefreshCw, color: '#D97706' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="flex items-center gap-2.5">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: color + '15' }}>
                  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color }} />
                </div>
                <div>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="font-display font-700 text-sm sm:text-base" style={{ color }}>{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Storage bar */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Cache Usage</span>
              <span className="font-mono">{(totalSize / 1024).toFixed(1)} / 6.0 GB</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex gap-0.5">
              {[{ w: 22, color: '#7C3AED' }, { w: 20, color: '#2563EB' }, { w: 14, color: '#0891B2' }, { w: 6, color: '#EA580C' }].map((seg, i) => (
                <div key={i} className="h-full rounded-sm" style={{ width: `${seg.w}%`, background: seg.color }} />
              ))}
            </div>
            <div className="flex gap-3 flex-wrap">
              {[['#7C3AED','LLM'],['#2563EB','ASR'],['#0891B2','TTS'],['#EA580C','Pronunc.'],['#E2E8F0','Free']].map(([color, label]) => (
                <div key={label} className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm" style={{ background: color }} />
                  <span className="text-xs text-slate-400">{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Model cards: 1-col mobile → 2-col md+ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
          {MODELS.map((model) => <ModelCard key={model.id} model={model} />)}
        </div>

        {/* Offline banner */}
        <div className="flex items-start gap-3 bg-green-50 rounded-2xl border border-green-200 px-4 sm:px-5 py-4">
          <WifiOff className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-green-800">100% Offline Ready</p>
            <p className="text-xs text-green-600 mt-0.5">All installed models run entirely in your browser using WebAssembly and WebGPU. No internet required after download.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
