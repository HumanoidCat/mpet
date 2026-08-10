import { CheckCircle2, RefreshCw, WifiOff, Package } from 'lucide-react';

/**
 * Pantalla standalone de Models (limpieza de datos falsos, S6-T3+).
 * Dueño: Monestel (UI).
 *
 * Conectada al progreso REAL de `AIPipeline.init()` (evento `model-progress`
 * del event bus, el mismo estado que ya consume `Splash.tsx`) en vez del
 * catálogo escrito a mano del prototipo de Figma Make, que listaba modelos
 * que no existen (p. ej. "Phoneme Analyzer, 124 MB"). El contrato real no
 * reporta tamaño en disco, versión ni categoría por modelo — esta pantalla
 * no inventa esos datos.
 */

export interface ModelEntry {
  /** Identificador real del modelo (p. ej. "Xenova/whisper-tiny.en"). */
  name: string;
  /** 0–1 */
  progress: number;
}

interface Props {
  models: ModelEntry[];
  modelsReady: boolean;
}

export default function ModelsScreen({ models, modelsReady }: Props) {
  const readyCount = models.filter((m) => m.progress >= 1).length;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
      <div className="max-w-3xl mx-auto flex flex-col gap-4 sm:gap-5">
        <div>
          <h2 className="font-[var(--font-display)] font-bold text-base sm:text-lg text-slate-900">AI Models</h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {readyCount}/{models.length} modelos cargados en esta sesión
          </p>
        </div>

        {models.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 p-8 text-center">
            <Package className="w-6 h-6 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-500">Todavía no se reportó progreso de carga</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {models.map((model) => {
              const done = model.progress >= 1;
              const pct = Math.round(model.progress * 100);
              return (
                <div key={model.name} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Package className="w-4 h-4 text-slate-400 flex-shrink-0" />
                      <span className="font-mono text-xs sm:text-sm text-slate-800 truncate">{model.name}</span>
                    </div>
                    <div
                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold flex-shrink-0"
                      style={
                        done
                          ? { background: '#F0FDF4', color: '#16A34A', border: '1px solid #A7F3D0' }
                          : { background: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }
                      }
                    >
                      {done ? <CheckCircle2 className="w-3 h-3" /> : <RefreshCw className="w-3 h-3 animate-spin" />}
                      {done ? 'Ready' : `${pct}%`}
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: done ? '#16A34A' : '#2563EB' }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {modelsReady && (
          <div className="flex items-start gap-3 bg-green-50 rounded-2xl border border-green-200 px-4 sm:px-5 py-4">
            <WifiOff className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-green-800">Corren en tu navegador</p>
              <p className="text-xs text-green-600 mt-0.5">
                Todos los modelos se ejecutan localmente en Web Workers — no se envía audio ni texto a ningún servidor.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
