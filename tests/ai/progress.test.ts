import { describe, it, expect, vi } from 'vitest';
import {
  createProgressAggregator,
  createRangedProgressAggregator,
} from '../../src/ai/model-cache/progress';

/**
 * S2-T5 · Tests del agregador de progreso.
 * Es lógica pura (sin navegador ni modelo), así que se puede testear en node.
 */
describe('createProgressAggregator', () => {
  it('combina varios archivos en un solo progreso 0–1', () => {
    const report = vi.fn();
    const agg = createProgressAggregator(report);

    // Dos archivos de 100 bytes cada uno: 200 en total.
    agg.handle({ status: 'progress', file: 'a.onnx', loaded: 50, total: 100 });
    expect(report).toHaveBeenLastCalledWith(0.5); // 50/100 (solo se conoce 'a')

    agg.handle({ status: 'progress', file: 'b.onnx', loaded: 50, total: 100 });
    // Ahora 100/200 = 0.5 -> no avanza, no debe reportar de nuevo
    expect(report).toHaveBeenCalledTimes(1);

    agg.handle({ status: 'progress', file: 'b.onnx', loaded: 100, total: 100 });
    expect(report).toHaveBeenLastCalledWith(0.75); // 150/200
  });

  it('nunca retrocede (progreso monótono)', () => {
    const report = vi.fn();
    const agg = createProgressAggregator(report);

    agg.handle({ status: 'progress', file: 'a.onnx', loaded: 50, total: 100 });
    agg.handle({ status: 'progress', file: 'a.onnx', loaded: 100, total: 100 });
    expect(report).toHaveBeenLastCalledWith(1);

    // Aparece un archivo nuevo y grande: el porcentaje real caería a 100/1100.
    // No debe reportarse un retroceso (la barra de la UI daría un salto atrás).
    agg.handle({ status: 'progress', file: 'b.onnx', loaded: 0, total: 1000 });
    expect(report).toHaveBeenLastCalledWith(1);
  });

  it('ignora los archivos que llegan completos de una sola vez', () => {
    // Este es el fallo que destapó la verificación del worker de TTS con eventos
    // reales: `config.json` (1656 bytes) llega entero en su primer evento, antes
    // de que empiece el modelo de 114 MB. Contándolo, la barra marcaba 100% y se
    // quedaba clavada ahí durante toda la descarga de verdad.
    const report = vi.fn();
    const agg = createProgressAggregator(report);

    agg.handle({ status: 'progress', file: 'config.json', loaded: 1656, total: 1656 });
    expect(report).not.toHaveBeenCalled();

    agg.handle({ status: 'progress', file: 'model.onnx', loaded: 16375, total: 114258806 });
    // Ahora sí avanza, y con el denominador correcto: solo el archivo grande.
    expect(report).toHaveBeenCalledTimes(1);
    expect(report.mock.calls[0][0]).toBeCloseTo(16375 / 114258806, 8);
  });

  it("ignora el 'done' de un archivo que nunca contó", () => {
    const report = vi.fn();
    const agg = createProgressAggregator(report);

    agg.handle({ status: 'progress', file: 'config.json', loaded: 10, total: 10 });
    agg.handle({ status: 'done', file: 'config.json' });
    expect(report).not.toHaveBeenCalled();
  });

  it('ignora eventos sin tamaño conocido', () => {
    const report = vi.fn();
    const agg = createProgressAggregator(report);

    agg.handle({ status: 'initiate', file: 'a.onnx' });
    agg.handle({ status: 'progress', file: 'a.onnx', total: 0, loaded: 0 });
    expect(report).not.toHaveBeenCalled();
  });

  it("marca el archivo completo al recibir 'done'", () => {
    const report = vi.fn();
    const agg = createProgressAggregator(report);

    agg.handle({ status: 'progress', file: 'a.onnx', loaded: 10, total: 100 });
    agg.handle({ status: 'done', file: 'a.onnx' });
    expect(report).toHaveBeenLastCalledWith(1);
  });

  it('complete() cierra en 100% aunque el modelo viniera de caché', () => {
    const report = vi.fn();
    const agg = createProgressAggregator(report);

    // Modelo cacheado: no se descargó ni un byte, no hubo eventos de progreso.
    agg.complete();
    expect(report).toHaveBeenCalledWith(1);

    // No debe reportar dos veces ni aceptar eventos posteriores.
    agg.complete();
    agg.handle({ status: 'progress', file: 'a.onnx', loaded: 1, total: 100 });
    expect(report).toHaveBeenCalledTimes(1);
  });
});

/**
 * S4-T5/S5-T5 · Tests del agregador por tramos.
 *
 * Nace de un fallo real que destapó el spike de TTS: el worker carga el
 * tokenizador (10 KB) y después el modelo (109 MB) en dos llamadas seguidas, y
 * con un solo agregador la barra llegaba al 100% al terminar el tokenizador y se
 * quedaba ahí durante toda la descarga de verdad.
 */
describe('createRangedProgressAggregator', () => {
  it('escala el progreso dentro de su tramo', () => {
    const report = vi.fn();
    const agg = createRangedProgressAggregator(0.03, 1, report);

    agg.handle({ status: 'progress', file: 'model.onnx', loaded: 50, total: 100 });
    // La mitad del tramo 0.03–1 es 0.515, no 0.5.
    expect(report).toHaveBeenLastCalledWith(0.515);
  });

  it('cierra en el tope del tramo, no en 1', () => {
    const report = vi.fn();
    const agg = createRangedProgressAggregator(0, 0.03, report);

    // El tokenizador termina: la barra debe quedar en 3%, dejando el resto del
    // recorrido para el modelo, que es lo que de verdad tarda.
    agg.complete();
    expect(report).toHaveBeenLastCalledWith(0.03);
  });

  it('encadenado en orden, el progreso global nunca retrocede', () => {
    const reported: number[] = [];
    const report = (p: number) => reported.push(p);

    const fase1 = createRangedProgressAggregator(0, 0.03, report);
    fase1.handle({ status: 'progress', file: 'tokenizer.json', loaded: 5, total: 10 });
    fase1.complete();

    const fase2 = createRangedProgressAggregator(0.03, 1, report);
    fase2.handle({ status: 'progress', file: 'model.onnx', loaded: 10, total: 100 });
    fase2.complete();

    expect(reported).toEqual([...reported].sort((a, b) => a - b));
    expect(reported.at(-1)).toBe(1);
  });

  it('rechaza un tramo invertido o vacío', () => {
    expect(() => createRangedProgressAggregator(0.5, 0.5, () => {})).toThrow();
    expect(() => createRangedProgressAggregator(1, 0, () => {})).toThrow();
  });
});
