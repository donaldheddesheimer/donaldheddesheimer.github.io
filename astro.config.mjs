// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import { figures } from './src/lib/figures';

export default defineConfig({
  site: 'https://donaldheddesheimer.github.io',
  integrations: [figures()],
  vite: { plugins: [tailwindcss()] },
});
