import type { AudioEngine } from '@shared/contracts';
import { Waveform } from './Waveform';

/**
 * Pantalla standalone del visualizador (S3-T2 shell). Dueño: Monestel (UI).
 * Usa el Waveform real conectado a AudioEngine — NO el canvas de seno
 * falso del prototipo de Figma Make. El espectrograma + overlay de pitch
 * (S5-T3, S5-T4) todavía no existen, se agregan cuando el DSP real de
 * Fabrizio esté listo; por ahora se deja el aviso "Próximamente".
 */

interface Props {
  audio: AudioEngine;
}

export function VisualizerScreen({ audio }: Props) {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-5">
      <div>
        <h2 className="font-[var(--font-display)] font-bold text-lg text-slate-900">Visualizer</h2>
        <p className="text-sm text-[var(--color-muted)]">Señal del micrófono en tiempo real</p>
      </div>

      <div className="bg-white rounded-2xl border border-[var(--color-border)] p-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          Waveform — dominio del tiempo
        </p>
        <div className="rounded-xl overflow-hidden w-full">
          <Waveform audio={audio} width={900} height={160} />
        </div>
      </div>

      <div className="bg-slate-50 rounded-2xl border border-dashed border-[var(--color-border)] p-6 text-center">
        <p className="text-sm font-medium text-slate-500">Espectrograma + contorno de pitch</p>
        <p className="text-xs text-[var(--color-muted)] mt-1">
          Próximamente — Semana 5 (S5-T3, S5-T4), cuando el DSP real esté disponible.
        </p>
      </div>
    </div>
  );
}
