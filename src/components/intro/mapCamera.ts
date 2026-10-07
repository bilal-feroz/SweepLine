/**
 * 2D map camera for the geographic intro.
 *
 * Map coordinates are SVG kilometres: x east, y south (the generated data's
 * north-up kilometres with y flipped). The camera is a similarity transform
 * expressed around a *lock point*: the point of interest sits at a chosen
 * screen position, so interpolating that position, the zoom (in log space) and
 * the rotation moves the camera without the destination drifting.
 */

/** Screen size in CSS pixels; layouts are expressed in units of the short side. */
export interface IntroViewport {
  w: number;
  h: number;
  /** Short side (px). */
  s: number;
}

export interface MapCamera {
  /** Map kilometres across the screen's short side. */
  span: number;
  /** Screen position of the lock point relative to the screen centre, in short-side units (y down). */
  px: number;
  py: number;
  /** Clockwise screen rotation of the map (degrees). */
  rot: number;
}

/** Row-major 2D affine [a, b, c, d, e, f]: x' = a·x + c·y + e, y' = b·x + d·y + f (SVG `matrix()` order). */
export type Affine = [number, number, number, number, number, number];

export const DEG = Math.PI / 180;

export function viewportOf(w: number, h: number): IntroViewport {
  return { w, h, s: Math.min(w, h) };
}

/** Map (SVG km) → screen px. */
export function cameraAffine(cam: MapCamera, vp: IntroViewport, lockX: number, lockY: number, out: Affine = [1, 0, 0, 1, 0, 0]): Affine {
  const k = vp.s / cam.span;
  const c = Math.cos(cam.rot * DEG) * k;
  const s = Math.sin(cam.rot * DEG) * k;
  const sx = vp.w / 2 + cam.px * vp.s;
  const sy = vp.h / 2 + cam.py * vp.s;
  out[0] = c;
  out[1] = s;
  out[2] = -s;
  out[3] = c;
  out[4] = sx - (c * lockX - s * lockY);
  out[5] = sy - (s * lockX + c * lockY);
  return out;
}

export function apply(m: Affine, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function multiply(m: Affine, n: Affine, out: Affine = [1, 0, 0, 1, 0, 0]): Affine {
  // (m ∘ n): apply n first, then m.
  const a = m[0] * n[0] + m[2] * n[1];
  const b = m[1] * n[0] + m[3] * n[1];
  const c = m[0] * n[2] + m[2] * n[3];
  const d = m[1] * n[2] + m[3] * n[3];
  const e = m[0] * n[4] + m[2] * n[5] + m[4];
  const f = m[1] * n[4] + m[3] * n[5] + m[5];
  out[0] = a;
  out[1] = b;
  out[2] = c;
  out[3] = d;
  out[4] = e;
  out[5] = f;
  return out;
}

export function invert(m: Affine): Affine {
  const det = m[0] * m[3] - m[1] * m[2];
  const a = m[3] / det;
  const b = -m[1] / det;
  const c = -m[2] / det;
  const d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}

export function svgMatrix(m: Affine): string {
  return `matrix(${m[0]} ${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]})`;
}

// ------------------------------------------------------------------ easing & interpolation

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** 0 → 1 as v goes a → b (clamped). */
export const ramp = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
export const smoothstep = (t: number) => t * t * (3 - 2 * t);
export const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
/** Smooth 0 → 1 window between a and b. */
export const fadeIn = (v: number, a: number, b: number) => smoothstep(ramp(v, a, b));
/** Smooth 1 → 0 window between a and b. */
export const fadeOut = (v: number, a: number, b: number) => 1 - smoothstep(ramp(v, a, b));
/** Visible inside [a1, b0], fading in over [a0, a1] and out over [b0, b1]. */
export const band = (v: number, a0: number, a1: number, b0: number, b1: number) => fadeIn(v, a0, a1) * fadeOut(v, b0, b1);

/**
 * Monotone cubic interpolation (Fritsch–Carlson) through (t, v) keys with
 * optional end slopes. C1-continuous and free of overshoot, so a camera never
 * backs up between keyframes.
 */
export function monotoneCurve(ts: number[], vs: number[], startSlope?: number, endSlope?: number): (t: number) => number {
  const n = ts.length;
  const h: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(ts[i + 1] - ts[i]);
    d.push((vs[i + 1] - vs[i]) / h[i]);
  }
  const m: number[] = new Array(n).fill(0);
  m[0] = startSlope ?? d[0];
  m[n - 1] = endSlope ?? d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else {
      // Weighted harmonic mean (Fritsch–Butland), keeps the curve monotone.
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const r = a * a + b * b;
    if (r > 9) {
      const tau = 3 / Math.sqrt(r);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }
  return (t: number) => {
    if (t <= ts[0]) return vs[0];
    if (t >= ts[n - 1]) return vs[n - 1];
    let i = 0;
    while (i < n - 2 && t > ts[i + 1]) i++;
    const u = (t - ts[i]) / h[i];
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * vs[i] + (u3 - 2 * u2 + u) * h[i] * m[i] + (-2 * u3 + 3 * u2) * vs[i + 1] + (u3 - u2) * h[i] * m[i + 1];
  };
}

/** A "nice" scale-bar length (1, 2 or 5 × 10ⁿ km) close to `target` km. */
export function niceLength(target: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  const f = target / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}
