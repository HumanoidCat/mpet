import { describe, it, expect } from 'vitest';
import {
  nyquistHz,
  isAliased,
  aliasFrequency,
  resampledLength,
  chooseResampleStrategy,
  antiAliasCutoffHz,
} from '../../src/audio/dsp/sampling';

describe('Muestreo y Nyquist (S1-T6)', () => {
  it('Nyquist es la mitad del sample rate', () => {
    expect(nyquistHz(16000)).toBe(8000);
    expect(nyquistHz(48000)).toBe(24000);
  });

  it('la voz (≤ 8 kHz) no sufre aliasing a 16 kHz', () => {
    expect(isAliased(300, 16000)).toBe(false);   // F0 típica
    expect(isAliased(3400, 16000)).toBe(false);  // banda telefónica
    expect(isAliased(7900, 16000)).toBe(false);  // fricativas
    expect(isAliased(9000, 16000)).toBe(true);   // por encima de Nyquist
  });

  it('una componente sobre Nyquist se pliega dentro de la banda', () => {
    // 9 kHz muestreado a 16 kHz aparece como 7 kHz: por eso hace falta
    // filtrar ANTES de decimar.
    expect(aliasFrequency(9000, 16000)).toBeCloseTo(7000);
    expect(aliasFrequency(20000, 16000)).toBeCloseTo(4000);
  });
});

describe('Estrategia de remuestreo (S2-T1)', () => {
  it('48 kHz → 16 kHz es decimación entera (÷3)', () => {
    expect(chooseResampleStrategy(48000)).toEqual({ kind: 'decimate', factor: 3 });
  });

  it('44.1 kHz → 16 kHz obliga a interpolar', () => {
    const s = chooseResampleStrategy(44100);
    expect(s.kind).toBe('interpolate');
    expect(s.factor).toBeCloseTo(2.75625);
  });

  it('si ya estamos a 16 kHz no se remuestrea', () => {
    expect(chooseResampleStrategy(16000)).toEqual({ kind: 'none', factor: 1 });
  });

  it('calcula la longitud de salida', () => {
    expect(resampledLength(48000, 48000, 16000)).toBe(16000); // 1 s
    expect(resampledLength(44100, 44100, 16000)).toBe(16000);
  });

  it('el corte anti-aliasing queda por debajo del Nyquist destino', () => {
    expect(antiAliasCutoffHz(16000)).toBeLessThan(nyquistHz(16000));
    expect(antiAliasCutoffHz(16000)).toBe(7200);
  });
});
