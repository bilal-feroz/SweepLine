import { useEffect, type ReactNode } from 'react';
import { MapIntro } from '../components/intro/MapIntro';
import { TopBar } from '../components/layout/TopBar';
import { Toast } from '../components/layout/Toast';
import { LoadingOverlay } from '../components/viewport/Hud';
import { Evidence } from '../pages/Evidence';
import { HowItWorks } from '../pages/HowItWorks';
import { LiveSimulation } from '../pages/LiveSimulation';
import { pageFromHash, useApp, type Page } from './store';

const PAGES: Record<Page, () => ReactNode> = {
  live: () => <LiveSimulation />,
  how: () => <HowItWorks />,
  evidence: () => <Evidence />,
};

/** Hash routing keeps pages linkable and refresh-safe without a router dependency. */
function useHashRoute() {
  const page = useApp((s) => s.ui.page);
  const setUI = useApp((s) => s.setUI);
  useEffect(() => {
    const read = () => {
      const p = pageFromHash(window.location.hash);
      if (p) setUI({ page: p });
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
  const intro = useApp((s) => s.intro);
  return (
    <div className="flex h-full w-full min-w-[1100px] flex-col bg-base">
      <TopBar />
      <main key={page} className="flex min-h-0 min-w-0 flex-1 animate-fade-in overflow-hidden">
        {PAGES[page]()}
      </main>
      <LoadingOverlay />
      <Toast />
      {intro && <MapIntro />}
    </div>
  );
}
