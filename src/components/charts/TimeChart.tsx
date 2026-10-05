import { useId } from 'react';
import { Area, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { mmss } from '../../utils/format';

/**
 * Chart palette (validated with the dataviz palette validator on the dark
 * surface #0B151F: lightness band, chroma, CVD ΔE 18.7, normal-vision ΔE 26.6, ≥3:1).
 * Colour follows the entity: SweepLine is always cyan, Baseline always orange.
 */
export const SERIES = {
  sweepline: '#1AA3BE',
  baseline: '#DB6C38',
} as const;

export interface SeriesDef {
  key: string;
  name: string;
  color: string;
}

type Row = Record<string, number | null>;

const AXIS_TICK = { fill: '#7992A0', fontSize: 11, fontFamily: 'JetBrains Mono, monospace' };

function ChartTooltip({
  active,
  payload,
  label,
  unit,
  digits,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number | null; color: string }>;
  label?: number;
  unit: string;
  digits: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="glass px-3 py-2 text-[12px] shadow-xl">
      <div className="num mb-1 text-[11px] text-muted">t = {mmss(Number(label))}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="num text-ink">{p.value === null || p.value === undefined ? '—' : `${p.value.toFixed(digits)}${unit}`}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Time-series chart: one y-axis, hairline grid, soft area fill, crosshair
 * tooltip and an end-value badge on each series (badges are nudged apart when
 * the series end close together).
 */
export function TimeChart({
  data,
  series,
  unit = '',
  digits = 1,
  height = 200,
  yMax,
  reference,
  yLabel,
}: {
  data: Row[];
  series: SeriesDef[];
  unit?: string;
  digits?: number;
  height?: number;
  yMax?: number;
  reference?: { y: number; label: string };
  /** Short y-axis title shown above the axis. */
  yLabel?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-[12.5px] text-dim" style={{ height }}>
        Collecting simulation samples…
      </div>
    );
  }
  const last = data[data.length - 1];
  // Badge positions by series (label renderers can run more than once per chart render).
  const placed = new Map<string, number>();
  const badge = (s: SeriesDef) =>
    function EndBadge(props: { index?: number; x?: number | string; y?: number | string }) {
      const v = last[s.key];
      if (props.index !== data.length - 1 || v === null || v === undefined || props.y === undefined) return <g />;
      let y = Number(props.y);
      for (const [k, py] of placed) if (k !== s.key && Math.abs(py - y) < 21) y = y >= py ? py + 21 : py - 21;
      placed.set(s.key, y);
      const text = `${v.toFixed(digits)}${unit.trim() === '%' ? '%' : ''}`;
      const w = text.length * 7 + 14;
      const x = Number(props.x) + 7;
      return (
        <g>
          <circle cx={Number(props.x)} cy={Number(props.y)} r={3.5} fill={s.color} stroke="#0B151F" strokeWidth={1.5} />
          <rect x={x} y={y - 10.5} width={w} height={21} rx={6} fill="#0B151F" stroke={s.color} strokeOpacity={0.75} />
          <text x={x + w / 2} y={y + 4} textAnchor="middle" fill="#E7F1F5" fontSize={11.5} fontFamily="JetBrains Mono, monospace">
            {text}
          </text>
        </g>
      );
    };
  return (
    <div style={{ height }} className="relative w-full">
      {yLabel && <span className="pointer-events-none absolute top-0 left-1 text-[11.5px] text-muted">{yLabel}</span>}
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: yLabel ? 24 : 10, right: 70, bottom: 0, left: -4 }}>
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${uid}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={s.color} stopOpacity={series.length > 1 ? 0.22 : 0.3} />
                <stop offset="1" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="rgba(150,200,220,0.08)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => mmss(v)}
            stroke="rgba(150,200,220,0.18)"
            tick={AXIS_TICK}
            tickLine={false}
            minTickGap={40}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={46}
            domain={[0, yMax ?? 'auto']}
            tickFormatter={(v: number) => `${Math.round(v)}${unit.trim() === '%' ? '%' : ''}`}
          />
          <Tooltip
            cursor={{ stroke: 'rgba(231,241,245,0.35)', strokeWidth: 1 }}
            content={(p) => <ChartTooltip {...(p as object)} unit={unit} digits={digits} />}
            isAnimationActive={false}
          />
          {reference && (
            <ReferenceLine
              y={reference.y}
              stroke="rgba(248,113,113,0.6)"
              strokeDasharray="4 4"
              label={{ value: reference.label, fill: '#f87171', fontSize: 11, position: 'insideTopLeft' }}
            />
          )}
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2.2}
              fill={`url(#${uid}-${s.key})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: '#0B151F' }}
              isAnimationActive={false}
              connectNulls
              label={badge(s)}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Dot legend. */
export function Legend({ series }: { series: SeriesDef[] }) {
  return (
    <div className="flex items-center gap-4">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-2 text-[12.5px] text-ink-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

/** Downsample a series of rows for charting. */
export function downsample<T>(rows: T[], max = 240): T[] {
  if (rows.length <= max) return rows;
  const step = rows.length / max;
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(rows[Math.floor(i * step)]);
  out.push(rows[rows.length - 1]);
  return out;
}
