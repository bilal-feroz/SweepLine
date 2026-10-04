import { Box, ChartLine, Coins, FlaskConical, LayoutDashboard, Network, ShieldCheck, Waves } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApp, type Page } from '../../app/store';
import { cn, type Tone } from '../../utils/format';
import { StatusDot } from '../ui/Panel';

const NAV: Array<{ page: Page; label: string; icon: ReactNode }> = [
  { page: 'overview', label: 'Overview', icon: <LayoutDashboard size={17} strokeWidth={1.5} /> },
  { page: 'visualiser', label: '3D Visualiser', icon: <Box size={17} strokeWidth={1.5} /> },
  { page: 'scenarios', label: 'Scenarios', icon: <FlaskConical size={17} strokeWidth={1.5} /> },
  { page: 'performance', label: 'Performance', icon: <ChartLine size={17} strokeWidth={1.5} /> },
  { page: 'environment', label: 'Environment', icon: <Waves size={17} strokeWidth={1.5} /> },
  { page: 'system', label: 'System Design', icon: <Network size={17} strokeWidth={1.5} /> },
  { page: 'validation', label: 'Validation', icon: <ShieldCheck size={17} strokeWidth={1.5} /> },
  { page: 'cost', label: 'Cost Analysis', icon: <Coins size={17} strokeWidth={1.5} /> },
];

export function Sidebar() {
  const page = useApp((s) => s.ui.page);
  const setUI = useApp((s) => s.setUI);
  const status = useApp((s) => s.snap?.status);
  const tone: Tone = status ? (status.tone === 'ok' ? 'ok' : status.tone === 'info' ? 'info' : status.tone === 'warn' ? 'warn' : 'alarm') : 'muted';

  return (
    <nav className="flex w-[224px] shrink-0 flex-col border-r border-line bg-deep/70 px-3 py-4" aria-label="Main navigation">
      <ul className="flex flex-col gap-1">
        {NAV.map((n) => {
          const active = n.page === page;
          return (
            <li key={n.page}>
              <button
                type="button"
                onClick={() => setUI({ page: n.page })}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group relative flex h-[40px] w-full items-center gap-3 rounded-lg px-3.5 text-[13.5px] transition-colors duration-150',
                  active ? 'bg-[#0f2233] text-white' : 'text-ink-2 hover:bg-panel-2 hover:text-ink',
                )}
              >
                {active && <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r bg-cyan shadow-[0_0_10px_rgba(34,211,238,0.7)]" />}
                <span className={cn(active ? 'text-cyan' : 'text-muted group-hover:text-ink-2')}>{n.icon}</span>
                {n.label}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-auto flex flex-col gap-3">
        <div className="panel-flat px-3.5 py-3">
          <div className="flex items-center gap-2">
            <StatusDot tone={tone} pulse={tone === 'alarm'} />
            <span className="text-[12px] font-semibold text-ink">System Status</span>
          </div>
          <div className={cn('mt-1.5 text-[13px] font-medium', tone === 'alarm' ? 'text-red' : tone === 'warn' ? 'text-amber' : 'text-ink')}>
            {status ? status.label : 'Initialising'}
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-muted">{status ? status.detail : 'Building digital twin'}</div>
        </div>
        <div className="px-1 text-[10.5px] leading-relaxed text-dim">
          Engineering design visualiser.
          <br />
          Values are simulation estimates — not field-validated.
        </div>
      </div>
    </nav>
  );
}
