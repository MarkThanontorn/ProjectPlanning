import { useTranslation } from 'react-i18next';
import { applyUpdate, installApp, usePwaStore } from '../pwa';

/** "A new version is ready" — switches when the user is ready (nothing is lost; data stays in the browser). */
export function UpdateBanner() {
  const { t } = useTranslation();
  const ready = usePwaStore((s) => s.updateReady);
  if (!ready) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
      <span>✨ {t('pwa.updateReady')}</span>
      <button className="ml-auto rounded-lg bg-emerald-600 px-3 py-1 font-medium text-white hover:bg-emerald-700" onClick={() => void applyUpdate()}>
        {t('pwa.updateNow')}
      </button>
    </div>
  );
}

/** Sidebar button offering the browser's "install as app", when available. */
export function InstallButton() {
  const { t } = useTranslation();
  const canInstall = usePwaStore((s) => s.canInstall && !s.installed);
  if (!canInstall) return null;
  return (
    <button
      className="w-full rounded-lg border border-emerald-300 py-1.5 text-emerald-700 hover:bg-emerald-50"
      title={t('pwa.installHint')}
      onClick={() => void installApp()}
    >
      ⬇ {t('pwa.install')}
    </button>
  );
}
