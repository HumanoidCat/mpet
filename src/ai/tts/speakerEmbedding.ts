/**
 * S4-T5/S5-T5 · Vector de voz (speaker embedding) para SpeechT5. Dueño: Isaac.
 *
 * QUÉ ES: SpeechT5 no tiene una voz propia. Además del texto hay que darle un
 * vector de 512 números (un "x-vector") que describe *quién* habla: timbre, tono
 * medio, características del tracto vocal. Con el mismo texto y otro vector, la
 * frase suena con otra voz.
 *
 * POR QUÉ ESTÁ EMBEBIDO AQUÍ Y NO SE DESCARGA:
 * El ejemplo oficial de transformers.js hace `fetch` de este vector desde
 * huggingface.co en cada arranque. Eso rompería el requisito central del
 * proyecto — la PWA debe funcionar 100 % sin conexión: la primera síntesis sin
 * internet lanzaría excepción y el botón de escuchar quedaría muerto.
 *
 * El pipeline de transformers.js acepta también un `Float32Array` en memoria
 * (verificado en el código de la versión instalada, 3.8.1: `pipelines.js`,
 * `_prepare_speaker_embeddings`), así que guardamos los 2 KB del vector como
 * texto en base64 dentro del propio código. Sin red, sin archivo suelto que el
 * empaquetador pueda perder, sin tocar `package.json`.
 *
 * PROCEDENCIA: `speaker_embeddings.bin` del conjunto de datos
 * `Xenova/transformers.js-docs` (el que usa la documentación oficial). Es un
 * x-vector extraído del corpus **CMU ARCTIC**, de uso libre, obtenido con el
 * extractor `spkrec-xvect` de SpeechBrain. Verificado al descargarlo:
 * 512 valores `float32`, norma L2 = 1.0000.
 */

/** Longitud del x-vector que espera SpeechT5 (config: `speaker_embedding_dim`). */
export const SPEAKER_EMBEDDING_DIM = 512;

/**
 * El vector, en base64. Se parte en líneas solo por legibilidad; los saltos se
 * eliminan antes de decodificar.
 */
const SPEAKER_EMBEDDING_B64 = `
  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
  XL0=
`;

/**
 * Decodifica el vector a `Float32Array`.
 *
 * POR QUÉ `DataView` Y NO `new Float32Array(bytes.buffer)`:
 * la vista directa interpreta los bytes con el orden del procesador. El archivo
 * está en little-endian (como todo lo que sale de PyTorch/NumPy en x86 y ARM),
 * así que leerlo explícitamente en little-endian deja el código correcto en
 * cualquier máquina, en vez de correcto por casualidad.
 */
export function loadSpeakerEmbedding(): Float32Array {
  const binary = atob(SPEAKER_EMBEDDING_B64.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const view = new DataView(bytes.buffer);
  const out = new Float32Array(SPEAKER_EMBEDDING_DIM);
  for (let i = 0; i < SPEAKER_EMBEDDING_DIM; i++) {
    out[i] = view.getFloat32(i * 4, /* littleEndian */ true);
  }
  return out;
}
