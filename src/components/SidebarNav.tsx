import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { orderedNav, type NavItem } from '../nav';
import { useAppStore } from '../store/useAppStore';
import { cx } from './ui';

function SortableLink({ item }: { item: NavItem }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cx('group relative', isDragging && 'z-10')}>
      <NavLink
        to={item.to}
        className={({ isActive }) =>
          cx(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium',
            isActive ? 'bg-emerald-50 text-emerald-800' : 'text-slate-600 hover:bg-slate-100',
            isDragging && 'bg-white shadow-lg ring-1 ring-emerald-400',
          )
        }
      >
        <span className="w-4 text-center">{item.icon}</span>
        <span className="flex-1">{t(`nav.${item.key}`)}</span>
      </NavLink>
      {/* Grip on the right: drag to reorder the menu */}
      <button
        type="button"
        title={t('nav.reorder')}
        aria-label={t('nav.reorder')}
        className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 cursor-grab touch-none rounded px-1 text-slate-400 hover:text-slate-700 active:cursor-grabbing group-hover:block"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
    </div>
  );
}

/** Sidebar menu; items can be dragged into any order (saved in settings, first item = home page). */
export function SidebarNav() {
  const order = useAppStore((s) => s.settings.navOrder);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const items = orderedNav(order);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const keys = items.map((i) => i.key as string);
    updateSettings({ navOrder: arrayMove(keys, keys.indexOf(String(e.active.id)), keys.indexOf(String(e.over.id))) });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
          {items.map((item) => (
            <SortableLink key={item.key} item={item} />
          ))}
        </nav>
      </SortableContext>
    </DndContext>
  );
}
