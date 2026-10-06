import { ArrowDown, ChevronRight, Map as MapIcon, Radar, Rows3, ShieldAlert, ShieldCheck, Box } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useSnap } from '../app/hooks';
import { PLAN_ASPECT, PlanSchematic } from '../components/charts/PlanSchematic';
import { SideSchematic } from '../components/charts/SideSchematic';
import { PageHeader } from '../components/layout/PageHeader';
import { SafeOpenChecklist } from '../components/panels/VisualiserPanels';
import { Segmented } from '../components/ui/Controls';
import { Icon } from '../components/ui/icons';
import { IconTile, Panel, Pill, type TileTone } from '../components/ui/Panel';
import { ViewportFooter, ViewportToolbar } from '../components/viewport/Hud';
import { ViewportSlot } from '../components/viewport/ViewportSlot';
import { ASSUMPTIONS } from '../config/assumptions';
import { OPERATING_ENVELOPE } from '../config/operatingEnvelope';
import { SITE } from '../config/site';
import type { SimSnapshot } from '../simulation/SimController';
import { getCurtainLayout } from '../simulation/geometry';
import { cn, mmss } from '../utils/format';

const C = ASSUMPTIONS.curtain;
const J = ASSUMPTIONS.jets;

const PROCESS: Array<{ n: string; icon: ReactNode; title: string; body: string; status: (s: SimSnapshot) => string }> = [
  {
    n: '01',
    icon: <Radar size={28} strokeWidth={1.6} />,
    title: 'Early Warning',
    body: 'The existing plant early-warning capability detects the bloom upstream and triggers deployment.',
    status: (s) => (s.bloom.warningAt === null ? 'Awaiting warning' : `Warning at ${mmss(s.bloom.warningAt)}`),
  },
  {
    n: '02',
    icon: <Icon name="curtain" size={30} strokeWidth={1.5} />,
    title: 'Active Guide Curtain',
    body: `Pops up from the seabed on the warning. Built-in water jets make its own current along the face and lift jellyfish at the edge of its ${C.skirtDepthMin}–${C.skirtDepthMax} m skirt.`,
    status: (s) =>
      `${s.curtain.mode.charAt(0)}${s.curtain.mode.slice(1).toLowerCase()} · ${s.params.anchorAngle}° · ${s.params.activeFlow && s.curtain.jetOutput > 0.01 ? `jets ${Math.round(s.curtain.jetOutput * 100)}%` : 'passive'}`,
  },
  {
    n: '03',
    icon: <Icon name="throat" size={30} strokeWidth={1.5} />,
    title: 'Recovery Throat',
    body: 'A continuous large bellmouth collects the swept bloom — no storage cage and no sharp corners.',
    status: (s) => `Occupancy ${Math.round(s.sweepline.throatOccupancy * 100)}%`,
  },
  {
    n: '04',
    icon: <Icon name="transfer" size={30} strokeWidth={1.5} />,
    title: 'Low-Shear Transfer',
    body: 'A large-aperture module moves animals around the intake, backed by a standby path.',
    status: (s) => `${s.transfer.path.charAt(0)}${s.transfer.path.slice(1).toLowerCase()} path`,
  },
  {
    n: '05',
    icon: <Icon name="release" size={30} strokeWidth={1.5} />,
    title: 'Safe Release',
    body: 'Animals are released alive down-current, outside the immediate intake capture area.',
    status: (s) => `${s.sweepline.released} released`,
  },
];

const LAYERS: Array<{ badge: string; tone: TileTone; pill: 'cyan' | 'amber' | 'green'; icon: ReactNode; title: string; body: string }> = [
  {
    badge: 'PRIMARY',
    tone: 'cyan',
    pill: 'cyan',
    icon: <Icon name="curtain" size={20} />,
    title: 'SweepLine guidance',
    body: 'The pop-up guide curtain and its water jets sweep the bloom to the recovery throat; low-shear transfer releases it alive down-current.',
  },
  {
    badge: 'SECONDARY',
    tone: 'amber',
    pill: 'amber',
    icon: <ShieldAlert size={19} />,
    title: 'SafeOpen + standby transfer',
    body: 'Standby transfer path, overload and transfer-fault detection, and automatic upstream-first reefing outside the operating envelope.',
  },
  {
    badge: 'TERTIARY',
    tone: 'teal',
    pill: 'green',
    icon: <Icon name="intake" size={20} />,
    title: 'Existing intake protection',
    body: 'Existing intake screens and plant response procedures remain in place and unchanged.',
  },
];

const CANDIDATES = [
  { name: 'Water-powered ejector', notes: 'No moving parts in the animal path; needs a motive-water supply.' },
  { name: 'Enclosed fish-friendly screw pump', notes: 'Large-aperture, low-speed Archimedean screw; used for fish passage.' },
  { name: 'Passive / open-flow bypass', notes: 'Hydraulic head only, where site geometry permits; lowest shear, lowest capacity.' },
];

type View = 'plan' | 'side' | '3d';

function SiteViews({ snap }: { snap: SimSnapshot }) {
  const [view, setView] = useState<View>('plan');
  const p = snap.params;
  const layout = getCurtainLayout(p.anchorAngle);
  const subtitle =
    view === 'plan'
      ? 'Generated from the simulation geometry — schematic, not ENEC facility data'
      : view === 'side'
        ? 'Section through the curtain at its shallowest point — live values, horizontal not to scale'
        : 'Live digital twin of the reference site';
  return (
    <Panel
      title="Reference Site"
      subtitle={subtitle}
      icon={<MapIcon size={18} />}
      actions={
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'plan', label: 'Plan View' },
            { value: 'side', label: 'Side View' },
            { value: '3d', label: '3D View' },
          ]}
        />
      }
      bodyClassName="flex flex-col gap-3"
    >
      <div className="overflow-hidden rounded-xl border border-line" style={{ aspectRatio: PLAN_ASPECT }}>
        {view === 'plan' && (
          <PlanSchematic
            selected={p.anchorAngle}
            reefFraction={snap.curtain.reefedPct > 0 && snap.curtain.reefedPct < 1 ? snap.curtain.reefedPct : 0}
            jets={p.activeFlow}
          />
        )}
        {view === 'side' && (
          <SideSchematic
            skirt={snap.curtain.skirtActual}
            liftDeg={snap.curtain.liftAngle}
            seabed={layout.minSeabedDepth}
            mean={p.bloomMeanDepth}
            sd={p.bloomDepthSD}
            p90={snap.bloom.p90}
            hs={p.waveHeight}
            current={p.currentSpeed}
            underPct={snap.sweepline.underSkirtPct}
            minClearance={OPERATING_ENVELOPE.seabedClearance.min}
            jet={p.activeFlow ? Math.max(snap.curtain.jetOutput, snap.curtain.mode === 'STOWED' ? p.jetLevel : 0) : 0}
          />
        )}
        {view === '3d' && (
          <ViewportSlot className="h-full w-full">
            <div className="pointer-events-none absolute inset-0 z-10">
              <div className="absolute top-3 right-3">
                <ViewportToolbar />
              </div>
              <ViewportFooter />
            </div>
          </ViewportSlot>
        )}
      </div>
      {view === 'plan' && (
        <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-[12.5px] text-ink-2">
          <span className="flex items-center gap-2">
            <span className="h-[3px] w-6 rounded bg-curtain" /> Selected anchor layout ({p.anchorAngle}°)
          </span>
          <span className="flex items-center gap-2">
            <span className="h-px w-6 border-t border-dashed border-muted" /> Alternative pre-engineered layouts
          </span>
          <span className="flex items-center gap-2">
            <span className="h-[2px] w-6 border-t-2 border-dashed border-cyan" /> Transfer line
          </span>
        </div>
      )}
    </Panel>
  );
}

function SafetyArchitecture() {
  return (
    <Panel title="Safety Architecture" subtitle="Three independent layers of protection" icon={<ShieldCheck size={18} />} bodyClassName="flex flex-col">
      {LAYERS.map((l, i) => (
        <div key={l.badge} className="flex flex-col items-stretch">
          <div className="card-inner flex items-start gap-3.5 px-4 py-3.5">
            <IconTile size={42} tone={l.tone}>
              {l.icon}
            </IconTile>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={l.pill} dot={false} className="!h-[22px] !px-2 !text-[10.5px]">
                  {l.badge}
                </Pill>
                <span className="text-[15px] font-semibold text-ink">{l.title}</span>
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{l.body}</p>
            </div>
          </div>
          {i < LAYERS.length - 1 && <ArrowDown size={16} className="mx-auto my-1.5 text-dim" />}
        </div>
      ))}
      <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-teal/25 bg-teal/[0.05] px-3.5 py-3 text-[13px] leading-relaxed text-ink-2">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-teal" />
        SweepLine cannot become a new blockage: when it disengages, the curtain reefs and the site returns to its existing protection state.
      </div>
    </Panel>
  );
}

export function SystemDesign() {
  const snap = useSnap();
  if (!snap) return null;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-5 overflow-y-auto p-5 min-[1600px]:p-6 [&>*]:shrink-0">
      <PageHeader
        eyebrow="System Design"
        title="Don’t stop the bloom. Give it another path."
        subtitle="DETECT → DEPLOY → SWEEP → TRANSFER → RELEASE — SweepLine acts after the existing early warning."
      />

      <div className="flex items-stretch gap-2">
        {PROCESS.map((c, i) => (
          <div key={c.n} className="flex min-w-0 flex-1 items-center gap-2">
            <section className="card flex h-full min-w-0 flex-1 flex-col gap-3 p-5">
              <div className="flex items-start justify-between">
                <IconTile size={56}>{c.icon}</IconTile>
                <span className="num text-[14px] font-semibold text-dim">{c.n}</span>
              </div>
              <h3 className="text-[17px] leading-tight font-semibold text-white">{c.title}</h3>
              <p className="text-[13px] leading-relaxed text-muted">{c.body}</p>
              <div className="mt-auto flex items-center gap-1.5 border-t border-line pt-3 text-[12.5px] text-ink-2">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
                <span className="truncate">{c.status(snap)}</span>
              </div>
            </section>
            {i < PROCESS.length - 1 && (
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-line-strong bg-panel text-cyan">
                <ChevronRight size={15} />
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] items-start gap-5">
        <SiteViews snap={snap} />
        <SafetyArchitecture />
      </div>

      <div className="grid grid-cols-3 items-start gap-5">
        <Panel title="Fail-safe Rule" subtitle="The upstream end reefs first" icon={<Rows3 size={18} />} iconTone="red" bodyClassName="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-ink-2">
            New jellyfish stop entering the guide and continue on their normal trajectory, while jellyfish already on the curtain continue to the throat and
            are transferred. The throat end is never opened first — that could release a concentrated group close to the intake.
          </p>
          <div className="card-inner px-4 py-3.5">
            <SafeOpenChecklist />
          </div>
        </Panel>

        <Panel title="Transfer Module" subtitle="Technology not yet selected" icon={<Icon name="transfer" size={19} />} bodyClassName="flex flex-col gap-2.5">
          {CANDIDATES.map((c) => (
            <div key={c.name} className="card-inner px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-medium text-ink">{c.name}</span>
                <Pill tone="amber" dot={false} className="!h-[22px] !px-2 !text-[10.5px]">
                  CANDIDATE
                </Pill>
              </div>
              <div className="mt-1 text-[12.5px] leading-relaxed text-muted">{c.notes}</div>
            </div>
          ))}
          <p className="text-[12.5px] leading-relaxed text-muted">
            Selection follows jellyfish bell-damage testing. The simulation uses a generic module with a standby path and a passive open-flow line (
            {Math.round(ASSUMPTIONS.transfer.passiveDrainFraction * 100)}% of design, assumption).
          </p>
        </Panel>

        <Panel title="Curtain Specification" subtitle="Design assumptions" icon={<Box size={18} />}>
          <dl className="flex flex-col">
            {(
              [
                ['Float line', 'Buoyant HDPE floats, high-vis amber'],
                ['Skirt', 'Smooth flexible marine fabric'],
                ['Lower edge', 'Weighted ballast chain'],
                ['Module length', `${C.moduleLength} m`],
                ['Skirt depth range', `${C.skirtDepthMin}–${C.skirtDepthMax} m`],
                ['Seabed clearance', `≥ ${C.seabedClearance} m`],
                ['Skirt winch rate', `${C.skirtWinchRate} m/s`],
                ['Deployment', 'Pop-up: inflatable float line'],
                ['Workboat option', `${C.deploySpeed} m/s tow`],
                ['Conveyor jets', `${J.conveyorSpeed} m/s at the face`],
                ['Foot jets', `${J.footUplift} m/s up at the hem`],
                ['Jet flow / power', `~${J.designFlowM3s} m³/s · ~${J.designPowerKW} kW`],
                ['Intermediate anchors', `every ${C.intermediateAnchorSpacing} m`],
                ['Throat mouth', `${(SITE.throat.halfWidth * 2).toFixed(1)} × ${(SITE.throat.halfHeight * 2).toFixed(1)} m`],
                ['Air bubbles', 'None — water jets only'],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-4 border-b border-line/60 py-2 text-[13px] last:border-0">
                <dt className="text-muted">{k}</dt>
                <dd className={cn('text-right text-ink', /\d/.test(v) && 'num')}>{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[11.5px] text-dim">Values: src/config/assumptions.ts · src/config/site.ts</p>
        </Panel>
      </div>
    </div>
  );
}
