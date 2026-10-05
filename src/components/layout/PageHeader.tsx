import { ShieldAlert, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useApp } from '../../app/store';
import { cn } from '../../utils/format';

export function PageHeader({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex shrink-0 items-end justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && <div className="page-eyebrow">{eyebrow}</div>}
        <h1 className="page-title mt-1 truncate">{title}</h1>
        {subtitle && <p className="page-sub mt-1.5 line-clamp-2">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/** Compact operating-envelope status (links to the Environment page). */
export function EnvelopeBadge({ compact, short }: { compact?: boolean; short?: boolean }) {
  const env = useApp((s) => s.snap?.envelope);
  const setUI = useApp((s) => s.setUI);
  if (!env) return null;
  const ok = env.within;
  const advisory = env.advisories.length > 0;
  const tone = ok ? (advisory ? 'amber' : 'teal') : 'red';
  return (
    <button
      type="button"
      onClick={() => setUI({ page: 'environment' })}
      className={cn(
        'flex shrink-0 items-center gap-2 rounded-xl border font-medium whitespace-nowrap transition-colors',
        short ? 'h-[30px] px-2.5 text-[12px]' : compact ? 'h-[34px] px-3 text-[13px]' : 'h-[40px] px-3 text-[13px]',
        tone === 'teal' && 'border-teal/35 bg-teal/[0.07] text-teal hover:bg-teal/[0.12]',
        tone === 'amber' && 'border-amber/40 bg-amber/[0.08] text-amber hover:bg-amber/[0.13]',
        tone === 'red' && 'border-red/45 bg-red/[0.09] text-red hover:bg-red/[0.14]',
      )}
      title={`${env.satisfied}/${env.total} assumed envelope constraints satisfied — open the operating envelope`}
    >
      {ok ? <ShieldCheck size={short ? 14 : 16} /> : <ShieldAlert size={short ? 14 : 16} />}
      {short
        ? ok
          ? advisory
            ? 'Advisory'
            : 'Within envelope'
          : 'Outside envelope'
        : ok
          ? advisory
            ? 'Within envelope · advisory'
            : 'Operating within envelope'
          : 'Outside validated envelope'}
    </button>
  );
}
