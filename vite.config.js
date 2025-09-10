import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'client',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'client/index.html'),
      },
      output: {
        manualChunks: undefined,
      }
    },
    target: 'es2020',
    sourcemap: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'client/src'),
      '@/types': resolve(__dirname, 'client/src/types'),
      '@/modules': resolve(__dirname, 'client/src/modules'),
      '@/utils': resolve(__dirname, 'client/src/utils')
    }
  },
  server: {
    port: 5173,
    open: false,
    cors: true,
    proxy: {
      '/api': {
        target: 'https://localhost:8443',
        changeOrigin: true,
        secure: false
      }
    }
  },
  preview: {
    port: 4173
  },
  esbuild: {
    target: 'es2020'
  }
});
