import { describe, it, expect } from 'vitest';
import { normalizeDb, jetColormap, dbToColor } from '../../src/ui/visualizer/colormap';

describe('colormap (S5-T3, espectrograma)', () => {
  it('normalizeDb recorta al rango [0,1]', () => {
    expect(normalizeDb(-80)).toBe(0);
    expect(normalizeDb(0)).toBe(1);
    expect(normalizeDb(-200)).toBe(0);
    expect(normalizeDb(50)).toBe(1);
    expect(normalizeDb(-40)).toBeCloseTo(0.5);
  });

  it('jetColormap: silencio es azul oscuro, señal fuerte tiende a rojo', () => {
    const quiet = jetColormap(0);
    expect(quiet.r).toBe(0);
    expect(quiet.b).toBeGreaterThan(0);

    // En el "jet" clasico, el rojo puro (255,0,0) cae exactamente en v=0.875
    const peakRed = jetColormap(0.875);
    expect(peakRed.r).toBe(255);
    expect(peakRed.g).toBe(0);
    expect(peakRed.b).toBe(0);

    const loud = jetColormap(1);
    expect(loud.g).toBe(0);
    expect(loud.b).toBe(0);
    expect(loud.r).toBeGreaterThan(0);
  });

  it('dbToColor devuelve un string rgb() valido', () => {
    expect(dbToColor(-80)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    expect(dbToColor(0)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  });
});
