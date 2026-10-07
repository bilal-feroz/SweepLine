/**
 * Compact SVG path encoding for the generated map-intro data. Coordinates are
 * rounded to integer multiples of `unit` (km) and written as relative moves, so
 * a path renders inside `<g transform="scale(unit)">` in map kilometres.
 * Map y (north) is flipped to SVG y (down) here.
 */
import type { Pt, Ring } from './geo';

function num(v: number): string {
  return v === 0 ? '0' : String(v);
}

/** Append one subpath; returns the number of vertices written. */
function subpath(out: string[], pts: Pt[], unit: number, close: boolean): number {
  let px = 0;
  let py = 0;
  let n = 0;
  let s = '';
  for (let i = 0; i < pts.length; i++) {
    const x = Math.round(pts[i][0] / unit);
    const y = Math.round(-pts[i][1] / unit);
    if (i === 0) {
      s = `M${num(x)} ${num(y)}`;
      n++;
    } else {
      const dx = x - px;
      const dy = y - py;
      if (dx === 0 && dy === 0) continue;
      s += (n === 1 ? 'l' : dx < 0 ? '' : ' ') + num(dx) + (dy < 0 ? '' : ' ') + num(dy);
      n++;
    }
    px = x;
    py = y;
  }
  if (n < 2) return 0;
  if (close) s += 'z';
  out.push(s);
  return n;
}

export interface EncodedPath {
  d: string;
  /** Vertex count (for the build report). */
  n: number;
}

export function encodeRings(rings: Ring[], unit: number): EncodedPath {
  const out: string[] = [];
  let n = 0;
  for (const r of rings) n += subpath(out, r, unit, true);
  return { d: out.join(''), n };
}

export function encodeLines(lines: Pt[][], unit: number): EncodedPath {
  const out: string[] = [];
  let n = 0;
  for (const l of lines) n += subpath(out, l, unit, false);
  return { d: out.join(''), n };
}
