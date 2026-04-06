/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'
import { resolve } from 'node:path'

// https://vitejs.dev/config/
export default defineConfig(({ command }) => {
  const isElectron = process.env.ELECTRON === 'true'

  return {
    plugins: [
      react(),

      // Only wire Electron plugin when ELECTRON=true (dev or build)
      ...(isElectron ? [
        electron({
          main: {
            entry: 'electron/main.ts',
            vite: {
              build: {
                outDir: 'dist-electron',
                rollupOptions: { external: ['electron'] },
              },
            },
          },
          preload: {
            input: resolve(__dirname, 'electron/preload.ts'),
          },
          renderer: {},
        }),
      ] : []),
    ],

    // base path:
    //   - Electron build → relative paths (./)
    //   - Minato-embed build (VITE_BASE_PATH=/kasumi-app/) → sub-path
    //   - standalone dev/build → root (/)
    base: isElectron && command === 'build' ? './' : (process.env.VITE_BASE_PATH ?? '/'),

    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react':  ['react', 'react-dom'],
            'vendor-pm':     ['prosemirror-state', 'prosemirror-view', 'prosemirror-model'],
            'vendor-pm-ext': ['prosemirror-tables', 'prosemirror-schema-list', 'prosemirror-commands'],
          },
        },
      },
    },

    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', 'src/test/e2e/**'],
      include: ['src/test/unit/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}', '!src/test/e2e/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html'],
        include: ['src/modules/**/*.{ts,tsx}'],
        exclude: ['src/modules/**/*.d.ts', 'src/test/**'],
        thresholds: {
          global: { branches: 70, functions: 75, lines: 75, statements: 75 },
        },
      },
    },
  }
})
