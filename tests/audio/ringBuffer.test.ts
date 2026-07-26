import { describe, it, expect } from 'vitest';
import { RingBuffer } from '../../src/audio/capture/ringBuffer';

const f32 = (...xs: number[]) => Float32Array.from(xs);

describe('RingBuffer (S2-T1)', () => {
  it('lee en el mismo orden en que se escribió (FIFO)', () => {
    const rb = new RingBuffer(8);
    rb.write(f32(1, 2, 3, 4));

    expect(rb.available).toBe(4);
    expect(Array.from(rb.read(4)!)).toEqual([1, 2, 3, 4]);
    expect(rb.available).toBe(0);
  });

  it('devuelve null si aún no hay un frame completo', () => {
    const rb = new RingBuffer(8);
    rb.write(f32(1, 2));

    // El consumidor pide 4: espera al siguiente bloque en vez de recibir
    // un frame a medias.
    expect(rb.read(4)).toBeNull();
    expect(rb.available).toBe(2);
  });

  it('da la vuelta sobre el buffer sin perder muestras', () => {
    const rb = new RingBuffer(4);
    rb.write(f32(1, 2, 3));
    rb.read(3);

    // Escritura que cruza el final del array físico.
    rb.write(f32(4, 5, 6));
    expect(Array.from(rb.read(3)!)).toEqual([4, 5, 6]);
    expect(rb.dropped).toBe(0);
  });

  it('cuenta las muestras descartadas cuando se desborda', () => {
    const rb = new RingBuffer(4);
    const written = rb.write(f32(1, 2, 3, 4, 5, 6));

    // Entran 4, se pierden 2: el pipeline va tarde y queda registrado.
    expect(written).toBe(4);
    expect(rb.dropped).toBe(2);
    expect(Array.from(rb.read(4)!)).toEqual([1, 2, 3, 4]);
  });

  it('drain devuelve la cola pendiente y vacía el buffer', () => {
    const rb = new RingBuffer(8);
    rb.write(f32(1, 2, 3, 4, 5));
    rb.read(2);

    expect(Array.from(rb.drain())).toEqual([3, 4, 5]);
    expect(rb.available).toBe(0);
    expect(rb.drain().length).toBe(0);
  });

  it('reset deja el buffer como recién creado', () => {
    const rb = new RingBuffer(4);
    rb.write(f32(1, 2, 3, 4, 5));
    rb.reset();

    expect(rb.available).toBe(0);
    expect(rb.dropped).toBe(0);
    expect(rb.free).toBe(4);
  });

  it('rechaza capacidades inválidas', () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError);
    expect(() => new RingBuffer(-1)).toThrow(RangeError);
  });
});
