import * as THREE from 'three';
import { S_FREE_DRIFT, S_INACTIVE, S_INTAKE_CONTACT, S_TRANSFERRED, S_UNDER_SKIRT } from '../../simulation/Agent';
import type { SimulationEngine } from '../../simulation/SimulationEngine';
import { MEDIUM_GLSL, SHARED } from '../environment/shaderChunks';

/** Distance-based legibility scaling: true scale up close, enlarged at aerial distances. */
export const LEGIBILITY = { start: 12, perMetre: 1 / 15, max: 11 };

/** Height of the bell crown above the instance origin, in bell diameters (see jellyfishGeometry). */
const BELL_TOP = 0.37;

export function jellyShader(map: THREE.Texture | null): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: SHARED.uTime,
      uSunDir: SHARED.uSunDir,
      uSunColor: SHARED.uSunColor,
      uWaterExtinction: SHARED.uWaterExtinction,
      uWaterScatter: SHARED.uWaterScatter,
      uHazeColor: SHARED.uHazeColor,
      uHazeDensity: SHARED.uHazeDensity,
      uFlowDim: { value: 0 },
      uStateColors: { value: 0 },
      uMap: { value: map },
      uHasMap: { value: map ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec4 aData;   // phase, tint, alpha, state (+16 when selected)
      attribute float aPart;
      attribute float aT;
      attribute float aAng;
      uniform float uTime;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying vec3 vWorld;
      varying float vPart;
      varying float vT;
      varying vec4 vData;
      varying vec2 vUv;
      void main() {
        float ph = aData.x * 6.2831853 + uTime * 4.0;
        float c = pow(0.5 + 0.5 * sin(ph), 2.0);
        vec3 p = position;
        if (aPart < 0.5) {
          float m = smoothstep(0.15, 1.0, aT);
          p.xz *= 1.0 - 0.13 * c * m;
          p.y = p.y * (1.0 + 0.07 * c) - 0.025 * c * m;
        } else {
          float w = aT * aT;
          p.x += sin(ph * 0.5 - aT * 2.6 + aAng) * 0.05 * w + 0.025 * c * w * cos(aAng);
          p.z += cos(ph * 0.5 - aT * 2.2 + aAng * 1.3) * 0.05 * w + 0.025 * c * w * sin(aAng);
          p.y += 0.045 * c * aT;
        }
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vViewPos = mv.xyz;
        vNormalV = normalize(normalMatrix * (mat3(instanceMatrix) * normal));
        vPart = aPart;
        vT = aT;
        vData = aData;
        vUv = uv;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uStateColors;
      uniform sampler2D uMap;
      uniform float uHasMap;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying vec3 vWorld;
      varying float vPart;
      varying float vT;
      varying vec4 vData;
      varying vec2 vUv;
      ${MEDIUM_GLSL}
      vec3 stateColor(float s) {
        if (s < 1.5) return vec3(0.75, 0.86, 1.0);       // approaching
        if (s < 2.5) return vec3(0.15, 0.85, 0.95);      // guided
        if (s < 3.5) return vec3(1.0, 0.36, 0.3);        // under skirt
        if (s < 4.5) return vec3(1.0, 0.72, 0.25);       // transfer queue
        if (s < 6.5) return vec3(0.3, 0.95, 0.6);        // released
        if (s < 7.5) return vec3(1.0, 0.25, 0.25);       // intake contact
        return vec3(0.6, 0.7, 0.85);                     // free drift
      }
      void main() {
        bool selected = vData.w > 15.5;
        float state = mod(vData.w, 16.0);
        vec3 N = normalize(vNormalV);
        if (!gl_FrontFacing) N = -N;
        vec3 V = normalize(-vViewPos);
        vec3 L = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
        float NdV = abs(dot(N, V));
        float rim = pow(1.0 - NdV, 2.2);
        float wrap = max(dot(N, L) * 0.5 + 0.5, 0.0);
        float back = pow(max(dot(V, -L), 0.0), 3.0);
        float tint = vData.y;
        vec3 hue = tint < 0.34 ? vec3(0.55, 0.72, 0.98) : tint < 0.68 ? vec3(0.78, 0.87, 0.98) : vec3(0.5, 0.88, 0.95);
        vec3 base = mix(vec3(0.74, 0.82, 0.92), hue, 0.6);
        if (uHasMap > 0.5) base = mix(base, texture2D(uMap, vUv).rgb, 0.65);
        vec3 col;
        float alpha;
        if (vPart < 0.6) {
          // Fine granular "mosaic" speckle of the exumbrella.
          vec2 g = vUv * vec2(56.0, 20.0);
          float speck = smoothstep(0.32, 0.0, length(fract(g) - 0.5)) * (1.0 - vT * 0.6);
          col = base * (0.26 + wrap * uSunColor * 0.42) + base * back * 0.35;
          col += speck * vec3(0.1, 0.12, 0.18);
          col += (1.0 - vT) * vec3(0.05, 0.07, 0.15);
          col += rim * vec3(0.4, 0.58, 0.8) * 0.45;
          alpha = (vPart > 0.1 ? 0.16 : 0.22) + 0.42 * rim;
        } else {
          vec3 armC = mix(vec3(0.86, 0.88, 0.95), hue, 0.25);
          col = armC * (0.3 + wrap * uSunColor * 0.42) + rim * vec3(0.3, 0.42, 0.55) * 0.35;
          alpha = 0.4 + 0.2 * rim - 0.22 * vT;
        }
        if (uStateColors > 0.5) {
          vec3 sc = stateColor(state);
          col = mix(col, sc * 0.9, 0.62);
          alpha = max(alpha, 0.55);
        }
        if (selected) {
          col = mix(col, vec3(0.3, 0.95, 1.0), 0.45) + rim * 0.5;
          alpha = max(alpha, 0.8);
        }
        // Underwater: sunlight from above rim-lights the bell; applied before the water fog so distance still hides it.
        float under = 1.0 - step(0.0, cameraPosition.y);
        col += under * (vPart < 0.6 ? 0.24 : 0.12) * rim * vec3(0.7, 0.9, 1.0);
        alpha = mix(alpha, min(1.0, alpha * 1.25 + 0.06), under);
        col = slMedium(col, vWorld);
        // Legibility at aerial distances: agents are already enlarged; give them a soft
        // self-lit edge so the bloom reads through the surface. Up close the look is physical.
        float far = smoothstep(30.0, 140.0, length(cameraPosition - vWorld)) * step(0.0, cameraPosition.y);
        col += far * (vPart < 0.6 ? 0.58 : 0.3) * (0.55 + 0.45 * rim) * mix(vec3(0.62, 0.84, 1.0), hue, 0.3);
        alpha = mix(alpha, min(1.0, alpha * 1.55 + 0.22), far);
        gl_FragColor = vec4(col, alpha * vData.z);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

interface LodMesh {
  mesh: THREE.InstancedMesh;
  data: THREE.InstancedBufferAttribute;
  slots: Int32Array;
  count: number;
}

const NEAR_DISTANCE = 45;

/**
 * Renders one engine's agents as two instanced LODs. Updated every frame
 * straight from the engine's typed arrays — no React involvement.
 */
export class JellyfishSystem {
  readonly group = new THREE.Group();
  readonly near: LodMesh;
  far: LodMesh;
  readonly material: THREE.ShaderMaterial;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qYaw = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly pos = new THREE.Vector3();
  private readonly scl = new THREE.Vector3();
  selectedId = -1;

  constructor(nearGeo: THREE.BufferGeometry, farGeo: THREE.BufferGeometry, material: THREE.ShaderMaterial, capacity: number, name: string) {
    this.material = material;
    this.group.name = name;
    this.near = this.makeLod(nearGeo, 420);
    this.far = this.makeLod(farGeo, capacity);
    this.near.mesh.renderOrder = 6;
    this.far.mesh.renderOrder = 5;
    this.group.add(this.far.mesh, this.near.mesh);
  }

  private makeLod(geo: THREE.BufferGeometry, cap: number): LodMesh {
    const g = geo.clone();
    const data = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    data.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aData', data);
    const mesh = new THREE.InstancedMesh(g, this.material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.userData.pick = 'jelly';
    return { mesh, data, slots: new Int32Array(cap), count: 0 };
  }

  /** Grow the far LOD if the engine's pool outgrew it. */
  ensureCapacity(cap: number): void {
    if (cap <= this.far.slots.length) return;
    const geo = this.far.mesh.geometry;
    this.group.remove(this.far.mesh);
    this.far.mesh.dispose();
    const fresh = this.makeLod(geo, cap);
    this.far = fresh;
    fresh.mesh.renderOrder = 5;
    this.group.add(fresh.mesh);
  }

  update(engine: SimulationEngine, camera: THREE.Camera, legibility: boolean): void {
    const p = engine.pool;
    this.ensureCapacity(p.capacity);
    const cam = camera.position;
    const near = this.near;
    const far = this.far;
    near.count = 0;
    far.count = 0;
    const nm = near.mesh.instanceMatrix.array as Float32Array;
    const fm = far.mesh.instanceMatrix.array as Float32Array;
    const nd = near.data.array as Float32Array;
    const fd = far.data.array as Float32Array;
    const nearCap = near.slots.length;
    const farCap = far.slots.length;
    const { state, px, py, pz, vx, vz, size, phase, tint, fade, id } = p;
    for (let i = 0; i < p.capacity; i++) {
      const st = state[i];
      if (st === S_INACTIVE || st === S_TRANSFERRED) continue;
      const x = px[i];
      const y = py[i];
      const z = pz[i];
      const dx = x - cam.x;
      const dy = y - cam.y;
      const dz = z - cam.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      let boost = 1;
      if (legibility && dist > LEGIBILITY.start) boost = Math.min(LEGIBILITY.max, 1 + (dist - LEGIBILITY.start) * LEGIBILITY.perMetre);
      const s = size[i] * boost;
      // Enlarged bells are flattened a little and kept below the surface, so they never sit on top of the water.
      const flat = boost > 1 ? 1 - 0.22 * Math.min(1, (boost - 1) / 6) : 1;
      const yv = boost > 1 ? Math.min(y, -BELL_TOP * s * flat - 0.35) : y;
      // Bell axis tilts gently into the direction of travel.
      const hvx = vx[i];
      const hvz = vz[i];
      const hv = Math.sqrt(hvx * hvx + hvz * hvz);
      const tilt = Math.min(0.42, hv * 1.1);
      if (hv > 1e-4) {
        this.axis.set(hvz / hv, 0, -hvx / hv);
        this.q.setFromAxisAngle(this.axis, tilt);
      } else this.q.identity();
      this.qYaw.setFromAxisAngle(this.up, phase[i] * 6.283);
      this.q.multiply(this.qYaw);
      this.pos.set(x, yv, z);
      this.scl.set(s, s * flat, s);
      this.m.compose(this.pos, this.q, this.scl);
      const selected = id[i] === this.selectedId;
      let alpha = fade[i];
      if (st === S_INTAKE_CONTACT) alpha *= 0.85;
      const stateCode = st === S_FREE_DRIFT && p.flags[i] & 2 ? S_UNDER_SKIRT : st;
      const useNear = (dist < NEAR_DISTANCE || selected) && near.count < nearCap;
      if (useNear) {
        const k = near.count++;
        this.m.toArray(nm, k * 16);
        nd[k * 4] = phase[i];
        nd[k * 4 + 1] = tint[i];
        nd[k * 4 + 2] = alpha;
        nd[k * 4 + 3] = stateCode + (selected ? 16 : 0);
        near.slots[k] = i;
      } else if (far.count < farCap) {
        const k = far.count++;
        this.m.toArray(fm, k * 16);
        fd[k * 4] = phase[i];
        fd[k * 4 + 1] = tint[i];
        fd[k * 4 + 2] = alpha;
        fd[k * 4 + 3] = stateCode + (selected ? 16 : 0);
        far.slots[k] = i;
      }
    }
    for (const lod of [near, far]) {
      lod.mesh.count = lod.count;
      lod.mesh.instanceMatrix.clearUpdateRanges();
      lod.mesh.instanceMatrix.addUpdateRange(0, lod.count * 16);
      lod.mesh.instanceMatrix.needsUpdate = true;
      lod.data.clearUpdateRanges();
      lod.data.addUpdateRange(0, lod.count * 4);
      lod.data.needsUpdate = true;
    }
  }

  setStateColors(on: boolean): void {
    this.material.uniforms.uStateColors.value = on ? 1 : 0;
  }

  /** Resolve a raycast hit on one of the LOD meshes to a pool slot. */
  slotFor(mesh: THREE.Object3D, instanceId: number): number {
    if (mesh === this.near.mesh) return this.near.slots[instanceId] ?? -1;
    if (mesh === this.far.mesh) return this.far.slots[instanceId] ?? -1;
    return -1;
  }
}
