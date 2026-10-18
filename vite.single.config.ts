// Builds the whole app into ONE self-contained HTML file (dist-single/index.html)
// for computers that can't reach the hosted site: copy the file and open it in Edge / Chrome.
import { defineConfig, mergeConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import base from './vite.config';

export default mergeConfig(
  base,
  defineConfig({
    plugins: [viteSingleFile()],
    build: { outDir: 'dist-single', emptyOutDir: true },
  }),
);
