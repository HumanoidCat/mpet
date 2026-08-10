/**
 * S7-T4 · Tests de la carga bajo demanda.
 *
 * Lo que se protege son las tres trampas que tiene "cargar la primera vez que se
 * use", y que no se ven mirando el código: descargar el modelo dos veces si llegan
 * dos peticiones a la vez, quedarse pegado a un error de red, y perder el reporte de
 * progreso. Las dos primeras se comprueban aquí.
 */

import { describe, expect, it, vi } from 'vitest';
import { createLazyLoader } from '../../src/ai/lazy';

describe('createLazyLoader', () => {
  it('no carga nada hasta que se le pide', () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const lazy = createLazyLoader(load);

    expect(load).not.toHaveBeenCalled();
    expect(lazy.loaded).toBe(false);
    expect(lazy.loading).toBe(false);
  });

  it('carga una sola vez aunque se pida muchas', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const lazy = createLazyLoader(load);

    await lazy.ensure();
    await lazy.ensure();
    await lazy.ensure();

    expect(load).toHaveBeenCalledTimes(1);
    expect(lazy.loaded).toBe(true);
  });

  it('comparte la misma carga entre llamadas simultáneas', async () => {
    // El caso real: el usuario pulsa "escuchar" dos veces seguidas mientras el
    // modelo todavía baja. Sin esto se descargarían 109 MB dos veces y quedarían
    // dos copias del modelo en memoria.
    let resolver: (() => void) | null = null;
    const load = vi.fn(() => new Promise<void>((res) => (resolver = res)));
    const lazy = createLazyLoader(load);

    const a = lazy.ensure();
    const b = lazy.ensure();
    expect(load).toHaveBeenCalledTimes(1);
    expect(lazy.loading).toBe(true);
    expect(lazy.loaded).toBe(false);

    resolver!();
    await Promise.all([a, b]);

    expect(load).toHaveBeenCalledTimes(1);
    expect(lazy.loaded).toBe(true);
  });

  it('propaga el error de la carga a todos los que esperaban', async () => {
    const load = vi.fn().mockRejectedValue(new Error('sin red'));
    const lazy = createLazyLoader(load);

    const a = lazy.ensure();
    const b = lazy.ensure();

    await expect(a).rejects.toThrow('sin red');
    await expect(b).rejects.toThrow('sin red');
  });

  it('permite reintentar después de un fallo', async () => {
    // Un corte de red momentáneo no puede dejar el botón de escuchar inutilizable
    // durante toda la sesión.
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('sin red'))
      .mockResolvedValueOnce(undefined);
    const lazy = createLazyLoader(load);

    await expect(lazy.ensure()).rejects.toThrow('sin red');
    expect(lazy.loaded).toBe(false);
    expect(lazy.loading).toBe(false);

    await lazy.ensure();
    expect(lazy.loaded).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('después de cargar no vuelve a intentarlo nunca', async () => {
    const load = vi.fn().mockResolvedValue(undefined);
    const lazy = createLazyLoader(load);

    await lazy.ensure();
    await Promise.all([lazy.ensure(), lazy.ensure()]);

    expect(load).toHaveBeenCalledTimes(1);
  });
});
