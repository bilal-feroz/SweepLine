import { LocateFixed, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSnap } from '../../app/hooks';
import { useApp } from '../../app/store';
import { ASSUMPTIONS } from '../../config/assumptions';
import { SITE } from '../../config/site';
import { controller } from '../../simulation/SimController';
import { cn, mmss, num, pct } from '../../utils/format';

function Row({ k, v, tone }: { k: string; v: ReactNode; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-[2px] text-[11.5px]">
      <span className="text-muted">{k}</span>
      <span className={cn('num text-ink', tone)}>{v}</span>
    </div>
  );
}

const STATE_TONE: Record<string, string> = {
  GUIDED: 'text-cyan',
  UNDER_SKIRT: 'text-red',
  TRANSFER_QUEUE: 'text-amber',
  TRANSFERRED: 'text-teal',
  RELEASED: 'text-teal',
  INTAKE_CONTACT: 'text-red',
};

/** Inspector for the selected 3D object — values are live from the simulation. */
export function Inspector() {
  const sel = useApp((s) => s.ui.selection);
  const follow = useApp((s) => s.ui.follow);
  const setUI = useApp((s) => s.setUI);
  const snap = useSnap();
  if (!sel || !snap) return null;
  const close = () => {
    controller.select('sweepline', null);
    setUI({ selection: null, follow: false });
  };
  const s = snap.sweepline;
  let title = '';
  let body: ReactNode = null;
  switch (sel.kind) {
    case 'jelly': {
      const a = snap.selectedAgent;
      title = a ? `Jelly #${a.id}` : 'Jellyfish';
      body = a ? (
        <>
          <Row k="World" v={a.engine === 'baseline' ? 'Baseline' : 'SweepLine'} />
          <Row k="State" v={a.state.replace('_', ' ')} tone={STATE_TONE[a.state]} />
          <Row k="Depth" v={a.state === 'TRANSFERRED' ? 'in transfer line' : `${num(a.depth)} m`} />
          <Row k="Velocity" v={`${num(a.speed, 2)} m/s`} />
          <Row k="Bell diameter" v={`${Math.round(a.size * 100)} cm`} />
          {a.contactTime !== null && <Row k="Curtain contact" v={mmss(a.contactTime)} />}
          {a.transitRemaining !== null && <Row k="Release in" v={mmss(a.transitRemaining)} tone="text-teal" />}
        </>
      ) : (
        <div className="text-[11.5px] text-muted">This agent has left the simulated site.</div>
      );
      break;
    }
    case 'curtain':
      title = 'Angled Guide Curtain';
      body = (
        <>
          <Row k="Anchor layout" v={`${snap.curtain.angle}° (pre-engineered)`} />
          <Row k="Angle to current" v={`${num(snap.curtain.attackAngle, 0)}°`} />
          <Row k="Skirt depth" v={`${num(snap.curtain.skirtActual)} m`} />
          <Row k="Length" v={`${num(snap.curtain.length, 0)} m (sim. assumption)`} />
          <Row k="Mode" v={snap.curtain.mode} tone={snap.curtain.mode === 'REEFING' ? 'text-amber' : undefined} />
          <Row k="Load" v={`${s.curtainLoadLabel} · ${(s.curtainLoad * 100).toFixed(0)}%`} />
          <Row k="Guided now" v={s.guided} tone="text-cyan" />
          <Row k="Skirt blow-back" v={`${num(snap.curtain.liftAngle, 1)}°`} />
          <Row k="Normal velocity" v={`${num(snap.curtain.normalVelocity, 2)} m/s`} />
          <Row k="Modules" v={`${Math.ceil(snap.curtain.length / ASSUMPTIONS.curtain.moduleLength)} × ${ASSUMPTIONS.curtain.moduleLength} m`} />
        </>
      );
      break;
    case 'throat':
      title = 'Recovery Throat';
      body = (
        <>
          <Row k="Type" v="Continuous bellmouth (no storage)" />
          <Row k="Mouth" v={`${(SITE.throat.halfWidth * 2).toFixed(1)} × ${(SITE.throat.halfHeight * 2).toFixed(1)} m`} />
          <Row k="Occupancy" v={pct(Math.min(s.throatOccupancy, 1.5))} tone={s.throatOccupancy >= 0.85 ? 'text-red' : s.throatOccupancy >= 0.6 ? 'text-amber' : 'text-teal'} />
          <Row k="In throat" v={`${snap.transfer.queue} / ${snap.transfer.holdCapacity}`} />
          <Row k="Diverted (total)" v={s.diverted} />
          <Row k="Avg contact time" v={s.avgContactTime === null ? '—' : mmss(s.avgContactTime)} />
        </>
      );
      break;
    case 'transfer':
      title = 'Transfer Module';
      body = (
        <>
          <div className="mb-1 text-[10.5px] text-muted">Large-aperture low-shear transfer module (generic)</div>
          <Row k="Primary" v={snap.transfer.primary} tone={snap.transfer.primary === 'FAULT' ? 'text-red' : snap.transfer.primary === 'ONLINE' ? 'text-teal' : undefined} />
          <Row
            k="Standby"
            v={snap.transfer.standby}
            tone={snap.transfer.standby === 'ONLINE' ? 'text-teal' : snap.transfer.standby === 'ACTIVATING' ? 'text-amber' : snap.transfer.standby === 'FAULT' ? 'text-red' : undefined}
          />
          <Row k="Active path" v={snap.transfer.path} />
          <Row k="Capacity" v={`${pct(snap.transfer.availability)} · ${Math.round(snap.transfer.flowM3h)} m³/h`} />
          <Row k="Utilisation" v={s.transferUtilisation === null ? 'Idle' : pct(Math.min(1, s.transferUtilisation))} />
          <Row k="Transferred" v={s.transferred} />
          <Row k="In transit" v={s.inTransit} />
          <div className="mt-1 text-[10px] text-dim">Final hardware selected through bell-damage testing.</div>
        </>
      );
      break;
    case 'intake': {
      const b = snap.baseline;
      title = 'Intake Screens';
      body = (
        <>
          <div className="mb-1 text-[10.5px] text-muted">Existing protection — unchanged by SweepLine (Layer 3)</div>
          <Row k="Baseline contact" v={pct(b.intakeContactPct)} tone="text-red" />
          <Row k="SweepLine contact" v={pct(s.intakeContactPct)} tone="text-teal" />
          <Row k="Baseline load" v={`${b.screenLoad} · ${b.intakeRatePerMin.toFixed(1)}/min`} />
          <Row k="SweepLine load" v={`${s.screenLoad} · ${s.intakeRatePerMin.toFixed(1)}/min`} />
          <Row k="Bays" v={`${SITE.intake.bays} (schematic)`} />
        </>
      );
      break;
    }
    case 'release':
      title = 'Safe Release';
      body = (
        <>
          <Row k="Location" v="Down-current, outside capture area" />
          <Row k="Transfer line" v={`${snap.params.releaseDistance} m (assumption)`} />
          <Row k="Released (total)" v={s.released} tone="text-teal" />
          <Row k="In transit" v={s.inTransit} />
          <div className="mt-1 text-[10px] text-dim">Release position shown schematically.</div>
        </>
      );
      break;
    case 'bloom':
      title = 'Jellyfish Bloom';
      body = (
        <>
          <Row k="Species" v="Catostylus mosaicus" />
          <Row k="Density" v={pct(snap.params.bloomDensity)} />
          <Row k="Mean / P90 depth" v={`${num(snap.params.bloomMeanDepth)} / ${num(snap.bloom.p90)} m`} />
          <Row k="Arrival rate" v={`${snap.bloom.arrivalsPerMin.toFixed(1)} / min`} />
          <Row k="Active agents" v={`${snap.sweepline.active}`} />
          <Row k="Bell diameter" v="30–45 cm" />
        </>
      );
      break;
  }
  return (
    <div data-hud className="glass pointer-events-auto w-[256px] animate-fade-in px-3.5 py-3 shadow-2xl">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div>
          <div className="eyebrow !text-[9.5px]">Inspector</div>
          <div className="text-[13px] font-semibold text-ink">{title}</div>
        </div>
        <div className="flex items-center gap-1">
          {sel.kind === 'jelly' && snap.selectedAgent && (
            <button
              type="button"
              title={follow ? 'Stop following' : 'Follow with camera'}
              onClick={() => setUI({ follow: !follow })}
              className={cn('rounded-md p-1 transition-colors', follow ? 'bg-cyan/20 text-cyan' : 'text-muted hover:text-ink')}
            >
              <LocateFixed size={14} />
            </button>
          )}
          <button type="button" title="Close inspector" onClick={close} className="rounded-md p-1 text-muted hover:text-ink">
            <X size={14} />
          </button>
        </div>
      </div>
      {body}
    </div>
  );
}
