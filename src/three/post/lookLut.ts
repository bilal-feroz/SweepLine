import { LookupTexture } from 'postprocessing';

/** Strength of the look. 0 = neutral LUT. */
export const LOOK = {
  /** Luminance S-curve amount (0..1). */
  contrast: 0.16,
  /** Teal push into the shadows, warm sand into the highlights (sRGB units). */
  shadowTint: [-0.012, 0.004, 0.018] as const,
  highlightTint: [0.018, 0.008, -0.014] as const,
};

const smooth = (x: number) => x * x * (3 - 2 * x);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * "Gulf daylight" colour look baked into a 3D LUT (sRGB in, sRGB out): a gentle luminance
 * S-curve and split toning (cool shadows, warm highlights). Applied after the scene grade, so
 * it shapes the final picture without moving the status colours far from their hues.
 * Replace with a .cube from a colourist via postprocessing's LUTCubeLoader if needed.
 */
export function createLookLUT(size = 32): LookupTexture {
  const lut = LookupTexture.createNeutral(size);
  const data = lut.image.data as Float32Array;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const lc = l + LOOK.contrast * (smooth(l) - l);
    const k = l > 1e-4 ? lc / l : 1;
    const ws = (1 - l) * (1 - l);
    const wh = l * l;
    data[i] = clamp01(r * k + LOOK.shadowTint[0] * ws + LOOK.highlightTint[0] * wh);
    data[i + 1] = clamp01(g * k + LOOK.shadowTint[1] * ws + LOOK.highlightTint[1] * wh);
    data[i + 2] = clamp01(b * k + LOOK.shadowTint[2] * ws + LOOK.highlightTint[2] * wh);
  }
  lut.needsUpdate = true;
  lut.name = 'sweepline-gulf-daylight';
  return lut;
}
