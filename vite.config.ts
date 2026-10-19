import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // <--- هذا السطر هو الأساس لحل مشكلة مسارات الملفات وأنواع الـ MIME
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});