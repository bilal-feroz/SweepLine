import { ArrowRight, ChevronDown, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useSnap } from '../app/hooks';
import { AngleDiagram } from '../components/charts/AngleDiagram';
import { PlanSchematic } from '../components/charts/PlanSchematic';
import { SideSchematic } from '../components/charts/SideSchematic';
import { Icon } from '../components/ui/icons';
import { IconTile, Panel, type TileTone } from '../components/ui/Panel';
import { ASSUMPTIONS } from '../config/assumptions';
import { OPERATING_ENVELOPE } from '../config/operatingEnvelope';
import { SITE } from '../config/site';
import { popUpDuration } from '../simulation/curtain';
import { getCurtainLayout } from '../simulation/geometry';
import type { ConstraintStatus } from '../simulation/safety';
import { cn } from '../utils/format';

const C = ASSUMPTIONS.curtain;
const J = ASSUMPTIONS.jets;

const STEPS: Array<{ icon: ReactNode; title: string; body: string }> = [
  {
    icon: <Icon name="curtain" size={22} />,
    title: 'Deploy',
    body: 'Pops up from the seabed when the early warning arrives — about a minute, no vessel.',
  },
  {
    icon: <Icon name="bellmouth" size={22} />,
    title: 'Sweep',
    body: 'The angled curtain turns the current sideways; built-in water jets keep the bloom moving along it.',
  },
  {
    icon: <Icon name="throat" size={22} />,
    title: 'Recover',
    body: 'A large, smooth bellmouth collects the bloom — no cage, no sharp edges.',
  },
  {
    icon: <Icon name="release" size={22} />,
    title: 'Release',
    body: 'A low-shear line carries the jellyfish alive around the intake and releases them down-current.',
  },
];

const SAFETY: Array<{ tone: TileTone; icon: ReactNode; title: string; body: string }> = [
  {
    tone: 'cyan',
    icon: <Icon name="curtain" size={18} />,
    title: 'SweepLine guidance',
    body: 'Curtain, water jets, throat and low-shear transfer move the bloom alive around the intake.',
  },
  {
    tone: 'amber',
    icon: <ShieldAlert size={17} />,
    title: 'SafeOpen and standby path',
    body: 'A standby transfer path takes over on a fault. Outside the operating envelope the curtain retracts, upstream end first.',
  },
  {
    tone: 'teal',
    icon: <Icon name="intake" size={18} />,
    title: 'Existing intake protection',
    body: "The plant's screens and procedures stay unchanged — SweepLine is never worse than today.",
  },
];

const STATUS_TEXT: Record<ConstraintStatus, string> = { ok: 'text-teal', near: 'text-amber', out: 'text-red', na: 'text-dim' };

function TechnicalDetails() {
  const snap = useSnap();
  const [open, setOpen] = useState(false);
  if (!snap) return null;
  const p = snap.params;
  const c = snap.curtain;
  const layout = getCurtainLayout(p.anchorAngle);
  const popUpMin = popUpDuration(layout) / 60;
  const spec: Array<[string, string]> = [
    ['Anchor layouts', '15° / 20° / 25° pre-engineered'],
    ['Curtain length (20°)', `${getCurtainLayout(20).length.toFixed(0)} m in ${C.moduleLength} m modules`],
    ['Skirt depth', `${C.skirtDepthMin}–${C.skirtDepthMax} m, ≥ ${C.seabedClearance} m above the seabed`],
    ['Deployment', `Pop-up, inflatable float line (~${popUpMin.toFixed(1)} min)`],
    ['Conveyor jets', `${J.conveyorSpeed} m/s at the face, ${J.conveyorBand} m wide`],
    ['Foot jets', `${J.footUplift} m/s upward at the hem`],
    ['Jet flow / power', `~${J.designFlowM3s} m³/s · ~${J.designPowerKW} kW at 100 %`],
    ['Throat mouth', `${(SITE.throat.halfWidth * 2).toFixed(1)} × ${(SITE.throat.halfHeight * 2).toFixed(1)} m bellmouth`],
    ['Transfer candidates', 'Water-powered ejector · fish-friendly screw pump · passive bypass'],
    ['Air bubbles / moving parts', 'None in the animals’ path'],
  ];
  return (
    <section className="card overflow-hidden">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-white/[0.02]">
        <span>
          <span className="block text-[16px] font-semibold text-white">Technical details</span>
          <span className="block text-[13px] text-muted">Side section, specification and operating envelope — all values are design assumptions</span>
        </span>
        <ChevronDown size={18} className={cn('shrink-0 text-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid animate-fade-in grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-5 border-t border-line px-5 pt-4 pb-5">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="text-[13px] font-semibold text-ink">Section through the curtain (live values)</div>
            <div className="overflow-hidden rounded-xl border border-line">
              <SideSchematic
                skirt={c.skirtActual}
                liftDeg={c.liftAngle}
                seabed={layout.minSeabedDepth}
                mean={p.bloomMeanDepth}
                sd={p.bloomDepthSD}
                p90={snap.bloom.p90}
                hs={p.waveHeight}
                current={p.currentSpeed}
                underPct={snap.sweepline.underSkirtPct}
                minClearance={OPERATING_ENVELOPE.seabedClearance.min}
                jet={p.activeFlow ? Math.max(c.jetOutput, c.mode === 'STOWED' ? p.jetLevel : 0) : 0}
              />
            </div>
            <div className="mt-2 text-[13px] font-semibold text-ink">Specification</div>
            <dl className="grid grid-cols-2 gap-x-6">
              {spec.map(([k, v]) => (
                <div key={k} className="flex flex-col border-b border-line/60 py-1.5">
                  <dt className="text-[12px] text-muted">{k}</dt>
                  <dd className="text-[13px] text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="min-w-0">
            <div className="mb-1 text-[13px] font-semibold text-ink">Operating envelope (assumed limits)</div>
            <p className="mb-2 text-[12px] text-muted">Outside these limits SweepLine does not deploy — or retracts — and says so.</p>
            {snap.envelope.constraints.map((k) => (
              <div key={k.key} className="flex items-center justify-between gap-3 border-b border-line/60 py-1.5 text-[13px]">
                <span className="min-w-0 truncate text-ink-2">
                  {k.label}
                  {k.kind === 'advisory' && <span className="ml-1.5 text-[10.5px] tracking-wide text-dim uppercase">advisory</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={cn('num', STATUS_TEXT[k.status])}>{k.value}</span>
                  <span className="num w-[86px] text-right text-[11.5px] text-dim">{k.limit}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/** 02 — How It Works: why SweepLine is different from putting another net in front of the intake. */
export function HowItWorks() {
  const snap = useSnap();
  if (!snap) return null;
  const p = snap.params;
  const c = snap.curtain;
  const ut = p.currentSpeed * Math.cos((c.attackAngle * Math.PI) / 180);
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-6 py-6">
        <header className="max-w-[860px]">
          <div className="page-eyebrow">How it works</div>
          <h1 className="mt-1.5 text-[clamp(30px,2.6vw,42px)] leading-[1.08] font-bold tracking-tight text-white">Don’t stop the bloom. Give it another path.</h1>
          <p className="mt-2.5 text-[15px] leading-relaxed text-ink-2">
            A net blocks the bloom and takes its full force. SweepLine guides it: a curtain that pops up from the seabed on the early warning, makes its
            own gentle current, and sweeps the jellyfish alive around the intake.
          </p>
        </header>

        <section className="card grid grid-cols-4 gap-0 px-2 py-4">
          {STEPS.map((s, i) => (
            <div key={s.title} className="relative flex items-start gap-3 px-4">
              <IconTile size={42}>{s.icon}</IconTile>
              <div className="min-w-0 pr-3">
                <div className="flex items-center gap-2">
                  <span className="num text-[11.5px] text-dim">0{i + 1}</span>
                  <span className="text-[16px] font-semibold text-white">{s.title}</span>
                </div>
                <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{s.body}</p>
              </div>
              {i < STEPS.length - 1 && <ArrowRight size={16} className="absolute top-3 -right-2 text-cyan/70" />}
            </div>
          ))}
        </section>

        <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-5">
          <Panel title="The site from above" subtitle="Schematic reference geometry from the simulation — not ENEC facility data">
            <div className="overflow-hidden rounded-xl border border-line">
              <PlanSchematic selected={p.anchorAngle} jets={p.activeFlow} />
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-ink-2">
              <span className="flex items-center gap-2">
                <span className="h-[3px] w-5 rounded bg-curtain" /> Guide curtain ({p.anchorAngle}°)
              </span>
              <span className="flex items-center gap-2">
                <span className="h-[2px] w-5 rounded bg-cyan" /> Conveyor jets
              </span>
              <span className="flex items-center gap-2">
                <span className="h-[2px] w-5 border-t-2 border-dashed border-cyan" /> Transfer line to release
              </span>
            </div>
          </Panel>

          <div className="flex min-w-0 flex-col gap-5">
            <Panel title="Guide, don’t block" subtitle="Why an angled curtain carries so little load">
              <div className="card-inner px-2 py-2">
                <AngleDiagram angle={c.attackAngle} u={p.currentSpeed} un={c.normalVelocity} ut={ut} />
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-ink-2">
                At {c.attackAngle.toFixed(0)}°, only <span className="num text-amber">{c.normalVelocity.toFixed(2)} m/s</span> pushes into the curtain while{' '}
                <span className="num text-teal">{ut.toFixed(2)} m/s</span> carries the bloom along it
                {p.activeFlow ? (
                  <>
                    {' '}
                    — plus <span className="num text-cyan">{(p.jetLevel * J.conveyorSpeed).toFixed(2)} m/s</span> from the conveyor jets, even at slack tide
                  </>
                ) : null}
                . A net facing the flow takes the full {p.currentSpeed.toFixed(2)} m/s and the bloom’s weight.
              </p>
            </Panel>

            <Panel title="Safety story" subtitle="Three independent layers" icon={<ShieldCheck size={18} />} bodyClassName="flex flex-col gap-2">
              {SAFETY.map((s, i) => (
                <div key={s.title} className="card-inner flex items-start gap-3 px-3.5 py-3">
                  <IconTile size={34} tone={s.tone}>
                    {s.icon}
                  </IconTile>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-white">
                      <span className="num mr-1.5 text-dim">{i + 1}.</span>
                      {s.title}
                    </div>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{s.body}</p>
                  </div>
                </div>
              ))}
            </Panel>
          </div>
        </div>

        <TechnicalDetails />
      </div>
    </div>
  );
}
