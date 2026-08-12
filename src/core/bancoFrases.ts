/**
 * Banco de frases del modo practica. Duenio: Alejandro (core).
 *
 * POR QUE EXISTE UN BANCO FIJO Y NO FRASES GENERADAS
 * Tres razones, y las tres salen de mediciones del proyecto:
 *
 * 1. **Es lo que hace posible puntuar.** El puntaje de pronunciacion necesita una
 *    frase correcta contra la que comparar. En conversacion libre no la hay, y de
 *    ahi venia el error de diseno que sintetizaba la propia equivocacion del
 *    estudiante (ver `orchestrator.ts`).
 *
 * 2. **Cierra el riesgo R16.** La referencia sintetizada no es reproducible entre
 *    sesiones: la misma frase suena distinta al recargar la pagina, asi que el
 *    mismo estudiante sacaba puntajes distintos por algo ajeno a el. Con un banco
 *    cerrado, cada referencia se sintetiza una vez y se puede guardar.
 *
 * 3. **Permite esquivar lo que el sintetizador no sabe decir.** El conteo de
 *    S7-T4 midio 7 fallos de 14 palabras dificiles, y ademas fallan `water` y
 *    `book`, que eran palabras de control. Un banco curado evita todas.
 *
 * CRITERIO DE CURADO, APLICADO A CADA FRASE
 * - **Sin cifras.** El sintetizador no las dice: ante `$25` no se oye un numero
 *   equivocado, no se oye nada (I-07). Los numeros van escritos con letras.
 * - **Sin las palabras que el sintetizador pronuncia mal**, medidas en S7-T4:
 *   vegetables, ginger, engine, island, salmon, chef, water, book.
 * - **Con pares minimos utiles al hispanohablante** —ship/sheep, bad/bed,
 *   sit/seat, live/leave, pull/pool— porque son el contraste que de verdad cuesta
 *   y el que S6-T7 usa como evidencia.
 * - **Cortas.** Entre cuatro y ocho palabras: el reconocedor necesita contexto
 *   continuo, pero una frase larga acumula errores y diluye el contraste.
 */

/** Una frase para repetir, con lo que la hace util. */
export interface FrasePractica {
  id: string;
  /** El texto que el estudiante debe repetir. */
  texto: string;
  /**
   * Palabra donde esta el contraste que se practica. Sirve para explicar por que
   * se propone esta frase, no para puntuar.
   */
  foco: string;
  /** Contraste que se entrena, para mostrarlo junto a la frase. */
  contraste: string;
}

/**
 * Banco cerrado. El orden es estable para que la practica sea reproducible entre
 * sesiones y para que el historial de progreso compare lo mismo con lo mismo.
 */
export const BANCO_FRASES: readonly FrasePractica[] = [
  { id: 'ship', texto: 'I need a new ship', foco: 'ship', contraste: 'ship / sheep' },
  { id: 'sheep', texto: 'The sheep are in the field', foco: 'sheep', contraste: 'ship / sheep' },
  { id: 'bad', texto: 'That was a bad idea', foco: 'bad', contraste: 'bad / bed' },
  { id: 'bed', texto: 'Please make the bed today', foco: 'bed', contraste: 'bad / bed' },
  { id: 'sit', texto: 'Please sit down here', foco: 'sit', contraste: 'sit / seat' },
  { id: 'seat', texto: 'This seat is taken', foco: 'seat', contraste: 'sit / seat' },
  { id: 'live', texto: 'I live near the park', foco: 'live', contraste: 'live / leave' },
  { id: 'leave', texto: 'We leave early tomorrow', foco: 'leave', contraste: 'live / leave' },
  { id: 'pull', texto: 'Pull the door slowly', foco: 'pull', contraste: 'pull / pool' },
  { id: 'pool', texto: 'The pool is very cold', foco: 'pool', contraste: 'pull / pool' },
] as const;

/** Palabras que el sintetizador pronuncia mal, medidas en S7-T4. */
const PALABRAS_VETADAS = [
  'vegetables', 'ginger', 'engine', 'island', 'salmon', 'chef', 'water', 'book',
];

/**
 * Comprueba que una frase cumple el criterio de curado.
 *
 * Existe para que la prueba lo verifique sobre todo el banco: si alguien agrega
 * una frase con una cifra o con una palabra vetada, la suite lo detiene antes de
 * que llegue a un estudiante.
 */
export function cumpleCriterio(frase: FrasePractica): { ok: boolean; motivo?: string } {
  if (/\d/.test(frase.texto)) {
    return { ok: false, motivo: 'contiene una cifra y el sintetizador no las dice (I-07)' };
  }

  const palabras = frase.texto.toLowerCase().replace(/[^\p{L}\s']/gu, ' ').split(/\s+/);

  const vetada = palabras.find((p) => PALABRAS_VETADAS.includes(p));
  if (vetada) {
    return { ok: false, motivo: `contiene "${vetada}", que el sintetizador pronuncia mal (S7-T4)` };
  }

  if (!palabras.includes(frase.foco.toLowerCase())) {
    return { ok: false, motivo: `el foco "${frase.foco}" no aparece en la frase` };
  }

  const n = palabras.filter((p) => p.length > 0).length;
  if (n < 4 || n > 8) {
    return { ok: false, motivo: `tiene ${n} palabras y el rango util es de 4 a 8` };
  }

  return { ok: true };
}

/**
 * Siguiente frase a practicar, evitando repetir las ya hechas en la sesion.
 *
 * Recorre el banco en orden en vez de elegir al azar: asi dos sesiones distintas
 * practican lo mismo en el mismo orden, que es lo que permite comparar el
 * progreso del estudiante contra sus propias tomas anteriores — el unico uso del
 * comparador que S9-T3 encontro fiable.
 */
export function siguienteFrase(hechas: readonly string[]): FrasePractica {
  const pendiente = BANCO_FRASES.find((f) => !hechas.includes(f.id));
  // Al terminar el banco se vuelve a empezar: repetir es practica, no un fallo.
  return pendiente ?? BANCO_FRASES[0];
}
