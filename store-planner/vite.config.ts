import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// 상위 폴더의 PostCSS 설정을 읽지 않도록 고정
export default defineConfig({ plugins: [react()], base: './', css: { postcss: {} } });
