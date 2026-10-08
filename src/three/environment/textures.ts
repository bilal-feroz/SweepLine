import * as THREE from 'three';
import { SeededRandom } from '../../simulation/seededRandom';

/** Periodic value noise on a `period`×`period` lattice, sampled to size×size. Tileable. */
function tileNoise(size: number, period: number, rng: SeededRandom): Float32Array {
  const lat = new Float32Array(period * period);
  for (let i = 0; i < lat.length; i++) lat[i] = rng.next();
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * period;
    const y0 = Math.floor(fy);
    const ty = fy - y0;
    const sy = ty * ty * (3 - 2 * ty);
    const y1 = (y0 + 1) % period;
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * period;
      const x0 = Math.floor(fx);
      const tx = fx - x0;
      const sx = tx * tx * (3 - 2 * tx);
      const x1 = (x0 + 1) % period;
      const a = lat[y0 * period + x0];
      const b = lat[y0 * period + x1];
      const c = lat[y1 * period + x0];
      const d = lat[y1 * period + x1];
      out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

function fbm(size: number, periods: number[], amps: number[], seed: number): Float32Array {
  const rng = new SeededRandom(seed);
  const out = new Float32Array(size * size);
  let total = 0;
  periods.forEach((p, i) => {
    const n = tileNoise(size, p, rng);
    for (let k = 0; k < out.length; k++) out[k] += n[k] * amps[i];
    total += amps[i];
  });
  for (let k = 0; k < out.length; k++) out[k] /= total;
  return out;
}

function heightToNormal(h: Float32Array, size: number, strength: number): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const r = h[y * size + ((x + 1) % size)];
      const u = h[((y - 1 + size) % size) * size + x];
      const d = h[((y + 1) % size) * size + x];
      const nx = (l - r) * strength;
      const ny = (u - d) * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  return data;
}

function dataTexture(data: Uint8Array, size: number, srgb: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Small-scale capillary/wind-wave normal map for the water surface. */
export function makeWaterNormalMap(size = 256): THREE.DataTexture {
  const rng = new SeededRandom(9001);
  const h = new Float32Array(size * size);
  const waves: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 26; i++) {
    const fx = Math.round(rng.range(-9, 9));
    const fy = Math.round(rng.range(-9, 9));
    if (fx === 0 && fy === 0) continue;
    const amp = 1 / Math.pow(Math.hypot(fx, fy), 1.3);
    waves.push([fx, fy, amp, rng.next() * Math.PI * 2]);
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const [fx, fy, a, ph] of waves) v += a * Math.sin(((fx * x + fy * y) / size) * Math.PI * 2 + ph);
      h[y * size + x] = v;
    }
  }
  const n = fbm(size, [16, 32], [0.6, 0.4], 77);
  for (let k = 0; k < h.length; k++) h[k] = h[k] * 0.55 + n[k] * 0.8;
  return dataTexture(heightToNormal(h, size, 2.2), size, false);
}

/** Seabed sand: albedo with ripples and mottling, plus matching normal map. */
export function makeSandTextures(size = 512): { map: THREE.DataTexture; normal: THREE.DataTexture } {
  const n = fbm(size, [4, 8, 16, 32, 64], [0.35, 0.25, 0.18, 0.12, 0.1], 31);
  const grain = fbm(size, [128], [1], 32);
  const h = new Float32Array(size * size);
  const col = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const k = y * size + x;
      const warp = n[k] * 2.4;
      const ripple = Math.sin(((x + y * 0.35) / size) * Math.PI * 2 * 14 + warp * 3.0);
      h[k] = ripple * 0.35 + n[k] * 1.2 + grain[k] * 0.25;
      const shade = 0.8 + 0.22 * n[k] + 0.06 * ripple + 0.08 * (grain[k] - 0.5);
      col[k * 4] = Math.min(255, 196 * shade);
      col[k * 4 + 1] = Math.min(255, 178 * shade);
      col[k * 4 + 2] = Math.min(255, 140 * shade);
      col[k * 4 + 3] = 255;
    }
  }
  return { map: dataTexture(col, size, true), normal: dataTexture(heightToNormal(h, size, 3.0), size, false) };
}

/** Weathered concrete albedo + normal. */
export function makeConcreteTextures(size = 256): { map: THREE.DataTexture; normal: THREE.DataTexture } {
  const n = fbm(size, [4, 8, 16, 64, 128], [0.3, 0.25, 0.2, 0.15, 0.1], 51);
  const col = new Uint8Array(size * size * 4);
  for (let k = 0; k < size * size; k++) {
    const v = 0.82 + 0.2 * (n[k] - 0.5);
    col[k * 4] = 186 * v;
    col[k * 4 + 1] = 184 * v;
    col[k * 4 + 2] = 176 * v;
    col[k * 4 + 3] = 255;
  }
  return { map: dataTexture(col, size, true), normal: dataTexture(heightToNormal(n, size, 1.6), size, false) };
}

/** Dry coastal ground: compacted sand and gravel with large-scale mottling. */
export function makeLandTexture(size = 512): THREE.DataTexture {
  const n = fbm(size, [4, 8, 16, 32, 128], [0.32, 0.26, 0.18, 0.14, 0.1], 71);
  const g = fbm(size, [64, 256], [0.6, 0.4], 72);
  const col = new Uint8Array(size * size * 4);
  for (let k = 0; k < size * size; k++) {
    const v = 0.78 + 0.32 * (n[k] - 0.5) + 0.12 * (g[k] - 0.5);
    col[k * 4] = Math.min(255, 198 * v);
    col[k * 4 + 1] = Math.min(255, 175 * v);
    col[k * 4 + 2] = Math.min(255, 130 * v);
    col[k * 4 + 3] = 255;
  }
  return dataTexture(col, size, true);
}

/** Rock-armour colour variation. */
export function makeRockTexture(size = 256): THREE.DataTexture {
  const n = fbm(size, [8, 16, 32, 64], [0.35, 0.3, 0.2, 0.15], 61);
  const col = new Uint8Array(size * size * 4);
  for (let k = 0; k < size * size; k++) {
    const v = 0.7 + 0.45 * (n[k] - 0.5);
    col[k * 4] = 150 * v;
    col[k * 4 + 1] = 140 * v;
    col[k * 4 + 2] = 124 * v;
    col[k * 4 + 3] = 255;
  }
  return dataTexture(col, size, true);
}

/** Woven wire screen mesh with alpha (for band screens). */
export function makeScreenMeshTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const wire = x % 8 < 2 || y % 8 < 2;
      data[i] = 70;
      data[i + 1] = 82;
      data[i + 2] = 88;
      data[i + 3] = wire ? 255 : 0;
    }
  }
  const t = dataTexture(data, size, true);
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Steel deck grating. */
export function makeGratingTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const bar = x % 6 < 2 || y % 24 < 2;
      const v = bar ? 92 : 40;
      data[i] = v;
      data[i + 1] = v + 4;
      data[i + 2] = v + 6;
      data[i + 3] = 255;
    }
  }
  return dataTexture(data, size, true);
}

/** Soft radial sprite (white, alpha falloff). */
export function makeSoftSprite(size = 64, hardness = 2.2): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.min(1, Math.hypot(dx, dy) * 2);
      const a = Math.pow(1 - r, hardness);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = a * 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Patchy white-water ring (white, alpha) where a rising curtain section breaks the surface. */
export function makeFoamSprite(size = 128): THREE.DataTexture {
  const n = fbm(size, [8, 16, 32], [0.45, 0.35, 0.2], 91);
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const k = y * size + x;
      const ring = r < 1 ? Math.exp(-Math.pow((r - 0.6) / 0.24, 2)) : 0;
      const patch = Math.max(0, (n[k] - 0.3) / 0.7);
      data[k * 4] = data[k * 4 + 1] = data[k * 4 + 2] = 255;
      data[k * 4 + 3] = Math.min(1, ring * (0.3 + 1.2 * patch)) * 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Selection ring sprite. */
export function makeRingSprite(size = 128): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size - 0.5;
      const dy = (y + 0.5) / size - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const ring = Math.exp(-Math.pow((r - 0.82) / 0.05, 2));
      const ticks = Math.abs(dx) < 0.012 || Math.abs(dy) < 0.012 ? Math.exp(-Math.pow((r - 0.97) / 0.06, 2)) : 0;
      const a = Math.min(1, ring + ticks);
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = a * 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
