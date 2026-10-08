import * as THREE from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SITE, seabedDepth } from '../../config/site';
import { pointAtArc, type CurtainLayout } from '../../simulation/geometry';

export type CameraPreset = 'aerial' | 'top' | 'underwater' | 'curtain' | 'throat' | 'intake' | 'release' | 'compare' | 'free';

export const CAMERA_PRESETS: Array<{ key: Exclude<CameraPreset, 'free' | 'compare'>; label: string }> = [
  { key: 'top', label: 'Top' },
  { key: 'aerial', label: 'Perspective' },
  { key: 'underwater', label: 'Underwater' },
  { key: 'curtain', label: 'Curtain' },
  { key: 'throat', label: 'Throat' },
  { key: 'intake', label: 'Intake' },
  { key: 'release', label: 'Release' },
];

export interface CameraPose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
}

/** Perspective preset on a wide screen: from offshore and slightly upstream, about 49° down. */
const AERIAL_TARGET = new THREE.Vector3(-18.6, 0, -10.2);
const AERIAL_OFFSET = new THREE.Vector3(-15.9, 137.4, 120.6);
const _cam = new THREE.PerspectiveCamera();
const _p = new THREE.Vector3();

/**
 * Perspective preset for a canvas aspect: the wide-screen framing, moved upstream and back just
 * enough to keep in view where a run's bloom starts (upstream of the curtain's anchor) as well
 * as the throat and the intake.
 */
function aerialPose(layout: CurtainLayout, aspect: number, fov: number): CameraPose {
  const keep: Array<[number, number, number]> = [
    [layout.upstream.x - 22, -1, layout.upstream.z + 3],
    [layout.upstream.x - 22, -1, -8],
    [layout.throat.mx, 0, layout.throat.mz],
    [SITE.intake.x1, SITE.intake.deckY, SITE.intake.mouthZ],
  ];
  _cam.fov = fov;
  _cam.aspect = aspect;
  _cam.updateProjectionMatrix();
  const fits = (tx: number, scale: number) => {
    _cam.position.set(tx, 0, AERIAL_TARGET.z).addScaledVector(AERIAL_OFFSET, scale);
    _cam.lookAt(tx, 0, AERIAL_TARGET.z);
    _cam.updateMatrixWorld();
    for (const k of keep) {
      _p.set(k[0], k[1], k[2]).project(_cam);
      if (Math.abs(_p.x) > 0.94 || Math.abs(_p.y) > 0.94) return false;
    }
    return true;
  };
  let best = { tx: AERIAL_TARGET.x, scale: 2.2 };
  for (let shift = 0; shift <= 60; shift += 3) {
    const tx = AERIAL_TARGET.x - shift;
    if (!fits(tx, 2.2)) continue;
    let lo = 1;
    let hi = 2.2;
    if (!fits(tx, lo)) {
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (fits(tx, mid)) hi = mid;
        else lo = mid;
      }
    } else hi = lo;
    if (hi < best.scale - 1e-3) best = { tx, scale: hi };
  }
  const target = new THREE.Vector3(best.tx, 0, AERIAL_TARGET.z);
  return { pos: target.clone().addScaledVector(AERIAL_OFFSET, best.scale), target };
}

/** Camera presets derived from the active anchor layout and the reference site (`aspect` and `fov` of the view). */
export function presetPose(key: Exclude<CameraPreset, 'free'>, layout: CurtainLayout, aspect = 16 / 9, fov = 42): CameraPose {
  const th = layout.throat;
  switch (key) {
    case 'top':
      // Framed so the land strip, not the curtain's upstream end, sits under the Live headline (top left).
      return { pos: new THREE.Vector3(-14, 330, -3.99), target: new THREE.Vector3(-14, 0, -4) };
    case 'compare':
      return { pos: new THREE.Vector3(-42, 292, 92), target: new THREE.Vector3(-40, -2, -22) };
    case 'underwater': {
      // Downstream section, looking along the bloom face toward the throat where guided traffic converges.
      const p = pointAtArc(layout, layout.length * 0.78);
      return {
        pos: new THREE.Vector3(p.x + p.nx * 7.5 - p.tx * 8, -2.5, p.z + p.nz * 7.5 - p.tz * 8),
        target: new THREE.Vector3(p.x + p.tx * 9 + p.nx * 0.6, -1.7, p.z + p.tz * 9 + p.nz * 0.6),
      };
    }
    case 'curtain': {
      const p = pointAtArc(layout, layout.length * 0.55);
      return {
        pos: new THREE.Vector3(p.x + p.nx * 26 - p.tx * 22, 11, p.z + p.nz * 26 - p.tz * 22),
        target: new THREE.Vector3(p.x + p.tx * 12, -1, p.z + p.tz * 12),
      };
    }
    case 'throat':
      return {
        pos: new THREE.Vector3(th.mx - 13, 6.5, th.mz + 12),
        target: new THREE.Vector3(th.mx + 3, -0.8, th.mz - 1),
      };
    case 'intake': {
      const cx = (SITE.intake.x0 + SITE.intake.x1) / 2;
      return { pos: new THREE.Vector3(cx - 8, 9, SITE.intake.mouthZ + 30), target: new THREE.Vector3(cx + 2, 0.5, SITE.intake.mouthZ) };
    }
    case 'release': {
      const r = SITE.release;
      return { pos: new THREE.Vector3(r.x - 30, 16, r.z + 26), target: new THREE.Vector3(r.x + 10, 0, r.z + 4) };
    }
    case 'aerial':
    default:
      return aerialPose(layout, aspect, fov);
  }
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Quintic ease (zero speed and acceleration at both ends) for long orbit swings. */
const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Flight paths: 'arc' lifts the camera along a quadratic curve (preset changes);
 * 'orbit' interpolates distance, tilt and heading around a moving target, so a
 * straight-down view can swing into a perspective view without spinning.
 */
export type FlightPath = 'arc' | 'orbit';

interface Tween {
  from: CameraPose;
  to: CameraPose;
  ctrl: THREE.Vector3;
  t: number;
  duration: number;
  path: FlightPath;
}

const _sphA = new THREE.Spherical();
const _sphB = new THREE.Spherical();
const _off = new THREE.Vector3();

/**
 * Pose at linear progress t (0..1) of an orbit flight — the curve flyTo(…, 'orbit')
 * follows: target lerped, distance in log space, shortest heading turn, eased.
 */
export function orbitPose(from: CameraPose, to: CameraPose, t: number, out: CameraPose): CameraPose {
  const k = smoother(t);
  _sphA.setFromVector3(_off.subVectors(from.pos, from.target));
  _sphB.setFromVector3(_off.subVectors(to.pos, to.target));
  let dTheta = _sphB.theta - _sphA.theta;
  while (dTheta > Math.PI) dTheta -= Math.PI * 2;
  while (dTheta < -Math.PI) dTheta += Math.PI * 2;
  const r = Math.exp(THREE.MathUtils.lerp(Math.log(_sphA.radius), Math.log(_sphB.radius), k));
  const phi = THREE.MathUtils.lerp(_sphA.phi, _sphB.phi, k);
  out.target.lerpVectors(from.target, to.target, k);
  out.pos.setFromSphericalCoords(r, phi, _sphA.theta + dTheta * k).add(out.target);
  return out;
}

/**
 * Smooth camera transitions between presets (no hard cuts). A quadratic arc
 * lifts long moves and dives cleanly through the surface for underwater views.
 * Any user interaction cancels the tween and hands control to OrbitControls.
 */
export class CameraRig {
  private tween: Tween | null = null;
  private readonly orbitOut: CameraPose = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  current: CameraPreset = 'aerial';
  /** World position to follow (e.g. a selected jellyfish). */
  followTarget: THREE.Vector3 | null = null;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly controls: OrbitControls;
  onPresetChange: ((p: CameraPreset) => void) | null = null;

  constructor(camera: THREE.PerspectiveCamera, controls: OrbitControls) {
    this.camera = camera;
    this.controls = controls;
    controls.addEventListener('start', () => {
      if (this.tween) this.tween = null;
      if (this.current !== 'free') {
        this.current = 'free';
        this.onPresetChange?.('free');
      }
    });
  }

  get transitioning(): boolean {
    return this.tween !== null;
  }

  /** Preset pose framed for this camera's current aspect. */
  pose(key: Exclude<CameraPreset, 'free'>, layout: CurtainLayout): CameraPose {
    return presetPose(key, layout, this.camera.aspect, this.camera.fov);
  }

  goTo(key: Exclude<CameraPreset, 'free'>, layout: CurtainLayout, duration = 1.7): void {
    const to = this.pose(key, layout);
    this.flyTo(to, duration);
    this.current = key;
    this.onPresetChange?.(key);
  }

  flyTo(to: CameraPose, duration = 1.6, path: FlightPath = 'arc'): void {
    const from: CameraPose = { pos: this.camera.position.clone(), target: this.controls.target.clone() };
    const mid = from.pos.clone().lerp(to.pos, 0.5);
    const dist = from.pos.distanceTo(to.pos);
    const crossing = (from.pos.y > 0) !== (to.pos.y > 0);
    const lift = Math.min(60, dist * 0.25);
    if (crossing) mid.y = Math.max(from.pos.y, to.pos.y, 6) + lift * 0.3;
    else if (to.pos.y > 0) mid.y = Math.max(mid.y, Math.max(from.pos.y, to.pos.y) + lift * 0.4);
    this.tween = { from, to: { pos: to.pos.clone(), target: to.target.clone() }, ctrl: mid, t: 0, duration, path };
  }

  /** Place the camera at an exact pose (no transition; the active preset is unchanged). */
  setPose(pose: CameraPose): void {
    this.tween = null;
    this.camera.position.copy(pose.pos);
    this.controls.target.copy(pose.target);
    this.controls.update();
  }

  private applyTween(tw: Tween): void {
    if (tw.path === 'orbit') {
      orbitPose(tw.from, tw.to, tw.t, this.orbitOut);
      this.camera.position.copy(this.orbitOut.pos);
      this.controls.target.copy(this.orbitOut.target);
      return;
    }
    const k = ease(tw.t);
    const a = tw.from.pos;
    const b = tw.to.pos;
    const c = tw.ctrl;
    const u = 1 - k;
    this.camera.position.set(u * u * a.x + 2 * u * k * c.x + k * k * b.x, u * u * a.y + 2 * u * k * c.y + k * k * b.y, u * u * a.z + 2 * u * k * c.z + k * k * b.z);
    this.controls.target.lerpVectors(tw.from.target, tw.to.target, k);
  }

  snap(key: Exclude<CameraPreset, 'free'>, layout: CurtainLayout): void {
    const p = this.pose(key, layout);
    this.camera.position.copy(p.pos);
    this.controls.target.copy(p.target);
    this.current = key;
    this.tween = null;
    this.controls.update();
  }

  update(dt: number): void {
    if (this.tween) {
      const tw = this.tween;
      tw.t = Math.min(1, tw.t + dt / tw.duration);
      this.applyTween(tw);
      if (tw.t >= 1) this.tween = null;
    } else if (this.followTarget) {
      const delta = this.followTarget.clone().sub(this.controls.target).multiplyScalar(Math.min(1, dt * 2.5));
      this.controls.target.add(delta);
      this.camera.position.add(delta);
    }
    this.controls.update();
    // Never below the seabed.
    const floor = -seabedDepth(this.camera.position.x, this.camera.position.z) + 0.6;
    if (this.camera.position.y < floor) this.camera.position.y = floor;
  }
}
