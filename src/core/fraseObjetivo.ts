/**
 * S9-T3 · Comparacion de lo transcrito contra la frase objetivo. Duenio: Alejandro.
 *
 * POR QUE EXISTE
 * El puntaje acustico del comparador **no puede detectar una palabra mal
 * pronunciada**: mide parecido espectral, y el efecto del hablante pesa unas seis
 * veces mas que el error de pronunciacion (S9-T3). Cambiar de voz cuesta +7.08 de
 * distancia; pronunciar mal cuesta +1.20.
 *
 * La unica senal independiente del hablante que tenemos es el reconocedor. Whisper
 * esta entrenado con miles de voces, asi que si el estudiante dice `sheep` donde
 * iba `ship`, lo transcribe como `sheep` y el error aparece **en el texto**, donde
 * el timbre ya no influye.
 *
 * Esto solo funciona si existe una frase objetivo contra la que comparar. En
 * conversacion libre no la hay, y de ahi venia el error de diseno original del
 * orquestador: sintetizaba la transcripcion, o sea la propia equivocacion del
 * estudiante, y se comparaba contra ella.
 *
 * LIMITACION MEDIDA, Y COMO OBLIGA A PRESENTARLO
 * Sobre 40 grabaciones: **6 de 10 errores detectados y 4 falsas alarmas**. No basta
 * por si sola y hay que combinarla con la senal acustica.
 *
 * Las falsas alarmas mandan sobre la redaccion: decirle a alguien que pronuncio mal
 * cuando pronuncio bien desmotiva y ademas es falso. Por eso el resultado se llama
 * `noReconocida` y no `incorrecta`, y la interfaz debe decir "no te entendi bien"
 * y nunca "lo dijiste mal".
 */

import type { ComparacionObjetivo, PalabraObjetivo } from '@shared/contracts';

/**
 * Normaliza para comparar: minusculas, sin puntuacion y sin espacios de mas.
 *
 * Se ignoran mayusculas y puntuacion por lo mismo que el diferenciador de
 * gramatica (D-06): las pone el reconocedor, no el hablante, y marcarlas seria
 * atribuirle una falta que no cometio.
 */
export function normalizarParaComparar(texto: string): string[] {
  return texto
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter((p) => p.length > 0);
}

/**
 * Compara lo que el reconocedor oyo contra la frase que se pidio repetir.
 *
 * El emparejamiento es posicional y no por subsecuencia comun: la tarea es repetir
 * una frase concreta, asi que las palabras deben llegar en su sitio. Un algoritmo
 * de subsecuencia toleraria omisiones e inserciones, que aqui **son justamente lo
 * que hay que detectar**.
 */
export function compararConObjetivo(
  objetivo: string,
  transcrito: string
): ComparacionObjetivo {
  const esperadas = normalizarParaComparar(objetivo);
  const oidas = normalizarParaComparar(transcrito);

  const palabras: PalabraObjetivo[] = esperadas.map((palabra, i) => ({
    palabra,
    noReconocida: oidas[i] !== palabra,
  }));

  const noReconocidas = palabras.filter((p) => p.noReconocida).length;

  return {
    palabras,
    noReconocidas,
    // Una frase objetivo vacia no tiene nada que acertar; se declara 1 para que no
    // aparezca como fallo total en la interfaz.
    aciertos: esperadas.length === 0 ? 1 : 1 - noReconocidas / esperadas.length,
  };
}
