import type { Config } from 'tailwindcss';
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { brand: { DEFAULT: '#1428A0', dark: '#0f1f7a', soft: '#eef1ff' } },
    },
  },
  plugins: [],
};
export default config;
