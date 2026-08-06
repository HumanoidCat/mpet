/**
 * S5-T2 — Escala mel y banco de filtros triangulares.
 *
 * El oído no percibe la frecuencia de forma lineal: distinguimos con facilidad
 * 200 de 300 Hz, pero 5000 y 5100 Hz suenan casi igual. La **escala mel** es un
 * cambio de eje que refleja eso — distancias iguales en mel corresponden a
 * distancias perceptuales iguales:
 *
 *   m = 2595 · log₁₀( 1 + f / 700 )
 *
 * Casi lineal por debajo de 1 kHz y logarítmica por encima, que es justo donde
 * está la información fonética de las vocales.
 *
 * El banco de filtros agrupa los 257 bins de la FFT en 26 bandas triangulares
 * repartidas uniformemente **en mel**, no en Hz. Eso hace dos cosas a la vez:
 * reduce la dimensión de 257 a 26, y descarta el detalle fino del espectro —los
 * armónicos individuales, que dependen del tono de quien habla— conservando la
 * envolvente, que es lo que identifica al fonema. Por eso los MFCC comparan
 * pronunciación y no voces.
 *
 * Se usa la fórmula **HTK**, que es la del estándar de reconocimiento de voz.
 * librosa la implementa con `htk=True` (su opción por defecto, `htk=False`, usa
 * la variante de Slaney, que es distinta).
 */

/** Hz → mel, según la fórmula de HTK. */
export function hzToMel(hz: number): number {
  return 2595 * Math.log10(1 + hz / 700);
}

/** mel → Hz: la inversa exacta de `hzToMel`. */
export function melToHz(mel: number): number {
  return 700 * (Math.pow(10, mel / 2595) - 1);
}

export interface MelFilterbank {
  /** Un peso por bin de la FFT, para cada uno de los `nFilters` filtros. */
  filters: Float32Array[];
  /** Frecuencia central de cada filtro, en Hz. */
  centersHz: Float32Array;
  /** Bins de la mitad positiva del espectro que cubre cada filtro. */
  binCount: number;
}

/**
 * Construye el banco de filtros triangulares.
 *
 * Se reparten `nFilters + 2` puntos equiespaciados en mel entre `fMin` y
 * `fMax`. Cada filtro usa tres puntos consecutivos: sube desde el primero hasta
 * el segundo y baja hasta el tercero. Los triángulos se solapan a la mitad, de
 * modo que ninguna frecuencia quede sin cubrir.
 */
export function melFilterbank(
  nFilters: number,
  fftSize: number,
  sampleRate: number,
  fMin = 0,
  fMax = sampleRate / 2
): MelFilterbank {
  if (nFilters < 1) throw new RangeError(`nFilters debe ser ≥ 1, recibí ${nFilters}`);
  if (fMax > sampleRate / 2) {
    throw new RangeError(`fMax no puede superar el Nyquist (${sampleRate / 2}), recibí ${fMax}`);
  }
  if (fMin >= fMax) throw new RangeError(`fMin (${fMin}) debe ser menor que fMax (${fMax})`);

  const binCount = fftSize / 2 + 1;

  // Puntos equiespaciados en mel, devueltos a Hz y luego a índice de bin.
  const melMin = hzToMel(fMin);
  const melMax = hzToMel(fMax);
  const puntosHz = new Float32Array(nFilters + 2);
  const puntosBin = new Float32Array(nFilters + 2);

  for (let i = 0; i < nFilters + 2; i++) {
    const mel = melMin + ((melMax - melMin) * i) / (nFilters + 1);
    puntosHz[i] = melToHz(mel);
    // Posición fraccionaria en el eje de bins: no se redondea, para que los
    // triángulos queden donde corresponde aunque no caigan en un bin exacto.
    puntosBin[i] = (puntosHz[i] * fftSize) / sampleRate;
  }

  const filters: Float32Array[] = [];
  const centersHz = new Float32Array(nFilters);

  for (let m = 1; m <= nFilters; m++) {
    const izquierda = puntosBin[m - 1];
    const centro = puntosBin[m];
    const derecha = puntosBin[m + 1];

    const pesos = new Float32Array(binCount);
    for (let k = 0; k < binCount; k++) {
      if (k > izquierda && k < centro) {
        pesos[k] = (k - izquierda) / (centro - izquierda); // rampa de subida
      } else if (k >= centro && k < derecha) {
        pesos[k] = (derecha - k) / (derecha - centro); // rampa de bajada
      }
    }

    filters.push(pesos);
    centersHz[m - 1] = puntosHz[m];
  }

  return { filters, centersHz, binCount };
}

/**
 * Aplica el banco a un espectro de **potencia** (|X[k]|², no amplitud) y
 * devuelve la energía dentro de cada banda.
 *
 * Trabaja en doble precisión. La potencia sin normalizar alcanza valores del
 * orden de 10⁴, y en simple precisión el redondeo a esa escala llega a alterar
 * el cuarto decimal del puntaje final: suficiente para romper la invariancia al
 * volumen, que debería ser exacta.
 */
export function applyMelFilterbank(
  powerSpectrum: Float32Array | Float64Array,
  bank: MelFilterbank
): Float64Array {
  const out = new Float64Array(bank.filters.length);

  for (let m = 0; m < bank.filters.length; m++) {
    const pesos = bank.filters[m];
    let suma = 0;
    const n = Math.min(pesos.length, powerSpectrum.length);
    for (let k = 0; k < n; k++) suma += pesos[k] * powerSpectrum[k];
    out[m] = suma;
  }
  return out;
}
