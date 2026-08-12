import { describe, it, expect } from 'vitest';
import { micErrorMessage } from '../../src/ui/shell/micErrorMessage';

describe('micErrorMessage (S7-T3, errores de microfono)', () => {
  it('permiso denegado pide habilitarlo en el navegador', () => {
    const err = new DOMException('denied', 'NotAllowedError');
    expect(micErrorMessage(err)).toMatch(/permiso/i);
  });

  it('sin microfono conectado lo dice explicitamente', () => {
    const err = new DOMException('no device', 'NotFoundError');
    expect(micErrorMessage(err)).toMatch(/no se encontró/i);
  });

  it('microfono en uso por otra app lo distingue de los demas casos', () => {
    const err = new DOMException('busy', 'NotReadableError');
    expect(micErrorMessage(err)).toMatch(/en uso/i);
  });

  it('error desconocido cae en el mensaje generico', () => {
    expect(micErrorMessage(new Error('algo raro'))).toMatch(/no se pudo acceder/i);
    expect(micErrorMessage('no es ni siquiera un Error')).toMatch(/no se pudo acceder/i);
  });
});
