import { useEffect, type ReactNode } from 'react';
import { Sidebar } from '../components/layout/Sidebar';
import { TopBar } from '../components/layout/TopBar';
import { Toast } from '../components/layout/Toast';
import { LoadingOverlay } from '../components/viewport/Hud';
import { CostAnalysis } from '../pages/CostAnalysis';
import { Environment } from '../pages/Environment';
import { Overview } from '../pages/Overview';
import { Performance } from '../pages/Performance';
import { Scenarios } from '../pages/Scenarios';
import { SystemDesign } from '../pages/SystemDesign';
import { Validation } from '../pages/Validation';
import { Visualiser } from '../pages/Visualiser';
import { useApp, type Page } from './store';

const PAGES: Record<Page, () => ReactNode> = {
  overview: () => <Overview />,
  visualiser: () => <Visualiser />,
  scenarios: () => <Scenarios />,
  performance: () => <Performance />,
  environment: () => <Environment />,
  system: () => <SystemDesign />,
  validation: () => <Validation />,
  cost: () => <CostAnalysis />,
};

const isPage = (p: string): p is Page => p in PAGES;

/** Hash routing keeps pages linkable and refresh-safe without a router dependency. */
function useHashRoute() {
  const page = useApp((s) => s.ui.page);
  const setUI = useApp((s) => s.setUI);
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.replace(/^#\/?/, '');
      if (isPage(h)) setUI({ page: h });
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, [setUI]);
  useEffect(() => {
    const target = `#/${page}`;
    if (window.location.hash !== target) window.history.replaceState(null, '', target);
  }, [page]);
  return page;
}

export function App() {
  const page = useHashRoute();
  return (
    <div className="flex h-full w-full min-w-[1100px] flex-col bg-base">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main key={page} className="flex min-w-0 flex-1 animate-fade-in overflow-hidden">
          {PAGES[page]()}
        </main>
      </div>
      <LoadingOverlay />
      <Toast />
    </div>
  );
}
