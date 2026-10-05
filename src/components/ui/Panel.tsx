import type { ReactNode } from 'react';
import { cn, type Tone, toneBg } from '../../utils/format';

export type TileTone = 'cyan' | 'red' | 'amber' | 'teal' | 'blue';

export function IconTile({ children, tone = 'cyan', size = 40, className }: { children: ReactNode; tone?: TileTone; size?: number; className?: string }) {
  return (
    <span className={cn('icon-tile', className)} data-tone={tone === 'cyan' ? undefined : tone} style={{ width: size, height: size }}>
      {children}
    </span>
  );
}

/** Card with an optional icon-tile header (title + subtitle) and actions. */
export function Panel({
  title,
  subtitle,
  icon,
  iconTone,
  actions,
  children,
  className,
  bodyClassName,
  eyebrow,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  iconTone?: TileTone;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  eyebrow?: ReactNode;
}) {
  return (
    <section className={cn('card flex min-h-0 flex-col', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="flex min-w-0 items-center gap-3">
            {icon && (
              <IconTile tone={iconTone} size={38}>
                {icon}
              </IconTile>
            )}
            <div className="min-w-0">
              {eyebrow && <div className="page-eyebrow !text-[11px]">{eyebrow}</div>}
              {title && <h3 className="card-title truncate">{title}</h3>}
              {subtitle && <p className="card-sub mt-0.5 line-clamp-2">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2 pt-0.5">{actions}</div>}
        </header>
      )}
      <div className={cn('min-h-0 flex-1 px-5 pb-4', bodyClassName)}>{children}</div>
    </section>
  );
}

export function Pill({ children, tone = 'green', dot = true, className }: { children: ReactNode; tone?: 'green' | 'amber' | 'red' | 'cyan' | 'muted'; dot?: boolean; className?: string }) {
  return (
    <span className={cn('pill', className)} data-tone={tone === 'green' ? undefined : tone}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
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

export function Bar({ value, tone = 'info', target, thick }: { value: number; tone?: Tone; target?: number; thick?: boolean }) {
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
    <div className={cn('relative w-full overflow-hidden rounded-full bg-[rgba(150,200,220,0.1)]', thick ? 'h-[7px]' : 'h-[5px]')}>
      <div className={cn('h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ease-out', color)} style={{ width: `${v * 100}%` }} />
      {target !== undefined && <div className="absolute top-0 h-full w-[2px] bg-ink/60" style={{ left: `${target * 100}%` }} />}
    </div>
  );
}

export function KeyValue({ label, value, tone, mono = true }: { label: ReactNode; value: ReactNode; tone?: Tone; mono?: boolean }) {
  const color = tone === 'alarm' ? 'text-red' : tone === 'warn' ? 'text-amber' : tone === 'ok' ? 'text-teal' : tone === 'info' ? 'text-cyan' : 'text-ink';
  return (
    <div className="flex items-center justify-between gap-3 py-[4px] text-[13px]">
      <span className="text-muted">{label}</span>
      <span className={cn('text-right whitespace-nowrap', mono && 'num', color)}>{value}</span>
    </div>
  );
}
