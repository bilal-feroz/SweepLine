import { Box, ChartLine, ChevronRight, Coins, FlaskConical, LayoutDashboard, Network, ShieldCheck, Waves } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApp, type Page } from '../../app/store';
import { cn, type Tone } from '../../utils/format';
import { StatusDot } from '../ui/Panel';

const NAV: Array<{ page: Page; label: string; icon: ReactNode }> = [
  { page: 'overview', label: 'Overview', icon: <LayoutDashboard size={20} strokeWidth={1.5} /> },
  { page: 'visualiser', label: '3D Visualiser', icon: <Box size={20} strokeWidth={1.5} /> },
  { page: 'scenarios', label: 'Scenarios', icon: <FlaskConical size={20} strokeWidth={1.5} /> },
  { page: 'performance', label: 'Performance', icon: <ChartLine size={20} strokeWidth={1.5} /> },
  { page: 'environment', label: 'Environment', icon: <Waves size={20} strokeWidth={1.5} /> },
  { page: 'system', label: 'System Design', icon: <Network size={20} strokeWidth={1.5} /> },
  { page: 'validation', label: 'Validation', icon: <ShieldCheck size={20} strokeWidth={1.5} /> },
  { page: 'cost', label: 'Cost Analysis', icon: <Coins size={20} strokeWidth={1.5} /> },
];

export function Sidebar() {
  const page = useApp((s) => s.ui.page);
  const setUI = useApp((s) => s.setUI);
  const status = useApp((s) => s.snap?.status);
  const tone: Tone = status ? (status.tone === 'ok' ? 'ok' : status.tone === 'info' ? 'info' : status.tone === 'warn' ? 'warn' : 'alarm') : 'muted';

  return (
    <nav className="flex w-[232px] shrink-0 flex-col border-r border-line bg-[#060f17] px-3.5 py-5 min-[1600px]:w-[256px]" aria-label="Main navigation">
      <ul className="flex flex-col gap-1.5">
        {NAV.map((n) => {
          const active = n.page === page;
          return (
            <li key={n.page}>
              <button
                type="button"
                onClick={() => setUI({ page: n.page })}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex h-[48px] w-full items-center gap-3.5 rounded-xl px-4 text-[15px] transition-colors duration-150',
                  active ? 'bg-[linear-gradient(90deg,#10283b,#0d1f2e)] font-medium text-white' : 'text-ink-2 hover:bg-panel-2 hover:text-white',
                )}
              >
                {active && <span className="absolute top-2.5 bottom-2.5 left-0 w-[3px] rounded-r bg-cyan shadow-[0_0_12px_rgba(34,211,238,0.8)]" />}
                <span className={cn(active ? 'text-cyan' : 'text-muted group-hover:text-ink-2')}>{n.icon}</span>
                {n.label}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setUI({ page: 'visualiser' })}
          className="card flex items-center justify-between gap-2 !rounded-2xl px-4 py-3.5 text-left transition-colors hover:border-cyan/30"
          title="Open operations"
        >
          <span>
            <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
              <StatusDot tone={tone} pulse={tone === 'alarm'} /> System Status
            </span>
            <span className={cn('mt-1.5 block text-[19px] font-semibold', tone === 'alarm' ? 'text-red' : tone === 'warn' ? 'text-amber' : 'text-white')}>
              {status ? status.label : 'Initialising'}
            </span>
            <span className="mt-0.5 block text-[12px] leading-snug text-muted">{status ? status.detail : 'Building digital twin'}</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-muted" />
        </button>
        <div className="px-1.5 text-[11.5px] leading-relaxed text-dim">
          Engineering design visualiser. Values are simulation estimates — not field-validated.
        </div>
      </div>
    </nav>
  );
}
