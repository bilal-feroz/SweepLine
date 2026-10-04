import { ArrowDownToLine, CheckCircle2, Clock, FlaskConical, Play, ShieldOff, Upload, Waves, Wind, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSnap } from '../app/hooks';
import { useApp } from '../app/store';
import { PageHeader } from '../components/layout/PageHeader';
import { Panel } from '../components/ui/Panel';
import { controller } from '../simulation/SimController';
import { SCENARIOS, type Scenario } from '../simulation/scenarios';
import { DEFAULT_PARAMS, type SimParams } from '../simulation/types';
import { cn } from '../utils/format';

const ICONS: Record<string, ReactNode> = {
  normal: <FlaskConical size={17} />,
  extreme: <Waves size={17} />,
  deep: <ArrowDownToLine size={17} />,
  'high-current': <Wind size={17} />,
  'high-waves': <Waves size={17} />,
  'transfer-failure': <Zap size={17} />,
  safeopen: <ShieldOff size={17} />,
};

function describeStep(s: NonNullable<Scenario['script']>[number]): string {
  const a = s.action;
  if (a.kind === 'fail') return a.failure === 'transferPrimary' ? 'Primary transfer fault' : a.failure === 'transferStandby' ? 'Standby transfer fault' : `Inject ${a.failure}`;
  if (a.kind === 'clear') return `Clear ${a.failure}`;
  return a.message;
}

function ParamGrid({ p }: { p: SimParams }) {
  const p90 = p.bloomMeanDepth + 1.2816 * p.bloomDepthSD;
  const items: Array<[string, string, boolean?]> = [
    ['Density', `${Math.round(p.bloomDensity * 100)}%`],
    ['Current', `${p.currentSpeed.toFixed(2)} m/s`, p.currentSpeed > 0.6],
    ['Bloom depth', `${p.bloomMeanDepth.toFixed(1)} m · P90 ${p90.toFixed(1)}`, p90 > p.skirtDepth],
    ['Skirt', `${p.skirtDepth.toFixed(1)} m`],
    ['Waves (Hs)', `${p.waveHeight.toFixed(1)} m`, p.waveHeight > 1.5],
    ['Anchor layout', `${p.anchorAngle}°`],
    ['Transfer', `${Math.round(p.transferCapacity * 100)}%`],
    ['Standby', p.standbyEnabled ? 'Armed' : 'Not armed'],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
      {items.map(([k, v, warn]) => (
        <div key={k} className="flex items-center justify-between gap-2 text-[11.5px]">
          <span className="text-muted">{k}</span>
          <span className={cn('num', warn ? 'text-amber' : 'text-ink')}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function ScenarioCard({ sc, active }: { sc: Scenario; active: boolean }) {
  const setUI = useApp((s) => s.setUI);
  const showToast = useApp((s) => s.showToast);
  const params: SimParams = { ...DEFAULT_PARAMS, ...sc.params };
  const tone = sc.tone === 'failure' ? 'red' : sc.tone === 'stress' ? 'amber' : 'teal';
  return (
    <div
      className={cn(
        'panel flex flex-col gap-3 p-4 transition-colors duration-200',
        active && 'border-cyan/45 shadow-[0_0_0_1px_rgba(34,211,238,0.25)]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
              tone === 'red' ? 'border-red/35 bg-red/10 text-red' : tone === 'amber' ? 'border-amber/35 bg-amber/10 text-amber' : 'border-teal/35 bg-teal/10 text-teal',
            )}
          >
            {ICONS[sc.id]}
          </span>
          <div>
            <h3 className="text-[14px] font-semibold text-ink">{sc.name}</h3>
            <p className="text-[12px] text-ink-2">{sc.tagline}</p>
          </div>
        </div>
        {active && (
          <span className="flex items-center gap-1 text-[10.5px] text-cyan">
            <CheckCircle2 size={12} /> Active
          </span>
        )}
      </div>
      <p className="text-[12px] leading-relaxed text-muted">{sc.description}</p>
      <ParamGrid p={params} />
      <div className="flex flex-wrap gap-1.5">
        {sc.demonstrates.map((d) => (
          <span key={d} className="rounded-md border border-line bg-base/50 px-2 py-0.5 text-[10.5px] text-ink-2">
            {d}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2 text-[10.5px] text-dim">
        <Clock size={11} />
        {sc.start === 'sequence' ? 'Runs from bloom approach (warning → deploy → sweep)' : 'Pre-rolls into steady operation'}
      </div>
      {sc.script && (
        <ol className="flex flex-col gap-0.5 border-l border-line-strong pl-2.5">
          {sc.script.map((s, i) => (
            <li key={i} className="text-[11px] text-ink-2">
              <span className="num text-dim">+{s.at}s</span> · {describeStep(s)}
            </li>
          ))}
        </ol>
      )}
      <div className="mt-auto flex gap-2 pt-1">
        <button
          type="button"
          className="btn flex-1"
          onClick={() => {
            controller.loadScenario(sc.id);
            showToast(`${sc.name} parameters loaded into the running simulation`, 'info');
          }}
          title="Apply this scenario's parameters to the live simulation without restarting"
        >
          <Upload size={13} /> Load Scenario
        </button>
        <button
          type="button"
          className="btn btn-primary flex-1"
          onClick={() => {
            setUI({ page: 'visualiser', compare: false });
            void controller.runScenario(sc.id);
          }}
          title="Restart with this scenario (same seed) and open the 3D Visualiser"
        >
          <Play size={13} /> Run
        </button>
      </div>
    </div>
  );
}

export function Scenarios() {
  const snap = useSnap();
  if (!snap) return null;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-4 [&>*]:shrink-0">
      <PageHeader
        eyebrow="Scenarios"
        title="Scenario library"
        subtitle="Each card loads real parameter presets into the agent model — outcomes are computed, never scripted"
        right={
          <div className="flex items-center gap-2">
            <span className="tag">Seed {snap.params.seed}</span>
            <span className="tag">{snap.params.agentBudget} agents</span>
          </div>
        }
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {SCENARIOS.map((sc) => (
          <ScenarioCard key={sc.id} sc={sc} active={snap.scenarioId === sc.id} />
        ))}
        <Panel title="Custom run" eyebrow="Current parameters" className="p-0">
          <div className="flex flex-col gap-3">
            <ParamGrid p={snap.params} />
            <p className="text-[11.5px] leading-relaxed text-muted">
              Adjust any control on the Overview or 3D Visualiser, then restart to replay the full sequence with the same seed — Baseline and
              SweepLine receive the identical bloom.
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn flex-1" onClick={() => void controller.restart('sequence')}>
                <Play size={13} /> From bloom approach
              </button>
              <button type="button" className="btn flex-1" onClick={() => void controller.restart('steady')}>
                <Play size={13} /> Steady operation
              </button>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
