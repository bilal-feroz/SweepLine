/**
 * The schematic end of the intro, drawn in the simulation's own site frame
 * (metres: x along-shore in the nominal current direction, z offshore — see
 * src/config/site.ts). Real geography leads the camera to the reference coast;
 * from there these shapes take over: the shoreline straightens into the
 * schematic revetment, and the intake, guide curtain, transfer route, current
 * and bloom are the same geometry and agents the Three.js scene renders.
 */
import { SITE } from '../../config/site';
import { MAP_INTRO_DATA } from '../../data/mapIntro.generated';
import { S_INACTIVE, S_TRANSFERRED } from '../../simulation/Agent';
import type { CurtainLayout } from '../../simulation/geometry';
import type { SimulationEngine } from '../../simulation/SimulationEngine';
import { apply, DEG, type Affine } from './mapCamera';

const f1 = (v: number) => Math.round(v * 10) / 10;

/** Site metres ↔ map SVG kilometres, from the shoreline fitted by the data build. */
export class SiteFrame {
  /** (x, z) metres → SVG km (x east, y south). */
  readonly toSvg: Affine;
  /** Reference point the camera locks on: the schematic intake mouth. */
  readonly lockSite: [number, number] = [(SITE.intake.x0 + SITE.intake.x1) / 2, SITE.intake.mouthZ];
  readonly lock: [number, number];
  /** Clockwise map rotation that turns the offshore direction (site +z) to screen-up. */
  readonly offshoreUpRot: number;
  readonly waterlineZ = MAP_INTRO_DATA.site.waterlineZ;

  constructor() {
    const bx = MAP_INTRO_DATA.site.bearingX * DEG;
    const bz = bx + 90 * DEG;
    this.toSvg = [Math.sin(bx) / 1000, -Math.cos(bx) / 1000, Math.sin(bz) / 1000, -Math.cos(bz) / 1000, 0, 0];
    this.lock = apply(this.toSvg, this.lockSite[0], this.lockSite[1]);
    this.offshoreUpRot = (((360 - (MAP_INTRO_DATA.site.bearingX + 90)) % 360) + 360) % 360;
  }
}

// ------------------------------------------------------------------ polylines

export interface Polyline {
  x: number[];
  z: number[];
  /** Cumulative arc length (m). */
  s: number[];
  length: number;
}

function polyline(pts: Array<readonly [number, number]>): Polyline {
  const x: number[] = [];
  const z: number[] = [];
  const s: number[] = [];
  let acc = 0;
  pts.forEach(([px, pz], i) => {
    if (i > 0) acc += Math.hypot(px - x[i - 1], pz - z[i - 1]);
    x.push(px);
    z.push(pz);
    s.push(acc);
  });
  return { x, z, s, length: acc };
}

/** The part of a polyline between arc lengths s0 and s1 as SVG path data (site metres). */
export function subPath(p: Polyline, s0: number, s1: number): string {
  s0 = Math.max(0, s0);
  s1 = Math.min(p.length, s1);
  if (s1 <= s0) return '';
  const at = (s: number): [number, number] => {
    let i = 1;
    while (i < p.s.length - 1 && p.s[i] < s) i++;
    const k = (s - p.s[i - 1]) / Math.max(1e-6, p.s[i] - p.s[i - 1]);
    return [p.x[i - 1] + (p.x[i] - p.x[i - 1]) * k, p.z[i - 1] + (p.z[i] - p.z[i - 1]) * k];
  };
  const a = at(s0);
  let d = `M${f1(a[0])} ${f1(a[1])}`;
  for (let i = 0; i < p.s.length; i++) if (p.s[i] > s0 && p.s[i] < s1) d += `L${f1(p.x[i])} ${f1(p.z[i])}`;
  const b = at(s1);
  return `${d}L${f1(b[0])} ${f1(b[1])}`;
}

// ------------------------------------------------------------------ static schematic

export interface Schematic {
  /** Intake structure outline and its screen face. */
  intake: string;
  intakeFace: string;
  curtain: Polyline;
  route: Polyline;
  release: { x: number; z: number; r: number };
  throat: { x: number; z: number };
}

export function buildSchematic(layout: CurtainLayout): Schematic {
  const I = SITE.intake;
  const curtainPts: Array<[number, number]> = [];
  for (let i = 0; i < layout.n; i++) curtainPts.push([layout.px[i], layout.pz[i]]);
  return {
    intake: `M${I.x0 - 2.4} ${I.backZ}H${I.x1 + 2.4}V${I.mouthZ + 0.4}H${I.x0 - 2.4}Z`,
    intakeFace: `M${I.x0} ${I.mouthZ}H${I.x1}`,
    curtain: polyline(curtainPts),
    route: polyline([...SITE.pipeRoute, [SITE.release.x, SITE.release.z]]),
    release: { x: SITE.release.x, z: SITE.release.z, r: 7 },
    throat: { x: layout.end.x, z: layout.end.z },
  };
}

// ------------------------------------------------------------------ shoreline hand-off

const SHORE = MAP_INTRO_DATA.destination;

/**
 * The real shoreline (site metres), straightened toward the schematic
 * waterline by `m` (0 = as surveyed, 1 = straight). Returns the land fill and
 * the shoreline stroke.
 */
export function shoreline(m: number, waterlineZ: number): { land: string; line: string } {
  const pts = SHORE.shoreline;
  let line = '';
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i];
    const z = pts[i + 1] + (waterlineZ - pts[i + 1]) * m;
    line += `${i === 0 ? 'M' : 'L'}${f1(x)} ${f1(z)}`;
  }
  const x0 = pts[0];
  const x1 = pts[pts.length - 2];
  const land = `${line}L${f1(x1)} ${SHORE.rect.z0}L${f1(x0)} ${SHORE.rect.z0}Z`;
  return { land, line };
}

// ------------------------------------------------------------------ current

/** Along-shore current lanes (z offshore, m) and their phase offsets. */
const CURRENT_LANES: Array<[number, number]> = [
  [20, 0],
  [64, 130],
  [116, 55],
  [176, 175],
];
const STREAK = { head: 14, tail: 54, spacing: 240, speed: 34, x0: -700, x1: 430 };

/**
 * Sparse comets drifting toward +x (the simulated current direction) at ambient
 * time `a` (s): a short bright head and a faint tail so the direction reads at a glance.
 */
export function currentStreaks(a: number): { heads: string; tails: string } {
  let heads = '';
  let tails = '';
  const span = STREAK.x1 - STREAK.x0;
  for (const [z, phase] of CURRENT_LANES) {
    const offset = (a * STREAK.speed + phase) % STREAK.spacing;
    for (let x = STREAK.x0 + offset; x < STREAK.x1; x += STREAK.spacing) {
      const fade = Math.sin(((x - STREAK.x0) / span) * Math.PI);
      if (fade < 0.2) continue;
      const zz = z + Math.sin(x * 0.011 + z) * 3;
      tails += `M${f1(x - STREAK.tail * fade)} ${f1(zz)}L${f1(x)} ${f1(zz)}`;
      heads += `M${f1(x - STREAK.head * fade)} ${f1(zz)}L${f1(x)} ${f1(zz)}`;
    }
  }
  return { heads, tails };
}

// ------------------------------------------------------------------ bloom

/** Soft density field: ellipses (site metres) where the approaching bloom concentrates. */
export const HAZE = [
  { x: -205, z: 40, rx: 150, rz: 92, o: 1 },
  { x: -95, z: -6, rx: 82, rz: 40, o: 0.8 },
  { x: -300, z: 120, rx: 110, rz: 70, o: 0.6 },
];

/** One in every `STRIDE` agents (by id) is drawn as a dot. */
const STRIDE = 16;
const MAX_DOTS = 120;

/**
 * Bloom dots at the live agents' positions (a stable subset), so they become the
 * Three.js jellyfish at the hand-off. Before the simulation is ready a seeded
 * stand-in bloom drifts with the current.
 */
export function bloomDots(engine: SimulationEngine | null, ready: boolean, a: number): { bright: string; dim: string } {
  let bright = '';
  let dim = '';
  let n = 0;
  if (engine && ready) {
    const p = engine.pool;
    for (let i = 0; i < p.capacity && n < MAX_DOTS; i++) {
      const st = p.state[i];
      if (st === S_INACTIVE || st === S_TRANSFERRED) continue;
      const id = p.id[i];
      if (id % STRIDE !== 0) continue;
      const s = `M${f1(p.px[i])} ${f1(p.pz[i])}h0.01`;
      if ((id / STRIDE) % 3 === 0) bright += s;
      else dim += s;
      n++;
    }
    return { bright, dim };
  }
  // Seeded stand-in (only shown if the simulation is still pre-rolling).
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let k = 0; k < 64; k++) {
    const x0 = -330 + rnd() * 380;
    const z = Math.max(-50, Math.min(190, -16 + (rnd() + rnd() + rnd() - 1.5) * 70));
    const x = x0 + ((a * 1.5) % 40);
    const s = `M${f1(x)} ${f1(z)}h0.01`;
    if (k % 3 === 0) bright += s;
    else dim += s;
  }
  return { bright, dim };
}
