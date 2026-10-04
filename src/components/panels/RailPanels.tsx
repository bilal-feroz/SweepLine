import { Lock, RotateCcw } from 'lucide-react';
import { useHistory, useSnap } from '../../app/hooks';
import { useApp } from '../../app/store';
import { ASSUMPTIONS } from '../../config/assumptions';
import { OPERATING_ENVELOPE } from '../../config/operatingEnvelope';
import { compassLabel } from '../../config/site';
import { controller } from '../../simulation/SimController';
import { ANCHOR_ANGLES, DEFAULT_PARAMS, type AnchorAngle } from '../../simulation/types';
import { cn, num, pct } from '../../utils/format';
import { Sparkline } from '../charts/Sparkline';
import { Segmented, Slider } from '../ui/Controls';
import { Bar, KeyValue, Panel, StatusDot } from '../ui/Panel';

function MetricRow({
  label,
  value,
  target,
  tone,
  bar,
  barTarget,
  sub,
}: {
  label: string;
  value: string;
  target?: string;
  tone: 'ok' | 'info' | 'warn' | 'alarm';
  bar?: number;
  barTarget?: number;
  sub?: string;
}) {
  const color = tone === 'alarm' ? 'text-red' : tone === 'warn' ? 'text-amber' : tone === 'ok' ? 'text-teal' : 'text-cyan';
  return (
    <div className="panel-flat px-3 py-2.5">
      <div className="flex items-center justify-between text-[11.5px]">
        <span className="text-ink-2">{label}</span>
        {target && <span className="text-[10.5px] text-muted">{target}</span>}
      </div>
      <div className="mt-0.5 flex items-center gap-3">
        <span className={cn('num text-[21px] leading-none', color)}>{value}</span>
        {bar !== undefined && (
          <div className="flex-1">
            <Bar value={bar} tone={tone} target={barTarget} />
          </div>
        )}
      </div>
      {sub && <div className="mt-1 text-[10.5px] text-muted">{sub}</div>}
    </div>
  );
}

/** Real-time SweepLine performance (simulation estimates). */
export function PerformancePanel() {
  const snap = useSnap();
  const hist = useHistory(60);
  if (!snap) return null;
  const s = snap.sweepline;
  const b = snap.baseline;
  const eff = s.diversionEfficiency;
  const under = s.underSkirtPct;
  const util = s.transferUtilisation;
  const reduction = b.intakeRatePerMin > 0.05 ? 1 - s.intakeRatePerMin / b.intakeRatePerMin : null;
  const risk = s.screenLoad;
  const load = s.curtainLoad;
  return (
    <Panel title="Real-time Performance" actions={<span className="tag">Sim estimate</span>} bodyClassName="flex flex-col gap-2">
      <MetricRow
        label="Diversion Efficiency"
        target="Dev. target ≥ 80%"
        value={pct(eff)}
        tone={eff === null ? 'info' : eff >= 0.8 ? 'ok' : eff >= 0.6 ? 'warn' : 'alarm'}
        bar={eff ?? 0}
        barTarget={0.8}
      />
      <MetricRow
        label="Under-skirt Escape"
        target="Dev. target ≤ 10%"
        value={pct(under)}
        tone={under === null ? 'info' : under <= 0.1 ? 'ok' : under <= 0.2 ? 'warn' : 'alarm'}
        bar={Math.min(1, (under ?? 0) * 2.5)}
        barTarget={0.25}
      />
      <MetricRow
        label="Transfer Utilisation"
        target={`Capacity ${Math.round(snap.transfer.flowM3h)} m³/h`}
        value={util === null ? 'Idle' : pct(Math.min(util, 1))}
        tone={util === null ? 'info' : util >= 1 ? 'alarm' : util >= 0.85 ? 'warn' : 'info'}
        bar={Math.min(1, util ?? 0)}
      />
      <div className="panel-flat px-3 py-2.5">
        <div className="text-[11.5px] text-ink-2">Intake Risk</div>
        <div className="mt-0.5 flex items-baseline gap-3">
          <span className={cn('text-[21px] leading-none font-semibold', risk === 'HIGH' ? 'text-red' : risk === 'MEDIUM' ? 'text-amber' : 'text-teal')}>{risk}</span>
          <span className="text-[10.5px] text-muted">
            Jellyfish reaching screens:{' '}
            <span className={cn('num', reduction !== null && reduction > 0 ? 'text-teal' : 'text-amber')}>{reduction === null ? '—' : pct(-reduction)}</span> vs baseline
          </span>
        </div>
      </div>
      <div className="panel-flat px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11.5px] text-ink-2">Curtain Load</div>
            <div
              className={cn(
                'text-[19px] leading-tight font-semibold',
                s.curtainLoadLabel === 'OVERLOAD' ? 'text-red' : s.curtainLoadLabel === 'HIGH' ? 'text-amber' : s.curtainLoadLabel === 'INACTIVE' ? 'text-muted' : 'text-teal',
              )}
            >
              {s.curtainLoadLabel === 'INACTIVE' ? 'Inactive' : s.curtainLoadLabel.charAt(0) + s.curtainLoadLabel.slice(1).toLowerCase()}
              <span className="num ml-2 text-[11px] font-normal text-muted">{(load * 100).toFixed(0)}%</span>
            </div>
          </div>
          <div className="w-[120px]">
            <Sparkline data={hist.map((h) => h.load * 100)} color="#2dd4bf" height={30} min={0} max={Math.max(100, ...hist.map((h) => h.load * 100))} />
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function densityLabel(d: number): { label: string; tone: 'alarm' | 'warn' | 'ok' } {
  if (d >= 0.85) return { label: 'Very high', tone: 'alarm' };
  if (d >= 0.65) return { label: 'High', tone: 'alarm' };
  if (d >= 0.4) return { label: 'Moderate', tone: 'warn' };
  return { label: 'Low', tone: 'ok' };
}

export function waveLabel(hs: number): string {
  if (hs < 0.5) return 'Slight';
  if (hs < 1.25) return 'Moderate';
  if (hs < 2.5) return 'Rough';
  return 'Very rough';
}

/** Environmental conditions (simulation inputs). */
export function ConditionsPanel() {
  const snap = useSnap();
  if (!snap) return null;
  const p = snap.params;
  const d = densityLabel(p.bloomDensity);
  return (
    <Panel title="Environmental Conditions" actions={<span className="tag">SIM inputs</span>}>
      <KeyValue
        label="Bloom Density"
        value={
          <span className="flex items-center gap-1.5">
            <StatusDot tone={d.tone} /> {d.label} <span className="text-dim">({(p.bloomDensity * 100).toFixed(0)}%)</span>
          </span>
        }
      />
      <KeyValue label="Bloom Depth (mean / P90)" value={`${p.bloomMeanDepth.toFixed(1)} / ${snap.bloom.p90.toFixed(1)} m`} tone={snap.bloom.p90 > p.skirtDepth ? 'warn' : undefined} />
      <KeyValue label="Current Direction" value={`${compassLabel(p.currentBearing)} (${p.currentBearing.toFixed(0)}°)`} />
      <KeyValue label="Current Speed" value={`${p.currentSpeed.toFixed(2)} m/s`} tone={p.currentSpeed > OPERATING_ENVELOPE.currentSpeed.max ? 'alarm' : p.currentSpeed > OPERATING_ENVELOPE.currentSpeed.near ? 'warn' : undefined} />
      <KeyValue label="Wave State" value={`${waveLabel(p.waveHeight)} · ${p.waveHeight.toFixed(1)} m`} tone={p.waveHeight > OPERATING_ENVELOPE.waveHeight.max ? 'alarm' : p.waveHeight > OPERATING_ENVELOPE.waveHeight.near ? 'warn' : undefined} />
      <KeyValue label="Skirt Depth" value={`${snap.curtain.skirtActual.toFixed(1)} m`} />
      <KeyValue label="Current–curtain angle" value={`${snap.curtain.attackAngle.toFixed(0)}°`} />
    </Panel>
  );
}

/** Live scenario controls — every control drives the simulation. */
export function ScenarioControlsPanel({ compact }: { compact?: boolean }) {
  const snap = useSnap();
  const displayed = useApp((s) => s.ui.displayed);
  const setUI = useApp((s) => s.setUI);
  const showToast = useApp((s) => s.showToast);
  if (!snap) return null;
  const p = snap.params;
  const deployed = snap.curtain.mode !== 'STOWED';
  const C = ASSUMPTIONS.curtain;
  const maxSkirt = Math.min(C.skirtDepthMax, snap.curtain.clearanceMax);
  const setAngle = (a: AnchorAngle) => {
    if (a === p.anchorAngle) return;
    if (deployed) showToast(`Angle is fixed while deployed — restarting the run on the ${a}° anchors (same seed)`, 'warn');
    void controller.selectAnchorLayout(a);
  };
  return (
    <Panel
      title="Scenario Controls"
      actions={
        <button
          type="button"
          className="btn !h-[24px] !px-2 !text-[11px]"
          title="Reset controls to reference values"
          onClick={() => {
            const { bloomDensity, currentSpeed, bloomMeanDepth, bloomDepthSD, skirtDepth, transferCapacity, waveHeight, currentBearing } = DEFAULT_PARAMS;
            controller.setParams({ bloomDensity, currentSpeed, bloomMeanDepth, bloomDepthSD, skirtDepth, transferCapacity, waveHeight, currentBearing });
            showToast('Controls reset to reference values', 'info');
          }}
        >
          <RotateCcw size={11} /> Reset
        </button>
      }
      bodyClassName="flex flex-col gap-2.5"
    >
      <Segmented
        value={displayed}
        onChange={(v) => setUI({ displayed: v, compare: false })}
        options={[
          { value: 'baseline', label: 'Baseline' },
          { value: 'sweepline', label: 'SweepLine' },
        ]}
      />
      <div>
        <div className="mb-1 flex items-center justify-between text-[12px]">
          <span className="text-ink-2">Anchor layout</span>
          {deployed && (
            <span className="flex items-center gap-1 text-[10.5px] text-muted" title="Pre-engineered anchor configuration is fixed while deployed">
              <Lock size={10} /> fixed while deployed
            </span>
          )}
        </div>
        <Segmented
          size="sm"
          value={p.anchorAngle}
          onChange={setAngle}
          options={ANCHOR_ANGLES.map((a) => ({
            value: a,
            label: `${a}°`,
            title: deployed && a !== p.anchorAngle ? `Fixed while deployed — selecting ${a}° restarts the run and redeploys` : `${a}° pre-engineered anchor layout`,
          }))}
        />
      </div>
      <Slider label="Bloom Density" value={p.bloomDensity} min={0.1} max={1} step={0.01} display={`${Math.round(p.bloomDensity * 100)}%`} onChange={(v) => controller.setParams({ bloomDensity: v })} />
      <Slider
        label="Current Speed"
        value={p.currentSpeed}
        min={0.05}
        max={0.9}
        step={0.01}
        display={`${p.currentSpeed.toFixed(2)} m/s`}
        tone={p.currentSpeed > OPERATING_ENVELOPE.currentSpeed.max ? 'red' : p.currentSpeed > OPERATING_ENVELOPE.currentSpeed.near ? 'amber' : undefined}
        marker={{ value: OPERATING_ENVELOPE.currentSpeed.max, label: 'Envelope limit' }}
        onChange={(v) => controller.setParams({ currentSpeed: v })}
      />
      <Slider
        label="Bloom Depth (mean)"
        value={p.bloomMeanDepth}
        min={0.5}
        max={4.5}
        step={0.1}
        display={`${p.bloomMeanDepth.toFixed(1)} m`}
        tone={snap.bloom.p90 > p.skirtDepth ? 'amber' : undefined}
        onChange={(v) => controller.setParams({ bloomMeanDepth: v })}
      />
      <Slider
        label="Skirt Depth"
        value={p.skirtDepth}
        min={C.skirtDepthMin}
        max={maxSkirt}
        step={0.5}
        display={`${p.skirtDepth.toFixed(1)} m`}
        hint={snap.curtain.skirtActual.toFixed(1) !== p.skirtDepth.toFixed(1) ? `Winches adjusting · ${snap.curtain.skirtActual.toFixed(1)} m` : undefined}
        onChange={(v) => controller.setParams({ skirtDepth: v })}
      />
      <Slider
        label="Transfer Capacity"
        value={p.transferCapacity}
        min={0.2}
        max={1}
        step={0.01}
        display={`${Math.round(p.transferCapacity * 100)}%`}
        onChange={(v) => controller.setParams({ transferCapacity: v })}
      />
      {!compact && (
        <Slider
          label="Wave Height (Hs)"
          value={p.waveHeight}
          min={0.1}
          max={2.5}
          step={0.05}
          display={`${p.waveHeight.toFixed(2)} m`}
          tone={p.waveHeight > OPERATING_ENVELOPE.waveHeight.max ? 'red' : p.waveHeight > OPERATING_ENVELOPE.waveHeight.near ? 'amber' : undefined}
          marker={{ value: OPERATING_ENVELOPE.waveHeight.max, label: 'Envelope limit' }}
          onChange={(v) => controller.setParams({ waveHeight: v })}
        />
      )}
      <div className="flex items-center justify-between text-[10.5px] text-dim">
        <span>Bloom P90 {num(snap.bloom.p90)} m vs skirt {num(p.skirtDepth)} m</span>
        <span className="num">SEED {p.seed}</span>
      </div>
    </Panel>
  );
}
