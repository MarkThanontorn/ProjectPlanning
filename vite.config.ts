/// <reference types="vitest" />
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

/**
 * Content Security Policy for built pages: the app may only load its own code, styles and fonts,
 * and can't send anything to another site — a second line of defence for the data inside.
 * The single-file build has everything inline (no files to point at), so it gets an inline policy.
 */
function contentSecurityPolicy(): Plugin {
  let single = false;
  const policy = (p: Record<string, string>) => Object.entries(p).map(([k, v]) => `${k} ${v}`).join('; ');
  return {
    name: 'content-security-policy',
    apply: 'build',
    configResolved(c) {
      single = c.build.outDir.replace(/\\/g, '/').endsWith('dist-single');
    },
    transformIndexHtml() {
      const csp = single
        ? policy({
            'default-src': "'none'",
            'script-src': "'unsafe-inline'",
            'style-src': "'unsafe-inline'",
            'font-src': 'data:',
            'img-src': 'data: blob:',
            'connect-src': "'none'",
            'base-uri': "'none'",
            'form-action': "'none'",
          })
        : policy({
            'default-src': "'self'",
            'script-src': "'self'",
            'style-src': "'self' 'unsafe-inline'",
            'font-src': "'self' data:",
            'img-src': "'self' data: blob:",
            'connect-src': "'self'",
            'object-src': "'none'",
            'base-uri': "'none'",
            'form-action': "'none'",
          });
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }];
    },
  };
}

export default defineConfig({
  // Relative asset paths: the same build works on GitHub Pages (/ProjectPlanning/) and as a local file.
  base: './',
  plugins: [react(), contentSecurityPolicy()],
  // App version from package.json, shown in the sidebar.
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { port: 5190, strictPort: true },
  test: { environment: 'node' },
});
