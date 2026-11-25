import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// infra 모드: 회사 PC용 단일 HTML (설치·인터넷 불필요, 더블클릭 실행)
export default defineConfig(({ mode }) => ({
  plugins: mode === 'infra' ? [react(), viteSingleFile()] : [react()],
  base: './',
  css: { postcss: {} },
  build: mode === 'infra' ? { outDir: 'dist-infra', chunkSizeWarningLimit: 4000 } : { chunkSizeWarningLimit: 4000 },
}));
