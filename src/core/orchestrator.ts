import type {
  AIPipeline,
  AudioEngine,
  ChatMessage,
  EventBus,
  PronunciationScorer,
  SupportedLanguage,
  Transcription,
} from '@shared/contracts';
import { compararConObjetivo } from './fraseObjetivo';
import { detectarIdiomaEscrito } from './idiomaEscrito';

/**
 * Orquestador (S2-T7 + S6). Duenio: Alejandro.
 *
 * Cablea el flujo de un turno de conversacion:
 *   boton mic -> captura (AudioEngine) -> ASR -> gramatica -> mensajes al chat
 *                                             -> puntaje de pronunciacion (async)
 *                                             -> sugerencias (async)
 *
 * Los modulos llegan por inyeccion de dependencias: se sustituyen por mocks o
 * por los reales sin tocar este archivo.
 *
 * POR QUE EL PUNTAJE Y LAS SUGERENCIAS SE CALCULAN APARTE DEL TURNO
 * Puntuar exige sintetizar la frase de referencia, y una frase nueva tarda unos
 * diez segundos la primera vez (despues sale de la cache del TTS). Sugerir exige
 * generar texto con un modelo. El proyecto se comprometio a devolver
 * retroalimentacion en menos de dos segundos, que es el limite por debajo del
 * cual la correccion sigue siendo util al hablar. Por eso el turno responde con
 * transcripcion, correccion y respuesta del tutor, y lo demas llega cuando esta
 * listo.
 *
 * COMO LLEGAN A LA INTERFAZ
 * Se vuelve a emitir el MISMO mensaje, con el mismo `id`, ya con `pronunciation`
 * lleno. La interfaz actualiza el mensaje existente en vez de agregar uno nuevo.
 *
 * Se descarto un evento propio del tipo `{ pronunciation, messageId }`: mandaria
 * un delta, y un delta no se puede aplicar si el receptor todavia no tiene ese
 * mensaje. Reemitir el mensaje completo manda estado en vez de cambio, con lo
 * que la operacion es idempotente: repetir el evento no duplica ni corrompe.
 *
 * La semantica de alta-o-actualizacion esta documentada en `AppEvent`
 * (`src/shared/contracts.ts`), porque es la frontera que consume la interfaz.
 *
 * QUE TEXTO SE SINTETIZA COMO REFERENCIA — CORREGIDO EN S9-T3
 *
 * Hasta agosto se sintetizaba `transcription.text`, o sea **lo que el estudiante
 * acababa de decir**. El razonamiento escrito entonces era que sintetizar la frase
 * corregida compararia dos secuencias de palabras distintas. Eso vale para la
 * gramatica, pero se extendio a toda la referencia sin ver la consecuencia:
 *
 *   la transcripcion ya lleva dentro el error de pronunciacion.
 *
 * Si el estudiante dice `sheep` donde iba `ship`, el reconocedor escribe `sheep`,
 * el sintetizador dice `sheep`, y el estudiante se compara contra su propio error.
 * **El puntaje no podia detectar una palabra mal dicha, por construccion.** Lo
 * detecto Fabrizio midiendo con voz real (S9-T3); fue un error de diseno mio y
 * estuvo activo varias semanas.
 *
 * Ahora se sintetiza la **frase objetivo**: lo que se le pidio repetir. Y si no hay
 * frase objetivo —conversacion libre— **no se puntua**, porque no existe una
 * pronunciacion correcta contra la que comparar. Mejor ningun numero que uno que
 * en realidad mide cuanto se parece la voz del estudiante a la del sintetizador.
 *
 * LIMITE QUE SIGUE ABIERTO
 * Incluso con la referencia correcta, el puntaje acustico depende mas de quien
 * habla que de como pronuncia: cambiar de voz cuesta +7.08 de distancia y
 * pronunciar mal solo +1.20 (R03). Por eso el modo practica combina este puntaje
 * con la comparacion de la transcripcion contra el objetivo
 * (`src/core/fraseObjetivo.ts`), que es la unica senal independiente del hablante.
 */

export type OrchestratorState = 'idle' | 'recording' | 'processing';

/**
 * Duraciones de un turno, en milisegundos. Para cerrar R06 (S8-T7).
 *
 * El presupuesto de dos segundos se aplica a `retroalimentacion` —transcripcion
 * mas correccion—, que es lo que pierde valor si tarda: una correccion que llega
 * tarde ya no se conecta con lo que el estudiante acaba de decir. La respuesta
 * del tutor admite mas, porque una pausa de segundo y medio antes de contestar es
 * lo normal en una conversacion (ver D-15).
 */
export interface TiemposTurno {
  /** Reconocimiento de voz. */
  asr: number;
  /** Correccion gramatical. */
  gramatica: number;
  /** ASR + gramatica: lo que cubre el presupuesto de 2 s. */
  retroalimentacion: number;
  /** Generacion de la respuesta del tutor, dentro del turno pero despues. */
  tutor: number;
  /** Desde que se suelta el microfono hasta que el tutor responde. */
  total: number;
  /** Muestras de audio del turno, para poder normalizar por duracion hablada. */
  muestras: number;
}

export interface Orchestrator {
  /** Estado actual del turno. */
  getState(): OrchestratorState;
  /** Alterna el microfono: idle -> grabando -> procesando -> idle. */
  toggleMic(): Promise<void>;
  /**
   * Turno escrito: el estudiante teclea en vez de hablar.
   *
   * POR QUE EXISTE: practicar gramatica y vocabulario no necesita el microfono, y
   * exigirlo deja fuera tres situaciones normales — estar en un sitio donde no se
   * puede hablar, no tener microfono, o simplemente querer trabajar la escritura.
   * La correccion gramatical, las sugerencias y el tutor operan sobre TEXTO: el
   * reconocedor solo estaba ahi para producirlo.
   *
   * QUE NO HACE, y es deliberado: **no puntua pronunciacion**. No hay audio que
   * comparar. Es la misma regla que ya rige la conversacion libre (ver cabecera):
   * sin algo contra que comparar, no se inventa un numero.
   */
  submitText(text: string): Promise<void>;
  /** Carga los modelos de IA (reporta progreso via event bus). */
  init(): Promise<void>;
  /**
   * Fija la frase que el estudiante debe repetir, o `null` para conversacion
   * libre.
   *
   * Es lo que decide si se puntua la pronunciacion: sin objetivo no hay una
   * pronunciacion correcta contra la que comparar (ver cabecera). La interfaz la
   * fija al entrar al modo practica y la limpia al salir.
   */
  setFraseObjetivo(texto: string | null): void;
  /** Frase objetivo vigente, o `null` si se esta en conversacion libre. */
  getFraseObjetivo(): string | null;
  /**
   * Tiempos del ultimo turno completado, o `null` si todavia no hubo ninguno.
   * Existe para poder medir R06 con la aplicacion real en vez de estimarlo.
   */
  getTiempos(): TiemposTurno | null;
}

interface Deps {
  audio: AudioEngine;
  ai: AIPipeline;
  bus: EventBus;
  /**
   * Opcional: si no se inyecta, el turno funciona igual y no se puntua. Permite
   * ejercitar el flujo de conversacion sin arrastrar el comparador.
   */
  scorer?: PronunciationScorer;
}

let nextId = 0;
const newId = () => `msg-${Date.now()}-${nextId++}`;

export function createOrchestrator({ audio, ai, bus, scorer }: Deps): Orchestrator {
  let state: OrchestratorState = 'idle';
  const history: ChatMessage[] = [];
  /** `null` = conversacion libre, y entonces no se puntua la pronunciacion. */
  let fraseObjetivo: string | null = null;
  let tiempos: TiemposTurno | null = null;

  /**
   * Aplica un cambio a un mensaje ya publicado y lo vuelve a emitir.
   *
   * POR QUE SE LEE DEL HISTORIAL Y NO DE UNA COPIA CAPTURADA
   * Dos calculos corren fuera del turno sobre el mismo mensaje: el puntaje de
   * pronunciacion y las sugerencias. Si cada uno reconstruyera el mensaje a
   * partir de la copia que recibio al arrancar, el que terminara segundo
   * borraria el campo del primero, porque su copia no lo tiene. Leyendo del
   * historial en el momento de aplicar, los dos cambios se acumulan.
   *
   * Se construye un objeto nuevo en vez de mutar el existente: la interfaz
   * necesita una referencia distinta para redibujar.
   */
  function actualizarMensaje(id: string, cambio: Partial<ChatMessage>): void {
    const i = history.findIndex((m) => m.id === id);
    if (i === -1) return;

    const actualizado: ChatMessage = { ...history[i], ...cambio };
    history[i] = actualizado;
    // Mismo `id`: la interfaz actualiza el mensaje en vez de agregar otro.
    bus.emit({ type: 'message', message: actualizado });
  }

  /**
   * Pide sugerencias para lo que dijo el estudiante y las adjunta al mensaje.
   *
   * Fuera del turno, por lo mismo que el puntaje: generar texto con un modelo
   * tarda mas de lo que el proyecto se comprometio a esperar. Si el pipeline
   * todavia no las implementa devuelve lista vacia y no se emite nada, que es
   * mejor que mostrar una seccion de sugerencias en blanco.
   */
  async function suggest(message: ChatMessage, texto: string): Promise<void> {
    if (texto.trim().length === 0) return;

    try {
      const suggestions = await ai.suggest(texto);
      if (suggestions.length === 0) return;
      actualizarMensaje(message.id, { suggestions });
    } catch (err) {
      bus.emit({
        type: 'error',
        stage: 'suggestions',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Puntua la pronunciacion y actualiza el mensaje ya publicado.
   *
   * Se ejecuta fuera del turno a proposito (ver cabecera). Los fallos no
   * interrumpen la conversacion: se informan por el bus y el mensaje se queda
   * sin puntaje, que es honesto, en vez de mostrar un numero inventado.
   */
  async function scorePronunciation(
    message: ChatMessage,
    pcm: Float32Array,
    transcription: Transcription
  ): Promise<void> {
    // Sin comparador, sin palabras reconocidas o sin audio no hay nada que medir.
    if (!scorer || transcription.words.length === 0 || pcm.length === 0) return;

    // SIN FRASE OBJETIVO NO SE PUNTUA. Ver la cabecera del archivo: sintetizar la
    // transcripcion comparaba al estudiante contra su propia equivocacion.
    if (!fraseObjetivo) return;

    try {
      const referencePcm = await ai.speak(fraseObjetivo);
      // El sintetizador puede no estar disponible todavia: devuelve vacio y se
      // omite el puntaje en silencio, sin ensuciar el chat con un error.
      if (referencePcm.length === 0) return;

      // Las dos senales tienen que recorrer la MISMA cadena, o el puntaje mide
      // la diferencia entre las dos rutas en vez de la pronunciacion. El PCM del
      // usuario sale de `stop()` y ya viene acondicionado; el del sintetizador
      // viene crudo. Se declara cada caso en vez de suponerlo (ver
      // `AnalyzeOptions`): el acondicionamiento no es idempotente.
      const [userFrames, referenceFrames] = await Promise.all([
        audio.analyze(pcm, { conditioned: true }),
        audio.analyze(referencePcm),
      ]);

      const pronunciation = await scorer.score(
        userFrames,
        referenceFrames,
        transcription.words
      );

      actualizarMensaje(message.id, { pronunciation });
    } catch (err) {
      bus.emit({
        type: 'error',
        stage: 'pronunciation',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Lo que ocurre despues de tener el texto del estudiante, venga de donde venga.
   *
   * POR QUE ESTA EXTRAIDO: el turno hablado y el escrito solo se diferencian en
   * COMO se obtiene el texto y en si hay audio que puntuar. Todo lo demas
   * —correccion, comparacion con la frase objetivo, respuesta del tutor,
   * sugerencias, orden de las llamadas— es identico, y duplicarlo garantizaria
   * que los dos caminos se separen en cuanto alguien toque uno solo.
   *
   * `audio` ausente significa turno escrito: sin puntaje de pronunciacion, porque
   * no hay nada que comparar.
   */
  async function completarTurno(
    texto: string,
    idioma: SupportedLanguage,
    audio: { pcm: Float32Array; transcription: Transcription } | null,
    marcas: { t0: number; tAsr: number },
    /**
     * Lo que el estudiante dijo, ya en ingles. Solo llega cuando hablo en
     * espanol, y viene del propio reconocedor (`Transcription.englishText`).
     *
     * POR QUE ESTO CAMBIA TODO EL DISENIO DEL TUTOR BILINGUE. Antes el tutor
     * tenia que ser un modelo de chat multilingue: recibia espanol y debia
     * traducir y conversar a la vez. Eso costaba 7 segundos por turno. Con la
     * traduccion ya hecha, al tutor le llega ingles y puede volver a ser el
     * modelo rapido: solo tiene que conversar.
     */
    ingles?: string
  ): Promise<void> {
    // LA CORRECCION GRAMATICAL SE SALTA EN ESPANOL. El corrector es un T5
    // entrenado solo en ingles: pasarle una frase en espanol no da una
    // correccion mala, da basura, y el chat la resaltaria como si fuera un
    // error real del estudiante. Un turno sin correccion es un resultado
    // valido: significa que no habia nada que corregir en ingles.
    const correction =
      idioma === 'es'
        ? { corrected: texto, edits: [] }
        : await ai.correctGrammar(texto);
    const tGramatica = Date.now();

    // En un turno de practica se compara lo dicho contra la frase que se pidio
    // repetir. Es la unica senal que depende de la pronunciacion y no de la voz,
    // y se calcula DENTRO del turno porque es texto contra texto: no cuesta nada
    // y llega junto con la correccion.
    const objetivo = fraseObjetivo;
    const userMsg: ChatMessage = {
      id: newId(),
      role: 'user',
      text: texto,
      correction,
      ...(objetivo ? { target: objetivo, targetMatch: compararConObjetivo(objetivo, texto) } : {}),
      ts: Date.now(),
    };
    history.push(userMsg);
    bus.emit({ type: 'message', message: userMsg });

    // El puntaje corre en otro worker y no compite con nada: se lanza ya. Solo
    // existe si hubo audio: en un turno escrito no hay pronunciacion que medir.
    if (audio) void scorePronunciation(userMsg, audio.pcm, audio.transcription);

    // LA RESPUESTA DEL TUTOR VA ANTES QUE LAS SUGERENCIAS, Y EL ORDEN IMPORTA.
    // Las dos salen del MISMO worker y del MISMO modelo, asi que se atienden
    // una detras de otra. Lanzando primero las sugerencias, la respuesta que el
    // estudiante esta esperando quedaba detras de DOS generaciones que nadie
    // espera —una por cada instruccion de `SUGGESTION_PROMPTS`—, y con un modelo
    // que genera token a token eso se nota de inmediato en el turno.
    //
    // Invertido, la respuesta sale primero y las sugerencias se calculan despues,
    // en segundo plano, actualizando el mismo mensaje cuando terminan. El
    // contrato no cambia: siguen llegando tarde y siguen siendo opcionales.
    // AL TUTOR SIEMPRE LE LLEGA INGLES. Si el estudiante hablo en espanol, lo que
    // se le pasa es la traduccion que hizo el reconocedor, no el espanol crudo.
    //
    // Asi el tutor nunca tiene que saber espanol, que era lo unico que obligaba a
    // usar un modelo de chat multilingue —y lo que costaba 7 segundos por turno—.
    // El bilingue no desaparece: se resuelve antes, en el reconocedor, que ya
    // estaba cargado y sabe hacerlo.
    const historialParaTutor =
      ingles && idioma === 'es'
        ? history.map((m, i) =>
            i === history.length - 1 && m.role === 'user' ? { ...m, text: ingles } : m
          )
        : history;

    // LA INSTRUCCION EN ESPANOL SOLO VALE SI HAY TRADUCCION. `TUTOR_SYSTEM_ES` le
    // dice al modelo que lo que recibe "ya viene en ingles"; si se la damos sin
    // traduccion —lo que pasa en un turno **escrito** en espanol, donde no hay audio
    // que pasar por el reconocedor— la instruccion contradice al dato y el modelo
    // responde cualquier cosa. Sin traduccion se usa la instruccion normal.
    const idiomaTutor: SupportedLanguage = idioma === 'es' && ingles ? 'es' : 'en';
    const replyText = await ai.reply(historialParaTutor, idiomaTutor, ingles);
    const tTutor = Date.now();

    // Las sugerencias son reescrituras en ingles: sobre una frase en espanol no
    // tienen sentido, por la misma razon que la correccion gramatical.
    if (idioma !== 'es') void suggest(userMsg, texto);

    tiempos = {
      asr: marcas.tAsr - marcas.t0,
      gramatica: tGramatica - marcas.tAsr,
      retroalimentacion: tGramatica - marcas.t0,
      tutor: tTutor - tGramatica,
      total: tTutor - marcas.t0,
      muestras: audio ? audio.pcm.length : 0,
    };
    const tutorMsg: ChatMessage = {
      id: newId(),
      role: 'tutor',
      text: replyText,
      ts: Date.now(),
    };
    history.push(tutorMsg);
    bus.emit({ type: 'message', message: tutorMsg });
  }

  /**
   * Turno escrito. Mismo flujo que el hablado, sin reconocedor y sin puntaje.
   *
   * El idioma se detecta sobre el texto en vez de sobre el audio, con la misma
   * consecuencia: en espanol no se corrige gramatica ni se sugiere, y el tutor
   * ayuda a decirlo en ingles.
   */
  async function processTextTurn(texto: string): Promise<void> {
    const limpio = texto.trim();
    if (limpio.length === 0) return;

    state = 'processing';
    try {
      const t0 = Date.now();
      // No hay etapa de reconocimiento: `tAsr` coincide con el inicio para que el
      // reparto de `tiempos` siga siendo valido y la etapa figure en cero, que es
      // lo que realmente costo.
      await completarTurno(limpio, detectarIdiomaEscrito(limpio), null, { t0, tAsr: t0 });
    } catch (err) {
      bus.emit({
        type: 'error',
        stage: 'pipeline',
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      state = 'idle';
    }
  }

  async function processTurn(pcm: Float32Array): Promise<void> {
    state = 'processing';
    try {
      // Grabacion vacia: el usuario pulso y solto sin hablar, o la captura no
      // entrego muestras. Pasarla por el reconocedor cuesta segundos y puede
      // devolver texto inventado, que es peor que no responder nada.
      if (pcm.length === 0) return;

      // Se mide con `Date.now()` y no con `performance.now()` a proposito: la
      // resolucion de milisegundos sobra para etapas de cientos de ms, y asi el
      // nucleo no depende de una API que no existe en el entorno de pruebas.
      const t0 = Date.now();
      // En modo practica se fuerza ingles: se sabe que la frase objetivo esta en
      // ingles, y dejar que el detector dude ante una palabra mal pronunciada solo
      // anade una forma de fallar. En conversacion libre se deja detectar, que es
      // lo que hace posible responder al estudiante cuando recurre al espanol.
      // `alsoTranslate` solo en conversacion libre: en modo practica se sabe que
      // la frase objetivo esta en ingles, asi que no hay nada que traducir y una
      // segunda pasada del reconocedor seria tiempo tirado.
      const transcription = await ai.transcribe(
        pcm,
        fraseObjetivo ? 'en' : undefined,
        !fraseObjetivo
      );
      const tAsr = Date.now();
      bus.emit({ type: 'transcription', result: transcription });

      // Nada reconocible: silencio o ruido de fondo. Se sale sin agregar un
      // mensaje vacio al chat ni pedirle al tutor que responda a nada.
      if (transcription.text.trim().length === 0) return;

      // El idioma decide dos cosas en este turno. Ausente se trata como ingles,
      // que es lo que hacian los modelos de solo ingles antes del bilingue.
      const idioma = transcription.language ?? 'en';

      await completarTurno(
        transcription.text,
        idioma,
        { pcm, transcription },
        { t0, tAsr },
        transcription.englishText
      );
    } catch (err) {
      bus.emit({
        type: 'error',
        stage: 'pipeline',
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      state = 'idle';
    }
  }

  return {
    getState: () => state,

    setFraseObjetivo(texto) {
      const limpio = texto?.trim() ?? '';
      fraseObjetivo = limpio.length > 0 ? limpio : null;
    },

    getFraseObjetivo: () => fraseObjetivo,

    getTiempos: () => tiempos,

    async init() {
      await ai.init((model, progress) => {
        bus.emit({ type: 'model-progress', model, progress });
      });
    },

    async submitText(text) {
      // Misma guarda que el microfono: dos turnos a la vez competirian por los
      // mismos workers y el segundo saldria peor, ademas de desordenar el chat.
      if (state !== 'idle') return;
      await processTextTurn(text);
    },

    async toggleMic() {
      if (state === 'processing') return; // ignorar clicks durante proceso

      if (state === 'idle') {
        await audio.start();
        state = 'recording';
        bus.emit({ type: 'recording-started' });
        return;
      }

      // state === 'recording'
      let pcm: Float32Array;
      try {
        pcm = await audio.stop();
      } catch (err) {
        // Si detener la captura falla y el estado se queda en `recording`, el
        // boton del microfono queda atrapado: la interfaz cree que sigue
        // grabando y el usuario no tiene forma de salir sin recargar. Volver a
        // `idle` deja la aplicacion utilizable aunque se pierda esa grabacion.
        state = 'idle';
        bus.emit({
          type: 'error',
          stage: 'capture',
          error: err instanceof Error ? err.message : String(err),
        });
        return;
      }

      bus.emit({ type: 'recording-stopped', pcm });
      await processTurn(pcm);
    },
  };
}
