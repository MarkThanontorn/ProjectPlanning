/// <reference types="vitest" />
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

export default defineConfig({
  // Relative asset paths: the same build works on GitHub Pages (/ProjectPlanning/) and as a local file.
  base: './',
  plugins: [react()],
  // App version from package.json, shown in the sidebar.
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { port: 5190, strictPort: true },
  test: { environment: 'node' },
});
