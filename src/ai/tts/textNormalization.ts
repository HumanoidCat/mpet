/**
 * I-07 · Números a letras antes de sintetizar. Dueño: Isaac.
 *
 * EL PROBLEMA, MEDIDO NO SUPUESTO
 * El conteo de pronunciación (S7-T4) encontró que MMS-TTS **no sabe decir cifras**.
 * Con `$25` el reconocedor no oyó un número equivocado: no oyó nada donde iba la
 * cifra, en las tres repeticiones ("sake is", "sait as", "say this"). Es coherente con
 * cómo funciona el modelo, que convierte caracteres en sonidos y nunca aprendió que
 * "2" se dice "two".
 *
 * POR QUÉ IMPORTA EN ESTA APLICACIÓN CONCRETA
 * Precios, horas y fechas son contenido básico de una clase de inglés conversacional:
 * *"It costs $25"*, *"The class starts at 8:30"*, *"I was born in 1998"*. Con el
 * sintetizador actual, el estudiante oye un hueco mudo justo en la parte que tenía que
 * aprender. Y como ese audio es además la referencia contra la que se puntúa su
 * pronunciación, el hueco se convierte en un puntaje injusto.
 *
 * LA SOLUCIÓN, Y POR QUÉ ES BARATA
 * Escribir el número en letras antes de dárselo al modelo. No hace falta cambiar de
 * modelo, ni añadir dependencias, ni pedirle nada a nadie: es texto que entra por
 * `speak()` y se transforma antes de sintetizar.
 *
 * ALCANCE DECLARADO: inglés, hasta los millones. No cubre números romanos, fracciones
 * ni notación científica, que no aparecen en conversación de práctica. Lo que no
 * reconoce lo deja intacto, que es lo mismo que pasa hoy: nunca empeora.
 *
 * Es lógica pura (sin modelo ni navegador) a propósito: así se puede testear.
 */

const UNIDADES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];

const DECENAS = [
  '', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
];

/** Convierte un entero de 0 a 999 en palabras. */
function cientosEnLetras(n: number): string {
  if (n < 20) return UNIDADES[n];
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    // Con guion, como se escribe en inglés: "twenty-five". El tokenizador de MMS-TTS
    // trata el guion como separador, así que no cambia la pronunciación.
    return u === 0 ? DECENAS[d] : `${DECENAS[d]}-${UNIDADES[u]}`;
  }
  const c = Math.floor(n / 100);
  const resto = n % 100;
  return resto === 0
    ? `${UNIDADES[c]} hundred`
    : `${UNIDADES[c]} hundred ${cientosEnLetras(resto)}`;
}

/**
 * Convierte un entero en palabras.
 *
 * Se corta en los miles de millones porque más allá no aparece en una conversación de
 * práctica, y devolver el número tal cual es mejor que devolver algo incorrecto.
 */
export function numeroEnLetras(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n < 0) return `minus ${numeroEnLetras(-n)}`;
  if (n === 0) return 'zero';
  if (n >= 1_000_000_000) return String(n);

  const partes: string[] = [];
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;

  if (millones > 0) partes.push(`${cientosEnLetras(millones)} million`);
  if (miles > 0) partes.push(`${cientosEnLetras(miles)} thousand`);
  if (resto > 0) partes.push(cientosEnLetras(resto));

  return partes.join(' ');
}

const ORDINALES_IRREGULARES: Record<string, string> = {
  one: 'first',
  two: 'second',
  three: 'third',
  five: 'fifth',
  eight: 'eighth',
  nine: 'ninth',
  twelve: 'twelfth',
};

/** Convierte un entero en ordinal escrito: 3 → third, 21 → twenty-first. */
export function ordinalEnLetras(n: number): string {
  const palabras = numeroEnLetras(n);
  // Solo cambia la ÚLTIMA palabra: "twenty-one" → "twenty-first".
  const separador = palabras.lastIndexOf('-') > palabras.lastIndexOf(' ') ? '-' : ' ';
  const corte = Math.max(palabras.lastIndexOf('-'), palabras.lastIndexOf(' '));
  const prefijo = corte >= 0 ? palabras.slice(0, corte) : '';
  const ultima = corte >= 0 ? palabras.slice(corte + 1) : palabras;

  const ordinal =
    ORDINALES_IRREGULARES[ultima] ??
    (ultima.endsWith('y') ? `${ultima.slice(0, -1)}ieth` : `${ultima}th`);

  return corte >= 0 ? `${prefijo}${separador}${ordinal}` : ordinal;
}

/**
 * Dice un año como lo dice un hablante: 1998 → "nineteen ninety-eight".
 *
 * POR QUÉ NO "one thousand nine hundred ninety-eight": nadie habla así de los años, y
 * el estudiante está aprendiendo a sonar natural, no a leer cifras.
 */
export function anioEnLetras(n: number): string {
  // Los años 2000–2009 se dicen enteros ("two thousand five"), no por mitades.
  if (n >= 2000 && n <= 2009) return numeroEnLetras(n);
  if (n < 1100 || n > 2999) return numeroEnLetras(n);

  const alto = Math.floor(n / 100);
  const bajo = n % 100;
  if (bajo === 0) return `${cientosEnLetras(alto)} hundred`;
  // "nineteen oh five" para 1905: así se dice.
  if (bajo < 10) return `${cientosEnLetras(alto)} oh ${UNIDADES[bajo]}`;
  return `${cientosEnLetras(alto)} ${cientosEnLetras(bajo)}`;
}

/** Une la parte entera y la decimal de una cantidad de dinero. */
function dinero(entero: number, centavos: number, moneda: 'dollars' | 'euros'): string {
  const singularMoneda = moneda === 'dollars' ? 'dollar' : 'euro';
  const parteEntera = `${numeroEnLetras(entero)} ${entero === 1 ? singularMoneda : moneda}`;
  if (centavos === 0) return parteEntera;
  const parteCentavos = `${numeroEnLetras(centavos)} ${centavos === 1 ? 'cent' : 'cents'}`;
  return `${parteEntera} ${parteCentavos}`;
}

/** Dice una hora como se dice hablando: 8:30 → "eight thirty", 8:00 → "eight o'clock". */
function hora(h: number, m: number): string {
  const horas = numeroEnLetras(h);
  if (m === 0) return `${horas} o'clock`;
  // "eight oh five" para 8:05, igual que con los años.
  if (m < 10) return `${horas} oh ${UNIDADES[m]}`;
  return `${horas} ${cientosEnLetras(m)}`;
}

/**
 * Reescribe un texto para que el sintetizador pueda decirlo.
 *
 * El orden de las reglas importa y no es casual: las más específicas van primero,
 * porque `$25.50` tiene que reconocerse como dinero **antes** de que la regla de los
 * decimales lo parta en "veinticinco punto cincuenta".
 */
export function normalizeForSpeech(texto: string): string {
  let out = texto;

  // 1. Dinero: $25, $1.50, €10
  out = out.replace(/([$€])\s?(\d+)(?:\.(\d{1,2}))?/g, (_, simbolo, entero, decimales) => {
    const moneda = simbolo === '$' ? 'dollars' : 'euros';
    const centavos = decimales ? Number(decimales.padEnd(2, '0')) : 0;
    return dinero(Number(entero), centavos, moneda);
  });

  // 2. Horas: 8:30, 12:05
  out = out.replace(/\b(\d{1,2}):(\d{2})\b/g, (coincidencia, h, m) => {
    const horas = Number(h);
    const minutos = Number(m);
    // Si no es una hora válida no se dice como hora: puede ser un marcador o un
    // tiempo, y "veinticinco en punto" sería peor. Los dígitos no quedan sueltos: la
    // regla 7 los convertirá igual, porque dejar una cifra es dejar un silencio.
    if (horas > 23 || minutos > 59) return coincidencia;
    return hora(horas, minutos);
  });

  // 3. Porcentajes: 50%
  out = out.replace(/(\d+)\s?%/g, (_, n) => `${numeroEnLetras(Number(n))} percent`);

  // 4. Ordinales escritos con cifra: 1st, 2nd, 3rd, 21st
  out = out.replace(/\b(\d+)(?:st|nd|rd|th)\b/gi, (_, n) => ordinalEnLetras(Number(n)));

  // 5. Años: 1998, 2026. Solo cuatro cifras que caigan en rango de año.
  out = out.replace(/\b(1[1-9]\d{2}|20\d{2})\b/g, (_, n) => anioEnLetras(Number(n)));

  // 6. Decimales: 3.5
  out = out.replace(/\b(\d+)\.(\d+)\b/g, (_, entero, decimales) => {
    // Los decimales se dicen dígito a dígito: 3.14 es "three point one four".
    const digitos = [...String(decimales)].map((d) => UNIDADES[Number(d)]).join(' ');
    return `${numeroEnLetras(Number(entero))} point ${digitos}`;
  });

  // 7. Enteros sueltos, lo último que queda
  out = out.replace(/\b\d+\b/g, (n) => numeroEnLetras(Number(n)));

  return out;
}
