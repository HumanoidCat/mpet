import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@audio': fileURLToPath(new URL('./src/audio', import.meta.url)),
      '@ai': fileURLToPath(new URL('./src/ai', import.meta.url)),
      '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@mocks': fileURLToPath(new URL('./mocks', import.meta.url)),
    },
  },
  plugins: [
    react(),
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
        // Los modelos de Hugging Face (~41 MB) los cachea transformers.js
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
    environment: 'node',
    include: ['tests/**/*.test.ts']
  }
});
