import { ChevronDown, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp, type Page } from '../../app/store';
import { controller } from '../../simulation/SimController';
import { SCENARIOS } from '../../simulation/scenarios';
import { cn } from '../../utils/format';
import { LogoMark } from '../ui/Logo';

export function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open, close]);
  return ref;
}

const TABS: Array<{ page: Page; n: string; label: string }> = [
  { page: 'live', n: '01', label: 'Live Simulation' },
  { page: 'how', n: '02', label: 'How It Works' },
  { page: 'evidence', n: '03', label: 'Evidence' },
];

/** Scenario selector — runs the scenario (same seed) on the Live Simulation page. */
function ScenarioMenu() {
  const name = useApp((s) => s.snap?.scenarioName ?? 'Reference conditions');
  const setUI = useApp((s) => s.setUI);
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-[36px] items-center gap-2 rounded-lg border border-line-strong bg-white/[0.03] px-3 text-[13.5px] text-ink transition-colors hover:border-cyan/40"
        aria-expanded={open}
      >
        <span className="text-muted">Scenario</span>
        <span className="max-w-[190px] truncate font-medium">{name}</span>
        <ChevronDown size={15} className="text-muted" />
      </button>
      {open && (
        <div className="glass absolute top-[44px] right-0 z-50 w-[330px] animate-fade-in !rounded-xl p-1.5 shadow-2xl">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                setOpen(false);
                setUI({ page: 'live' });
                void controller.runScenario(s.id);
              }}
              className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-panel-3"
            >
              <span className="text-[13.5px] text-ink">{s.name}</span>
              <span className="text-[12px] text-muted">{s.tagline}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TopBar() {
  const page = useApp((s) => s.ui.page);
  const setUI = useApp((s) => s.setUI);
  const paused = useApp((s) => s.snap?.paused ?? false);
  const speed = useApp((s) => s.snap?.speed ?? 5);
  return (
    <header className="relative z-30 flex h-[60px] shrink-0 items-center gap-6 border-b border-line bg-[#060f17] px-5">
      <div className="flex shrink-0 items-center gap-2.5">
        <LogoMark size={30} />
        <span className="text-[18px] font-bold tracking-tight text-white">SweepLine</span>
        <span className="pill !h-[22px] !px-2 !text-[10px]" data-tone="muted">
          SIMULATION
        </span>
      </div>

      <nav className="flex items-center gap-1" aria-label="Pages">
        {TABS.map((t) => {
          const active = t.page === page;
          return (
            <button
              key={t.page}
              type="button"
              onClick={() => setUI({ page: t.page })}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex h-[60px] items-center gap-2 px-4 text-[14.5px] transition-colors',
                active ? 'font-semibold text-white' : 'text-ink-2 hover:text-white',
              )}
            >
              <span className={cn('num text-[11.5px]', active ? 'text-cyan' : 'text-dim')}>{t.n}</span>
              {t.label}
              {active && <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-cyan shadow-[0_0_10px_rgba(34,211,238,0.7)]" />}
            </button>
          );
        })}
      </nav>

      <div className="ml-auto flex items-center gap-2.5">
        <ScenarioMenu />
        <button
          type="button"
          className="btn !h-[36px] !w-[36px] !px-0"
          title={paused ? 'Resume simulation' : 'Pause simulation'}
          onClick={() => controller.togglePause()}
        >
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <div className="seg !p-[3px]" title="Simulation speed">
          {[1, 5, 20].map((s) => (
            <button key={s} type="button" data-active={speed === s} onClick={() => controller.setSpeed(s)} className="num !h-[28px] !px-2.5">
              {s}x
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
