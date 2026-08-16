/**
 * Módulo vacío al que se redirigen los módulos de Node que alguna dependencia
 * importa pero que en el navegador nunca se ejecutan.
 *
 * POR QUÉ EXISTE: `kokoro-js` importa `path` y `fs/promises` en su compilado. Los
 * usa solo en la ruta de Node —para cargar los vectores de voz desde disco— y su
 * `package.json` lo declara con `"browser": { "path": false, "fs/promises": false }`.
 * En el navegador esa rama no se alcanza: las voces llegan por red.
 *
 * Vite honra ese campo `browser` cuando resuelve desde el grafo de la aplicación,
 * pero el import ocurre **dentro de un Web Worker**, que Rollup empaqueta como una
 * entrada aparte donde no se aplica. Sin este alias, `vite build` falla al no poder
 * resolver `path` — que es lo que rompió la integración continua el 16 de agosto,
 * con `tsc` y las pruebas en verde, porque ninguno de los dos empaqueta.
 *
 * NO SE PONE UN OBJETO FALSO CON MÉTODOS SIMULADOS a propósito. Si alguna vez se
 * alcanzara de verdad esta ruta, un `join()` que devuelve una cadena inventada
 * fallaría más adelante y lejos de la causa. Un módulo vacío hace que el fallo
 * ocurra donde está el problema.
 */

export default {};
