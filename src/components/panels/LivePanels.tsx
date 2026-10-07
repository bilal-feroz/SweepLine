import {
  AlertTriangle,
  Check,
  FileText,
  FlaskConical,
  Layers,
  PowerOff,
  RefreshCcw,
  RotateCcw,
  ShieldAlert,
  Waves,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useSnap } from '../../app/hooks';
import { useApp } from '../../app/store';
import { controller, PHASE_LABELS, type SimSnapshot } from '../../simulation/SimController';
import type { FailureKey } from '../../simulation/types';
import { approachingBloom, bloomLabel, clockTime, cn, mmss, pct } from '../../utils/format';
import { EnvelopeBadge } from '../layout/PageHeader';
import { useOutsideClose } from '../layout/TopBar';
import { Segmented, Toggle } from '../ui/Controls';
import { Icon } from '../ui/icons';

// ---------------------------------------------------------------- headline

type Tone = 'red' | 'amber' | 'cyan' | 'muted';
const TONE_TEXT: Record<Tone, string> = { red: 'text-red', amber: 'text-amber', cyan: 'text-cyan', muted: 'text-ink-2' };
const TONE_DOT: Record<Tone, string> = { red: 'bg-red', amber: 'bg-amber', cyan: 'bg-cyan', muted: 'bg-muted' };

/** The situation: what the sea is doing. */
function situation(s: SimSnapshot): { text: string; tone: Tone } {
  if (!s.bloom.active) return { text: `${bloomLabel(s.params.bloomDensity)} passed — curtain clearing`, tone: 'cyan' };
  return approachingBloom(s.params.bloomDensity);
}

/** The response: what SweepLine is doing about it. */
function response(s: SimSnapshot): { text: string; tone: Tone } {
  const c = s.curtain;
  const so = s.safeOpen;
  if (so.phase !== 'IDLE' && so.phase !== 'COMPLETE') {
    const label = PHASE_LABELS[so.phase];
    return { text: `SafeOpen — ${label.charAt(0).toLowerCase()}${label.slice(1)}`, tone: 'red' };
  }
  if (so.phase === 'COMPLETE') return { text: 'Existing intake protection restored', tone: 'amber' };
  if (s.status.code === 'OUTSIDE_ENVELOPE')
    return { text: c.mode === 'STOWED' ? 'Outside operating envelope — SweepLine stands down' : 'Outside operating envelope — SafeOpen recommended', tone: 'red' };
  if (c.mode === 'STOWED') return s.bloom.warningAt === null ? { text: 'SweepLine stowed — awaiting warning', tone: 'muted' } : { text: 'Warning received — preparing deployment', tone: 'amber' };
  if (c.mode === 'DEPLOYING') {
    if (c.deployDelay > 0) return { text: c.deployMode === 'workboat' ? `Workboat mobilising — on station in ${mmss(c.deployDelay)}` : 'SweepLine inflating', tone: 'cyan' };
    return { text: `SweepLine ${c.deployMode === 'popup' ? 'rising from the seabed' : 'being laid'} — ${Math.round(c.deployedPct)}%`, tone: 'cyan' };
  }
  if (c.mode === 'STOWING') return { text: 'Bloom passed — SweepLine stowing', tone: 'muted' };
  if (c.mode === 'UNREEFING') return { text: 'SweepLine re-arming', tone: 'cyan' };
  if (s.transfer.primary === 'FAULT')
    return { text: s.transfer.standby === 'ONLINE' ? 'Transfer fault — standby path carrying the load' : 'Transfer fault — standby activating', tone: 'amber' };
  return { text: `SweepLine deployed${s.params.activeFlow && c.jetOutput > 0.01 ? ' · water jets on' : ''}`, tone: 'cyan' };
}

function HeadlineMetric({ value, label, tone }: { value: string; label: string; tone: string }) {
  return (
    <div className="min-w-0">
      <div className={cn('num text-[30px] leading-none font-semibold tracking-tight', tone)}>{value}</div>
      <div className="mt-1 text-[12.5px] leading-tight text-ink-2">{label}</div>
    </div>
  );
}

/** Situation → response → result, readable in a few seconds. */
export function LiveHeadline() {
  const s = useSnap();
  if (!s) return null;
  const sit = situation(s);
  const res = response(s);
  const sw = s.sweepline;
  const b = s.baseline;
  const reduction = b.intakeContactPct !== null && sw.intakeContactPct !== null && b.intakeContactPct > 0 ? 1 - sw.intakeContactPct / b.intakeContactPct : null;
  const under = sw.underSkirtPct;
  return (
    <div className="glass pointer-events-auto w-[500px] max-w-full !rounded-2xl px-5 py-4 shadow-2xl">
      <div data-live-eyebrow className={cn('flex items-center gap-2 text-[12px] font-semibold tracking-[0.14em] uppercase', TONE_TEXT[sit.tone])}>
        <span className={cn('h-2 w-2 animate-pulse-soft rounded-full', TONE_DOT[sit.tone])} />
        {sit.text}
      </div>
      <div className={cn('mt-1 text-[22px] leading-tight font-semibold tracking-tight', res.tone === 'cyan' ? 'text-white' : TONE_TEXT[res.tone])}>{res.text}</div>
      <div className="mt-3.5 grid grid-cols-3 gap-4 border-t border-line pt-3.5">
        <HeadlineMetric value={pct(sw.diversionEfficiency)} label="diverted" tone="text-cyan" />
        <HeadlineMetric value={reduction === null ? '—' : pct(reduction)} label="fewer intake contacts" tone={reduction !== null && reduction < 0.5 ? 'text-amber' : 'text-teal'} />
        <HeadlineMetric value={pct(under)} label="under-skirt escape" tone={under !== null && under > 0.1 ? 'text-amber' : 'text-ink'} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11.5px] text-muted">
        <EnvelopeBadge short />
        <span>Same seed vs a no-SweepLine baseline · simulation estimate</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- compact timeline

const STAGES: Array<{ key: string; label: string }> = [
  { key: 'bloom', label: 'Bloom' },
  { key: 'warning', label: 'Warning' },
  { key: 'deploy', label: 'Deploy' },
  { key: 'sweep', label: 'Sweep' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'release', label: 'Release' },
  { key: 'recovery', label: 'Recovery' },
];

export function CompactTimeline() {
  const s = useSnap();
  const showToast = useApp((st) => st.showToast);
  if (!s) return null;
  const order = s.timeline.map((t) => t.key);
  const cur = order.indexOf(s.stage);
  return (
    <div className="glass pointer-events-auto flex h-[46px] items-center gap-3 !rounded-xl px-2.5">
      <button
        type="button"
        onClick={() => {
          void controller.restart('sequence');
          showToast('Replaying the sequence from bloom approach (same seed)', 'info');
        }}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-cyan/40 bg-cyan/10 px-2.5 text-[12.5px] font-medium text-cyan transition-colors hover:bg-cyan/20"
        title="Replay the full sequence from bloom approach (same seed)"
      >
        <RotateCcw size={13} /> Replay
      </button>
      <div className="flex min-w-0 flex-1 items-center">
        {STAGES.map((st, i) => {
          const reached = s.timeline.find((t) => t.key === st.key)?.at !== null;
          const current = i === cur;
          return (
            <div key={st.key} className="flex min-w-0 flex-1 items-center">
              <span
                className={cn(
                  'h-2.5 w-2.5 shrink-0 rounded-full border-2',
                  current ? 'border-cyan bg-cyan shadow-[0_0_10px_rgba(34,211,238,0.8)]' : reached ? 'border-cyan/70 bg-cyan/30' : 'border-[rgba(150,200,220,0.3)]',
                )}
              />
              <span className={cn('ml-1.5 truncate text-[12.5px]', current ? 'font-semibold text-white' : reached ? 'text-ink-2' : 'text-dim')}>{st.label}</span>
              {i < STAGES.length - 1 && <span className={cn('mx-2 h-px min-w-3 flex-1', i < cur ? 'bg-cyan/50' : 'bg-[rgba(150,200,220,0.15)]')} />}
            </div>
          );
        })}
      </div>
      <span className="num shrink-0 text-[12px] text-muted" title="Simulated time since the bloom approach">
        {mmss(s.simTime)}
      </span>
      <span className="hidden shrink-0 text-[11px] text-dim min-[1400px]:inline" title="Reference coastal intake geometry is schematic, not ENEC facility data. Agents are drawn enlarged for legibility.">
        Schematic geometry · simulation estimate
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- SafeOpen (contextual)

const SO_STEPS = [
  { phase: 'INITIATED', label: 'Stop accepting new bloom traffic' },
  { phase: 'UPSTREAM_REEF', label: 'Retract the upstream end first' },
  { phase: 'CLEARING', label: 'Keep transfer running, clear traffic' },
  { phase: 'PROGRESSIVE_REEF', label: 'Retract the rest progressively' },
  { phase: 'THROAT_CLEAR', label: 'Clear the recovery throat' },
  { phase: 'COMPLETE', label: 'Existing protection restored' },
] as const;

/** Shown only while SafeOpen runs (and once it completes, with the option to re-arm). */
export function SafeOpenPanel() {
  const s = useSnap();
  const showToast = useApp((st) => st.showToast);
  if (!s || s.safeOpen.phase === 'IDLE') return null;
  const phase = s.safeOpen.phase;
  const idx = SO_STEPS.findIndex((x) => x.phase === phase);
  const complete = phase === 'COMPLETE';
  return (
    <div className={cn('glass pointer-events-auto w-[300px] animate-fade-in !rounded-xl px-4 py-3', complete ? 'border-teal/40' : 'border-red/45')}>
      <div className="flex items-center justify-between">
        <span className={cn('flex items-center gap-1.5 text-[12px] font-semibold tracking-[0.12em]', complete ? 'text-teal' : 'text-red')}>
          <ShieldAlert size={14} /> SAFEOPEN
        </span>
        <span className="num text-[11.5px] text-muted">{mmss(s.safeOpen.elapsed)}</span>
      </div>
      <p className="mt-0.5 text-[12px] text-ink-2">{s.safeOpen.reason}</p>
      <ol className="mt-2.5 flex flex-col gap-1.5">
        {SO_STEPS.map((st, i) => {
          const done = complete || idx > i;
          const cur = idx === i && !complete;
          return (
            <li key={st.phase} className="flex items-center gap-2 text-[12px]">
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                  done ? 'border-teal bg-teal text-[#03121a]' : cur ? 'border-red bg-red/20' : 'border-[rgba(150,200,220,0.3)]',
                )}
              >
                {done ? <Check size={10} strokeWidth={3} /> : cur ? <span className="h-1.5 w-1.5 rounded-full bg-red" /> : null}
              </span>
              <span className={cn(done ? 'text-ink-2' : cur ? 'font-medium text-white' : 'text-muted')}>{st.label}</span>
            </li>
          );
        })}
      </ol>
      {complete && (
        <button
          type="button"
          className="btn btn-solid mt-3 !h-[34px] w-full"
          onClick={() => {
            if (!controller.rearm()) showToast('Re-arm not available — check the operating envelope and transfer path', 'warn');
          }}
        >
          <RefreshCcw size={14} /> Re-arm SweepLine
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- stress test

const FAULTS: Array<{ key: FailureKey; title: string; sub: string; icon: ReactNode }> = [
  { key: 'transferPrimary', title: 'Transfer failure', sub: 'Primary module fault', icon: <Zap size={15} /> },
  { key: 'extremeCurrent', title: 'Extreme current', sub: '0.78 m/s', icon: <Wind size={15} /> },
  { key: 'deepBloom', title: 'Deep bloom', sub: 'Mean depth 3.6 m', icon: <Icon name="jellyfish" size={15} /> },
  { key: 'highDensity', title: 'High density', sub: 'Bloom surge', icon: <Layers size={15} /> },
  { key: 'curtainOverload', title: 'Curtain overload', sub: 'Debris / fouling', icon: <AlertTriangle size={15} /> },
  { key: 'highWaves', title: 'High waves', sub: 'Hs 1.9 m', icon: <Waves size={15} /> },
];

function MenuButton({ icon, label, badge, open, onClick }: { icon: ReactNode; label: string; badge?: number; open: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={cn(
        'glass pointer-events-auto relative flex h-[38px] items-center gap-2 !rounded-xl px-3.5 text-[13px] font-medium transition-colors',
        open ? '!border-cyan/50 text-white' : 'text-ink-2 hover:text-white',
      )}
    >
      {icon}
      {label}
      {badge ? <span className="num ml-0.5 rounded-md bg-red/20 px-1.5 text-[11px] text-red">{badge}</span> : null}
    </button>
  );
}

export function StressTestMenu() {
  const s = useSnap();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  if (!s) return null;
  const f = s.failures;
  const active = Object.values(f).filter(Boolean).length;
  const soActive = s.safeOpen.phase !== 'IDLE' && s.safeOpen.phase !== 'COMPLETE';
  const canSafeOpen = !soActive && (s.curtain.mode === 'DEPLOYED' || s.curtain.mode === 'DEPLOYING' || s.curtain.mode === 'UNREEFING');
  return (
    <div className="pointer-events-auto relative" ref={ref}>
      <MenuButton icon={<FlaskConical size={15} />} label="Stress test" badge={active} open={open} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="glass absolute right-0 bottom-[46px] z-40 max-h-[calc(100vh-240px)] w-[360px] animate-fade-in overflow-y-auto !rounded-2xl p-3.5 shadow-2xl">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[14px] font-semibold text-white">
              Stress test <span className="font-normal text-muted">· inject a fault, watch the response</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-muted hover:text-white" title="Close">
              <X size={15} />
            </button>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-1.5">
            {FAULTS.map((x) => {
              const on = f[x.key];
              return (
                <button
                  key={x.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => (on ? controller.clearFailure(x.key) : controller.injectFailure(x.key))}
                  className={cn(
                    'card-inner flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors',
                    on ? '!border-red/50 !bg-red/[0.1]' : 'hover:!border-cyan/30',
                  )}
                  title={on ? 'Active — click to clear' : `Inject: ${x.title.toLowerCase()}`}
                >
                  <span className={cn('flex shrink-0', on ? 'text-red' : 'text-cyan')}>{x.icon}</span>
                  <span className="min-w-0">
                    <span className={cn('block truncate text-[12.5px] font-medium', on ? 'text-red' : 'text-ink')}>{x.title}</span>
                    <span className="block truncate text-[11px] text-muted">{x.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {f.transferPrimary && (
            <button
              type="button"
              aria-pressed={f.transferStandby}
              onClick={() => (f.transferStandby ? controller.clearFailure('transferStandby') : controller.injectFailure('transferStandby'))}
              className={cn('card-inner mt-1.5 flex w-full items-center gap-2 px-2.5 py-2 text-left', f.transferStandby ? '!border-red/50 !bg-red/[0.1]' : '!border-amber/40')}
            >
              <PowerOff size={15} className={f.transferStandby ? 'text-red' : 'text-amber'} />
              <span className={cn('text-[12.5px] font-medium', f.transferStandby ? 'text-red' : 'text-amber')}>
                {f.transferStandby ? 'Standby failed — active' : 'Fail the standby path too'}
              </span>
            </button>
          )}
          <div className="mt-2.5 flex gap-2">
            <button type="button" className="btn btn-danger !h-[32px] flex-1 !text-[12.5px]" disabled={!canSafeOpen} onClick={() => controller.initiateSafeOpen('Operator command')}>
              <ShieldAlert size={14} /> Operator SafeOpen
            </button>
            <button type="button" className="btn !h-[32px] flex-1 !text-[12.5px]" disabled={active === 0} onClick={() => controller.clearAllFailures()}>
              <RefreshCcw size={13} /> Clear faults
            </button>
          </div>
          <div className="mt-3 border-t border-line pt-2.5">
            <div className="mb-1 text-[11.5px] font-semibold tracking-[0.08em] text-muted uppercase">Compare</div>
            <Toggle
              checked={s.params.activeFlow}
              onChange={(v) => controller.setParams({ activeFlow: v })}
              label="Water jets"
              hint="Off = a passive curtain, for comparison"
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[13px] text-ink-2">Deployment</span>
              <Segmented
                size="sm"
                value={s.params.deployMode}
                onChange={(v) => controller.setParams({ deployMode: v })}
                options={[
                  { value: 'popup', label: 'Pop-up' },
                  { value: 'workboat', label: 'Workboat' },
                ]}
              />
            </div>
            <p className="mt-1 text-[11px] text-dim">Deployment applies from the next run — use Replay.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- event log (hidden by default)

const LEVEL_DOT: Record<string, string> = { info: 'bg-cyan', ok: 'bg-teal', warn: 'bg-amber', alarm: 'bg-red' };
const LEVEL_TEXT: Record<string, string> = { info: 'text-ink-2', ok: 'text-ink-2', warn: 'text-amber', alarm: 'text-red' };

export function EventLogMenu() {
  const s = useSnap();
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  if (!s) return null;
  const events = s.events.slice(-60).reverse();
  const start = s.clockMs - s.simTime * 1000;
  return (
    <div className="pointer-events-auto relative" ref={ref}>
      <MenuButton icon={<FileText size={15} />} label="Log" open={open} onClick={() => setOpen((o) => !o)} />
      {open && (
        <div className="glass absolute right-0 bottom-[46px] z-40 flex max-h-[380px] w-[420px] animate-fade-in flex-col !rounded-2xl p-4 shadow-2xl">
          <div className="mb-2 text-[14.5px] font-semibold text-white">Event log</div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            {events.map((e) => (
              <div key={e.id} className="flex items-start gap-2.5 py-[3px] text-[12.5px] leading-snug">
                <span className="num w-[58px] shrink-0 text-[11.5px] text-muted">{clockTime(start + e.t * 1000)}</span>
                <span className={cn('mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full', LEVEL_DOT[e.level])} />
                <span className={LEVEL_TEXT[e.level]}>{e.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
