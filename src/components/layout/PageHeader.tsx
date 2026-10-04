import { ChevronRight, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApp } from '../../app/store';
import { cn } from '../../utils/format';

export function PageHeader({ eyebrow, title, subtitle, right }: { eyebrow: string; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-end justify-between gap-4">
      <div className="min-w-0">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="mt-0.5 truncate text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ink-2">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/** Operating-envelope status badge (links to the Environment page). */
export function EnvelopeBadge() {
  const env = useApp((s) => s.snap?.envelope);
  const setUI = useApp((s) => s.setUI);
  if (!env) return null;
  const ok = env.within;
  const advisory = env.advisories.length > 0;
  return (
    <button
      type="button"
      onClick={() => setUI({ page: 'environment' })}
      className={cn(
        'flex h-[40px] shrink-0 items-center gap-3 rounded-xl border px-3.5 text-[12px] transition-colors',
        ok
          ? advisory
            ? 'border-amber/35 bg-amber/[0.07] hover:bg-amber/[0.12]'
            : 'border-teal/30 bg-teal/[0.06] hover:bg-teal/[0.1]'
          : 'border-red/40 bg-red/[0.08] hover:bg-red/[0.13]',
      )}
      title="Open the operating envelope"
    >
      {ok ? <ShieldCheck size={17} className={advisory ? 'text-amber' : 'text-teal'} /> : <ShieldAlert size={17} className="text-red" />}
      <span className={cn('font-medium', ok ? (advisory ? 'text-amber' : 'text-teal') : 'text-red')}>
        {ok ? (advisory ? 'Within envelope · advisory' : 'Operating within assumed envelope') : 'Outside validated operating envelope'}
      </span>
      <span className="border-l border-line-strong pl-3 text-ink-2">
        <span className="num">
          {env.satisfied}/{env.total}
        </span>{' '}
        <span className="hidden min-[1600px]:inline">constraints satisfied</span>
        <span className="min-[1600px]:hidden">met</span>
      </span>
      <ChevronRight size={14} className="text-muted" />
    </button>
  );
}
