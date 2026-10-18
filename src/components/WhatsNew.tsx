import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import changelog from '../../CHANGELOG.md?raw';

/** Minimal renderer for the changelog's own markdown (##/### headings, "- " bullets, `code`, **bold**). */
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('`') ? (
      <code key={i} className="rounded bg-slate-100 px-1 text-[0.9em]">
        {part.slice(1, -1)}
      </code>
    ) : part.startsWith('**') ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}

function renderChangelog(md: string) {
  const out: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length)
      out.push(
        <ul key={out.length} className="mb-3 ml-5 list-disc space-y-0.5 text-sm text-slate-700">
          {bullets.map((b, i) => (
            <li key={i}>{inline(b)}</li>
          ))}
        </ul>,
      );
    bullets = [];
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line.startsWith('- ')) bullets.push(line.slice(2));
    else if (line.startsWith('  ') && bullets.length) bullets[bullets.length - 1] += ' ' + line.trim();
    else {
      flush();
      if (line.startsWith('## '))
        out.push(
          <h3 key={out.length} className="mb-1 mt-4 text-base font-bold text-slate-900">
            {inline(line.slice(3).replace(/\[([^\]]+)\]/, 'v$1'))}
          </h3>,
        );
      else if (line.startsWith('# ')) continue;
      else if (line.trim()) out.push(<p key={out.length} className="mb-2 text-sm text-slate-600">{inline(line)}</p>);
    }
  }
  flush();
  return out;
}

/** "What's new" dialog showing CHANGELOG.md. */
export function WhatsNew({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-bold">
            {t('app.whatsNew')} <span className="ml-1 text-sm font-normal text-slate-500">v{__APP_VERSION__}</span>
          </h2>
          <button className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label={t('detail.close')}>
            ✕
          </button>
        </div>
        <div className="overflow-y-auto px-6 pb-5 pt-1">{renderChangelog(changelog)}</div>
      </div>
    </div>
  );
}
