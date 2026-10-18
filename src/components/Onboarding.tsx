import { useTranslation } from 'react-i18next';
import { hasDemo } from '../domain/demo';
import { useAppStore } from '../store/useAppStore';

/** First-launch choice: start empty (real use) or explore with sample data. */
export function Welcome() {
  const { t } = useTranslation();
  const { startEmpty, startWithDemo } = useAppStore();
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-900/50 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-xl rounded-2xl bg-white p-7 shadow-2xl">
        <div className="mb-1 text-sm font-medium text-emerald-700">● {t('app.title')}</div>
        <h2 className="text-2xl font-bold text-slate-900">{t('onboard.title')}</h2>
        <p className="mt-1 text-slate-500">{t('onboard.sub')}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            autoFocus
            className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-4 text-left hover:bg-emerald-100"
            onClick={startEmpty}
          >
            <div className="text-2xl">✨</div>
            <div className="mt-1 font-semibold text-slate-900">{t('onboard.empty')}</div>
            <div className="text-sm text-slate-600">{t('onboard.emptyHint')}</div>
          </button>
          <button className="rounded-xl border-2 border-slate-200 p-4 text-left hover:border-slate-400 hover:bg-slate-50" onClick={startWithDemo}>
            <div className="text-2xl">🧪</div>
            <div className="mt-1 font-semibold text-slate-900">{t('onboard.demo')}</div>
            <div className="text-sm text-slate-600">{t('onboard.demoHint')}</div>
          </button>
        </div>
        <p className="mt-5 text-xs text-slate-400">{t('onboard.privacy')}</p>
      </div>
    </div>
  );
}

/** Slim notice while sample data is present, with a one-click way to remove it. */
export function DemoBanner() {
  const { t } = useTranslation();
  const demo = useAppStore((s) => hasDemo(s));
  const removeDemo = useAppStore((s) => s.removeDemo);
  if (!demo) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <span>🧪 {t('onboard.banner')}</span>
      <button
        className="ml-auto rounded-lg border border-amber-300 bg-white px-3 py-1 font-medium text-amber-900 hover:bg-amber-100"
        onClick={() => confirm(t('onboard.removeConfirm')) && removeDemo()}
      >
        {t('onboard.remove')}
      </button>
    </div>
  );
}
