import { describe, it, expect } from 'vitest';
import {
  BANCO_FRASES,
  cumpleCriterio,
  siguienteFrase,
} from '../../src/core/bancoFrases';

/**
 * El banco no es una lista de ejemplos: cada frase cumple un criterio que sale de
 * mediciones del proyecto. Estas pruebas existen para que ese criterio se cumpla
 * tambien en las frases que alguien agregue manana.
 */

describe('Banco de frases de practica', () => {
  it('todas las frases cumplen el criterio de curado', () => {
    for (const frase of BANCO_FRASES) {
      const r = cumpleCriterio(frase);
      expect(r.ok, `"${frase.texto}": ${r.motivo ?? ''}`).toBe(true);
    }
  });

  it('ninguna frase contiene palabras que el sintetizador pronuncia mal', () => {
    // Medido en S7-T4: 7 fallos de 14 palabras dificiles, y ademas `water` y
    // `book`, que eran de control. Si una de esas entra al banco, el estudiante
    // se compara contra una referencia mal pronunciada.
    const texto = BANCO_FRASES.map((f) => f.texto.toLowerCase()).join(' ');
    for (const veto of ['vegetables', 'ginger', 'engine', 'island', 'salmon', 'chef', 'water', 'book']) {
      expect(texto, `el banco contiene "${veto}"`).not.toContain(veto);
    }
  });

  it('ninguna frase contiene cifras', () => {
    // El sintetizador no las dice: ante un precio no se oye un numero equivocado,
    // no se oye nada (I-07).
    for (const frase of BANCO_FRASES) {
      expect(/\d/.test(frase.texto), `"${frase.texto}" tiene una cifra`).toBe(false);
    }
  });

  it('los identificadores son unicos', () => {
    const ids = BANCO_FRASES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('cubre los cinco pares minimos de S6-T7', () => {
    const contrastes = new Set(BANCO_FRASES.map((f) => f.contraste));
    for (const par of ['ship / sheep', 'bad / bed', 'sit / seat', 'live / leave', 'pull / pool']) {
      expect(contrastes, `falta el par ${par}`).toContain(par);
    }
  });

  it('rechaza una frase con cifra', () => {
    const r = cumpleCriterio({ id: 'x', texto: 'It costs 25 dollars', foco: 'costs', contraste: 'x' });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('cifra');
  });

  it('rechaza una frase con palabra vetada', () => {
    const r = cumpleCriterio({ id: 'x', texto: 'I drink water every day', foco: 'drink', contraste: 'x' });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('water');
  });

  it('rechaza una frase cuyo foco no aparece en el texto', () => {
    const r = cumpleCriterio({ id: 'x', texto: 'Please sit down here', foco: 'seat', contraste: 'x' });
    expect(r.ok).toBe(false);
    expect(r.motivo).toContain('foco');
  });

  it('rechaza frases demasiado cortas o demasiado largas', () => {
    expect(cumpleCriterio({ id: 'x', texto: 'Sit down', foco: 'sit', contraste: 'x' }).ok).toBe(false);
    expect(
      cumpleCriterio({
        id: 'x',
        texto: 'Please sit down here right now before we start again',
        foco: 'sit',
        contraste: 'x',
      }).ok
    ).toBe(false);
  });
});

describe('siguienteFrase', () => {
  it('sin nada hecho devuelve la primera, para que el orden sea estable', () => {
    // El orden estable es lo que permite comparar el progreso del estudiante
    // contra sus propias tomas anteriores, que es el unico uso fiable del
    // comparador segun S9-T3.
    expect(siguienteFrase([]).id).toBe(BANCO_FRASES[0].id);
  });

  it('salta las que ya se practicaron', () => {
    expect(siguienteFrase([BANCO_FRASES[0].id]).id).toBe(BANCO_FRASES[1].id);
  });

  it('al terminar el banco vuelve a empezar en vez de quedarse sin frase', () => {
    // Repetir es practica, no un fallo, y devolver `undefined` obligaria a la
    // interfaz a manejar un caso que no aporta nada.
    const todas = BANCO_FRASES.map((f) => f.id);
    expect(siguienteFrase(todas).id).toBe(BANCO_FRASES[0].id);
  });
});
