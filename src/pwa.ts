/**
 * Installable app + offline support (hosted build only): registers the service worker,
 * tells the UI when a new version is ready, and offers the browser's install prompt.
 */
import { create } from 'zustand';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** A newer version is downloaded and waiting for the user to switch. */
  updateReady: boolean;
  /** The browser is willing to install the app (Edge / Chrome). */
  canInstall: boolean;
  /** Running as the installed app window. */
  installed: boolean;
}

export const usePwaStore = create<PwaState>(() => ({
  updateReady: false,
  canInstall: false,
  installed: typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches,
}));

let installPrompt: InstallPromptEvent | null = null;
let updating = false;

export function registerPwa() {
  if (!__PWA__ || !import.meta.env.PROD || !('serviceWorker' in navigator) || location.protocol === 'file:') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // show our own button instead of the browser's mini bar
    installPrompt = e as InstallPromptEvent;
    usePwaStore.setState({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    usePwaStore.setState({ canInstall: false, installed: true });
  });

  // Only reload when the user asked for the update (not when the first worker takes over).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updating) location.reload();
  });

  void navigator.serviceWorker.register('./sw.js').then((reg) => {
    const ready = () => usePwaStore.setState({ updateReady: true });
    if (reg.waiting && navigator.serviceWorker.controller) ready();
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) ready();
      });
    });
    // Look for a new release when the app comes back into view, and hourly while open.
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void reg.update());
    setInterval(() => void reg.update(), 60 * 60_000);
  });
}

/** Switches to the waiting version (the page reloads). */
export async function applyUpdate() {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg?.waiting) return location.reload();
  updating = true;
  reg.waiting.postMessage('skip-waiting');
}

export async function installApp() {
  if (!installPrompt) return;
  await installPrompt.prompt();
  const { outcome } = await installPrompt.userChoice;
  if (outcome === 'accepted') usePwaStore.setState({ canInstall: false });
  installPrompt = null;
}
