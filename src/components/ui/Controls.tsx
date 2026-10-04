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
          className={cn('flex-1', size === 'sm' && '!h-[22px] !px-2 !text-[11px]')}
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
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className={cn('group', disabled && 'opacity-50')}>
      <div className="flex items-center justify-between gap-2 text-[12px]">
        <span className="text-ink-2">{label}</span>
        <span className={cn('num text-[12px]', tone === 'red' ? 'text-red' : tone === 'amber' ? 'text-amber' : 'text-ink')}>{display}</span>
      </div>
      <div className="relative mt-0.5">
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
            className="pointer-events-none absolute top-[3px] h-[12px] w-px bg-red/70"
            style={{ left: `calc(${((marker.value - min) / (max - min)) * 100}% )` }}
            title={marker.label}
          />
        )}
      </div>
      {hint && <div className="mt-0.5 text-[10.5px] text-dim">{hint}</div>}
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 py-1">
      <span>
        <span className="block text-[12px] text-ink-2">{label}</span>
        {hint && <span className="block text-[10.5px] text-dim">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-[18px] w-[32px] shrink-0 rounded-full border transition-colors duration-200',
          checked ? 'border-cyan/60 bg-cyan/25' : 'border-line-strong bg-base/60',
        )}
      >
        <span
          className={cn(
            'absolute top-[2px] h-[12px] w-[12px] rounded-full transition-all duration-200',
            checked ? 'left-[16px] bg-cyan shadow-[0_0_8px_rgba(34,211,238,0.6)]' : 'left-[2px] bg-muted',
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
