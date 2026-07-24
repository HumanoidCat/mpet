import { describe, it, expect, vi } from 'vitest';
import { createProgressAggregator } from '../../src/ai/model-cache/progress';

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

    agg.handle({ status: 'progress', file: 'a.onnx', loaded: 100, total: 100 });
    expect(report).toHaveBeenLastCalledWith(1);

    // Aparece un archivo nuevo y grande: el porcentaje real caería a 100/1100.
    // No debe reportarse un retroceso (la barra de la UI daría un salto atrás).
    agg.handle({ status: 'progress', file: 'b.onnx', loaded: 0, total: 1000 });
    expect(report).toHaveBeenCalledTimes(1);
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
