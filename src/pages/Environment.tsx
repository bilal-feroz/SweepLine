import { Compass } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSnap } from '../app/hooks';
import { SERIES } from '../components/charts/TimeChart';
import { PageHeader } from '../components/layout/PageHeader';
import { EnvelopePanel } from '../components/panels/OpsPanels';
import { Slider } from '../components/ui/Controls';
import { KeyValue, Panel } from '../components/ui/Panel';
import { ASSUMPTIONS } from '../config/assumptions';
import { OPERATING_ENVELOPE } from '../config/operatingEnvelope';
import { compassLabel } from '../config/site';
import { S_APPROACHING, S_GUIDED } from '../simulation/Agent';
import { controller } from '../simulation/SimController';
import { num, pct } from '../utils/format';

/** Standard normal CDF (Abramowitz–Stegun). */
function phi(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

const BIN = 0.25;
const MAX_DEPTH = 6;

function useDepthHistogram() {
  const [bins, setBins] = useState<Array<{ depth: number; label: string; share: number; model: number }>>([]);
  const snap = useSnap();
  const mean = snap?.params.bloomMeanDepth ?? 1.8;
  const sd = snap?.params.bloomDepthSD ?? 0.8;
  useEffect(() => {
    const read = () => {
      const e = controller.sweepline;
      const p = e.pool;
      const counts = new Array(Math.round(MAX_DEPTH / BIN)).fill(0);
      let n = 0;
      for (let i = 0; i < p.capacity; i++) {
        const st = p.state[i];
        if (st !== S_APPROACHING && st !== S_GUIDED) continue;
        const d = -p.py[i];
        const k = Math.min(counts.length - 1, Math.max(0, Math.floor(d / BIN)));
        counts[k]++;
        n++;
      }
      setBins(
        counts.map((c, k) => {
          const lo = k * BIN;
          const hi = lo + BIN;
          const model = phi((hi - mean) / sd) - phi((lo - mean) / sd);
          return { depth: lo + BIN / 2, label: `${lo.toFixed(2)}–${hi.toFixed(2)} m`, share: n ? (c / n) * 100 : 0, model: model * 100 };
        }),
      );
    };
    read();
    const id = setInterval(read, 1500);
    return () => clearInterval(id);
  }, [mean, sd]);
  return bins;
}

export function Environment() {
  const snap = useSnap();
  const bins = useDepthHistogram();
  const stats = useMemo(() => {
    if (!snap) return null;
    const p = snap.params;
    const skirt = snap.curtain.skirtActual;
    const below = 1 - phi((skirt - p.bloomMeanDepth) / p.bloomDepthSD);
    return { below, skirt };
  }, [snap]);
  if (!snap || !stats) return null;
  const p = snap.params;
  const E = OPERATING_ENVELOPE;
  const un = snap.curtain.normalVelocity;
  const ut = p.currentSpeed * Math.cos((snap.curtain.attackAngle * Math.PI) / 180);
  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4 [&>*]:shrink-0">
        <PageHeader eyebrow="Environment" title="Site conditions & bloom" subtitle="Simulation inputs for the reference UAE coastal intake — schematic, not ENEC facility data" />
        <div className="grid grid-cols-[0.95fr_1.35fr] gap-3">
          <Panel title="Hydrodynamic inputs" eyebrow="Simulation inputs" bodyClassName="flex flex-col gap-3">
            <Slider
              label="Current speed"
              value={p.currentSpeed}
              min={0.05}
              max={0.9}
              step={0.01}
              display={`${p.currentSpeed.toFixed(2)} m/s`}
              tone={p.currentSpeed > E.currentSpeed.max ? 'red' : p.currentSpeed > E.currentSpeed.near ? 'amber' : undefined}
              marker={{ value: E.currentSpeed.max, label: 'Assumed envelope limit' }}
              hint={`Assumed envelope ≤ ${E.currentSpeed.max} m/s`}
              onChange={(v) => controller.setParams({ currentSpeed: v })}
            />
            <Slider
              label={
                <span className="flex items-center gap-1.5">
                  <Compass size={12} /> Current direction
                </span>
              }
              value={p.currentBearing}
              min={92}
              max={132}
              step={1}
              display={`${compassLabel(p.currentBearing)} ${p.currentBearing.toFixed(0)}°`}
              hint="Changes the effective current–curtain angle of the fixed anchor layout"
              onChange={(v) => controller.setParams({ currentBearing: v })}
            />
            <Slider
              label="Significant wave height (Hs)"
              value={p.waveHeight}
              min={0.1}
              max={2.5}
              step={0.05}
              display={`${p.waveHeight.toFixed(2)} m`}
              tone={p.waveHeight > E.waveHeight.max ? 'red' : p.waveHeight > E.waveHeight.near ? 'amber' : undefined}
              marker={{ value: E.waveHeight.max, label: 'Assumed envelope limit' }}
              hint={`Assumed envelope ≤ ${E.waveHeight.max} m · drives float heave, skirt heave and overtopping`}
              onChange={(v) => controller.setParams({ waveHeight: v })}
            />
            <div className="border-t border-line pt-2">
              <div className="eyebrow mb-1.5">Bloom</div>
              <div className="flex flex-col gap-3">
                <Slider label="Bloom density" value={p.bloomDensity} min={0.1} max={1} step={0.01} display={`${Math.round(p.bloomDensity * 100)}%`} onChange={(v) => controller.setParams({ bloomDensity: v })} />
                <Slider label="Bloom mean depth" value={p.bloomMeanDepth} min={0.5} max={4.5} step={0.1} display={`${p.bloomMeanDepth.toFixed(1)} m`} onChange={(v) => controller.setParams({ bloomMeanDepth: v })} />
                <Slider label="Bloom depth variance (σ)" value={p.bloomDepthSD} min={0.2} max={1.5} step={0.05} display={`${p.bloomDepthSD.toFixed(2)} m`} onChange={(v) => controller.setParams({ bloomDepthSD: v })} />
              </div>
            </div>
            <div className="border-t border-line pt-2">
              <div className="eyebrow mb-1.5">Reference conditions</div>
              <div className="grid grid-cols-2 gap-3">
                <Slider label="Water temp." value={p.waterTemp} min={18} max={36} step={0.1} display={`${p.waterTemp.toFixed(1)} °C`} onChange={(v) => controller.setParams({ waterTemp: v })} />
                <Slider label="Salinity" value={p.salinity} min={36} max={46} step={0.1} display={`${p.salinity.toFixed(1)} PSU`} onChange={(v) => controller.setParams({ salinity: v })} />
              </div>
              <p className="mt-1.5 text-[10.5px] text-dim">Recorded with exported runs; not used by the agent model.</p>
            </div>
          </Panel>

          <div className="flex min-w-0 flex-col gap-3">
            <Panel
              title="Bloom depth distribution vs skirt"
              eyebrow="Live agents (approaching and guided) · model distribution"
              actions={
                <span className="flex items-center gap-1.5 text-[11px] text-ink-2">
                  <span className="h-2 w-3 rounded-sm" style={{ background: SERIES.sweepline }} /> Simulated agents
                </span>
              }
            >
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={bins} layout="vertical" margin={{ top: 4, right: 18, bottom: 0, left: 6 }} barCategoryGap={2}>
                    <CartesianGrid stroke="rgba(150,200,220,0.08)" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fill: '#7992A0', fontSize: 10.5 }}
                      tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                      stroke="rgba(150,200,220,0.18)"
                      tickLine={false}
                    />
                    <YAxis
                      type="number"
                      dataKey="depth"
                      domain={[0, MAX_DEPTH]}
                      reversed
                      ticks={[0, 1, 2, 3, 4, 5, 6]}
                      tickFormatter={(v: number) => `${v} m`}
                      tick={{ fill: '#7992A0', fontSize: 10.5 }}
                      stroke="rgba(150,200,220,0.18)"
                      tickLine={false}
                      width={40}
                    />
                    <Tooltip
                      cursor={{ fill: 'rgba(231,241,245,0.05)' }}
                      isAnimationActive={false}
                      content={({ active, payload }) =>
                        active && payload && payload.length ? (
                          <div className="glass px-2.5 py-1.5 text-[11.5px]">
                            <div className="num text-muted">{(payload[0].payload as { label: string }).label}</div>
                            <div className="text-ink">Simulated {Number((payload[0].payload as { share: number }).share).toFixed(1)}%</div>
                            <div className="text-ink-2">Model {Number((payload[0].payload as { model: number }).model).toFixed(1)}%</div>
                          </div>
                        ) : null
                      }
                    />
                    <Bar dataKey="share" fill={SERIES.sweepline} radius={[0, 3, 3, 0]} isAnimationActive={false} barSize={9} />
                    <ReferenceLine
                      y={stats.skirt}
                      stroke="#e7f1f5"
                      strokeWidth={1.5}
                      label={{ value: `Skirt lower edge ${stats.skirt.toFixed(1)} m`, fill: '#e7f1f5', fontSize: 11, position: 'insideBottomRight' }}
                    />
                    <ReferenceLine
                      y={snap.bloom.p90}
                      stroke="rgba(150,200,220,0.6)"
                      strokeDasharray="4 4"
                      label={{ value: `P90 ${snap.bloom.p90.toFixed(1)} m`, fill: '#B9CBD3', fontSize: 10.5, position: 'insideTopRight' }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-3 border-t border-line pt-2 text-center">
                <div>
                  <div className="num text-[17px] text-ink">{pct(stats.below, 1)}</div>
                  <div className="text-[10.5px] text-muted">Model share below skirt</div>
                </div>
                <div>
                  <div className="num text-[17px] text-ink">{pct(snap.sweepline.underSkirtPct, 1)}</div>
                  <div className="text-[10.5px] text-muted">Simulated under-skirt escape</div>
                </div>
                <div>
                  <div className="num text-[17px] text-ink">{num(snap.curtain.liftAngle, 1)}°</div>
                  <div className="text-[10.5px] text-muted">Skirt blow-back</div>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                The simulated escape rate exceeds the static share below the skirt because flow diving under the skirt (entrainment), vertical mixing and wave
                heave move guided jellyfish downward — the adjustable-skirt trade-off.
              </p>
            </Panel>

            <Panel title="Current–curtain geometry" eyebrow={`${snap.curtain.angle}° pre-engineered anchor layout`}>
              <div className="grid grid-cols-2 gap-x-8">
                <KeyValue label="Effective angle to current" value={`${snap.curtain.attackAngle.toFixed(0)}°`} />
                <KeyValue label="Normal velocity (into curtain)" value={`${un.toFixed(3)} m/s`} />
                <KeyValue label="Tangential velocity (sweep)" value={`${ut.toFixed(3)} m/s`} />
                <KeyValue label="Curtain length" value={`${snap.curtain.length.toFixed(0)} m`} />
                <KeyValue label="Est. traverse time" value={`${(snap.curtain.length / Math.max(ut, 0.01) / 60).toFixed(1)} min`} />
                <KeyValue label="Seabed-limited max skirt" value={`${snap.curtain.clearanceMax.toFixed(1)} m`} />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-muted">
                A shallow angle keeps the normal (blocking) component small and the sweeping component large: incoming flow becomes lateral flow along the
                curtain. Redirect gain {ASSUMPTIONS.curtain.redirectGain}, entrainment gain {ASSUMPTIONS.curtain.entrainmentGain} (design assumptions).
              </p>
            </Panel>
          </div>
        </div>
      </div>
      <aside className="flex w-[360px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-deep/40 p-3 [&>*]:shrink-0">
        <EnvelopePanel detailed />
        <Panel title="How the envelope is used" eyebrow="Design rule">
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[11.5px] leading-relaxed text-ink-2">
            <li>
              <span className="text-ink">Hard limits</span> block deployment and, if exceeded for {ASSUMPTIONS.safeOpen.violationDwell} s during operation, trigger
              SafeOpen automatically.
            </li>
            <li>
              <span className="text-ink">Advisory limits</span> (bloom too deep for the skirt) recommend action — SweepLine would be ineffective, not unsafe.
            </li>
            <li>Thresholds are assumptions pending flume calibration and a coastal pilot (see Validation).</li>
            <li>Outside the envelope the visualiser reports it plainly — it never fakes success.</li>
          </ul>
        </Panel>
      </aside>
    </div>
  );
}
