/**
 * D-17 · Pruebas de la configuración del sintetizador.
 *
 * QUÉ PROTEGEN: el cambio de MMS-TTS a Kokoro trae dos diferencias de tratamiento
 * que, si se pierden, no dan error sino audio malo — y el audio malo del sintetizador
 * contamina el puntaje de pronunciación, porque es la referencia contra la que se
 * compara al estudiante. Un fallo aquí se vería como "el comparador anda raro".
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TTS_CONFIG,
  FALLBACK_TTS_CONFIG,
  TTS_CONFIGS,
  getTtsConfig,
} from '../../src/ai/tts/ttsProtocol';
import { SAMPLE_RATE } from '../../src/shared/constants';

describe('configuración del sintetizador', () => {
  it('la configuración por defecto es Kokoro, adoptada en D-17', () => {
    const config = getTtsConfig(DEFAULT_TTS_CONFIG);
    expect(config.engine).toBe('kokoro');
  });

  it('la vuelta atrás apunta a una configuración que existe y no es la actual', () => {
    // Si esto se rompe, la marcha atrás documentada en D-18 deja de funcionar
    // justo cuando haría falta.
    expect(FALLBACK_TTS_CONFIG).not.toBe(DEFAULT_TTS_CONFIG);
    expect(() => getTtsConfig(FALLBACK_TTS_CONFIG)).not.toThrow();
    expect(getTtsConfig(FALLBACK_TTS_CONFIG).engine).toBe('vits');
  });

  it('Kokoro declara una frecuencia nativa DISTINTA de la del proyecto', () => {
    // Es la razón por la que el worker remuestrea. Si alguien "corrigiera" este
    // valor a 16 000 creyendo que es un error, el worker dejaría de remuestrear y
    // la referencia sonaría con el tono alterado: los MFCC medirían la diferencia
    // de frecuencia de muestreo, no la de pronunciación.
    const config = getTtsConfig('F-kokoro-q8');
    expect(config.engine).toBe('kokoro');
    if (config.engine !== 'kokoro') return;
    expect(config.nativeSampleRate).toBe(24000);
    expect(config.nativeSampleRate).not.toBe(SAMPLE_RATE);
  });

  it('Kokoro nombra la voz con la que se midió el banco', () => {
    // El conteo de 1 fallo de 14 se hizo con `af_heart`. Cambiar de voz sin volver
    // a medir invalidaría la evidencia que justificó el cambio de modelo (D-17).
    const config = getTtsConfig('F-kokoro-q8');
    if (config.engine !== 'kokoro') return;
    expect(config.voice).toBe('af_heart');
  });

  it('todas las configuraciones tienen identificador único', () => {
    const ids = TTS_CONFIGS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('falla con un identificador desconocido', () => {
    // @ts-expect-error se comprueba el error en tiempo de ejecución, no el tipo
    expect(() => getTtsConfig('inventado')).toThrow();
  });

  it('Kokoro pesa menos que el modelo al que reemplaza', () => {
    // Los dos números son medidos, no de la ficha del Hub: 88.1 contra 109.0 MiB.
    // Es parte del argumento de D-17 y conviene que se rompa si alguien lo edita.
    const kokoro = getTtsConfig('F-kokoro-q8');
    const mms = getTtsConfig('D-vits-fp32');
    expect(kokoro.expectedMB).toBeLessThan(mms.expectedMB);
  });
});
