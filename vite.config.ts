import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  /**
   * Los Web Workers se compilan como módulos ES, no como IIFE.
   *
   * POR QUÉ HIZO FALTA: el worker de TTS carga `kokoro-js` con un `import()`
   * dinámico, para que el paquete no entre en el fragmento inicial. Un import
   * dinámico obliga a dividir el código, y el formato IIFE que Vite usa por
   * defecto en los workers no admite división — la compilación aborta con
   * «UMD and IIFE output formats are not supported for code-splitting builds»
   * (fallo del 16-ago, ver I-12).
   *
   * POR QUÉ NO AÑADE NINGÚN REQUISITO: los cuatro workers del proyecto ya se
   * instancian con `{ type: 'module' }` desde sus clientes, así que la
   * compatibilidad mínima ya era la de los workers de módulo —Chrome 80, Safari 15,
   * Firefox 114— y está documentada en `docs/evidencias/s8/s8-t4-compatibilidad-navegadores.md`.
   * Este ajuste alinea el formato de salida con cómo se cargan de verdad.
   */
  worker: {
    format: 'es',
  },
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@audio': fileURLToPath(new URL('./src/audio', import.meta.url)),
      '@ai': fileURLToPath(new URL('./src/ai', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@mocks': fileURLToPath(new URL('./mocks', import.meta.url)),
      // `kokoro-js` importa `path` y `fs/promises` en su compilado. Son modulos
      // de Node que no existen en el navegador, y sin esto `vite build` falla al
      // no poder resolverlos (fallo en integracion continua del 16-ago, con `tsc`
      // y las pruebas en verde porque ninguno de los dos empaqueta).
      //
      // El propio paquete declara `"browser": { "path": false, "fs/promises": false }`
      // porque solo los usa en la ruta de Node —para cargar voces desde disco—, y
      // en el navegador nunca llega ahi. Vite honra ese campo al resolver desde el
      // grafo de la aplicacion, pero **el import ocurre dentro de un Web Worker**,
      // que Rollup empaqueta aparte, y ahi no se aplica.
      //
      // SOLO EN COMPILACION, NO EN PRUEBAS. Cuatro pruebas del proyecto usan
      // `node:path` para leer ficheros de apoyo. Hoy no chocan porque ese
      // especificador es distinto de `path`, pero dejar el alias activo tambien
      // bajo Vitest haria que cambiar `node:path` por `path` en cualquier prueba
      // futura la rompiera de una forma dificil de entender. Acotarlo cuesta una
      // linea y elimina esa trampa.
      ...(process.env.VITEST
        ? {}
        : {
            path: fileURLToPath(new URL('./src/shared/emptyModule.ts', import.meta.url)),
            'fs/promises': fileURLToPath(new URL('./src/shared/emptyModule.ts', import.meta.url)),
          }),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'My Personal English Teacher',
        short_name: 'MPET',
        description: 'PWA offline para practicar inglés con DSP e IA en el navegador',
        theme_color: '#1a1a2e',
        background_color: '#1a1a2e',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        // Precache: solo el app shell (ligero, se instala de una vez).
        // Los modelos de Hugging Face (~279 MB) los cachea transformers.js
        // en la Cache API durante la primera inferencia, no aqui.
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // El runtime WASM de ONNX (ort-wasm-*.wasm, ~22 MB) se cachea en
        // tiempo de ejecucion, no en el precache. Motivos:
        //   1) Coherencia: los modelos ya se cachean asi. Precachear el WASM
        //      no daria offline por si solo, porque faltarian los modelos.
        //   2) El precache de Workbox es todo-o-nada: 22 MB en la instalacion
        //      del service worker es un punto de fallo innecesario.
        // Resultado: primera ejecucion en linea descarga runtime + modelos;
        // a partir de ahi la app funciona sin conexion (RF-14, RF-15).
        runtimeCaching: [
          {
            urlPattern: /\.wasm$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'onnx-runtime-wasm',
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 60 * 60 * 24 * 90 // 90 dias
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  test: {
    // Por defecto Node: el DSP, el nucleo y el canal de IA se prueban sin
    // navegador, que es mas rapido y evita depender de un DOM simulado. Las
    // pruebas que si necesitan DOM lo declaran por archivo con la marca
    // `@vitest-environment jsdom` en su cabecera.
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}']
  }
});
