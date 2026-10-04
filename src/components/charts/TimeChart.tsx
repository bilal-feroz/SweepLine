import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
    <div className="glass px-2.5 py-2 text-[11.5px] shadow-xl">
      <div className="num mb-1 text-[10.5px] text-muted">t = {mmss(Number(label))}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-ink-2">
            <span className="h-[2px] w-3 rounded" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="num text-ink">{p.value === null || p.value === undefined ? '—' : `${p.value.toFixed(digits)}${unit}`}</span>
        </div>
      ))}
    </div>
  );
}

/** Time-series line chart: one y-axis, hairline grid, crosshair tooltip, endpoint labels. */
export function TimeChart({
  data,
  series,
  unit = '',
  digits = 1,
  height = 190,
  yMax,
  reference,
}: {
  data: Row[];
  series: SeriesDef[];
  unit?: string;
  digits?: number;
  height?: number;
  yMax?: number;
  reference?: { y: number; label: string };
}) {
  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-[11.5px] text-dim" style={{ height }}>
        Collecting simulation samples…
      </div>
    );
  }
  const last = data[data.length - 1];
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: series.length > 1 ? 70 : 16, bottom: 0, left: -8 }}>
          <CartesianGrid stroke="rgba(150,200,220,0.08)" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v: number) => mmss(v)}
            stroke="rgba(150,200,220,0.18)"
            tick={{ fill: '#7992A0', fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace' }}
            tickLine={false}
            minTickGap={36}
          />
          <YAxis
            stroke="rgba(150,200,220,0.18)"
            tick={{ fill: '#7992A0', fontSize: 10.5, fontFamily: 'JetBrains Mono, monospace' }}
            tickLine={false}
            axisLine={false}
            width={44}
            domain={[0, yMax ?? 'auto']}
            tickFormatter={(v: number) => `${Number(v.toFixed(digits > 0 ? 0 : 0))}${unit === '%' ? '%' : ''}`}
          />
          <Tooltip
            cursor={{ stroke: 'rgba(231,241,245,0.35)', strokeWidth: 1 }}
            content={(p) => <ChartTooltip {...(p as object)} unit={unit} digits={digits} />}
            isAnimationActive={false}
          />
          {reference && (
            <ReferenceLine
              y={reference.y}
              stroke="rgba(248,113,113,0.55)"
              strokeDasharray="4 4"
              label={{ value: reference.label, fill: '#f87171', fontSize: 10, position: 'insideTopLeft' }}
            />
          )}
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: '#0B151F' }}
              isAnimationActive={false}
              connectNulls
              label={
                series.length > 1
                  ? (props: { index?: number; x?: number | string; y?: number | string }) =>
                      props.index === data.length - 1 && last[s.key] !== null ? (
                        <text x={Number(props.x) + 6} y={Number(props.y) + 4} fill="#B9CBD3" fontSize={10.5} fontFamily="Inter Variable, sans-serif">
                          {s.name}
                        </text>
                      ) : (
                        <g />
                      )
                  : undefined
              }
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Legend({ series }: { series: SeriesDef[] }) {
  return (
    <div className="flex items-center gap-3">
      {series.map((s) => (
        <span key={s.key} className="flex items-center gap-1.5 text-[11px] text-ink-2">
          <span className="h-[2px] w-3.5 rounded" style={{ background: s.color }} />
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
