import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Ningun texto que vea el usuario puede ser una nota interna del equipo.
 *
 * POR QUE EXISTE
 * La pantalla del visualizador mostro durante semanas, al usuario final y en
 * produccion, frases como "FFT real (S3-T1, Fabrizio) OK" y "pitchHz siempre es
 * null hasta el detector real de pitch de Fabrizio (S5-T1)". Eran notas entre
 * companeros escritas dentro del JSX en vez de en un comentario, asi que se
 * renderizaban. Ademas quedaron falsas: describian un estado del proyecto de
 * semanas atras.
 *
 * Ninguna de las 365 pruebas lo detecto porque ninguna mira el texto que sale a
 * pantalla. Esta prueba cubre ese hueco de la forma mas barata posible: lee el
 * codigo fuente, quita los comentarios y busca marcas que solo aparecen en
 * lenguaje interno.
 *
 * Si una prueba falla aqui, la correccion no es borrar la marca: es mover la
 * nota a un comentario, que es donde va.
 */

const RAIZ = join(__dirname, '..', '..', 'src');

/** Marcas que nunca deben salir a pantalla. */
const PROHIBIDO: Array<{ patron: RegExp; motivo: string }> = [
  { patron: /S\d+-T\d+/, motivo: 'codigo de tarea del plan interno' },
  { patron: /\b(Fabrizio|Isaac|Monestel|Alejandro)\b/i, motivo: 'nombre de un integrante' },
  { patron: /\b(TODO|FIXME|HACK|XXX)\b/, motivo: 'marca de trabajo pendiente' },
  { patron: /\bshared-change\b/i, motivo: 'vocabulario del proceso interno' },
];

function archivosTsx(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivosTsx(ruta);
    return ruta.endsWith('.tsx') ? [ruta] : [];
  });
}

/**
 * Quita comentarios de bloque, de linea y de JSX. Lo que queda es, a grandes
 * rasgos, codigo y texto renderizable. Se prefiere una aproximacion simple y
 * legible a un analisis sintactico: si algun dia da un falso positivo, el
 * arreglo sigue siendo mover la nota a un comentario.
 */
function sinComentarios(fuente: string): string {
  return fuente
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '') // {/* comentario JSX */}
    .replace(/\/\*[\s\S]*?\*\//g, '') // /* comentario de bloque */
    // Comentario de linea, incluido el que va al final de una linea de codigo.
    // El `[^:]` evita cortar en `https://`, que tambien lleva dos barras.
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('La interfaz no muestra notas internas del equipo', () => {
  const archivos = [...archivosTsx(join(RAIZ, 'ui')), join(RAIZ, 'App.tsx')];

  it('hay archivos que revisar', () => {
    expect(archivos.length).toBeGreaterThan(5);
  });

  for (const ruta of archivos) {
    const nombre = ruta.slice(ruta.indexOf('src'));

    it(`${nombre} no filtra lenguaje interno`, () => {
      const codigo = sinComentarios(readFileSync(ruta, 'utf-8'));

      for (const { patron, motivo } of PROHIBIDO) {
        const encontrado = codigo.match(patron);
        expect(
          encontrado,
          `${nombre} contiene "${encontrado?.[0]}" fuera de un comentario (${motivo}). ` +
            'Si es una nota para el equipo, va en un comentario, no en el JSX.'
        ).toBeNull();
      }
    });
  }
});
