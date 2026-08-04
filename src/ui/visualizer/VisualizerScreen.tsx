import { useEffect, useState } from 'react';
import type { AudioEngine } from '@shared/contracts';
import { SAMPLE_RATE, FFT_SIZE } from '@shared/constants';
import { Waveform } from './Waveform';
import { Spectrogram } from './Spectrogram';
import { PitchTrace } from './PitchTrace';

/**
 * Pantalla standalone del visualizador (S3-T2 shell). Dueño: Monestel (UI).
 * Usa el Waveform real conectado a AudioEngine — NO el canvas de seno
 * falso del prototipo de Figma Make.
 *
 * Importante: esta pantalla NO controla el micrófono (no llama
 * audio.start()/stop()). El único dueño de ese estado es el orquestador
 * de Alejandro (src/core/orchestrator.ts), disparado desde el botón de
 * Chat. Aquí solo nos suscribimos a onFrame para mostrar la señal en
 * vivo mientras haya una grabación activa desde Chat.
 *
 * "Signal Information" muestra SOLO métricas reales (Sampling Rate real,
 * RMS Energy calculada en vivo desde AudioFrame.energy, duración real).
 * El espectrograma y el contorno de tono ya consumen datos reales: la STFT
 * (S3-T1) y el detector YIN (S5-T1) de Fabrizio están integrados al motor a
 * través de src/core/audioEngineAdapter.ts, así que `pitchHz` dejó de ser
 * null y `fftDb` viene del micrófono.
 */

interface Props {
  audio: AudioEngine;
}

export function VisualizerScreen({ audio }: Props) {
  const [energy, setEnergy] = useState(0);
  const [duration, setDuration] = useState(0);
  const [receivingFrames, setReceivingFrames] = useState(false);

  useEffect(() => {
    const off = audio.onFrame((frame) => {
      setReceivingFrames(true);
      setEnergy(frame.energy);
      setDuration(frame.t);
    });
    return off;
  }, [audio]);

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-5">
      <div>
        <h2 className="font-[var(--font-display)] font-bold text-lg text-slate-900">Visualizer</h2>
        <p className="text-sm text-[var(--color-muted)]">Señal del micrófono en tiempo real</p>
      </div>

      {!receivingFrames && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 text-sm text-blue-700">
          Todavía no hay señal — ve a <span className="font-medium">Chat</span> y presiona el micrófono para grabar.
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[var(--color-border)] p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Real-time Waveform — dominio del tiempo
          </p>
          {receivingFrames && (
            <span className="flex items-center gap-1 text-xs font-medium text-green-600">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> LIVE
            </span>
          )}
        </div>
        <div className="rounded-xl overflow-hidden w-full">
          <Waveform audio={audio} width={900} height={160} />
        </div>
      </div>

      {/* Signal Information: SOLO métricas reales, ninguna inventada */}
      <div className="bg-white rounded-2xl border border-[var(--color-border)] p-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Signal Information</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Metric label="Sampling Rate" value={`${SAMPLE_RATE.toLocaleString('en-US')} Hz`} />
          <Metric label="FFT Size (config)" value={`${FFT_SIZE} bins`} />
          <Metric label="RMS Energy" value={energy.toFixed(3)} />
          <Metric label="Signal Duration" value={`${duration.toFixed(1)} s`} />
        </div>
        {/*
          Aqui iba una nota de equipo que se renderizaba al usuario, diciendo que
          Dominant Freq, Noise Level y VAD "se agregan cuando el FFT este listo".
          El FFT esta integrado desde S3-T1, asi que la nota quedo falsa. Si esas
          tres metricas se agregan, salen de `AudioFrame.fftDb` y `energy`.
        */}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-[var(--color-border)] p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Espectrograma — STFT
          </p>
          <div className="rounded-xl overflow-hidden w-full">
            <Spectrogram audio={audio} width={420} height={180} />
          </div>
          <p className="text-xs text-[var(--color-muted)] mt-2">
            Transformada de Fourier de tiempo corto, ventana de Hann de {FFT_SIZE} muestras.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-[var(--color-border)] p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Pitch Tracking
          </p>
          <div className="rounded-xl overflow-hidden w-full">
            <PitchTrace audio={audio} width={420} height={180} />
          </div>
          <p className="text-xs text-[var(--color-muted)] mt-2">
            Frecuencia fundamental por autocorrelación (YIN), rango de voz 60–400 Hz.
          </p>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--color-muted)]">{label}</p>
      <p className="font-mono text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}
