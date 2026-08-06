/** @vitest-environment jsdom */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { App } from '../../src/App';

/**
 * Prueba de arranque de la aplicacion.
 *
 * POR QUE EXISTE
 * Hasta ahora ninguna prueba montaba `App.tsx`. La suite garantizaba que el
 * proyecto compila, no que arranca: un fallo al construir cualquiera de los
 * modulos dentro del `useMemo` de composicion daria una pantalla en blanco que
 * ni el typecheck ni el build detectan, y llegaria al sitio desplegado.
 *
 * Ese hueco ya se cobro una: durante semanas la pantalla del visualizador mostro
 * al usuario notas internas del equipo escritas dentro del JSX, en produccion,
 * sin que nada fallara.
 *
 * QUE CUBRE Y QUE NO
 * Cubre el arranque: que la composicion de modulos no lance, que la carga de
 * modelos progrese y que la aplicacion llegue a ofrecer el boton de entrada.
 *
 * No cubre las pantallas con lienzo —forma de onda, espectrograma, contorno de
 * tono—: jsdom no implementa el contexto 2D de Canvas. Verificarlas exige un
 * navegador de verdad y queda para S8-T4.
 *
 * Se ejecuta en modo simulado (`?mock=1`) a proposito: no descarga modelos, no
 * pide permiso de microfono y no depende de la red, asi que corre en
 * integracion continua igual que el resto.
 */

function abrirEnModoSimulado(): void {
  window.history.replaceState({}, '', '/?mock=1');
}

afterEach(cleanup);

describe('Arranque de la aplicacion', () => {
  it('monta sin lanzar y muestra la pantalla de carga', () => {
    abrirEnModoSimulado();

    // Si cualquier fabrica del `useMemo` de composicion lanzara, esto explota
    // aqui, que es exactamente lo que queremos detectar antes de desplegar.
    expect(() => render(<App />)).not.toThrow();
    expect(screen.getByText(/Preparing AI models/i)).toBeTruthy();
  });

  it('termina de cargar y ofrece entrar', async () => {
    abrirEnModoSimulado();
    render(<App />);

    // El pipeline simulado reporta progreso y resuelve. Cuando termina, la
    // pantalla de carga muestra el boton de entrada.
    await waitFor(
      () => expect(screen.getByRole('button', { name: /Start Learning/i })).toBeTruthy(),
      { timeout: 5000 }
    );
  });

  it('no muestra el mensaje de fallo de carga cuando todo va bien', async () => {
    abrirEnModoSimulado();
    render(<App />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Start Learning/i })).toBeTruthy()
    );
    expect(screen.queryByText(/No se pudieron cargar los modelos/i)).toBeNull();
  });
});
