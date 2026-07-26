/**
 * S2-T1 — AudioWorkletProcessor de captura.
 *
 * Corre en el hilo de audio en tiempo real: si tarda más de ~2.7 ms por bloque
 * (128 muestras a 48 kHz) el navegador produce glitches audibles. Por eso aquí
 * NO hay DSP: solo acumula los bloques de 128 muestras en un buffer y los
 * postea al hilo principal cuando junta `blockSize`. El filtrado anti-aliasing
 * y el remuestreo (`dsp/resampler.ts`) se hacen del otro lado, donde una
 * demora no corta el audio.
 *
 * Es JavaScript plano a propósito: `addModule()` carga este archivo tal cual
 * (se importa con `?url`), sin pasar por el grafo de módulos de la app, así que
 * no puede importar nada de `src/`.
 *
 * Contrato de mensajes hacia el hilo principal:
 *   { type: 'block', pcm: Float32Array, sampleRate: number }
 */

const DEFAULT_BLOCK_SIZE = 1024;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const blockSize = options?.processorOptions?.blockSize ?? DEFAULT_BLOCK_SIZE;
    this.blockSize = blockSize;
    this.buffer = new Float32Array(blockSize);
    this.filled = 0;
    this.capturing = true;

    this.port.onmessage = (e) => {
      if (e.data?.type === 'stop') {
        this.flush();
        this.capturing = false;
      }
    };
  }

  /** Envía lo acumulado aunque no llegue a `blockSize` (cola de la grabación). */
  flush() {
    if (this.filled === 0) return;
    const pcm = this.buffer.slice(0, this.filled);
    this.port.postMessage({ type: 'block', pcm, sampleRate }, [pcm.buffer]);
    this.filled = 0;
  }

  process(inputs) {
    // inputs[0] = primera entrada; [0] = canal mono (pedimos channelCount: 1).
    const channel = inputs[0]?.[0];
    if (!channel) return this.capturing;

    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.filled++] = channel[i];
      if (this.filled === this.blockSize) {
        // `slice` copia: el buffer se transfiere y no podemos seguir usándolo.
        const pcm = this.buffer.slice(0, this.blockSize);
        this.port.postMessage({ type: 'block', pcm, sampleRate }, [pcm.buffer]);
        this.filled = 0;
      }
    }

    // `true` mantiene vivo el nodo; al parar devolvemos false y se libera.
    return this.capturing;
  }
}

registerProcessor('capture-processor', CaptureProcessor);
