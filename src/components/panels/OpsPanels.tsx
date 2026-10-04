import {
  AlertTriangle,
  Anchor,
  ArrowDownToLine,
  CircleSlash,
  Layers,
  Play,
  PowerOff,
  RefreshCcw,
  ShieldOff,
  Square,
  Waves,
  Wind,
  Zap,
} from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useSnap } from '../../app/hooks';
import { useApp } from '../../app/store';
import { ASSUMPTIONS } from '../../config/assumptions';
import { controller, PHASE_LABELS } from '../../simulation/SimController';
import type { EnvelopeConstraint } from '../../simulation/safety';
import type { FailureKey, ModuleStatus } from '../../simulation/types';
import { clockTime, cn } from '../../utils/format';
import { Segmented, Toggle } from '../ui/Controls';
import { Panel, StatusDot } from '../ui/Panel';

const FAILURES: Array<{ key: FailureKey; label: string; icon: ReactNode; hint: string }> = [
  { key: 'transferPrimary', label: 'Transfer failure', icon: <Zap size={13} />, hint: 'Primary transfer module fault' },
  { key: 'extremeCurrent', label: 'Extreme current', icon: <Wind size={13} />, hint: '0.78 m/s — above assumed envelope' },
  { key: 'deepBloom', label: 'Deep bloom', icon: <ArrowDownToLine size={13} />, hint: 'Mean depth 3.6 m — below skirt' },
  { key: 'highDensity', label: 'High bloom density', icon: <Layers size={13} />, hint: 'Density 100% plus bloom surge' },
  { key: 'curtainOverload', label: 'Curtain overload', icon: <AlertTriangle size={13} />, hint: 'Debris / bio-fouling loading' },
  { key: 'highWaves', label: 'High wave state', icon: <Waves size={13} />, hint: 'Hs 1.9 m — above assumed envelope' },
];

/** Failure injection / stress test. Every injection changes the live simulation. */
export function StressTestPanel({ className }: { className?: string }) {
  const snap = useSnap();
  if (!snap) return null;
  const f = snap.failures;
  const tr = snap.transfer;
  const any = Object.values(f).some(Boolean);
  return (
    <Panel
      title="Failure Test"
      eyebrow="Stress test"
      className={className}
      actions={
        <button type="button" className="btn !h-[24px] !px-2 !text-[11px]" disabled={!any} onClick={() => controller.clearAllFailures()}>
          <RefreshCcw size={11} /> Clear all
        </button>
      }
      bodyClassName="flex flex-col gap-1.5"
    >
      {FAILURES.map((x) => {
        const active = f[x.key];
        return (
          <button
            key={x.key}
            type="button"
            onClick={() => (active ? controller.clearFailure(x.key) : controller.injectFailure(x.key))}
            className={cn(
              'flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors duration-150',
              active ? 'border-red/45 bg-red/[0.09]' : 'border-line bg-panel-2/60 hover:border-line-strong hover:bg-panel-3',
            )}
          >
            <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', active ? 'bg-red/20 text-red' : 'bg-base/60 text-ink-2')}>{x.icon}</span>
            <span className="min-w-0 flex-1">
              <span className={cn('block text-[12px]', active ? 'text-red' : 'text-ink')}>{active ? `${x.label} — injected` : `Inject ${x.label.toLowerCase()}`}</span>
              <span className="block truncate text-[10.5px] text-muted">{x.hint}</span>
            </span>
          </button>
        );
      })}
      <button
        type="button"
        disabled={!f.transferPrimary}
        onClick={() => (f.transferStandby ? controller.clearFailure('transferStandby') : controller.injectFailure('transferStandby'))}
        className={cn(
          'flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors duration-150 disabled:opacity-40',
          f.transferStandby ? 'border-red/45 bg-red/[0.09]' : 'border-amber/30 bg-amber/[0.05] hover:bg-amber/[0.1]',
        )}
        title={f.transferPrimary ? 'Fail the standby transfer path as well' : 'Inject a primary transfer failure first'}
      >
        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md', f.transferStandby ? 'bg-red/20 text-red' : 'bg-amber/15 text-amber')}>
          <PowerOff size={13} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn('block text-[12px]', f.transferStandby ? 'text-red' : 'text-amber')}>
            {f.transferStandby ? 'Standby failed — injected' : 'Fail standby transfer too'}
          </span>
          <span className="block truncate text-[10.5px] text-muted">Standby: {tr.standby}</span>
        </span>
      </button>
    </Panel>
  );
}

function moduleTone(s: ModuleStatus): 'ok' | 'warn' | 'alarm' | 'muted' {
  if (s === 'ONLINE') return 'ok';
  if (s === 'ACTIVATING') return 'warn';
  if (s === 'FAULT') return 'alarm';
  return 'muted';
}

/** Transfer system: primary / standby status and standby arming. */
export function TransferPanel() {
  const snap = useSnap();
  if (!snap) return null;
  const tr = snap.transfer;
  const s = snap.sweepline;
  const row = (label: string, status: ModuleStatus) => {
    const t = moduleTone(status);
    return (
      <div className="flex items-center justify-between py-[3px] text-[12px]">
        <span className="text-ink-2">{label}</span>
        <span className={cn('flex items-center gap-1.5 font-mono text-[11px]', t === 'ok' ? 'text-teal' : t === 'warn' ? 'text-amber' : t === 'alarm' ? 'text-red' : 'text-muted')}>
          <StatusDot tone={t} pulse={status === 'FAULT' || status === 'ACTIVATING'} />
          {status}
        </span>
      </div>
    );
  };
  return (
    <Panel title="Transfer System" eyebrow="Large-aperture low-shear module" actions={<span className="tag">{tr.path}</span>}>
      {row('Primary path', tr.primary)}
      {row('Standby path', tr.standby)}
      <div className="flex items-center justify-between py-[3px] text-[12px]">
        <span className="text-ink-2">Passive open-flow line</span>
        <span className="font-mono text-[11px] text-muted">{Math.round(ASSUMPTIONS.transfer.passiveDrainFraction * 100)}% (assumption)</span>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-2 border-t border-line pt-2 text-center">
        <div>
          <div className="num text-[15px] text-cyan">{Math.round(tr.flowM3h)}</div>
          <div className="text-[10px] text-muted">m³/h capacity</div>
        </div>
        <div>
          <div className="num text-[15px] text-ink">{s.transferred}</div>
          <div className="text-[10px] text-muted">transferred</div>
        </div>
        <div>
          <div className="num text-[15px] text-teal">{s.released}</div>
          <div className="text-[10px] text-muted">released</div>
        </div>
      </div>
      <div className="mt-2 border-t border-line pt-1">
        <Toggle
          checked={snap.params.standbyEnabled}
          onChange={(v) => controller.setParams({ standbyEnabled: v })}
          label="Standby transfer path armed"
          hint="First fail-safe — activates automatically on a primary fault"
        />
      </div>
    </Panel>
  );
}

/** Deployment and SafeOpen operator commands. */
export function OperationsPanel() {
  const snap = useSnap();
  const showToast = useApp((s) => s.showToast);
  if (!snap) return null;
  const mode = snap.curtain.mode;
  const so = snap.safeOpen;
  const soActive = so.phase !== 'IDLE' && so.phase !== 'COMPLETE';
  const canDeploy = mode === 'STOWED';
  const canRearm = so.phase === 'COMPLETE' || mode === 'REEFED';
  const canSafeOpen = !soActive && (mode === 'DEPLOYED' || mode === 'DEPLOYING' || mode === 'UNREEFING');
  return (
    <Panel title="Operations" eyebrow={`Curtain ${mode.toLowerCase()}`} bodyClassName="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canDeploy && !canRearm}
          onClick={() => {
            const ok = canDeploy ? controller.deploy('manual') : controller.rearm();
            if (!ok) showToast('Rejected — outside validated operating envelope', 'alarm');
          }}
        >
          {canRearm ? <RefreshCcw size={13} /> : <Anchor size={13} />}
          {canRearm ? 'Re-arm SweepLine' : 'Deploy SweepLine'}
        </button>
        <button type="button" className="btn btn-danger" disabled={!canSafeOpen} onClick={() => controller.initiateSafeOpen('Operator command')}>
          <ShieldOff size={13} /> Initiate SafeOpen
        </button>
        {mode === 'REEFED' ? (
          <button
            type="button"
            className="btn"
            disabled={soActive}
            onClick={() => controller.stowCurtain()}
            title={soActive ? 'Available once SafeOpen completes' : 'Reel the reefed curtain back onto the throat-side reel'}
          >
            <ArrowDownToLine size={12} className="rotate-180" /> Stow curtain
          </button>
        ) : (
          <button type="button" className="btn" disabled={!snap.bloom.active} onClick={() => controller.endBloom()} title="Stop new arrivals; the curtain stows once traffic clears">
            <Square size={12} /> End bloom
          </button>
        )}
        <button type="button" className="btn" onClick={() => void controller.restart('sequence')} title="Restart from bloom approach (same seed)">
          <Play size={12} /> Restart run
        </button>
      </div>
      {soActive && (
        <div className="rounded-lg border border-red/35 bg-red/[0.06] px-2.5 py-2 text-[11.5px]">
          <div className="font-semibold tracking-[0.08em] text-red">SAFEOPEN · {PHASE_LABELS[so.phase]}</div>
          <div className="mt-0.5 text-ink-2">Reason: {so.reason}</div>
        </div>
      )}
      <SafeOpenSteps />
    </Panel>
  );
}

const STEPS = [
  { phase: 'INITIATED', label: 'Stop accepting new bloom traffic' },
  { phase: 'UPSTREAM_REEF', label: 'Reef upstream section first' },
  { phase: 'CLEARING', label: 'Keep transfer running · clear curtain traffic' },
  { phase: 'PROGRESSIVE_REEF', label: 'Progressively reef remaining curtain' },
  { phase: 'THROAT_CLEAR', label: 'Clear recovery throat' },
  { phase: 'COMPLETE', label: 'Baseline intake protection restored' },
] as const;

/** SafeOpen sequence checklist (upstream-first). */
export function SafeOpenSteps() {
  const phase = useApp((s) => s.snap?.safeOpen.phase ?? 'IDLE');
  const idx = STEPS.findIndex((s) => s.phase === phase);
  return (
    <ol className="flex flex-col gap-1">
      {STEPS.map((s, i) => {
        const done = idx > i || phase === 'COMPLETE';
        const cur = idx === i && phase !== 'COMPLETE';
        return (
          <li key={s.phase} className="flex items-center gap-2 text-[11.5px]">
            <span
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-semibold',
                done ? 'border-teal/60 bg-teal/20 text-teal' : cur ? 'border-red bg-red/25 text-red' : 'border-line-strong text-dim',
              )}
            >
              {i + 1}
            </span>
            <span className={cn(done ? 'text-ink-2' : cur ? 'font-medium text-ink' : 'text-muted')}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

const statusTone = (c: EnvelopeConstraint) => (c.status === 'out' ? 'text-red' : c.status === 'near' ? 'text-amber' : c.status === 'na' ? 'text-dim' : 'text-teal');

/** Operating envelope: what SweepLine is (and is not) validated to do. */
export function EnvelopePanel({ className, detailed }: { className?: string; detailed?: boolean }) {
  const snap = useSnap();
  if (!snap) return null;
  const env = snap.envelope;
  const rec = env.recommendation;
  const bad = rec === 'DO NOT DEPLOY' || rec === 'INITIATE SAFEOPEN' || rec === 'HOLD — BASELINE PROTECTION';
  const warn = rec === 'INCREASE SKIRT DEPTH' || rec === 'MONITOR';
  return (
    <Panel
      title="Operating Envelope"
      eyebrow="Assumed thresholds — pending validation"
      className={className}
      actions={
        <span className={cn('num text-[12px]', env.within ? 'text-teal' : 'text-red')}>
          {env.satisfied}/{env.total}
        </span>
      }
    >
      {!env.within && (
        <div className="mb-2 rounded-lg border border-red/40 bg-red/[0.07] px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.06em] text-red">OUTSIDE VALIDATED OPERATING ENVELOPE</div>
      )}
      <div className="flex flex-col">
        {env.constraints.map((c) => (
          <div key={c.key} className="flex items-center justify-between gap-2 border-b border-line/60 py-[5px] text-[11.5px] last:border-0">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', c.status === 'out' ? 'bg-red' : c.status === 'near' ? 'bg-amber' : c.status === 'na' ? 'bg-dim' : 'bg-teal')} />
              <span className="truncate text-ink-2">{c.label}</span>
              {c.kind === 'advisory' && <span className="text-[9.5px] text-dim">advisory</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <span className={cn('num', statusTone(c))}>{c.value}</span>
              {detailed && <span className="num w-[86px] text-right text-[10.5px] text-dim">{c.limit}</span>}
            </span>
          </div>
        ))}
      </div>
      <div
        className={cn(
          'mt-2 flex items-center justify-between rounded-lg border px-2.5 py-2',
          bad ? 'border-red/40 bg-red/[0.07]' : warn ? 'border-amber/35 bg-amber/[0.06]' : 'border-teal/30 bg-teal/[0.05]',
        )}
      >
        <span className="text-[10.5px] text-muted">Recommended action</span>
        <span className={cn('text-[11.5px] font-semibold tracking-[0.04em]', bad ? 'text-red' : warn ? 'text-amber' : 'text-teal')}>{rec}</span>
      </div>
    </Panel>
  );
}

const LEVEL_DOT: Record<string, string> = { info: 'bg-cyan/70', ok: 'bg-teal', warn: 'bg-amber', alarm: 'bg-red' };
const LEVEL_TEXT: Record<string, string> = { info: 'text-ink-2', ok: 'text-teal', warn: 'text-amber', alarm: 'text-red' };

/** Timestamped event log (sim clock). */
export function EventLog({ className, max = 60 }: { className?: string; max?: number }) {
  const snap = useSnap();
  const ref = useRef<HTMLDivElement>(null);
  // Newest first, so the latest alarm is always in view.
  const events = snap ? snap.events.slice(-max).reverse() : [];
  const lastId = events.length ? events[0].id : 0;
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = 0;
  }, [lastId]);
  if (!snap) return null;
  const start = snap.clockMs - snap.simTime * 1000;
  return (
    <Panel title="Event Log" className={className} actions={<span className="tag">SIM clock · newest first</span>} bodyClassName="min-h-0 !pb-2">
      <div ref={ref} className="h-full overflow-y-auto pr-1">
        {events.length === 0 && <div className="text-[11.5px] text-muted">No events yet.</div>}
        {events.map((e) => (
          <div key={e.id} className="flex items-start gap-2 py-[2px] text-[11.5px] leading-snug">
            <span className="num shrink-0 text-[10.5px] text-dim">{clockTime(start + e.t * 1000)}</span>
            <span className={cn('mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full', LEVEL_DOT[e.level])} />
            <span className={LEVEL_TEXT[e.level]}>{e.message}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/** Advanced run settings: seed, agent budget, release distance, auto-deploy. */
export function AdvancedPanel() {
  const snap = useSnap();
  const showToast = useApp((s) => s.showToast);
  if (!snap) return null;
  const p = snap.params;
  return (
    <Panel title="Advanced" eyebrow="Run settings" bodyClassName="flex flex-col gap-2.5">
      <div>
        <div className="mb-1 text-[12px] text-ink-2">Release distance (simulation assumption)</div>
        <Segmented
          size="sm"
          value={p.releaseDistance}
          onChange={(v) => controller.setParams({ releaseDistance: v })}
          options={ASSUMPTIONS.release.distanceOptions.map((d) => ({ value: d, label: `${d} m` }))}
        />
      </div>
      <div>
        <div className="mb-1 text-[12px] text-ink-2">Simulated agents</div>
        <Segmented
          size="sm"
          value={p.agentBudget}
          onChange={(v) => {
            void controller.reseed(p.seed, v);
            showToast(`Restarting with ${v} agents (same seed)`, 'info');
          }}
          options={[250, 500, 1000, 1500, 2000].map((n) => ({ value: n, label: String(n) }))}
        />
      </div>
      <SeedInput seed={p.seed} />
      <Toggle checked={p.autoDeploy} onChange={(v) => controller.setParams({ autoDeploy: v })} label="Auto-deploy after early warning" hint="Only inside the assumed operating envelope" />
    </Panel>
  );
}

function SeedInput({ seed }: { seed: number }) {
  const ref = useRef<HTMLInputElement>(null);
  const showToast = useApp((s) => s.showToast);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12px] text-ink-2">
        <span>Random seed</span>
        <span className="text-[10.5px] text-dim">Same seed ⇒ identical bloom in both worlds</span>
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const v = Number(ref.current?.value);
          if (!Number.isFinite(v) || v <= 0) {
            showToast('Seed must be a positive integer', 'warn');
            return;
          }
          void controller.reseed(Math.floor(v), controller.params.agentBudget);
          showToast(`Re-seeded bloom · SEED ${Math.floor(v)}`, 'info');
        }}
      >
        <input ref={ref} key={seed} defaultValue={seed} className="input" inputMode="numeric" aria-label="Random seed" />
        <button type="submit" className="btn shrink-0">
          <CircleSlash size={12} className="rotate-90" /> Apply
        </button>
      </form>
    </div>
  );
}
