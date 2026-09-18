import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          konva: ['konva', 'react-konva'],
          vendor: ['react', 'react-dom', 'react-router-dom', 'dexie', 'zustand'],
          zip: ['jszip'],
        },
      },
    },
  },
});
