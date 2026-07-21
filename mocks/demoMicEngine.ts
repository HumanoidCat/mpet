import type { AudioEngine, AudioFrame } from '@shared/contracts';
import { SAMPLE_RATE, FRAME_SIZE, N_MFCC } from '@shared/constants';

/**
 * Adaptador de DEMO: captura el microfono real SOLO para visualizacion.
 *
 * NO es el modulo de captura del proyecto (S2-T1, Fabrizio): no tiene
 * AudioWorklet, ni decimacion controlada, ni filtro pasa-banda, ni VAD.
 * Existe unicamente para que la demo muestre la forma de onda de la voz
 * real mientras el modulo real se integra. Vive en mocks/ a proposito.
 *
 * La transcripcion sigue siendo simulada (el ASR real es S2-T4, Isaac).
 */
export function createDemoMicEngine(): AudioEngine {
  let ctx: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let processor: ScriptProcessorNode | null = null;
  let chunks: Float32Array[] = [];
  let t = 0;
  const subs = new Set<(f: AudioFrame) => void>();

  return {
    async start() {
      chunks = [];
      t = 0;
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Chrome remuestrea internamente a 16 kHz (hallazgo del spike S1-T6)
      ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      const source = ctx.createMediaStreamSource(stream);
      // ScriptProcessor esta deprecado pero es suficiente para una demo;
      // el modulo real usara AudioWorklet.
      processor = ctx.createScriptProcessor(FRAME_SIZE, 1, 1);
      const silent = ctx.createGain();
      silent.gain.value = 0; // evita eco: procesamos sin reproducir
      source.connect(processor);
      processor.connect(silent);
      silent.connect(ctx.destination);

      processor.onaudioprocess = (e) => {
        const pcm = new Float32Array(e.inputBuffer.getChannelData(0));
        chunks.push(pcm);
        t += pcm.length / SAMPLE_RATE;
        let sum = 0;
        for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
        const frame: AudioFrame = {
          pcm,
          fftDb: new Float32Array(FRAME_SIZE / 2).fill(-80), // FFT real: S3-T1
          pitchHz: null, // pitch real: S5-T1
          energy: Math.sqrt(sum / pcm.length),
          mfcc: new Array(N_MFCC).fill(0), // MFCC real: S5-T2
          t,
        };
        subs.forEach((cb) => cb(frame));
      };
    },

    async stop() {
      processor?.disconnect();
      stream?.getTracks().forEach((track) => track.stop());
      await ctx?.close();
      processor = null;
      stream = null;
      ctx = null;
      const total = chunks.reduce((acc, c) => acc + c.length, 0);
      const out = new Float32Array(total);
      let offset = 0;
      for (const c of chunks) {
        out.set(c, offset);
        offset += c.length;
      }
      return out;
    },

    onFrame(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },

    async analyze() {
      return []; // analisis offline: llega con el modulo DSP real
    },
  };
}
