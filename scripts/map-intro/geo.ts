/**
 * Geometry helpers for the map-intro data build: a local equirectangular
 * projection, rectangle clipping, Douglas–Peucker simplification and the
 * assembly of OpenStreetMap coastline ways into land polygons.
 *
 * Projected coordinates are kilometres: x east, y north (y up).
 */

export type Pt = [number, number];
export type Ring = Pt[];
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Mean Earth radius (km), IUGG. */
export const EARTH_RADIUS_KM = 6371.0088;
const RAD = Math.PI / 180;

/** Local equirectangular projection about (lon0, lat0): x = R·cos(lat0)·Δλ, y = R·Δφ (km). */
export class LocalProjection {
  readonly kx: number;
  readonly ky: number;
  constructor(
    readonly lon0: number,
    readonly lat0: number,
  ) {
    this.kx = EARTH_RADIUS_KM * Math.cos(lat0 * RAD) * RAD;
    this.ky = EARTH_RADIUS_KM * RAD;
  }
  project(lon: number, lat: number): Pt {
    return [(lon - this.lon0) * this.kx, (lat - this.lat0) * this.ky];
  }
  unproject(x: number, y: number): Pt {
    return [this.lon0 + x / this.kx, this.lat0 + y / this.ky];
  }
}

export function rectFromLonLat(p: LocalProjection, west: number, south: number, east: number, north: number): Rect {
  const [x0, y0] = p.project(west, south);
  const [x1, y1] = p.project(east, north);
  return { x0, y0, x1, y1 };
}

export function signedArea(r: Ring): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
  return a / 2;
}

export function pointInRing(p: Pt, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i];
    const [xj, yj] = r[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function ringBounds(r: Ring): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of r) {
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return { x0, y0, x1, y1 };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}

// ---------------------------------------------------------------- simplification

function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Douglas–Peucker for an open polyline (endpoints kept). */
export function simplifyLine(pts: Pt[], tol: number): Pt[] {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = -1;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = perpDist(pts[i], pts[a], pts[b]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** Douglas–Peucker for a closed ring (first point not repeated). Returns null if it collapses. */
export function simplifyRing(r: Ring, tol: number): Ring | null {
  if (r.length < 4) return null;
  // Split at the point farthest from the first vertex so both halves are well conditioned.
  let far = 0;
  let farD = -1;
  for (let i = 1; i < r.length; i++) {
    const d = Math.hypot(r[i][0] - r[0][0], r[i][1] - r[0][1]);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = simplifyLine(r.slice(0, far + 1), tol);
  const b = simplifyLine([...r.slice(far), r[0]], tol);
  const out = [...a, ...b.slice(1, -1)];
  return out.length >= 3 ? out : null;
}

// ---------------------------------------------------------------- clipping

/** Sutherland–Hodgman clip of a ring against an axis-aligned rectangle. */
export function clipRingToRect(r: Ring, rc: Rect): Ring {
  let out = r;
  const edges: Array<[(p: Pt) => boolean, (a: Pt, b: Pt) => Pt]> = [
    [(p) => p[0] >= rc.x0, (a, b) => [rc.x0, a[1] + ((b[1] - a[1]) * (rc.x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= rc.x1, (a, b) => [rc.x1, a[1] + ((b[1] - a[1]) * (rc.x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= rc.y0, (a, b) => [a[0] + ((b[0] - a[0]) * (rc.y0 - a[1])) / (b[1] - a[1]), rc.y0]],
    [(p) => p[1] <= rc.y1, (a, b) => [a[0] + ((b[0] - a[0]) * (rc.y1 - a[1])) / (b[1] - a[1]), rc.y1]],
  ];
  for (const [inside, cut] of edges) {
    if (out.length === 0) break;
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const ci = inside(cur);
      const pi = inside(prev);
      if (ci) {
        if (!pi) out.push(cut(prev, cur));
        out.push(cur);
      } else if (pi) out.push(cut(prev, cur));
    }
  }
  return out;
}

/** Liang–Barsky segment clip; returns the clipped parameter range or null. */
function clipSegment(a: Pt, b: Pt, rc: Rect): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const tests: Array<[number, number]> = [
    [-dx, a[0] - rc.x0],
    [dx, rc.x1 - a[0]],
    [-dy, a[1] - rc.y0],
    [dy, rc.y1 - a[1]],
  ];
  for (const [p, q] of tests) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return [t0, t1];
}

const lerpPt = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/** Clip a polyline to a rectangle, returning the inside pieces. */
export function clipLineToRect(line: Pt[], rc: Rect): Pt[][] {
  const out: Pt[][] = [];
  let cur: Pt[] | null = null;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const c = clipSegment(a, b, rc);
    if (!c) {
      cur = null;
      continue;
    }
    const pa = c[0] > 0 ? lerpPt(a, b, c[0]) : a;
    const pb = c[1] < 1 ? lerpPt(a, b, c[1]) : b;
    if (!cur || c[0] > 0) {
      cur = [pa];
      out.push(cur);
    }
    cur.push(pb);
    if (c[1] < 1) cur = null;
  }
  return out.filter((p) => p.length >= 2);
}

// ---------------------------------------------------------------- OSM coastline → land polygons

export interface CoastWay {
  nodes: number[];
  pts: Pt[];
}

/** Join coastline ways end-to-end (by node id). Returns closed rings and open chains (land on the left). */
export function joinWays(ways: CoastWay[]): { rings: Ring[]; chains: Pt[][] } {
  const byStart = new Map<number, number>();
  for (let i = 0; i < ways.length; i++) byStart.set(ways[i].nodes[0], i);
  const used = new Uint8Array(ways.length);
  const rings: Ring[] = [];
  const chains: Pt[][] = [];
  // Start chains at ways that nothing feeds into, so open chains are complete.
  const endNodes = new Set(ways.map((w) => w.nodes[w.nodes.length - 1]));
  const order = [...ways.keys()].sort((a, b) => Number(endNodes.has(ways[a].nodes[0])) - Number(endNodes.has(ways[b].nodes[0])));
  for (const start of order) {
    if (used[start]) continue;
    const startNode = ways[start].nodes[0];
    const pts: Pt[] = [];
    let cur: number | undefined = start;
    let closed = false;
    while (cur !== undefined && !used[cur]) {
      used[cur] = 1;
      const w: CoastWay = ways[cur];
      pts.push(...(pts.length ? w.pts.slice(1) : w.pts));
      const endNode = w.nodes[w.nodes.length - 1];
      if (endNode === startNode) {
        closed = true;
        break;
      }
      cur = byStart.get(endNode);
    }
    if (closed) rings.push(pts.slice(0, -1));
    else chains.push(pts);
  }
  return { rings, chains };
}

/** Position along the rectangle perimeter, counter-clockwise from the bottom-left corner. */
function perimeterPos(p: Pt, rc: Rect): number {
  const w = rc.x1 - rc.x0;
  const h = rc.y1 - rc.y0;
  const e = 1e-7 * (w + h);
  if (Math.abs(p[1] - rc.y0) < e) return p[0] - rc.x0;
  if (Math.abs(p[0] - rc.x1) < e) return w + (p[1] - rc.y0);
  if (Math.abs(p[1] - rc.y1) < e) return w + h + (rc.x1 - p[0]);
  return 2 * w + h + (rc.y1 - p[1]);
}

/** Rectangle corners passed when walking the perimeter counter-clockwise from `from` to `to`. */
function cornersBetween(from: number, to: number, rc: Rect): Pt[] {
  const w = rc.x1 - rc.x0;
  const h = rc.y1 - rc.y0;
  const per = 2 * (w + h);
  const corners: Array<[number, Pt]> = [
    [w, [rc.x1, rc.y0]],
    [w + h, [rc.x1, rc.y1]],
    [2 * w + h, [rc.x0, rc.y1]],
    [0, [rc.x0, rc.y0]],
  ];
  const wrap = (v: number) => ((v % per) + per) % per;
  const d = wrap(to - from);
  return corners
    .map(([pos, c]) => [wrap(pos - from), c] as [number, Pt])
    .filter(([dc]) => dc > 0 && dc < d)
    .sort((a, b) => a[0] - b[0])
    .map(([, c]) => c);
}

/**
 * Build land polygons inside `rc` from coastline rings and open chains.
 * Open chains are clipped to the rectangle and closed by walking the boundary
 * counter-clockwise (OSM coastline convention: land on the left).
 * `centreIsLand` decides the result when no coastline crosses the rectangle.
 */
export function buildLand(rings: Ring[], chains: Pt[][], rc: Rect, centreIsLand: boolean): Ring[] {
  const out: Ring[] = [];
  for (const r of rings) {
    if (!rectsOverlap(ringBounds(r), rc)) continue;
    const c = clipRingToRect(r, rc);
    if (c.length >= 3) out.push(c);
  }
  // Pieces of open chains that cross the rectangle.
  const pieces: Pt[][] = [];
  for (const ch of chains) {
    for (const p of clipLineToRect(ch, rc)) pieces.push(p);
  }
  const per = 2 * (rc.x1 - rc.x0 + (rc.y1 - rc.y0));
  const onEdge = (p: Pt) => {
    const e = 1e-6 * per;
    return Math.abs(p[0] - rc.x0) < e || Math.abs(p[0] - rc.x1) < e || Math.abs(p[1] - rc.y0) < e || Math.abs(p[1] - rc.y1) < e;
  };
  const open = pieces.filter((p) => onEdge(p[0]) && onEdge(p[p.length - 1]));
  const dangling = pieces.length - open.length;
  if (dangling) console.warn(`    buildLand: ${dangling} coastline piece(s) end inside the clip rectangle (data gap) — skipped`);
  if (open.length === 0) {
    if (centreIsLand)
      out.push([
        [rc.x0, rc.y0],
        [rc.x1, rc.y0],
        [rc.x1, rc.y1],
        [rc.x0, rc.y1],
      ]);
    return out;
  }
  const entry = open.map((p) => perimeterPos(p[0], rc));
  const exit = open.map((p) => perimeterPos(p[p.length - 1], rc));
  const used = new Uint8Array(open.length);
  for (let s = 0; s < open.length; s++) {
    if (used[s]) continue;
    const ring: Pt[] = [];
    let i = s;
    for (let guard = 0; guard < open.length + 1; guard++) {
      used[i] = 1;
      ring.push(...open[i]);
      // Next entry counter-clockwise from this exit.
      let best = -1;
      let bestD = Infinity;
      for (let j = 0; j < open.length; j++) {
        let d = entry[j] - exit[i];
        if (d < 0) d += per;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      ring.push(...cornersBetween(exit[i], entry[best], rc));
      if (best === s || used[best]) break;
      i = best;
    }
    if (ring.length >= 3) out.push(ring);
  }
  return out;
}
