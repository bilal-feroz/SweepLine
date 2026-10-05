import { ArrowDownToLine, ChevronDown, Clock, Dices, Layers, Play, ShieldOff, SlidersHorizontal, Upload, Users, Waves, Wind, Zap } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useSnap } from '../app/hooks';
import { useApp } from '../app/store';
import { PageHeader } from '../components/layout/PageHeader';
import { useOutsideClose } from '../components/layout/TopBar';
import { Icon, JellyIllustration } from '../components/ui/icons';
import { IconTile, Pill, type TileTone } from '../components/ui/Panel';
import { controller } from '../simulation/SimController';
import { SCENARIOS, type Scenario } from '../simulation/scenarios';
import { DEFAULT_PARAMS, type SimParams } from '../simulation/types';
import { cn } from '../utils/format';

const TONE_HEX: Record<TileTone, string> = { teal: '#2dd4bf', amber: '#f5b94c', blue: '#6f9bff', red: '#f87171', cyan: '#22d3ee' };
const TONE_GLOW: Record<TileTone, string> = {
  teal: 'rgba(45,212,191,0.17)',
  amber: 'rgba(245,185,76,0.14)',
  blue: 'rgba(96,140,255,0.2)',
  red: 'rgba(248,113,113,0.15)',
  cyan: 'rgba(34,211,238,0.15)',
};

const LOOK: Record<string, { tone: TileTone; icon: ReactNode; badge: string }> = {
  normal: { tone: 'teal', icon: <Icon name="jellyfish" size={26} />, badge: 'Nominal' },
  extreme: { tone: 'amber', icon: <Layers size={24} />, badge: 'Stress' },
  deep: { tone: 'blue', icon: <ArrowDownToLine size={24} />, badge: 'Stress' },
  'high-current': { tone: 'red', icon: <Wind size={24} />, badge: 'Envelope' },
  'high-waves': { tone: 'cyan', icon: <Waves size={24} />, badge: 'Stress' },
  'transfer-failure': { tone: 'amber', icon: <Zap size={24} />, badge: 'Failure' },
  safeopen: { tone: 'red', icon: <ShieldOff size={24} />, badge: 'Fail-safe' },
};

function describeStep(s: NonNullable<Scenario['script']>[number]): string {
  const a = s.action;
  if (a.kind === 'fail') return a.failure === 'transferPrimary' ? 'Primary transfer fault' : a.failure === 'transferStandby' ? 'Standby transfer fault' : `Inject ${a.failure}`;
  if (a.kind === 'clear') return `Clear ${a.failure}`;
  return a.message;
}

function ParamTile({ icon, label, value, warn }: { icon: ReactNode; label: string; value: string; warn?: boolean }) {
  return (
    <div className="card-inner flex items-center gap-3 px-3.5 py-3">
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04]', warn ? 'text-amber' : 'text-ink-2')}>{icon}</span>
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] text-muted">{label}</span>
        <span className={cn('num block truncate text-[15px] font-medium', warn ? 'text-amber' : 'text-ink')}>{value}</span>
      </span>
    </div>
  );
}

function ParamTiles({ p }: { p: SimParams }) {
  const p90 = p.bloomMeanDepth + 1.2816 * p.bloomDepthSD;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <ParamTile icon={<Icon name="jellyfish" size={17} />} label="Bloom density" value={`${Math.round(p.bloomDensity * 100)}%`} />
      <ParamTile icon={<Wind size={16} />} label="Current speed" value={`${p.currentSpeed.toFixed(2)} m/s`} warn={p.currentSpeed > 0.6} />
      <ParamTile icon={<ArrowDownToLine size={16} />} label="Bloom depth · P90" value={`${p.bloomMeanDepth.toFixed(1)} m · ${p90.toFixed(1)} m`} warn={p90 > p.skirtDepth} />
      <ParamTile icon={<Waves size={16} />} label="Wave height (Hs)" value={`${p.waveHeight.toFixed(2)} m`} warn={p.waveHeight > 1.5} />
    </div>
  );
}

function SecondaryParams({ p }: { p: SimParams }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted">
      <span>
        Skirt <span className="num text-ink-2">{p.skirtDepth.toFixed(1)} m</span>
      </span>
      <span>
        Anchors <span className="num text-ink-2">{p.anchorAngle}°</span>
      </span>
      <span>
        Transfer <span className="num text-ink-2">{Math.round(p.transferCapacity * 100)}%</span>
      </span>
      <span>
        Standby <span className="text-ink-2">{p.standbyEnabled ? 'armed' : 'not armed'}</span>
      </span>
    </div>
  );
}

function ScenarioCard({ sc, active }: { sc: Scenario; active: boolean }) {
  const setUI = useApp((s) => s.setUI);
  const showToast = useApp((s) => s.showToast);
  const params: SimParams = { ...DEFAULT_PARAMS, ...sc.params };
  const look = LOOK[sc.id] ?? { tone: 'cyan' as TileTone, icon: <Icon name="jellyfish" size={24} />, badge: 'Scenario' };
  const hex = TONE_HEX[look.tone];
  return (
    <article
      className={cn('card relative flex flex-col gap-4 overflow-hidden p-6 transition-shadow duration-200', active && 'shadow-[0_0_0_1px_rgba(34,211,238,0.5),0_0_28px_-6px_rgba(34,211,238,0.35)]')}
      style={{
        backgroundImage: `radial-gradient(120% 95% at 100% 0%, ${TONE_GLOW[look.tone]}, transparent 60%), linear-gradient(180deg, rgba(13,27,40,0.92), rgba(9,19,29,0.95))`,
        borderColor: active ? 'rgba(34,211,238,0.55)' : undefined,
      }}
    >
      <JellyIllustration tone={hex} className="pointer-events-none absolute -top-2 right-3 h-[150px] w-[142px] opacity-60" />
      <header className="relative flex items-start gap-4 pr-32">
        <IconTile size={54} tone={look.tone}>
          {look.icon}
        </IconTile>
        <div className="min-w-0 pt-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[21px] leading-tight font-semibold tracking-tight text-white">{sc.name}</h3>
            {active && <Pill tone="cyan">ACTIVE</Pill>}
          </div>
          <p className="mt-1 text-[14px] text-ink-2">{sc.tagline}</p>
        </div>
      </header>
      <p className="relative line-clamp-3 pr-24 text-[13.5px] leading-relaxed text-muted">{sc.description}</p>
      <div className="relative">
        <ParamTiles p={params} />
      </div>
      <SecondaryParams p={params} />
      <div className="flex flex-wrap gap-1.5">
        {sc.demonstrates.map((d) => (
          <span key={d} className="rounded-lg border border-line-strong bg-white/[0.03] px-2.5 py-1 text-[12px] text-ink-2">
            {d}
          </span>
        ))}
      </div>
      {sc.script && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
          <span className="text-muted">Script</span>
          {sc.script.map((s, i) => (
            <span key={i} className="flex items-center gap-1.5 text-ink-2">
              <span className="num rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[11.5px] text-cyan">+{s.at}s</span>
              {describeStep(s)}
            </span>
          ))}
        </div>
      )}
      <footer className="mt-auto flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <span className="flex items-center gap-1.5 text-[12.5px] text-muted">
          <Clock size={14} />
          {sc.start === 'sequence' ? 'Runs from bloom approach' : 'Pre-rolls into steady operation'}
        </span>
        <span className="pill !h-[22px] !px-2 !text-[10.5px]" data-tone={look.tone === 'red' ? 'red' : look.tone === 'amber' ? 'amber' : 'muted'}>
          {look.badge.toUpperCase()}
        </span>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            className="btn !h-[40px] !px-4"
            onClick={() => {
              controller.loadScenario(sc.id);
              showToast(`${sc.name} parameters loaded into the running simulation`, 'info');
            }}
            title="Apply this scenario's parameters to the live simulation without restarting"
          >
            <Upload size={15} /> Load Scenario
          </button>
          <button
            type="button"
            className="btn btn-solid !h-[40px] !px-4"
            onClick={() => {
              setUI({ page: 'visualiser', compare: false });
              void controller.runScenario(sc.id);
            }}
            title="Restart with this scenario (same seed) and open the 3D Visualiser"
          >
            <Play size={15} fill="currentColor" /> Run
          </button>
        </div>
      </footer>
    </article>
  );
}

function CustomRunCard() {
  const snap = useSnap();
  const setUI = useApp((s) => s.setUI);
  if (!snap) return null;
  return (
    <article className="card relative flex flex-col gap-4 overflow-hidden p-6">
      <header className="flex items-start gap-4">
        <IconTile size={54}>
          <SlidersHorizontal size={24} />
        </IconTile>
        <div className="pt-0.5">
          <h3 className="text-[21px] leading-tight font-semibold tracking-tight text-white">Custom Run</h3>
          <p className="mt-1 text-[14px] text-ink-2">The parameters running right now</p>
        </div>
      </header>
      <p className="text-[13.5px] leading-relaxed text-muted">
        Adjust any control on the 3D Visualiser or Environment page, then replay the full sequence with the same seed — Baseline and SweepLine receive the
        identical bloom.
      </p>
      <ParamTiles p={snap.params} />
      <SecondaryParams p={snap.params} />
      <footer className="mt-auto flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
        <button type="button" className="btn !h-[40px] !px-4" onClick={() => setUI({ page: 'visualiser' })}>
          <SlidersHorizontal size={15} /> Edit controls
        </button>
        <button type="button" className="btn !h-[40px] !px-4" onClick={() => void controller.restart('steady')} title="Restart in steady operation (same seed)">
          <Play size={15} /> Steady operation
        </button>
        <button type="button" className="btn btn-solid !h-[40px] !px-4" onClick={() => void controller.restart('sequence')} title="Restart from bloom approach (same seed)">
          <Play size={15} fill="currentColor" /> From bloom approach
        </button>
      </footer>
    </article>
  );
}

function SeedMenu({ seed, agents }: { seed: number; agents: number }) {
  const showToast = useApp((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const input = useRef<HTMLInputElement>(null);
  const apply = (v: number) => {
    void controller.reseed(v, agents);
    showToast(`Re-seeded bloom · SEED ${v}`, 'info');
    setOpen(false);
  };
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn !h-[40px] !px-3.5" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Dices size={16} /> Seed <span className="num text-cyan">{seed}</span> <ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div className="glass absolute top-[48px] right-0 z-50 w-[300px] animate-fade-in !rounded-xl p-3.5 shadow-2xl">
          <p className="mb-2.5 text-[12.5px] leading-relaxed text-ink-2">The same seed produces an identical bloom in the Baseline and SweepLine worlds.</p>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = Number(input.current?.value);
              if (!Number.isFinite(v) || v <= 0) {
                showToast('Seed must be a positive integer', 'warn');
                return;
              }
              apply(Math.floor(v));
            }}
          >
            <input ref={input} defaultValue={seed} className="input" inputMode="numeric" aria-label="Random seed" autoFocus />
            <button type="submit" className="btn shrink-0">
              Apply
            </button>
          </form>
          <button type="button" className="btn mt-2 w-full" onClick={() => apply(100000 + Math.floor(Math.random() * 900000))}>
            <Dices size={14} /> Random seed
          </button>
        </div>
      )}
    </div>
  );
}

function AgentsMenu({ seed, agents }: { seed: number; agents: number }) {
  const showToast = useApp((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn !h-[40px] !px-3.5" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Users size={16} /> Agents <span className="num text-cyan">{agents}</span> <ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div className="glass absolute top-[48px] right-0 z-50 w-[230px] animate-fade-in !rounded-xl p-1.5 shadow-2xl">
          <div className="px-3 pt-1.5 pb-2 text-[12px] text-muted">Simulated agents per world</div>
          {[250, 500, 1000, 1500, 2000].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setOpen(false);
                if (n === agents) return;
                void controller.reseed(seed, n);
                showToast(`Restarting with ${n} agents (same seed)`, 'info');
              }}
              className={cn('flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13.5px] hover:bg-panel-3', n === agents ? 'text-cyan' : 'text-ink-2')}
            >
              <span className="num">{n}</span>
              {n === 1000 && <span className="text-[11.5px] text-muted">default</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Scenarios() {
  const snap = useSnap();
  if (!snap) return null;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-5 min-[1600px]:p-6 [&>*]:shrink-0">
      <PageHeader
        eyebrow="Scenarios"
        title="Scenario Library"
        subtitle="Each scenario loads real parameter presets into the agent model — outcomes are computed, never scripted."
        right={
          <div className="flex items-center gap-2">
            <SeedMenu seed={snap.params.seed} agents={snap.params.agentBudget} />
            <AgentsMenu seed={snap.params.seed} agents={snap.params.agentBudget} />
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {SCENARIOS.map((sc) => (
          <ScenarioCard key={sc.id} sc={sc} active={snap.scenarioId === sc.id} />
        ))}
        <CustomRunCard />
      </div>
    </div>
  );
}
