import { useEffect, useRef, useState } from 'react';
import type { AudioEngine } from '@shared/contracts';
import { PITCH_MIN_HZ, PITCH_MAX_HZ } from '@shared/constants';

/**
 * Overlay de contorno de pitch (S5-T4). Dueño: Monestel (UI).
 * Igual que el Espectrograma: consume AudioEngine.onFrame genérico,
 * funciona con mockAudioEngine (desarrollo) o el motor real cuando
 * Fabrizio lo entregue (S5-T1). pitchHz === null (unvoiced/silencio)
 * se dibuja como hueco, no como cero — no inventamos pitch donde no hay voz.
 */

interface Props {
  audio: AudioEngine;
  width?: number;
  height?: number;
}

export function PitchTrace({ audio, width = 640, height = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<(number | null)[]>(new Array(width).fill(null));
  const [current, setCurrent] = useState<number | null>(null);

  useEffect(() => {
    const unsubscribe = audio.onFrame((frame) => {
      const hist = historyRef.current;
      hist.shift();
      hist.push(frame.pitchHz);
      setCurrent(frame.pitchHz);
    });

    let rafId = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.fillStyle = '#020617';
        ctx.fillRect(0, 0, width, height);

        const hist = historyRef.current;
        ctx.strokeStyle = '#34d399';
        ctx.lineWidth = 2;
        ctx.beginPath();
        let drawing = false;
        for (let x = 0; x < width; x++) {
          const hz = hist[x];
          if (hz == null) {
            drawing = false;
            continue;
          }
          const t = (hz - PITCH_MIN_HZ) / (PITCH_MAX_HZ - PITCH_MIN_HZ);
          const y = height - Math.min(1, Math.max(0, t)) * height;
          if (!drawing) {
            ctx.moveTo(x, y);
            drawing = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }
      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);

    return () => {
      unsubscribe();
      cancelAnimationFrame(rafId);
    };
  }, [audio, width, height]);

  return (
    <div>
      <canvas ref={canvasRef} width={width} height={height} aria-label="Contorno de pitch" />
      <p className="text-xs text-slate-400 mt-1 font-mono">
        {current != null ? `${current.toFixed(0)} Hz` : 'sin voz detectada'}
      </p>
    </div>
  );
}
