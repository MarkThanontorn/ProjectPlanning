/**
 * Makes the hosted build installable as an app (Edge / Chrome "Install") and usable offline:
 * emits manifest.webmanifest and a service worker that precaches every built file.
 * Skipped for the single-file build — browsers only install https sites, not local files.
 */
import type { Plugin } from 'vite';

const PUBLIC_FILES = ['icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon.png', 'manifest.webmanifest'];

const manifest = {
  name: 'Project Planning',
  short_name: 'Planning',
  description: 'WBS, Gantt, Kanban & Eisenhower planner',
  start_url: './',
  scope: './',
  display: 'standalone',
  background_color: '#f8fafc',
  theme_color: '#059669',
  lang: 'th',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
};

/**
 * Cache-first for the app's own files (they're versioned by hash), so the installed app opens
 * offline. A new release ships a new worker; it waits until the user clicks "Update".
 */
const serviceWorker = (version: string, files: string[]) => `// Generated at build time — Project Planning v${version}
const CACHE = 'pp-${version}';
const PRECACHE = ${JSON.stringify(['./', ...files.map((f) => `./${f}`)])};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pp-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  if (req.mode === 'navigate') {
    // The page always matches the cached code of this version.
    e.respondWith(caches.match(new URL('./index.html', self.registration.scope).href).then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req).then((r) => r || fetch(req)));
});
`;

export function pwa(version: string): Plugin {
  let single = false;
  return {
    name: 'pwa',
    apply: 'build',
    configResolved(c) {
      single = c.build.outDir.replace(/\\/g, '/').endsWith('dist-single');
    },
    transformIndexHtml() {
      if (single) return [];
      return [
        { tag: 'link', attrs: { rel: 'manifest', href: './manifest.webmanifest' }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'icon', type: 'image/png', href: './favicon.png' }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: './apple-touch-icon.png' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#059669' }, injectTo: 'head' },
      ];
    },
    generateBundle(_, bundle) {
      if (single) return;
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(manifest, null, 2) });
      const files = [...new Set([...Object.keys(bundle), 'index.html', ...PUBLIC_FILES])].filter((f) => !f.endsWith('.map'));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorker(version, files) });
    },
  };
}
