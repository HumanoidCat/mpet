import { useEffect, useRef } from 'react';
import type { AudioEngine } from '@shared/contracts';

/**
 * Waveform en tiempo real sobre Canvas (S3-T2).
 * Duenio actual: Alejandro (modulo UI asumido).
 *
 * Buffer deslizante de las ultimas muestras + dibujo min/max por columna de
 * pixeles en requestAnimationFrame (objetivo RF-03: >= 30 fps).
 * Con autoganancia de visualizacion: escala la onda al pico reciente para
 * que la voz a volumen normal sea visible sin saturar.
 */

const BUFFER_SECONDS = 2;
const SAMPLE_RATE = 16000;
const BUFFER_SIZE = BUFFER_SECONDS * SAMPLE_RATE;

interface Props {
  audio: AudioEngine;
  width?: number;
  height?: number;
}

export function Waveform({ audio, width = 640, height = 110 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
          const start = writeposRef.current;

          // Fondo oscuro del panel
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(0, 0, width, height);

          // Linea central
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, height / 2);
          ctx.lineTo(width, height / 2);
          ctx.stroke();

          // Autoganancia: pico del buffer visible (minimo 0.05 para no
          // amplificar el ruido de fondo hasta llenar la pantalla)
          let peak = 0.05;
          for (let i = 0; i < BUFFER_SIZE; i += 16) {
            const v = Math.abs(buf[i]);
            if (v > peak) peak = v;
          }
          const gain = 0.9 / peak;

          // Onda min/max por columna
          const samplesPerPx = Math.floor(BUFFER_SIZE / width);
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1;
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
            const yMin = ((1 - Math.max(-1, min * gain)) / 2) * height;
            const yMax = ((1 - Math.min(1, max * gain)) / 2) * height;
            ctx.moveTo(x + 0.5, yMin);
            ctx.lineTo(x + 0.5, Math.abs(yMin - yMax) < 1 ? yMax + 1 : yMax);
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
      aria-label="Forma de onda del microfono"
    />
  );
}
