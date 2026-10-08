import * as THREE from 'three';

/**
 * Clear-sky atmosphere for the reference site: single Rayleigh + Mie scattering through a
 * spherical-shell atmosphere, with a dense, low aerosol layer for the dusty, hazy Gulf air and a
 * cheap multiple-scattering term that whitens the horizon. Evaluated on the GPU when the sky is
 * baked and on the CPU for the haze colour, from the same constants. Radiance is scaled so the
 * horizon sits at the scene's established brightness.
 */
export const ATMOSPHERE = {
  /** Rayleigh scattering at sea level (1/m) and scale height (m). */
  rayleigh: [5.8e-6, 13.5e-6, 33.1e-6] as const,
  rayleighHeight: 8000,
  /** Aerosol scattering at sea level (1/m): ~2e-5 is clear maritime air; dust haze is several times that. */
  mie: 5.5e-5,
  mieHeight: 1100,
  /** Aerosol forward-scattering asymmetry (Cornette–Shanks phase). */
  mieG: 0.78,
  /** Second-order scattering, as a fraction of the single-scattered light, spread evenly. */
  multiple: 0.35,
};

const R_EARTH = 6360e3;
const R_ATMOS = 6420e3;
const PRIMARY = 32;
const LIGHT = 8;

/** Target luminance of the horizon (the brightness the scene was tuned for). */
const HORIZON_LUMINANCE = 0.6;

/** Far / near intersection of a ray from (0, oy, 0) with direction y-component dy and a centred sphere. */
function raySphereFar(oy: number, dy: number, r: number): number {
  const b = oy * dy;
  const c = oy * oy - r * r;
  const h = b * b - c;
  if (h < 0) return -1;
  return -b + Math.sqrt(h);
}

function raySphereNear(oy: number, dy: number, r: number): number {
  const b = oy * dy;
  const c = oy * oy - r * r;
  const h = b * b - c;
  if (h < 0) return -1;
  return -b - Math.sqrt(h);
}

/** Unscaled sky radiance looking along `d` (unit, y-up) with the sun along `s` (unit). */
function rawSky(d: THREE.Vector3, s: THREE.Vector3, out: THREE.Color): THREE.Color {
  const A = ATMOSPHERE;
  const oy = R_EARTH + 2;
  let tEnd = raySphereFar(oy, d.y, R_ATMOS);
  const tg = raySphereNear(oy, d.y, R_EARTH);
  if (tg > 0) tEnd = tg;
  let sR0 = 0, sR1 = 0, sR2 = 0, sM0 = 0, sM1 = 0, sM2 = 0;
  let odR = 0;
  let odM = 0;
  for (let i = 0; i < PRIMARY; i++) {
    // Steps crowd near the viewer (t ~ s^2), where low, dense air dominates near-horizontal rays.
    const s0 = i / PRIMARY;
    const s1 = (i + 1) / PRIMARY;
    const ds = tEnd * (s1 * s1 - s0 * s0);
    const t = tEnd * ((s0 + s1) * 0.5) ** 2;
    const px = d.x * t;
    const py = oy + d.y * t;
    const pz = d.z * t;
    const h = Math.hypot(px, py, pz) - R_EARTH;
    const dR = Math.exp(-h / A.rayleighHeight) * ds;
    const dM = Math.exp(-h / A.mieHeight) * ds;
    // Optical depth from the viewer to the middle of this step.
    const midR = odR + dR * 0.5;
    const midM = odM + dM * 0.5;
    odR += dR;
    odM += dM;
    // Optical depth toward the sun from this point.
    const pl = Math.hypot(px, py, pz);
    const ux = px / pl, uy = py / pl, uz = pz / pl;
    const mu = ux * s.x + uy * s.y + uz * s.z;
    const b = pl * mu;
    const tl = -b + Math.sqrt(Math.max(0, b * b - (pl * pl - R_ATMOS * R_ATMOS)));
    const dsl = tl / LIGHT;
    let lR = 0;
    let lM = 0;
    for (let j = 0; j < LIGHT; j++) {
      const q = dsl * (j + 0.5);
      const hq = Math.hypot(px + s.x * q, py + s.y * q, pz + s.z * q) - R_EARTH;
      lR += Math.exp(-hq / A.rayleighHeight) * dsl;
      lM += Math.exp(-hq / A.mieHeight) * dsl;
    }
    const tauM = A.mie * 1.1 * (midM + lM);
    const a0 = Math.exp(-(A.rayleigh[0] * (midR + lR) + tauM));
    const a1 = Math.exp(-(A.rayleigh[1] * (midR + lR) + tauM));
    const a2 = Math.exp(-(A.rayleigh[2] * (midR + lR) + tauM));
    sR0 += a0 * dR; sR1 += a1 * dR; sR2 += a2 * dR;
    sM0 += a0 * dM; sM1 += a1 * dM; sM2 += a2 * dM;
  }
  const mu = d.x * s.x + d.y * s.y + d.z * s.z;
  const g = A.mieG;
  const phR = (3 / (16 * Math.PI)) * (1 + mu * mu);
  const phM = ((3 / (8 * Math.PI)) * ((1 - g * g) * (1 + mu * mu))) / ((2 + g * g) * Math.pow(1 + g * g - 2 * g * mu, 1.5));
  const iso = A.multiple / (4 * Math.PI);
  const R = A.rayleigh;
  out.setRGB(
    sR0 * R[0] * (phR + iso) + sM0 * A.mie * (phM + iso),
    sR1 * R[1] * (phR + iso) + sM1 * A.mie * (phM + iso),
    sR2 * R[2] * (phR + iso) + sM2 * A.mie * (phM + iso),
  );
  return out;
}

const tmpD = new THREE.Vector3();
const tmpC = new THREE.Color();

/** Average unscaled radiance of the horizon band (all azimuths, ~1.5° up). */
function rawHorizon(sun: THREE.Vector3): THREE.Color {
  const acc = new THREE.Color(0, 0, 0);
  const n = 24;
  const el = (1.5 * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    const az = (i / n) * Math.PI * 2;
    tmpD.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    acc.add(rawSky(tmpD, sun, tmpC));
  }
  return acc.multiplyScalar(1 / n);
}

/** Radiance scale and horizon (haze) colour for a sun direction. */
export function atmosphereFor(sun: THREE.Vector3): { scale: number; horizon: THREE.Color } {
  const raw = rawHorizon(sun);
  const lum = 0.2126 * raw.r + 0.7152 * raw.g + 0.0722 * raw.b;
  const scale = HORIZON_LUMINANCE / Math.max(lum, 1e-9);
  return { scale, horizon: raw.multiplyScalar(scale) };
}

/** GLSL twin of the CPU model: vec3 slSky(vec3 dir, vec3 sun) (unscaled). Keep both in sync. */
export const ATMOSPHERE_GLSL = /* glsl */ `
const float SL_R_EARTH = ${R_EARTH.toFixed(1)};
const float SL_R_ATMOS = ${R_ATMOS.toFixed(1)};
const vec3 SL_BETA_R = vec3(${ATMOSPHERE.rayleigh.map((v) => v.toExponential(4)).join(', ')});
const float SL_H_R = ${ATMOSPHERE.rayleighHeight.toFixed(1)};
const float SL_BETA_M = ${ATMOSPHERE.mie.toExponential(4)};
const float SL_H_M = ${ATMOSPHERE.mieHeight.toFixed(1)};
const float SL_G_M = ${ATMOSPHERE.mieG.toFixed(4)};
const float SL_MS = ${ATMOSPHERE.multiple.toFixed(4)};
float slRaySphereFar(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float h = b * b - (dot(o, o) - r * r);
  return h < 0.0 ? -1.0 : -b + sqrt(h);
}
float slRaySphereNear(vec3 o, vec3 d, float r) {
  float b = dot(o, d);
  float h = b * b - (dot(o, o) - r * r);
  return h < 0.0 ? -1.0 : -b - sqrt(h);
}
vec3 slSky(vec3 d, vec3 s) {
  vec3 o = vec3(0.0, SL_R_EARTH + 2.0, 0.0);
  float tEnd = slRaySphereFar(o, d, SL_R_ATMOS);
  float tg = slRaySphereNear(o, d, SL_R_EARTH);
  if (tg > 0.0) tEnd = tg;
  vec3 sumR = vec3(0.0);
  vec3 sumM = vec3(0.0);
  float odR = 0.0;
  float odM = 0.0;
  for (int i = 0; i < ${PRIMARY}; i++) {
    float s0 = float(i) / ${PRIMARY.toFixed(1)};
    float s1 = float(i + 1) / ${PRIMARY.toFixed(1)};
    float ds = tEnd * (s1 * s1 - s0 * s0);
    float sm = (s0 + s1) * 0.5;
    vec3 p = o + d * (tEnd * sm * sm);
    float h = length(p) - SL_R_EARTH;
    float dR = exp(-h / SL_H_R) * ds;
    float dM = exp(-h / SL_H_M) * ds;
    float midR = odR + dR * 0.5;
    float midM = odM + dM * 0.5;
    odR += dR;
    odM += dM;
    float dsl = slRaySphereFar(p, s, SL_R_ATMOS) / ${LIGHT.toFixed(1)};
    float lR = 0.0;
    float lM = 0.0;
    for (int j = 0; j < ${LIGHT}; j++) {
      float hq = length(p + s * (dsl * (float(j) + 0.5))) - SL_R_EARTH;
      lR += exp(-hq / SL_H_R) * dsl;
      lM += exp(-hq / SL_H_M) * dsl;
    }
    vec3 att = exp(-(SL_BETA_R * (midR + lR) + SL_BETA_M * 1.1 * (midM + lM)));
    sumR += att * dR;
    sumM += att * dM;
  }
  float mu = dot(d, s);
  float g = SL_G_M;
  float phR = 3.0 / (16.0 * 3.14159265) * (1.0 + mu * mu);
  float phM = 3.0 / (8.0 * 3.14159265) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  float iso = SL_MS / (4.0 * 3.14159265);
  return sumR * SL_BETA_R * (phR + iso) + sumM * SL_BETA_M * (phM + iso);
}
`;
