import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppShell } from './components/AppShell';
import { orderedNav } from './nav';
import { TaskDetailModal } from './components/TaskDetailModal';
import { useAppStore } from './store/useAppStore';
import { EisenhowerBoard } from './views/board/EisenhowerBoard';
import { StatusBoard } from './views/board/StatusBoard';
import { GanttView } from './views/gantt/GanttView';
import { ListView } from './views/list/ListView';
import { WbsView } from './views/wbs/WbsView';
import { MasterPlanView } from './views/master/MasterPlanView';

export default function App() {
  const { t, i18n } = useTranslation();
  const loaded = useAppStore((s) => s.loaded);
  const lang = useAppStore((s) => s.settings.lang);
  const init = useAppStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  // Theme: explicit light/dark, or follow the operating system.
  const theme = useAppStore((s) => s.settings.theme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && media.matches));
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);

  const teamName = useAppStore((s) => s.settings.teamName);
  useEffect(() => {
    document.title = teamName ? `${t('app.title')} · ${teamName}` : t('app.title');
  }, [teamName, t]);

  const navOrder = useAppStore((s) => s.settings.navOrder);
  const home = orderedNav(navOrder)[0].to;

  useEffect(() => {
    void i18n.changeLanguage(lang);
    document.documentElement.lang = lang;
  }, [lang, i18n]);

  if (!loaded) return <div className="grid h-screen place-items-center text-slate-500">{t('app.loading')}</div>;

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to={home} replace />} />
        {/* The old Today page now lives in the board's day column. */}
        <Route path="/today" element={<Navigate to="/board/matrix" replace />} />
        <Route path="/master" element={<MasterPlanView />} />
        <Route path="/wbs" element={<WbsView />} />
        <Route path="/gantt" element={<GanttView />} />
        <Route path="/board/matrix" element={<EisenhowerBoard />} />
        <Route path="/board/status" element={<StatusBoard />} />
        <Route path="/list" element={<ListView />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
      <TaskDetailModal />
    </AppShell>
  );
}
