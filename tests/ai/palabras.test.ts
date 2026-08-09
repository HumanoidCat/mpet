/**
 * S7-T4 · Tests de la comparación entre lo que dijo el TTS y lo que entendió el ASR.
 *
 * POR QUÉ IMPORTAN: de esta comparación sale un conteo, y del conteo sale una decisión
 * pactada de antemano (si fallan 5 o más palabras se abre un `shared-change` y se
 * pagan 216 MB adicionales de descarga). Si la comparación fuera demasiado permisiva
 * taparía fallos reales; si fuera demasiado estricta contaría como fallo lo que solo
 * es puntuación del reconocedor. Estos tests fijan dónde está la línea.
 */

import { describe, expect, it } from 'vitest';
import {
  CARRIER_PHRASE,
  CARRIER_WORDS,
  CONTROL_WORDS,
  RENDITIONS,
  TARGET_WORDS,
  isHit,
  normalize,
  present,
} from '../../src/ai/spike-s7-t4/palabras';

const target = (word: string) => TARGET_WORDS.find((w) => w.word === word)!;

describe('normalize', () => {
  it('quita puntuación y mayúsculas que añade el reconocedor', () => {
    expect(normalize('  Vegetables.  ')).toBe('vegetables');
    expect(normalize('Water?')).toBe('water');
  });

  it('no toca las letras', () => {
    // Si el ASR oyó otra cosa, tiene que verse: normalizar no puede maquillar.
    expect(normalize('Veyitables.')).toBe('veyitables');
  });
});

describe('isHit', () => {
  it('acepta la palabra exacta', () => {
    expect(isHit(target('vegetables'), 'Vegetables.')).toBe(true);
  });

  it('acepta relleno alrededor, porque Whisper lo añade solo', () => {
    expect(isHit(target('knife'), 'The knife.')).toBe(true);
  });

  it('rechaza una pronunciación defectuosa', () => {
    // El caso que originó toda la medición.
    expect(isHit(target('vegetables'), 'Veyitables.')).toBe(false);
  });

  it('rechaza una palabra parecida pero distinta', () => {
    expect(isHit(target('chef'), 'Chief.')).toBe(false);
    expect(isHit(target('salmon'), 'Sal Mon.')).toBe(false);
  });

  it('acepta las formas alternativas declaradas para las cifras', () => {
    // El reconocedor puede escribir el número en cifra o en letra: las dos formas
    // significan que oyó bien. Esto NO tapa errores de pronunciación, solo de
    // ortografía del reconocedor.
    const money = target('$25');
    expect(isHit(money, 'Twenty five dollars.')).toBe(true);
    expect(isHit(money, '$25')).toBe(true);
    expect(isHit(money, 'Twenty.')).toBe(false);
  });

  it('no da por bueno un vacío', () => {
    expect(isHit(target('island'), '')).toBe(false);
  });
});

describe('banco de palabras', () => {
  it('tiene las 14 palabras objetivo del umbral pactado', () => {
    // El umbral de Alejandro está expresado sobre 14. Si alguien añade o quita
    // palabras, el umbral deja de significar lo mismo y hay que renegociarlo.
    expect(TARGET_WORDS).toHaveLength(14);
  });

  it('incluye la palabra que originó la medición', () => {
    expect(TARGET_WORDS.map((w) => w.word)).toContain('vegetables');
  });

  it('tiene control suficiente y sin solaparse con las objetivo', () => {
    expect(CONTROL_WORDS.length).toBeGreaterThanOrEqual(5);
    const targets = new Set(TARGET_WORDS.map((w) => w.word));
    expect(CONTROL_WORDS.every((c) => !targets.has(c.word))).toBe(true);
  });

  it('repite un número impar de veces, para que la mayoría no empate', () => {
    expect(RENDITIONS % 2).toBe(1);
  });
});

describe('frase portadora', () => {
  it('coloca la palabra en el hueco', () => {
    expect(present('vegetables', 'portadora')).toBe('Say vegetables again, please.');
    expect(present('vegetables', 'aislada')).toBe('vegetables');
  });

  it('ninguna palabra medida aparece en la portadora', () => {
    // Si una palabra objetivo formara parte de la frase portadora, la portadora se
    // la regalaría: el reconocedor la devolvería aunque el sintetizador la hubiera
    // pronunciado mal, y el conteo diría que todo está bien cuando no lo está.
    const carrier = new Set<string>(CARRIER_WORDS);
    for (const w of [...TARGET_WORDS, ...CONTROL_WORDS]) {
      expect(carrier.has(normalize(w.word))).toBe(false);
    }
  });

  it('la portadora declara todas sus palabras en CARRIER_WORDS', () => {
    // Protege el test anterior: si alguien cambia la frase y olvida actualizar la
    // lista, la comprobación de arriba dejaría de servir sin que nadie lo note.
    const enFrase = normalize(CARRIER_PHRASE.replace('___', ''))
      .split(' ')
      .filter(Boolean);
    for (const w of enFrase) {
      expect(CARRIER_WORDS as readonly string[]).toContain(w);
    }
  });
});
