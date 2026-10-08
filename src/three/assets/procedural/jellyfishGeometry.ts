import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Procedural Blue Blubber jellyfish (Catostylus mosaicus), normalised to a
 * 1.0 bell diameter so instances are scaled by true bell size (0.30–0.45 m).
 *
 * Anatomy: dense hemispherical bell with fine marginal lappets and no marginal
 * tentacles; eight short, thick oral arms clustered beneath it, each lumpy with
 * frilled mouth folds (the "cauliflower" mass seen in photos). Vertex attributes
 * drive the shader animation:
 *   aPart — 0 exumbrella, 0.25 subumbrella, 1 oral arm
 *   aT    — bell: 0 apex → 1 margin; arm: 0 root → 1 tip
 *   aAng  — angular position (radians)
 */
export interface JellyLod {
  thetaSegs: number;
  bellRings: number;
  lappets: number;
  arms: number;
  armRings: number;
  armSides: number;
  inner: boolean;
}

export const NEAR_LOD: JellyLod = { thetaSegs: 48, bellRings: 12, lappets: 24, arms: 8, armRings: 16, armSides: 10, inner: true };
export const FAR_LOD: JellyLod = { thetaSegs: 18, bellRings: 6, lappets: 0, arms: 4, armRings: 5, armSides: 6, inner: false };

const BELL_R = 0.5;
const BELL_H = 0.43;

function bellPoint(u: number, theta: number, lappets: number, inner: boolean, out: THREE.Vector3): void {
  const phi = u * (Math.PI / 2) * 1.05;
  let r = BELL_R * Math.pow(Math.sin(phi), 0.9);
  let y = BELL_H * Math.cos(phi) - 0.03;
  // Slight flattening of the crown for the dense, rounded Catostylus bell.
  y -= 0.035 * Math.pow(1 - u, 3);
  if (lappets > 0) {
    const m = THREE.MathUtils.smoothstep(u, 0.84, 1.0);
    const lobe = 1 - Math.abs(Math.cos(theta * lappets * 0.5));
    r *= 1 - 0.04 * lobe * m;
    y -= 0.018 * Math.pow(Math.abs(Math.sin(theta * lappets * 0.5)), 2) * m;
  }
  if (inner) {
    r *= 0.88;
    y = y * 0.78 - 0.045;
  }
  out.set(Math.cos(theta) * r, y, Math.sin(theta) * r);
}

function buildBell(lod: JellyLod, inner: boolean): THREE.BufferGeometry {
  const { thetaSegs, bellRings, lappets } = lod;
  const cols = thetaSegs + 1;
  const rows = bellRings + 1;
  const pos = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  const part = new Float32Array(cols * rows);
  const t = new Float32Array(cols * rows);
  const ang = new Float32Array(cols * rows);
  const v = new THREE.Vector3();
  let k = 0;
  for (let j = 0; j < rows; j++) {
    const u = Math.max(0.0005, j / bellRings);
    for (let i = 0; i < cols; i++) {
      const theta = (i / thetaSegs) * Math.PI * 2;
      bellPoint(u, theta, lappets, inner, v);
      pos[k * 3] = v.x;
      pos[k * 3 + 1] = v.y;
      pos[k * 3 + 2] = v.z;
      uv[k * 2] = i / thetaSegs;
      uv[k * 2 + 1] = u;
      part[k] = inner ? 0.25 : 0;
      t[k] = u;
      ang[k] = theta;
      k++;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < thetaSegs; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      if (inner) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
  g.setAttribute('aAng', new THREE.BufferAttribute(ang, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function buildArm(lod: JellyLod, a: number, armIndex: number): THREE.BufferGeometry {
  const { armRings, armSides } = lod;
  const cols = armSides + 1;
  const rows = armRings + 1;
  const pos = new Float32Array(cols * rows * 3);
  const uv = new Float32Array(cols * rows * 2);
  const part = new Float32Array(cols * rows).fill(1);
  const tt = new Float32Array(cols * rows);
  const ang = new Float32Array(cols * rows).fill(a);
  // Short and thick: about the bell's height, rooted together under the bell and flaring a little.
  const len = 0.4 + 0.05 * Math.sin(armIndex * 2.3);
  const frill = lod.armSides >= 8;
  const smooth = THREE.MathUtils.smoothstep;
  let k = 0;
  for (let j = 0; j < rows; j++) {
    const t = j / armRings;
    const spread = 0.045 + 0.085 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.6);
    const cx = Math.cos(a) * spread;
    const cz = Math.sin(a) * spread;
    const cy = -0.05 - len * t;
    // Thick fused root, swelling frilled body, rounded closed tip.
    let radius = 0.06 + 0.055 * Math.sin(Math.min(1, t * 1.35) * Math.PI);
    if (t > 0.84) radius *= Math.cos(((t - 0.84) / 0.16) * Math.PI * 0.5);
    for (let i = 0; i < cols; i++) {
      const psi = (i / armSides) * Math.PI * 2;
      let r = radius;
      if (frill) {
        // Cauliflower mouth folds: lumps at three scales, strongest mid-arm, calm at the root.
        const lump =
          0.5 * Math.sin(psi * 5 + t * 19 + armIndex * 1.7) * Math.sin(t * 27 + psi * 2 + armIndex) +
          0.3 * Math.sin(psi * 9 - t * 31 + armIndex * 0.9) +
          0.2 * Math.sin(psi * 13 + t * 47);
        r *= 1 + 0.45 * lump * smooth(t, 0.08, 0.3) * (1 - 0.5 * smooth(t, 0.85, 1));
      } else {
        r *= 1.12;
      }
      // Cross-section frame: radial (outward) and tangential directions around the bell axis.
      const ox = Math.cos(a) * Math.cos(psi) * r - Math.sin(a) * Math.sin(psi) * r;
      const oz = Math.sin(a) * Math.cos(psi) * r + Math.cos(a) * Math.sin(psi) * r;
      pos[k * 3] = cx + ox;
      pos[k * 3 + 1] = cy;
      pos[k * 3 + 2] = cz + oz;
      uv[k * 2] = i / armSides;
      uv[k * 2 + 1] = t;
      tt[k] = t;
      k++;
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < armSides; i++) {
      const p = j * cols + i;
      idx.push(p, p + 1, p + cols, p + 1, p + cols + 1, p + cols);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  g.setAttribute('aT', new THREE.BufferAttribute(tt, 1));
  g.setAttribute('aAng', new THREE.BufferAttribute(ang, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildJellyfishGeometry(lod: JellyLod): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [buildBell(lod, false)];
  if (lod.inner) parts.push(buildBell(lod, true));
  for (let i = 0; i < lod.arms; i++) {
    const a = (i / lod.arms) * Math.PI * 2 + 0.2;
    parts.push(buildArm(lod, a, i));
  }
  const g = mergeGeometries(parts, false)!;
  g.computeBoundingSphere();
  return g;
}

/**
 * Adapt an arbitrary jellyfish mesh (e.g. a Hyper3D GLB) to the animation
 * attributes: normalise to a 1.0 bell diameter and derive aPart/aT/aAng from
 * vertex height so the same shader can pulse the bell and sway the arms.
 */
export function adaptExternalJellyGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = source.index ? source.toNonIndexed() : source.clone();
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  const size = new THREE.Vector3();
  bb.getSize(size);
  const diameter = Math.max(size.x, size.z) || 1;
  const s = 1 / diameter;
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  g.translate(-cx, -bb.max.y, -cz);
  g.scale(s, s, s);
  // Bell top now at y = 0; shift so the bell centre sits near the origin like the procedural model.
  g.translate(0, BELL_H - 0.03, 0);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const n = pos.count;
  const part = new Float32Array(n);
  const t = new Float32Array(n);
  const ang = new Float32Array(n);
  const marginY = -0.03;
  const totalH = size.y * s;
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    ang[i] = Math.atan2(z, x);
    if (y >= marginY - 0.02) {
      part[i] = 0;
      t[i] = THREE.MathUtils.clamp(Math.hypot(x, z) / BELL_R, 0, 1);
    } else {
      part[i] = 1;
      t[i] = THREE.MathUtils.clamp((marginY - y) / Math.max(totalH - BELL_H, 0.2), 0, 1);
    }
  }
  g.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
  g.setAttribute('aAng', new THREE.BufferAttribute(ang, 1));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  for (const name of Object.keys(g.attributes)) {
    if (!['position', 'normal', 'uv', 'aPart', 'aT', 'aAng'].includes(name)) g.deleteAttribute(name);
  }
  g.computeBoundingSphere();
  return g;
}
