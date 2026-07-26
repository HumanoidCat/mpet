/**
 * S2-T1 — Buffer circular para la captura.
 *
 * El AudioWorklet entrega bloques de 128 muestras cada ~2.7 ms (a 48 kHz),
 * pero el análisis trabaja con frames de 512 y el remuestreo prefiere bloques
 * grandes (menos overhead de filtrado). El buffer circular desacopla ambos
 * ritmos sin reservar memoria en cada bloque: se escribe al final, se lee del
 * inicio, y los índices dan la vuelta sobre un Float32Array fijo.
 *
 * Política ante desbordamiento: se escribe lo que quepa y se cuentan las
 * muestras perdidas (`dropped`). Preferimos perder audio de forma medible a
 * pisar muestras viejas en silencio — si `dropped > 0` el pipeline va tarde y
 * eso es un dato de diagnóstico, no algo que ocultar.
 */

export class RingBuffer {
  private readonly buf: Float32Array;
  /** Índice de la próxima escritura. */
  private writeIdx = 0;
  /** Índice de la próxima lectura. */
  private readIdx = 0;
  /** Muestras pendientes de leer. */
  private count = 0;
  /** Muestras descartadas por falta de espacio (acumulado). */
  private droppedCount = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new RangeError(`capacity debe ser un entero positivo, recibí ${capacity}`);
    }
    this.buf = new Float32Array(capacity);
  }

  /** Muestras disponibles para leer. */
  get available(): number {
    return this.count;
  }

  /** Espacio libre para escribir. */
  get free(): number {
    return this.capacity - this.count;
  }

  get dropped(): number {
    return this.droppedCount;
  }

  /**
   * Escribe un bloque. Devuelve cuántas muestras entraron: si el valor es
   * menor que `data.length`, el resto se descartó (ver `dropped`).
   */
  write(data: Float32Array): number {
    const n = Math.min(data.length, this.free);
    for (let i = 0; i < n; i++) {
      this.buf[this.writeIdx] = data[i];
      this.writeIdx = (this.writeIdx + 1) % this.capacity;
    }
    this.count += n;
    this.droppedCount += data.length - n;
    return n;
  }

  /**
   * Lee exactamente `n` muestras, o `null` si aún no hay suficientes.
   * El "todo o nada" evita que el consumidor tenga que manejar bloques
   * parciales: o hay un frame completo o se espera al siguiente callback.
   */
  read(n: number): Float32Array | null {
    if (n > this.count) return null;
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      out[i] = this.buf[this.readIdx];
      this.readIdx = (this.readIdx + 1) % this.capacity;
    }
    this.count -= n;
    return out;
  }

  /** Vacía el buffer y devuelve lo que quedaba (cola final de la grabación). */
  drain(): Float32Array {
    return this.read(this.count) ?? new Float32Array(0);
  }

  reset(): void {
    this.writeIdx = 0;
    this.readIdx = 0;
    this.count = 0;
    this.droppedCount = 0;
  }
}
