import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// BASE_PATH permet de servir l'app depuis un sous-chemin (GitHub Pages : /Kadra/).
// Netlify et le développement local restent à la racine.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
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
