import { useId } from 'react';

/** Lightweight SVG sparkline (no charting library — updated at ~1 Hz). */
export function Sparkline({
  data,
  color = '#22d3ee',
  height = 36,
  min,
  max,
  fill = true,
  secondary,
  secondaryColor = '#DB6C38',
}: {
  data: Array<number | null>;
  color?: string;
  height?: number;
  min?: number;
  max?: number;
  fill?: boolean;
  secondary?: Array<number | null>;
  secondaryColor?: string;
}) {
  const id = useId().replace(/:/g, '');
  const vals = [...data, ...(secondary ?? [])].filter((v): v is number => v !== null && Number.isFinite(v));
  if (vals.length < 2) {
    return (
      <div className="flex items-center text-[10.5px] text-dim" style={{ height }}>
        Collecting samples…
      </div>
    );
  }
  const lo = min ?? Math.min(...vals);
  let hi = max ?? Math.max(...vals);
  if (hi - lo < 1e-6) hi = lo + 1;
  const W = 200;
  const path = (series: Array<number | null>) => {
    const n = series.length;
    let d = '';
    let started = false;
    series.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) return;
      const x = (i / Math.max(n - 1, 1)) * W;
      const y = height - 2 - ((v - lo) / (hi - lo)) * (height - 4);
      d += `${started ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
      started = true;
    });
    return d;
  };
  const line = path(data);
  const area = line ? `${line}L${W},${height}L0,${height}Z` : '';
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" className="block w-full" style={{ height }} aria-hidden="true">
      <defs>
        <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.32" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#g${id})`} />}
      {secondary && <path d={path(secondary)} fill="none" stroke={secondaryColor} strokeWidth="1.3" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}
