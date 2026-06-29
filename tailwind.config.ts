import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // 다크 기본 팔레트
        ink: '#0b0f14',
        panel: '#151b23',
        panel2: '#1d2530',
        line: '#2a3540',
      },
    },
  },
  plugins: [],
};

export default config;
