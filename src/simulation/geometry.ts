import { SITE, seabedDepth } from '../config/site';
import { ASSUMPTIONS } from '../config/assumptions';
import type { AnchorAngle } from './types';

const DEG = Math.PI / 180;

export interface ThroatGeometry {
  /** Mouth centre in plan. */
  mx: number;
  mz: number;
  /** Unit axis pointing into the throat. */
  ax: number;
  az: number;
  /** Unit lateral direction (toward the offshore rim). */
  lx: number;
  lz: number;
  halfWidth: number;
  halfHeight: number;
  centerDepth: number;
  length: number;
  outletRadius: number;
  inletX: number;
  inletZ: number;
}

export interface AnchorPoint {
  x: number;
  z: number;
  s: number;
  kind: 'upstream' | 'intermediate' | 'throat';
}

/**
 * The plan-view layout of one pre-engineered anchor configuration.
 * Arc length `s` runs from 0 at the upstream anchor to `length` at the throat rim.
 * Segment normals point to the upstream ("bloom") face of the curtain.
 */
export interface CurtainLayout {
  angle: AnchorAngle;
  length: number;
  straightLength: number;
  arcLength: number;
  /** Polyline points. */
  n: number;
  px: Float32Array;
  pz: Float32Array;
  ps: Float32Array;
  /** Segments (n − 1). */
  segCount: number;
  tx: Float32Array;
  tz: Float32Array;
  nx: Float32Array;
  nz: Float32Array;
  len: Float32Array;
  s0: Float32Array;
  midX: Float32Array;
  midZ: Float32Array;
  upstream: { x: number; z: number };
  end: { x: number; z: number };
  anchors: AnchorPoint[];
  throat: ThroatGeometry;
  minSeabedDepth: number;
  grid: SegmentGrid;
}

interface SegmentGrid {
  cell: number;
  x0: number;
  z0: number;
  cols: number;
  rows: number;
  cells: number[][];
}

/** Reusable query result for {@link nearestSegment}. */
export class SegmentHit {
  seg = -1;
  /** Signed perpendicular distance — positive on the bloom face. */
  d = 0;
  /** Distance to the closest point on the segment. */
  dist = 0;
  /** Projection along the segment (may fall outside 0..len). */
  along = 0;
  /** True when the projection falls within the segment (with a small tolerance). */
  within = false;
  /** Arc position of the closest point. */
  s = 0;
}

export function buildThroatGeometry(): ThroatGeometry {
  const { endX, endZ } = SITE.curtain;
  const t = SITE.throat;
  // End heading is +x (parallel to the nominal current); the bloom face normal is +z.
  const ax = 1;
  const az = 0;
  const lx = 0;
  const lz = 1;
  const mx = endX + lx * t.halfWidth;
  const mz = endZ + lz * t.halfWidth;
  return {
    mx,
    mz,
    ax,
    az,
    lx,
    lz,
    halfWidth: t.halfWidth,
    halfHeight: t.halfHeight,
    centerDepth: t.centerDepth,
    length: t.length,
    outletRadius: t.outletRadius,
    inletX: mx + ax * t.length,
    inletZ: mz + az * t.length,
  };
}

/** Half-width of the bellmouth at axial position q (0 = mouth plane). */
export function throatHalfWidthAt(th: ThroatGeometry, q: number): number {
  if (q <= 0) return th.halfWidth;
  const u = Math.min(q / th.length, 1);
  return th.outletRadius + (th.halfWidth - th.outletRadius) * Math.pow(1 - u, 1.6);
}

export function throatHalfHeightAt(th: ThroatGeometry, q: number): number {
  if (q <= 0) return th.halfHeight;
  const u = Math.min(q / th.length, 1);
  return th.outletRadius + (th.halfHeight - th.outletRadius) * Math.pow(1 - u, 1.6);
}

export function buildCurtainLayout(angle: AnchorAngle): CurtainLayout {
  const a = angle * DEG;
  const { endX, endZ, upstreamAnchorZ, funnelRadius: R, sampleSpacing } = SITE.curtain;

  // Funnel arc: heading turns smoothly from `angle` to 0 (parallel to current) at the throat rim.
  const cx = endX;
  const cz = endZ - R;
  const asx = cx - R * Math.sin(a);
  const asz = cz + R * Math.cos(a);
  const straightLength = (asz - upstreamAnchorZ) / Math.sin(a);
  const ux = asx - straightLength * Math.cos(a);
  const uz = upstreamAnchorZ;

  const xs: number[] = [];
  const zs: number[] = [];
  const nStraight = Math.max(2, Math.ceil(straightLength / sampleSpacing));
  for (let i = 0; i < nStraight; i++) {
    const t = i / nStraight;
    xs.push(ux + (asx - ux) * t);
    zs.push(uz + (asz - uz) * t);
  }
  const arcLength = R * a;
  const nArc = Math.max(4, Math.ceil(arcLength / 0.5));
  for (let j = 0; j <= nArc; j++) {
    const phi = a * (1 - j / nArc);
    xs.push(cx - R * Math.sin(phi));
    zs.push(cz + R * Math.cos(phi));
  }

  const n = xs.length;
  const px = new Float32Array(xs);
  const pz = new Float32Array(zs);
  const ps = new Float32Array(n);
  const segCount = n - 1;
  const tx = new Float32Array(segCount);
  const tz = new Float32Array(segCount);
  const nx = new Float32Array(segCount);
  const nz = new Float32Array(segCount);
  const len = new Float32Array(segCount);
  const s0 = new Float32Array(segCount);
  const midX = new Float32Array(segCount);
  const midZ = new Float32Array(segCount);
  let s = 0;
  let minSeabed = Infinity;
  for (let k = 0; k < segCount; k++) {
    const dx = px[k + 1] - px[k];
    const dz = pz[k + 1] - pz[k];
    const l = Math.hypot(dx, dz);
    tx[k] = dx / l;
    tz[k] = dz / l;
    nx[k] = -tz[k];
    nz[k] = tx[k];
    len[k] = l;
    s0[k] = s;
    midX[k] = px[k] + dx * 0.5;
    midZ[k] = pz[k] + dz * 0.5;
    minSeabed = Math.min(minSeabed, seabedDepth(midX[k], midZ[k]));
    s += l;
    ps[k + 1] = s;
  }
  const length = s;

  const anchors: AnchorPoint[] = [{ x: px[0], z: pz[0], s: 0, kind: 'upstream' }];
  const spacing = ASSUMPTIONS.curtain.intermediateAnchorSpacing;
  for (let as = spacing; as < straightLength - spacing * 0.4; as += spacing) {
    const p = pointAtArc({ px, pz, ps, n } as CurtainLayout, as);
    anchors.push({ x: p.x, z: p.z, s: as, kind: 'intermediate' });
  }
  anchors.push({ x: px[n - 1], z: pz[n - 1], s: length, kind: 'throat' });

  const layout: CurtainLayout = {
    angle,
    length,
    straightLength,
    arcLength,
    n,
    px,
    pz,
    ps,
    segCount,
    tx,
    tz,
    nx,
    nz,
    len,
    s0,
    midX,
    midZ,
    upstream: { x: px[0], z: pz[0] },
    end: { x: px[n - 1], z: pz[n - 1] },
    anchors,
    throat: buildThroatGeometry(),
    minSeabedDepth: minSeabed,
    grid: { cell: 5, x0: 0, z0: 0, cols: 0, rows: 0, cells: [] },
  };
  layout.grid = buildGrid(layout);
  return layout;
}

function buildGrid(L: CurtainLayout): SegmentGrid {
  const pad = ASSUMPTIONS.curtain.interactionRange + 2;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < L.n; i++) {
    minX = Math.min(minX, L.px[i]);
    maxX = Math.max(maxX, L.px[i]);
    minZ = Math.min(minZ, L.pz[i]);
    maxZ = Math.max(maxZ, L.pz[i]);
  }
  const cell = 5;
  const x0 = minX - pad;
  const z0 = minZ - pad;
  const cols = Math.ceil((maxX + pad - x0) / cell);
  const rows = Math.ceil((maxZ + pad - z0) / cell);
  const cells: number[][] = Array.from({ length: cols * rows }, () => []);
  for (let k = 0; k < L.segCount; k++) {
    const ax = L.px[k];
    const az = L.pz[k];
    const bx = L.px[k + 1];
    const bz = L.pz[k + 1];
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx) - pad - x0) / cell));
    const c1 = Math.min(cols - 1, Math.floor((Math.max(ax, bx) + pad - x0) / cell));
    const r0 = Math.max(0, Math.floor((Math.min(az, bz) - pad - z0) / cell));
    const r1 = Math.min(rows - 1, Math.floor((Math.max(az, bz) + pad - z0) / cell));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells[r * cols + c].push(k);
  }
  return { cell, x0, z0, cols, rows, cells };
}

/** Closest curtain segment to (x, z). Returns false when the point is outside the curtain's influence grid. */
export function nearestSegment(L: CurtainLayout, x: number, z: number, out: SegmentHit): boolean {
  const g = L.grid;
  const c = Math.floor((x - g.x0) / g.cell);
  const r = Math.floor((z - g.z0) / g.cell);
  if (c < 0 || r < 0 || c >= g.cols || r >= g.rows) return false;
  const list = g.cells[r * g.cols + c];
  if (list.length === 0) return false;
  let best = -1;
  let bestDist = Infinity;
  let bestD = 0;
  let bestAlong = 0;
  for (let i = 0; i < list.length; i++) {
    const k = list[i];
    const rx = x - L.px[k];
    const rz = z - L.pz[k];
    const along = rx * L.tx[k] + rz * L.tz[k];
    const cl = along < 0 ? 0 : along > L.len[k] ? L.len[k] : along;
    const qx = rx - L.tx[k] * cl;
    const qz = rz - L.tz[k] * cl;
    const dist = Math.sqrt(qx * qx + qz * qz);
    if (dist < bestDist) {
      bestDist = dist;
      best = k;
      bestD = rx * L.nx[k] + rz * L.nz[k];
      bestAlong = along;
    }
  }
  if (best < 0) return false;
  out.seg = best;
  out.dist = bestDist;
  out.d = bestD;
  out.along = bestAlong;
  const lk = L.len[best];
  out.within =
    (bestAlong >= -0.05 || best > 0) && (bestAlong <= lk + 0.05 || best < L.segCount - 1) && bestAlong > -1.5 && bestAlong < lk + 1.5;
  out.s = L.s0[best] + Math.max(0, Math.min(lk, bestAlong));
  return true;
}

/** Point and frame on the curtain at arc position s (clamped). */
export function pointAtArc(L: Pick<CurtainLayout, 'px' | 'pz' | 'ps' | 'n'>, s: number) {
  const n = L.n;
  if (s <= 0) return frameAt(L, 0, 0);
  if (s >= L.ps[n - 1]) return frameAt(L, n - 2, 1);
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (L.ps[mid] <= s) lo = mid;
    else hi = mid;
  }
  const t = (s - L.ps[lo]) / (L.ps[lo + 1] - L.ps[lo]);
  return frameAt(L, lo, t);
}

/** x of the curtain line at lateral position z (the nearer end beyond its lateral extent). */
export function curtainXAt(L: Pick<CurtainLayout, 'px' | 'pz' | 'n'>, z: number): number {
  const { px, pz, n } = L;
  for (let i = 1; i < n; i++) {
    const a = pz[i - 1];
    const b = pz[i];
    if ((z >= a && z <= b) || (z >= b && z <= a)) return px[i - 1] + (px[i] - px[i - 1]) * ((z - a) / (b - a || 1));
  }
  return Math.abs(z - pz[0]) < Math.abs(z - pz[n - 1]) ? px[0] : px[n - 1];
}

function frameAt(L: Pick<CurtainLayout, 'px' | 'pz' | 'ps' | 'n'>, k: number, t: number) {
  const dx = L.px[k + 1] - L.px[k];
  const dz = L.pz[k + 1] - L.pz[k];
  const l = Math.hypot(dx, dz) || 1;
  const tx = dx / l;
  const tz = dz / l;
  return { x: L.px[k] + dx * t, z: L.pz[k] + dz * t, tx, tz, nx: -tz, nz: tx };
}

const layoutCache = new Map<AnchorAngle, CurtainLayout>();
export function getCurtainLayout(angle: AnchorAngle): CurtainLayout {
  let l = layoutCache.get(angle);
  if (!l) {
    l = buildCurtainLayout(angle);
    layoutCache.set(angle, l);
  }
  return l;
}
