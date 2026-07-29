import { useEffect, useRef } from 'react';
import type { AudioEngine } from '@shared/contracts';
import { dbToColor } from './colormap';

/**
 * Espectrograma en tiempo real (S5-T3). Dueño: Monestel (UI).
 *
 * Técnica del tip del proyecto: la imagen se desplaza con
 * drawImage de si misma (scroll horizontal) y se dibuja una columna
 * nueva por cada AudioFrame recibido. Consume AudioEngine.onFrame
 * genérico — funciona igual con mockAudioEngine (desarrollo, FFT
 * simulado) que con el motor real cuando Fabrizio lo entregue (S3-T1).
 */

interface Props {
  audio: AudioEngine;
  width?: number;
  height?: number;
}

export function Spectrogram({ audio, width = 640, height = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#020617';
    ctx.fillRect(0, 0, width, height);

    const unsubscribe = audio.onFrame((frame) => {
      // Desplaza todo el contenido 1px a la izquierda (imagen de si misma)
      ctx.drawImage(canvas, 1, 0, width - 1, height, 0, 0, width - 1, height);

      // Dibuja la columna nueva a la derecha: un pixel por bin de fftDb,
      // interpolado a la altura del canvas
      const bins = frame.fftDb.length;
      for (let y = 0; y < height; y++) {
        const bin = Math.floor(((height - 1 - y) / height) * bins);
        const db = frame.fftDb[bin] ?? -80;
        ctx.fillStyle = dbToColor(db);
        ctx.fillRect(width - 1, y, 1, 1);
      }
    });

    return unsubscribe;
  }, [audio, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      aria-label="Espectrograma del microfono"
    />
  );
}
