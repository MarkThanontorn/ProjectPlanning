import { useTranslation } from 'react-i18next';

/**
 * Drag handle on a header cell's right edge. Reports the live width while
 * dragging and the final width on release; double-click resets to automatic.
 */
export function ResizeHandle({
  min = 60,
  onLive,
  onCommit,
  onReset,
}: {
  min?: number;
  onLive: (width: number) => void;
  onCommit: (width: number) => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      title={t('wbs.resizeHint')}
      className="absolute right-0 top-0 z-10 h-full w-2 cursor-col-resize touch-none hover:bg-sky-400/50 active:bg-sky-500/60"
      onPointerDown={(e) => {
        // Keep the header's column-reorder drag from starting.
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = (e.currentTarget.parentElement as HTMLElement).offsetWidth;
        const widthAt = (x: number) => Math.max(min, Math.round(startW + x - startX));
        const move = (ev: PointerEvent) => onLive(widthAt(ev.clientX));
        const up = (ev: PointerEvent) => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          onCommit(widthAt(ev.clientX));
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onReset();
      }}
    />
  );
}
