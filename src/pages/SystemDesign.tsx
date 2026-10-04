import { Anchor, ArrowDown, ArrowRight, BellRing, Layers3, MoveDown, Radar, ShieldCheck, Shuffle, Waves } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSnap } from '../app/hooks';
import { PlanSchematic } from '../components/charts/PlanSchematic';
import { PageHeader } from '../components/layout/PageHeader';
import { SafeOpenSteps } from '../components/panels/OpsPanels';
import { Panel } from '../components/ui/Panel';
import { ASSUMPTIONS } from '../config/assumptions';
import { SITE } from '../config/site';
import { cn } from '../utils/format';

const CHAIN: Array<{ icon: ReactNode; title: string; body: string }> = [
  { icon: <Radar size={16} />, title: 'Early Warning', body: 'Existing plant capability detects the bloom upstream.' },
  { icon: <Anchor size={16} />, title: 'Preselected Anchor Layout', body: '15° / 20° / 25° pre-engineered anchors — fixed during deployment.' },
  { icon: <Waves size={16} />, title: 'Smooth Guide Curtain', body: 'Floating line + smooth skirt; no fine mesh to entangle or gill.' },
  { icon: <MoveDown size={16} />, title: 'Adjustable Skirt', body: `${ASSUMPTIONS.curtain.skirtDepthMin}–${ASSUMPTIONS.curtain.skirtDepthMax} m via winches, seabed clearance enforced.` },
  { icon: <Shuffle size={16} />, title: 'Recovery Throat', body: 'Continuous large bellmouth — no storage cage, no sharp corner.' },
  { icon: <Layers3 size={16} />, title: 'Low-Shear Transfer', body: 'Large-aperture module moves animals around the intake.' },
  { icon: <BellRing size={16} />, title: 'Safe Release', body: 'Down-current, outside the immediate intake capture area.' },
];

const LAYERS = [
  {
    id: 'L1',
    title: 'SweepLine guidance',
    body: 'Angled guide curtain sweeps the bloom laterally to the recovery throat; low-shear transfer releases it alive down-current.',
    tone: 'cyan',
  },
  {
    id: 'L2',
    title: 'SafeOpen + standby transfer',
    body: 'Optional standby transfer path, overload and transfer-fault detection, automatic upstream-first reefing when outside the operating envelope.',
    tone: 'amber',
  },
  {
    id: 'L3',
    title: 'Existing intake protection',
    body: 'Existing intake screens and plant response procedures remain in place. Existing intake screens remain unchanged.',
    tone: 'teal',
  },
] as const;

const CANDIDATES = [
  { name: 'Water-powered ejector', notes: 'No moving parts in the animal path; motive-water supply required.' },
  { name: 'Enclosed fish-friendly screw pump', notes: 'Large-aperture, low-speed Archimedean screw; proven for fish passage.' },
  { name: 'Passive / open-flow bypass', notes: 'Hydraulic head only, where site geometry permits; lowest shear, lowest capacity.' },
];

export function SystemDesign() {
  const snap = useSnap();
  const C = ASSUMPTIONS.curtain;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4 [&>*]:shrink-0">
      <PageHeader eyebrow="System Design" title="Don’t stop the bloom. Give it another path." subtitle="DETECT → DEPLOY → SWEEP → TRANSFER → RELEASE — SweepLine acts after the existing early warning" />

      <Panel title="System architecture" eyebrow="Process chain">
        <div className="flex items-stretch gap-1.5">
          {CHAIN.map((c, i) => (
            <div key={c.title} className="flex min-w-0 flex-1 items-center gap-1.5">
              <div className="panel-flat flex h-full min-w-0 flex-1 flex-col gap-1.5 px-3 py-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan/30 bg-cyan/10 text-cyan">{c.icon}</span>
                <div className="text-[12.5px] font-semibold leading-tight text-ink">{c.title}</div>
                <div className="text-[11px] leading-snug text-muted">{c.body}</div>
              </div>
              {i < CHAIN.length - 1 && <ArrowRight size={14} className="shrink-0 text-dim" />}
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-[1.55fr_1fr] gap-3">
        <Panel title="Reference site — plan view" eyebrow="Generated from the simulation geometry · schematic, not ENEC facility data">
          <PlanSchematic selected={snap?.params.anchorAngle ?? 20} />
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-ink-2">
            <span className="flex items-center gap-1.5">
              <span className="h-[3px] w-5 rounded bg-curtain" /> Selected anchor layout
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-px w-5 border-t border-dashed border-muted" /> Alternative pre-engineered layouts
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[2px] w-5 border-t-2 border-dashed border-cyan" /> Transfer line
            </span>
          </div>
        </Panel>

        <Panel title="Safety architecture" eyebrow="Three independent layers" bodyClassName="flex flex-col gap-2">
          {LAYERS.map((l, i) => (
            <div key={l.id} className="flex flex-col items-stretch">
              <div
                className={cn(
                  'rounded-lg border px-3 py-2.5',
                  l.tone === 'cyan' ? 'border-cyan/35 bg-cyan/[0.06]' : l.tone === 'amber' ? 'border-amber/35 bg-amber/[0.06]' : 'border-teal/35 bg-teal/[0.06]',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className={cn('num text-[12px] font-semibold', l.tone === 'cyan' ? 'text-cyan' : l.tone === 'amber' ? 'text-amber' : 'text-teal')}>{l.id}</span>
                  <span className="text-[13px] font-semibold text-ink">{l.title}</span>
                </div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-2">{l.body}</p>
              </div>
              {i < LAYERS.length - 1 && <ArrowDown size={13} className="mx-auto my-0.5 text-dim" />}
            </div>
          ))}
          <div className="mt-1 flex items-start gap-2 rounded-lg border border-line bg-base/40 px-3 py-2 text-[11.5px] text-ink-2">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-teal" />
            SweepLine cannot become a new blockage: when it disengages the curtain reefs and the site returns to its existing protection state.
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Panel title="Fail-safe rule: upstream end reefs first" eyebrow="SafeOpen sequence">
          <p className="mb-2 text-[11.5px] leading-relaxed text-ink-2">
            New jellyfish stop entering the guide and continue on their normal trajectory, while jellyfish already on the curtain continue to the throat and
            are transferred. The throat / downstream end is never opened first — that could release a concentrated group close to the intake.
          </p>
          <SafeOpenSteps />
        </Panel>

        <Panel title="Large-aperture low-shear transfer module" eyebrow="Technology not yet selected">
          <div className="flex flex-col gap-1.5">
            {CANDIDATES.map((c) => (
              <div key={c.name} className="panel-flat px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-medium text-ink">{c.name}</span>
                  <span className="tag !text-amber">Candidate</span>
                </div>
                <div className="mt-0.5 text-[11px] text-muted">{c.notes}</div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-2">
            Candidate transfer technologies will be selected after jellyfish bell-damage testing. The simulation uses a generic module with a standby path
            and a passive open-flow line ({Math.round(ASSUMPTIONS.transfer.passiveDrainFraction * 100)}% of design, assumption).
          </p>
        </Panel>

        <Panel title="Curtain specification" eyebrow="Design assumptions">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[11.5px]">
            {(
              [
                ['Float line', 'Buoyant HDPE floats, high-vis amber'],
                ['Skirt', 'Smooth flexible marine fabric, dark teal'],
                ['Lower edge', 'Weighted ballast chain'],
                ['Module length', `${C.moduleLength} m`],
                ['Skirt depth range', `${C.skirtDepthMin}–${C.skirtDepthMax} m`],
                ['Seabed clearance', `≥ ${C.seabedClearance} m`],
                ['Skirt winch rate', `${C.skirtWinchRate} m/s`],
                ['Deployment tow speed', `${C.deploySpeed} m/s`],
                ['Intermediate anchors', `every ${C.intermediateAnchorSpacing} m`],
                ['Throat mouth', `${(SITE.throat.halfWidth * 2).toFixed(1)} × ${(SITE.throat.halfHeight * 2).toFixed(1)} m`],
                ['Bubble depth guard', 'Not in V1 (research only)'],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted">{k}</dt>
                <dd className="num text-right text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[10.5px] text-dim">All values: src/config/assumptions.ts · src/config/site.ts</p>
        </Panel>
      </div>
    </div>
  );
}
