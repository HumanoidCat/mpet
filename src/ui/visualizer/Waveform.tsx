import { useEffect, useRef } from 'react';
import type { AudioEngine } from '@shared/contracts';

/**
 * Waveform en tiempo real sobre Canvas (S3-T2).
 * Duenio actual: Alejandro (modulo UI asumido por baja del integrante).
 *
 * Se suscribe a AudioEngine.onFrame y mantiene un buffer deslizante de las
 * ultimas muestras. Dibuja con requestAnimationFrame para no bloquear la UI
 * (objetivo: 30+ fps, ver RF-03 en la matriz de trazabilidad).
 */

const BUFFER_SECONDS = 2;
const SAMPLE_RATE = 16000;
const BUFFER_SIZE = BUFFER_SECONDS * SAMPLE_RATE;

interface Props {
  audio: AudioEngine;
  width?: number;
  height?: number;
}

export function Waveform({ audio, width = 640, height = 120 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Buffer circular de muestras recientes
  const bufferRef = useRef<Float32Array>(new Float32Array(BUFFER_SIZE));
  const writeposRef = useRef(0);

  useEffect(() => {
    const unsubscribe = audio.onFrame((frame) => {
      const buf = bufferRef.current;
      let pos = writeposRef.current;
      for (let i = 0; i < frame.pcm.length; i++) {
        buf[pos] = frame.pcm[i];
        pos = (pos + 1) % BUFFER_SIZE;
      }
      writeposRef.current = pos;
    });

    let rafId = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const buf = bufferRef.current;
          const start = writeposRef.current; // muestra mas antigua
          ctx.clearRect(0, 0, width, height);

          // Linea central (referencia de amplitud cero)
          ctx.strokeStyle = '#e5e7eb';
          ctx.beginPath();
          ctx.moveTo(0, height / 2);
          ctx.lineTo(width, height / 2);
          ctx.stroke();

          // Onda: un valor min/max por columna de pixeles
          const samplesPerPx = Math.floor(BUFFER_SIZE / width);
          ctx.strokeStyle = '#2563eb';
          ctx.beginPath();
          for (let x = 0; x < width; x++) {
            let min = 1.0;
            let max = -1.0;
            const base = start + x * samplesPerPx;
            for (let s = 0; s < samplesPerPx; s++) {
              const v = buf[(base + s) % BUFFER_SIZE];
              if (v < min) min = v;
              if (v > max) max = v;
            }
            const yMin = ((1 - min) / 2) * height;
            const yMax = ((1 - max) / 2) * height;
            ctx.moveTo(x + 0.5, yMin);
            ctx.lineTo(x + 0.5, yMax);
          }
          ctx.stroke();
        }
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
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: '100%', maxWidth: width, border: '1px solid #e5e7eb', borderRadius: 8 }}
      aria-label="Forma de onda del microfono"
    />
  );
}
