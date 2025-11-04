import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { resolve } from 'path';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    nodePolyfills({
      include: ['buffer', 'stream', 'util', 'zlib', 'process'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'images/favicon.png', 'images/favicon.svg', 'qpdf.wasm'],
      manifest: require('./public/manifest.json'),
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,json,wasm}'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 5MB for large JS bundles
      },
    }),
  ],
  define: {
    __SIMPLE_MODE__: JSON.stringify(process.env.SIMPLE_MODE === 'true'),
  },
  resolve: {
    alias: {
      stream: 'stream-browserify',
      zlib: 'browserify-zlib',
    },
  },
  optimizeDeps: {
    include: ['pdfkit', 'blob-stream'],
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        about: resolve(__dirname, 'about.html'),
        contact: resolve(__dirname, 'contact.html'),
        faq: resolve(__dirname, 'faq.html'),
        privacy: resolve(__dirname, 'privacy.html'),
        terms: resolve(__dirname, 'terms.html'),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/tests/',
        '*.config.ts',
        '**/*.d.ts',
        'dist/',
      ],
    },
  },
}));
