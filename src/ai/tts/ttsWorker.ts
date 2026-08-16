/// <reference lib="webworker" />
/**
 * S5-T5 · Web Worker de síntesis de voz (TTS). Dueño: Isaac.
 *
 * QUÉ PRODUCE: el **audio de referencia** de una frase, como PCM mono a 16 kHz.
 * Ese PCM tiene dos consumidores distintos y por eso el contrato devuelve datos en
 * crudo en vez de reproducir directamente:
 *   1. `src/App.tsx` (Alejandro) lo mete en un `AudioContext` para que el estudiante
 *      lo escuche, con un botón de reproducción lenta a 0.7×.
 *   2. El comparador de pronunciación (Fabrizio) extrae sus MFCC y los alinea contra
 *      los de la voz del estudiante. Sin esta pieza no hay puntaje: es la razón por
 *      la que S5-T5 era la única tarea de la ruta crítica del proyecto.
 *
 * POR QUÉ UN WORKER: la síntesis tarda entre 1.7 s y 7.4 s según la longitud de la
 * frase (medido en S4-T5). En el hilo principal congelaría la interfaz todo ese
 * tiempo. Es además requisito del equipo: cada modelo en su propio Web Worker.
 *
 * POR QUÉ MMS-TTS Y NO SpeechT5: el spike S4-T5 midió las dos familias. SpeechT5
 * solo resulta inteligible sin cuantizar, y así pesa 613 MB — el triple de todo lo
 * que la aplicación descarga hoy. MMS-TTS pesa 109 MB, sintetiza directamente a
 * 16 kHz, carga desde caché en 0.86 s y no necesita vocoder aparte ni vector de voz.
 * Todo el detalle en `docs/evidencias/s4/s4-t5-tts-spike.md`.
 *
 * LIMITACIÓN CONOCIDA Y DOCUMENTADA: MMS-TTS trabaja carácter a carácter y pronuncia
 * mal algunas palabras (*vegetables* sonó como "veyitables"). No se corrige por
 * configuración. La alternativa de mayor calidad (Kokoro-82M) exige dos dependencias
 * nuevas y remuestreo de 24 kHz, así que quedó propuesta aparte para S7-T4
 * (`src/ai/PROPUESTA-kokoro-s7-t4.md`).
 */

import { AutoTokenizer, VitsModel } from '@huggingface/transformers';
import { resample } from '@audio/dsp/resampler';
import { SAMPLE_RATE } from '@shared/constants';
import {
  createRangedProgressAggregator,
  type RawProgressEvent,
} from '../model-cache/progress';
import { normalizeForSpeech } from './textNormalization';
import { getTtsConfig, type KokoroVoice, type TtsRequest, type TtsResponse } from './ttsProtocol';

type Tokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;

/** Lo que devuelve `KokoroTTS.generate()`: la onda y su frecuencia. */
interface KokoroAudio {
  audio: Float32Array;
  sampling_rate: number;
}

interface KokoroTts {
  generate(texto: string, opciones: { voice: string }): Promise<KokoroAudio>;
}

let tokenizer: Tokenizer | null = null;
let model: VitsModel | null = null;
let kokoro: KokoroTts | null = null;
/** Voz con la que sintetiza Kokoro. En MMS-TTS la voz está en los pesos. */
let kokoroVoice: KokoroVoice = 'af_heart';
/** Frecuencia que declara el modelo cargado. Se verifica contra el contrato. */
let sampleRate = 0;

const post = (msg: TtsResponse, transfer?: Transferable[]) =>
  (self as DedicatedWorkerGlobalScope).postMessage(msg, transfer ?? []);

/**
 * Fracción del progreso que se reserva al tokenizador.
 *
 * POR QUÉ NO UN AGREGADOR ÚNICO: el tokenizador son 10 KB y el modelo 109 MB, y se
 * cargan en dos llamadas seguidas. Con un solo agregador la barra llegaba al 100% al
 * terminar el tokenizador y se quedaba clavada durante toda la descarga real — se vio
 * tal cual en el spike S4-T5. Repartiendo el rango, la barra refleja lo que tarda.
 */
const TOKENIZER_SHARE = 0.03;

self.onmessage = async (event: MessageEvent<TtsRequest>) => {
  const msg = event.data;

  try {
    if (msg.type === 'init') {
      const config = getTtsConfig(msg.config);

      if (config.engine === 'kokoro') {
        const report = (progress: number) =>
          post({ type: 'progress', model: config.model, progress });

        const progreso = createRangedProgressAggregator(0, 1, report);

        // Import dinámico: así el paquete de Kokoro no entra en el fragmento
        // inicial de la aplicación. Es coherente con la carga bajo demanda del TTS
        // (D-11): quien nunca pide audio no descarga nada de esto.
        const { KokoroTTS } = await import('kokoro-js');

        kokoro = (await KokoroTTS.from_pretrained(config.model, {
          dtype: config.dtype,
          progress_callback: (e: unknown) => progreso.handle(e as RawProgressEvent),
        })) as unknown as KokoroTts;
        progreso.complete();

        kokoroVoice = config.voice;
        // Se guarda la frecuencia NATIVA, no la del proyecto: `speak` remuestrea
        // después, y confundirlas daría un PCM a 24 kHz etiquetado como 16.
        sampleRate = config.nativeSampleRate;

        post({ type: 'ready', model: config.model });
        return;
      }

      if (config.engine !== 'vits') {
        // Las configuraciones de SpeechT5 siguen existiendo en el protocolo porque
        // el spike las usa para reproducir las mediciones de la evidencia, pero
        // ninguna es viable en producción. Fallar con el motivo explícito es mejor
        // que cargar en silencio 613 MB.
        throw new Error(
          `La configuración "${config.id}" usa SpeechT5, descartado por medición en ` +
            'el spike S4-T5 (613 MB para la única variante inteligible). ' +
            'Solo se implementa MMS-TTS en producción.'
        );
      }

      const report = (progress: number) =>
        post({ type: 'progress', model: config.model, progress });

      const tokenizerProgress = createRangedProgressAggregator(0, TOKENIZER_SHARE, report);
      tokenizer = await AutoTokenizer.from_pretrained(config.model, {
        progress_callback: (e) => tokenizerProgress.handle(e as RawProgressEvent),
      });
      tokenizerProgress.complete();

      const modelProgress = createRangedProgressAggregator(TOKENIZER_SHARE, 1, report);
      // Sin casts en las opciones a propósito: así TypeScript verifica de verdad que
      // `dtype` y `progress_callback` existen en la API de transformers.js v3.
      // El cast del resultado sí hace falta: `from_pretrained` está tipado como que
      // devuelve la clase base `PreTrainedModel`.
      model = (await VitsModel.from_pretrained(config.model, {
        dtype: config.dtype,
        progress_callback: (e) => modelProgress.handle(e as RawProgressEvent),
      })) as VitsModel;
      modelProgress.complete();

      sampleRate = (model.config as unknown as { sampling_rate?: number }).sampling_rate ?? 0;

      // El contrato promete PCM a 16 kHz y `App.tsx` crea el AudioContext fijo a esa
      // frecuencia sin remuestrear: si el modelo cambiara, la voz sonaría con el tono
      // alterado y los MFCC de la referencia no serían comparables con los del
      // estudiante. Mejor romper aquí, con el motivo escrito, que sonar mal.
      if (sampleRate !== SAMPLE_RATE) {
        throw new Error(
          `El modelo sintetiza a ${sampleRate} Hz y el proyecto trabaja a ${SAMPLE_RATE} Hz. ` +
            'Haría falta remuestrear antes de devolver el PCM.'
        );
      }

      post({ type: 'ready', model: config.model });
      return;
    }

    if (msg.type === 'speak' && kokoro) {
      // I-07 · Números a letras. Kokoro los convierte por su cuenta, pero la
      // normalización se mantiene: no estorba, cubre casos que su conversor no
      // trata igual, y así el texto que se sintetiza no depende de qué modelo esté
      // cargado — que es lo que permite comparar mediciones entre los dos.
      const texto = normalizeForSpeech(msg.text);
      const salida = await kokoro.generate(texto, { voice: kokoroVoice });

      // Kokoro sale a 24 kHz y el proyecto entero trabaja a 16. Sin remuestrear, la
      // referencia sonaría con el tono alterado y sus MFCC no serían comparables
      // con los del estudiante: el puntaje de pronunciación mediría la diferencia
      // de frecuencia de muestreo, no la de pronunciación.
      const pcm =
        salida.sampling_rate === SAMPLE_RATE
          ? new Float32Array(salida.audio)
          : resample(salida.audio, salida.sampling_rate, SAMPLE_RATE);

      post({ type: 'result', id: msg.id, pcm, sampleRate: SAMPLE_RATE }, [pcm.buffer]);
      return;
    }

    if (msg.type === 'speak') {
      if (!tokenizer || !model) {
        throw new Error('El modelo de TTS no está cargado: llama a init() primero.');
      }

      // I-07 · Números a letras antes de tokenizar. MMS-TTS trabaja carácter a
      // carácter y nunca aprendió que "2" se dice "two": con cifras no pronuncia mal,
      // no pronuncia nada. Medido en S7-T4, donde `$25` dio silencio tres de tres
      // veces. La conversión ocurre aquí y no en el cliente para que cualquiera que
      // use el worker la reciba, venga de donde venga el texto.
      const texto = normalizeForSpeech(msg.text);
      const inputs = tokenizer(texto);
      const { waveform } = await model(inputs);

      // Copia propia antes de transferir: el búfer que devuelve ONNX Runtime puede
      // estar respaldado por memoria que el motor reutiliza en la siguiente
      // inferencia. Transferirlo directamente dejaría al motor sin él. Son ~130 KB
      // por frase, así que la copia es barata y la transferencia evita duplicarla
      // otra vez al cruzar al hilo principal.
      const pcm = new Float32Array(waveform.data as Float32Array);

      post({ type: 'result', id: msg.id, pcm, sampleRate }, [pcm.buffer]);
    }
  } catch (err) {
    post({
      type: 'error',
      id: msg.type === 'speak' ? msg.id : undefined,
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
