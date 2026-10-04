import type { ReactNode } from 'react';
import { cn, type Tone, toneBg } from '../../utils/format';

export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
  eyebrow,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  eyebrow?: ReactNode;
}) {
  return (
    <section className={cn('panel flex min-h-0 flex-col', className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
          <div className="min-w-0">
            {eyebrow && <div className="eyebrow mb-0.5">{eyebrow}</div>}
            {title && <h3 className="truncate text-[13px] font-semibold text-ink">{title}</h3>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={cn('min-h-0 flex-1 px-4 pb-3', bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatusDot({ tone, pulse, className }: { tone: Tone; pulse?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex h-2 w-2 shrink-0', className)}>
      {pulse && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-40', toneBg[tone])} />}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', toneBg[tone])} />
    </span>
  );
}

export function EstimateTag({ className }: { className?: string }) {
  return <span className={cn('tag', className)}>Simulation estimate</span>;
}

export function Bar({ value, tone = 'info', target }: { value: number; tone?: Tone; target?: number }) {
  const v = Math.max(0, Math.min(1, value));
  const color =
    tone === 'warn'
      ? 'from-amber/70 to-amber'
      : tone === 'alarm'
        ? 'from-red/70 to-red'
        : tone === 'ok'
          ? 'from-teal/70 to-teal'
          : 'from-cyan/70 to-cyan';
  return (
    <div className="relative h-[5px] w-full overflow-hidden rounded-full bg-line">
      <div className={cn('h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ease-out', color)} style={{ width: `${v * 100}%` }} />
      {target !== undefined && <div className="absolute top-0 h-full w-px bg-ink/50" style={{ left: `${target * 100}%` }} />}
    </div>
  );
}

export function KeyValue({ label, value, tone, mono = true }: { label: ReactNode; value: ReactNode; tone?: Tone; mono?: boolean }) {
  const color = tone === 'alarm' ? 'text-red' : tone === 'warn' ? 'text-amber' : tone === 'ok' ? 'text-teal' : tone === 'info' ? 'text-cyan' : 'text-ink';
  return (
    <div className="flex items-center justify-between gap-3 py-[3px] text-[12px]">
      <span className="text-muted">{label}</span>
      <span className={cn('text-right whitespace-nowrap', mono && 'num', color)}>{value}</span>
    </div>
  );
}
