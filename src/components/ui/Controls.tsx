import type { ReactNode } from 'react';
import { cn } from '../../utils/format';

export interface SegOption<T extends string | number> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  title?: string;
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
  size = 'md',
}: {
  value: T;
  options: SegOption<T>[];
  onChange: (v: T) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={cn('seg', className)} role="radiogroup">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          data-active={o.value === value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn('flex-1', size === 'sm' && '!h-[26px] !px-2 !text-[12px]')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  tone,
  hint,
  disabled,
  marker,
  icon,
  ends,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step: number;
  display: ReactNode;
  onChange: (v: number) => void;
  tone?: 'amber' | 'red';
  hint?: ReactNode;
  disabled?: boolean;
  /** Optional reference marker (e.g. envelope limit) as a value. */
  marker?: { value: number; label: string };
  /** Leading icon shown before the label. */
  icon?: ReactNode;
  /** Labels under the two ends of the track. */
  ends?: [ReactNode, ReactNode];
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn('group', disabled && 'opacity-50')}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[13.5px] text-ink-2">
          {icon && <span className="flex shrink-0 text-muted">{icon}</span>}
          <span className="truncate">{label}</span>
        </span>
        <span className={cn('num shrink-0 text-[13.5px]', tone === 'red' ? 'text-red' : tone === 'amber' ? 'text-amber' : 'text-ink')}>{display}</span>
      </div>
      <div className="relative mt-1">
        <input
          type="range"
          className="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          data-tone={tone}
          style={{ ['--pct' as string]: `${pct}%` }}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={typeof label === 'string' ? label : undefined}
        />
        {marker && (
          <div
            className="pointer-events-none absolute top-[3px] h-[12px] w-[2px] -translate-x-1/2 rounded-full bg-red/75"
            style={{ left: `calc(8px + (100% - 16px) * ${(marker.value - min) / (max - min)})` }}
            title={marker.label}
          />
        )}
      </div>
      {ends && (
        <div className="num mt-0.5 flex justify-between text-[11px] text-dim">
          <span>{ends[0]}</span>
          <span>{ends[1]}</span>
        </div>
      )}
      {hint && <div className="mt-1 text-[11.5px] leading-snug text-dim">{hint}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-1">
      <span>
        <span className="block text-[13.5px] text-ink-2">{label}</span>
        {hint && <span className="block text-[11.5px] text-dim">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-[20px] w-[36px] shrink-0 rounded-full border transition-colors duration-200',
          checked ? 'border-cyan/60 bg-cyan/25' : 'border-line-strong bg-base/60',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] h-[14px] w-[14px] rounded-full transition-all duration-200',
            checked ? 'left-[18px] bg-cyan shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'left-[2px] bg-muted',
          )}
        />
      </button>
    </label>
  );
}

export function IconButton({
  children,
  onClick,
  title,
  active,
  className,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  title: string;
  active?: boolean;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border transition-colors duration-150',
        active ? 'border-cyan/55 bg-cyan/15 text-cyan' : 'border-line-strong bg-panel-3/70 text-ink-2 hover:border-line-strong hover:bg-panel-3 hover:text-ink',
        disabled && 'opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}
