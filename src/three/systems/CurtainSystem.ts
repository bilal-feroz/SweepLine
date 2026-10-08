import * as THREE from 'three';
import { ASSUMPTIONS } from '../../config/assumptions';
import { SEABED_DEPTH_GLSL, seabedDepth } from '../../config/site';
import { getCurtainLayout, pointAtArc, type CurtainLayout } from '../../simulation/geometry';
import type { CurtainState } from '../../simulation/curtain';
import { ANCHOR_ANGLES, type AnchorAngle } from '../../simulation/types';
import { WAVES_GLSL, waveElevation } from '../../simulation/waves';
import { CAUSTIC_GLSL, MEDIUM_GLSL, SHARED, mediumMaterial } from '../environment/shaderChunks';
import { makeFoamSprite } from '../environment/textures';

const SKIRT_ROWS = 14;
/** Surface white-water rings where pop-up sections surface: pool size and lifetime (real seconds). */
const FOAM = 48;
const FOAM_LIFE = 2.4;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Float-line height from rise progress — the first part of the rise is the float inflating on the seabed (same curve as the skirt shader). */
const liftOf = (rise: number) => smooth(0.08, 1, rise);

function skirtMaterial(ballast: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColumns: { value: null as THREE.DataTexture | null },
      uColumnCount: { value: 1 },
      uSkirtDepth: { value: 3 },
      uLiftTan: { value: 0 },
      uWaveAmp: SHARED.uWaveAmp,
      uWaveTime: SHARED.uWaveTime,
      uTime: SHARED.uTime,
      uSunDir: SHARED.uSunDir,
      uSunColor: SHARED.uSunColor,
      uWaterExtinction: SHARED.uWaterExtinction,
      uWaterScatter: SHARED.uWaterScatter,
      uHazeColor: SHARED.uHazeColor,
      uHazeDensity: SHARED.uHazeDensity,
      uFlowDim: SHARED.uFlowDim,
      uCaustics: SHARED.uCaustics,
      uCausticFocus: SHARED.uCausticFocus,
      uSunRefr: SHARED.uSunRefr,
      uRippleMap: SHARED.uRippleMap,
      uHighlight: { value: 0 },
      uFouling: { value: 0 },
      uModule: { value: ASSUMPTIONS.curtain.moduleLength },
    },
    vertexShader: /* glsl */ `
      ${WAVES_GLSL}
      ${SEABED_DEPTH_GLSL}
      attribute float aCol;
      attribute float aV;
      attribute float aS;
      attribute vec2 aN;
      attribute vec2 aRing;
      uniform sampler2D uColumns;
      uniform float uColumnCount;
      uniform float uSkirtDepth;
      uniform float uLiftTan;
      uniform float uTime;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vV;
      varying float vS;
      varying float vFrac;
      varying float vReef;
      varying float vLaid;
      void main() {
        vec4 cd = texture2D(uColumns, vec2((aCol + 0.5) / uColumnCount, 0.5));
        float frac = cd.r;
        float reef = cd.g;
        float rise = cd.b;
        float present = cd.a;
        vec2 slope;
        float eta = waveElevation(position.xz, slope);
        float floorY = 0.06 - seabedDepth(position.xz);
        // Float line: inflating on the seabed, rising through the water column, then riding the waves.
        float lift = smoothstep(0.08, 1.0, rise);
        float top = mix(floorY + 0.24, eta + 0.06, lift);
        float depth = uSkirtDepth * frac;
        float v = ${ballast ? '1.0' : 'aV'};
        vec3 p = vec3(position.x, top - v * depth, position.z);
        float billow = (v * v * depth * uLiftTan * 0.85 + v * 0.05 * sin(uTime * 1.2 + aS * 0.31)) * lift;
        p.xz -= aN * billow;
        // Skirt that reaches the seabed lies folded along the bottom on the lee side.
        float spill = max(floorY - p.y, 0.0);
        p.y += spill;
        p.xz -= aN * spill * 0.55;
        ${ballast ? 'p.xz += aN * aRing.x; p.y += aRing.y;' : ''}
        if (present < 0.5) p.y = top + 0.02;
        vWorld = p;
        vec3 nrm = normalize(vec3(aN.x, 0.25 * uLiftTan * v, aN.y));
        ${ballast ? 'nrm = normalize(vec3(aN.x * aRing.x, aRing.y, aN.y * aRing.x));' : 'nrm = spill > 0.001 ? vec3(0.0, 1.0, 0.0) : nrm;'}
        vNormalW = nrm;
        vV = v;
        vS = aS;
        vFrac = frac;
        vReef = reef;
        vLaid = present;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform float uHighlight;
      uniform float uFouling;
      uniform float uModule;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vV;
      varying float vS;
      varying float vFrac;
      varying float vReef;
      varying float vLaid;
      ${MEDIUM_GLSL}
      ${CAUSTIC_GLSL}
      float foulHash(vec2 i) { return fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453); }
      float foulNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(foulHash(i), foulHash(i + vec2(1.0, 0.0)), f.x), mix(foulHash(i + vec2(0.0, 1.0)), foulHash(i + vec2(1.0, 1.0)), f.x), f.y);
      }
      void main() {
        if (vLaid < 0.5) discard;
        vec3 N = normalize(vNormalW);
        if (!gl_FrontFacing) N = -N;
        float diff = max(dot(N, uSunDir), 0.0) * 0.7 + 0.3;
        // Smooth dark-teal skirt fabric with module joints and a weighted lower edge.
        vec3 base = mix(vec3(0.035, 0.085, 0.09), vec3(0.05, 0.1, 0.1), smoothstep(0.0, 1.0, vV));
        float joint = 1.0 - smoothstep(0.0, 0.18, abs(fract(vS / uModule + 0.5) - 0.5) * uModule);
        base = mix(base, vec3(0.015, 0.03, 0.035), joint * 0.85);
        ${ballast ? 'base = vec3(0.09, 0.1, 0.1);' : 'base = mix(base, vec3(0.02, 0.025, 0.028), smoothstep(0.93, 0.97, vV));'}
        // High-visibility band just below the float line.
        ${ballast ? '' : 'base = mix(base, vec3(0.7, 0.42, 0.06), (1.0 - smoothstep(0.0, 0.035, vV)) * 0.8);'}
        base = mix(base, vec3(0.16, 0.17, 0.17), vReef * 0.7);
        if (uFouling > 0.001) {
          // Debris and bio-fouling: olive-brown patches that spread with the load, heaviest near the float line.
          float n = 0.65 * foulNoise(vec2(vS * 0.55, vV * 5.0)) + 0.35 * foulNoise(vec2(vS * 2.1, vV * 17.0)) + (1.0 - vV) * 0.18;
          float cover = smoothstep(1.02 - uFouling, 1.22 - uFouling, n);
          base = mix(base, vec3(0.12, 0.11, 0.045), cover * 0.9);
        }
        vec3 col = base * (diff * uSunColor * 0.9 + vec3(0.18, 0.26, 0.3));
        float foot = length(fwidth(vWorld.xz));
        if (vWorld.y < 0.0) {
          // Caustics play over the sunlit face of the fabric.
          float sunlit = max(dot(N, uSunDir), 0.0) * 0.63;
          col += base * uSunColor * sunlit * (slCaustic(vWorld, foot) - 1.0) * uCaustics * 1.6;
        }
        col += vec3(0.1, 0.65, 0.75) * uHighlight * 0.25 * (0.6 + 0.4 * sin(vS * 0.5 - uTime * 2.0));
        col = slMedium(col, vWorld);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.DoubleSide,
  });
}

/** Shadow-map pass for the GPU-displaced skirt: same vertex shader and uniforms, depth only. */
function skirtDepthMaterial(src: THREE.ShaderMaterial): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: src.uniforms,
    vertexShader: src.vertexShader,
    fragmentShader: /* glsl */ `
      varying float vLaid;
      void main() {
        if (vLaid < 0.5) discard;
        gl_FragColor = vec4(1.0);
      }
    `,
    side: THREE.DoubleSide,
  });
}

interface FloatSlot {
  s: number;
  x: number;
  z: number;
  tx: number;
  tz: number;
  /** Seabed height under the float (m, negative). */
  floor: number;
  connector: boolean;
}

/**
 * Renders the SweepLine guide curtain from the simulation's CurtainState:
 * floats on the shared sea state, a GPU-displaced skirt (deploy / reef /
 * blow-back / heave), weighted lower edge, module joints, anchors and the
 * pre-engineered anchor-layout previews. A pop-up curtain is drawn through its
 * whole cycle: stowed flat on the seabed, floats inflating as the front passes,
 * each section rising with its skirt peeling off the bottom, white water as it
 * surfaces, and its marker buoys coming up with it.
 */
export class CurtainSystem {
  readonly group = new THREE.Group();
  private layout: CurtainLayout;
  private skirt!: THREE.Mesh;
  private ballast!: THREE.Mesh;
  private readonly skirtMat = skirtMaterial(false);
  private readonly skirtDepth = skirtDepthMaterial(this.skirtMat);
  private readonly ballastMat = skirtMaterial(true);
  private columnTex!: THREE.DataTexture;
  private columnData!: Uint8Array;
  private floats!: THREE.InstancedMesh;
  private connectors!: THREE.InstancedMesh;
  private floatSlots: FloatSlot[] = [];
  /** Last rendered rise per float (foam spawns where a section surfaces). */
  private prevRise = new Float32Array(0);
  private risePrimed = false;
  private readonly foam: THREE.InstancedMesh;
  private readonly foamX = new Float32Array(FOAM);
  private readonly foamZ = new Float32Array(FOAM);
  private readonly foamRot = new Float32Array(FOAM);
  private readonly foamAge = new Float32Array(FOAM).fill(FOAM_LIFE);
  private foamNext = 0;
  private lastTime = 0;
  private readonly buoys = new THREE.Group();
  private readonly anchorBlocks = new THREE.Group();
  private readonly previews = new THREE.Group();
  readonly reefMarker: THREE.Mesh;
  private readonly floatMat = mediumMaterial({ color: 0xf59e0b, roughness: 0.42, metalness: 0.05, emissive: 0x2a1500 }, false);
  private readonly tmpM = new THREE.Matrix4();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpP = new THREE.Vector3();
  private readonly tmpS = new THREE.Vector3();
  private readonly tmpC = new THREE.Color();
  private readonly pitchQ = new THREE.Quaternion();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly zAxis = new THREE.Vector3(0, 0, 1);
  private readonly amber = new THREE.Color(0xf59e0b);
  private readonly reefed = new THREE.Color(0x5b6166);
  /** A deflated float tube reads dull and dark. */
  private readonly deflated = new THREE.Color(0x6b4a1c);
  /** Floats under debris and fouling. */
  private readonly fouled = new THREE.Color(0x5e5a2a);
  private customFloat: THREE.BufferGeometry | null = null;

  constructor(initial: AnchorAngle) {
    this.group.name = 'curtain';
    this.layout = getCurtainLayout(initial);
    this.buildAnchorBlocks();
    this.buildPreviews();
    this.group.add(this.buoys, this.anchorBlocks, this.previews);
    this.reefMarker = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 2.0, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xf5b94c, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.reefMarker.renderOrder = 22;
    this.reefMarker.visible = false;
    this.group.add(this.reefMarker);
    this.foam = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: makeFoamSprite(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
      FOAM,
    );
    this.foam.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.foam.frustumCulled = false;
    this.foam.renderOrder = 12;
    this.foam.name = 'curtain-foam';
    for (let k = 0; k < FOAM; k++) {
      this.foam.setMatrixAt(k, this.tmpM.makeScale(0, 0, 0));
      this.foam.setColorAt(k, this.tmpC.setScalar(0));
    }
    this.group.add(this.foam);
    this.rebuild(this.layout);
  }

  /** Use a GLB float element instead of the procedural float (instanced along the line). */
  setFloatGeometry(geo: THREE.BufferGeometry): void {
    this.customFloat = geo;
    this.rebuild(this.layout);
  }

  get currentLayout(): CurtainLayout {
    return this.layout;
  }

  private rebuild(layout: CurtainLayout): void {
    this.layout = layout;
    for (const obj of [this.skirt, this.ballast, this.floats, this.connectors]) {
      if (obj) {
        this.group.remove(obj);
        obj.geometry.dispose();
      }
    }
    const L = layout;
    const cols = L.n;
    // Skirt strip.
    const rows = SKIRT_ROWS + 1;
    const pos = new Float32Array(cols * rows * 3);
    const aCol = new Float32Array(cols * rows);
    const aV = new Float32Array(cols * rows);
    const aS = new Float32Array(cols * rows);
    const aN = new Float32Array(cols * rows * 2);
    for (let i = 0; i < cols; i++) {
      const k = Math.min(i, L.segCount - 1);
      const kp = Math.max(0, i - 1);
      const nx = (L.nx[k] + L.nx[kp]) * 0.5;
      const nz = (L.nz[k] + L.nz[kp]) * 0.5;
      const nl = Math.hypot(nx, nz) || 1;
      for (let j = 0; j < rows; j++) {
        const v = j / SKIRT_ROWS;
        const o = j * cols + i;
        pos[o * 3] = L.px[i];
        pos[o * 3 + 1] = -v * 3;
        pos[o * 3 + 2] = L.pz[i];
        aCol[o] = i;
        aV[o] = v;
        aS[o] = L.ps[i];
        aN[o * 2] = nx / nl;
        aN[o * 2 + 1] = nz / nl;
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = j * cols + i;
        idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aCol', new THREE.BufferAttribute(aCol, 1));
    sg.setAttribute('aV', new THREE.BufferAttribute(aV, 1));
    sg.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
    sg.setAttribute('aN', new THREE.BufferAttribute(aN, 2));
    sg.setIndex(idx);
    sg.computeBoundingSphere();
    this.columnData = new Uint8Array(cols * 4);
    this.columnTex = new THREE.DataTexture(this.columnData, cols, 1, THREE.RGBAFormat);
    this.columnTex.magFilter = THREE.LinearFilter;
    this.columnTex.minFilter = THREE.LinearFilter;
    this.columnTex.needsUpdate = true;
    for (const m of [this.skirtMat, this.ballastMat]) {
      m.uniforms.uColumns.value = this.columnTex;
      m.uniforms.uColumnCount.value = cols;
    }
    this.skirt = new THREE.Mesh(sg, this.skirtMat);
    this.skirt.frustumCulled = false;
    this.skirt.userData.pick = 'curtain';
    this.skirt.name = 'curtain-skirt';
    // The skirt shades the seabed behind it (and cuts a gap in the caustics there).
    this.skirt.castShadow = true;
    this.skirt.customDepthMaterial = this.skirtDepth;

    // Weighted lower edge: a small tube following the skirt's bottom edge.
    const sides = 6;
    const bpos = new Float32Array(cols * sides * 3);
    const bCol = new Float32Array(cols * sides);
    const bS = new Float32Array(cols * sides);
    const bN = new Float32Array(cols * sides * 2);
    const bRing = new Float32Array(cols * sides * 2);
    for (let i = 0; i < cols; i++) {
      const k = Math.min(i, L.segCount - 1);
      for (let j = 0; j < sides; j++) {
        const o = i * sides + j;
        const a = (j / sides) * Math.PI * 2;
        bpos[o * 3] = L.px[i];
        bpos[o * 3 + 2] = L.pz[i];
        bCol[o] = i;
        bS[o] = L.ps[i];
        bN[o * 2] = L.nx[k];
        bN[o * 2 + 1] = L.nz[k];
        bRing[o * 2] = Math.cos(a) * 0.075;
        bRing[o * 2 + 1] = Math.sin(a) * 0.075;
      }
    }
    const bidx: number[] = [];
    for (let i = 0; i < cols - 1; i++) {
      for (let j = 0; j < sides; j++) {
        const a = i * sides + j;
        const b = i * sides + ((j + 1) % sides);
        bidx.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
    bg.setAttribute('aCol', new THREE.BufferAttribute(bCol, 1));
    bg.setAttribute('aV', new THREE.BufferAttribute(new Float32Array(cols * sides).fill(1), 1));
    bg.setAttribute('aS', new THREE.BufferAttribute(bS, 1));
    bg.setAttribute('aN', new THREE.BufferAttribute(bN, 2));
    bg.setAttribute('aRing', new THREE.BufferAttribute(bRing, 2));
    bg.setIndex(bidx);
    this.ballast = new THREE.Mesh(bg, this.ballastMat);
    this.ballast.frustumCulled = false;
    this.ballast.userData.pick = 'curtain';
    // The skirt shader also declares aRing for the shared source; give it a zero attribute.
    sg.setAttribute('aRing', new THREE.BufferAttribute(new Float32Array(cols * rows * 2), 2));

    // Floats and module connectors.
    this.floatSlots = [];
    const spacing = ASSUMPTIONS.curtain.floatSpacing;
    const moduleLen = ASSUMPTIONS.curtain.moduleLength;
    for (let s = spacing * 0.5; s < L.length; s += spacing) {
      const f = pointAtArc(L, s);
      const nearJoint = Math.abs(((s + moduleLen / 2) % moduleLen) - moduleLen / 2) < spacing * 0.5;
      this.floatSlots.push({ s, x: f.x, z: f.z, tx: f.tx, tz: f.tz, floor: 0.06 - seabedDepth(f.x, f.z), connector: nearJoint });
    }
    this.prevRise = new Float32Array(this.floatSlots.length);
    this.risePrimed = false;
    const floatGeo =
      this.customFloat ?? new THREE.CapsuleGeometry(0.31, 0.72, 4, 14).rotateZ(Math.PI / 2);
    this.floats = new THREE.InstancedMesh(floatGeo, this.floatMat, this.floatSlots.length);
    this.floats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.floats.frustumCulled = false;
    this.floats.castShadow = true;
    this.floats.userData.pick = 'curtain';
    for (let i = 0; i < this.floatSlots.length; i++) this.floats.setColorAt(i, this.amber);
    const conGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.5, 14).rotateZ(Math.PI / 2);
    const conCount = this.floatSlots.filter((f) => f.connector).length;
    this.connectors = new THREE.InstancedMesh(conGeo, mediumMaterial({ color: 0x2d3a42, roughness: 0.6, metalness: 0.3 }, false), Math.max(1, conCount));
    this.connectors.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.connectors.frustumCulled = false;
    this.connectors.userData.pick = 'curtain';
    this.group.add(this.skirt, this.ballast, this.floats, this.connectors);
    this.buildBuoys();
  }

  private buildBuoys(): void {
    this.buoys.clear();
    const mat = mediumMaterial({ color: 0xf2c230, roughness: 0.5 }, false);
    const dark = mediumMaterial({ color: 0x1b2328, roughness: 0.7 }, false);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x31474f, transparent: true, opacity: 0.45 });
    for (const a of this.layout.anchors) {
      const buoy = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.3, 16), mat);
      body.position.y = 0.35;
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 12), dark);
      top.position.y = 1.3;
      buoy.add(body, top);
      buoy.position.set(a.x, 0, a.z);
      buoy.userData = { anchor: a, pick: 'curtain' };
      // Mooring line to the prepared seabed anchor (offset upstream / bloom side).
      const k = Math.min(this.layout.segCount - 1, Math.max(0, Math.floor((a.s / this.layout.length) * this.layout.segCount)));
      const depth = seabedDepth(a.x, a.z);
      const ax = a.x - this.layout.tx[k] * depth * 1.8 + this.layout.nx[k] * depth * 0.8;
      const az = a.z - this.layout.tz[k] * depth * 1.8 + this.layout.nz[k] * depth * 0.8;
      const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(ax - a.x, -seabedDepth(ax, az) + 0.4, az - a.z)]);
      buoy.add(new THREE.Line(lg, lineMat));
      this.buoys.add(buoy);
    }
  }

  /** Permanent seabed anchors for every pre-engineered configuration. */
  private buildAnchorBlocks(): void {
    const geo = new THREE.BoxGeometry(1.6, 0.8, 1.6);
    const mat = mediumMaterial({ color: 0x8c8a82, roughness: 0.9 });
    const all: Array<{ x: number; z: number }> = [];
    for (const ang of ANCHOR_ANGLES) for (const a of getCurtainLayout(ang).anchors) all.push(a);
    const mesh = new THREE.InstancedMesh(geo, mat, all.length);
    const m = new THREE.Matrix4();
    all.forEach((a, i) => {
      m.makeTranslation(a.x, -seabedDepth(a.x, a.z) + 0.35, a.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.receiveShadow = true;
    this.anchorBlocks.add(mesh);
  }

  /** Dashed plan-view previews of the three pre-engineered anchor layouts (shown while stowed). */
  private buildPreviews(): void {
    for (const ang of ANCHOR_ANGLES) {
      const L = getCurtainLayout(ang);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < L.n; i += 2) pts.push(new THREE.Vector3(L.px[i], 0.25, L.pz[i]));
      pts.push(new THREE.Vector3(L.px[L.n - 1], 0.25, L.pz[L.n - 1]));
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineDashedMaterial({ color: 0xf5b94c, dashSize: 2.2, gapSize: 1.6, transparent: true, opacity: 0.8, depthWrite: false });
      const line = new THREE.Line(g, mat);
      line.computeLineDistances();
      line.userData.angle = ang;
      line.renderOrder = 22;
      this.previews.add(line);
    }
  }

  /** `fouling`: debris and bio-fouling on the curtain, 0..1 (stress test). */
  update(c: CurtainState, waveTime: number, waveHeight: number, flowHighlight: boolean, fouling = 0): void {
    if (c.layout !== this.layout) this.rebuild(c.layout);
    const L = this.layout;
    const n = L.n;
    const laidFrom = L.length - c.deployFront;
    const stowed = c.mode === 'STOWED';
    const reefing = c.mode === 'REEFING' || c.mode === 'REEFED' || c.mode === 'UNREEFING';
    // A pop-up curtain is always in the water: stowed on the seabed, rising, or at the surface.
    const popup = c.deployMode === 'popup';
    const band = ASSUMPTIONS.curtain.reefBand;
    // Column data: R = skirt fraction, G = reefed, B = float-line rise, A = in the water.
    for (let i = 0; i < n; i++) {
      const s = L.ps[i];
      const rise = (c.segRise[Math.max(0, i - 1)] + c.segRise[Math.min(i, L.segCount - 1)]) * 0.5;
      const laid = !stowed && s >= laidFrom - 0.01;
      let frac = 0;
      let reef = 0;
      if (popup) {
        // The skirt hangs full length beneath a submerged float; at the surface it follows reefing and blow-back.
        const r = reefing && rise >= 1 ? clamp01((s - c.reefFront) / band) : 1;
        frac = rise < 1 ? 1 : r * c.liftCos;
        reef = 1 - r;
      } else if (laid) {
        const drop = c.mode === 'DEPLOYING' ? clamp01((s - laidFrom - 3) / ASSUMPTIONS.curtain.skirtDropLag) : 1;
        const r = reefing ? clamp01((s - c.reefFront) / band) : 1;
        frac = drop * r * c.liftCos;
        reef = 1 - r;
      }
      this.columnData[i * 4] = Math.round(Math.max(0.02, frac) * 255);
      this.columnData[i * 4 + 1] = Math.round(reef * 255);
      this.columnData[i * 4 + 2] = Math.round((popup ? rise : laid ? 1 : 0) * 255);
      this.columnData[i * 4 + 3] = popup || laid ? 255 : 0;
    }
    this.columnTex.needsUpdate = true;
    for (const m of [this.skirtMat, this.ballastMat]) {
      m.uniforms.uSkirtDepth.value = c.skirtActual;
      m.uniforms.uLiftTan.value = Math.tan((c.liftAngleDeg * Math.PI) / 180);
    }
    this.skirtMat.uniforms.uHighlight.value = flowHighlight ? 1 : 0;
    for (const m of [this.skirtMat, this.ballastMat]) m.uniforms.uFouling.value = fouling;
    this.skirt.visible = popup || !stowed;
    this.ballast.visible = popup || !stowed;

    // Floats: flat on the seabed while stowed, filling as the inflation front passes, rising, then riding the sea state.
    const now = SHARED.uTime.value;
    const rdt = Math.min(0.1, Math.max(0, now - this.lastTime));
    this.lastTime = now;
    let surfacing = 0;
    let ci = 0;
    for (let i = 0; i < this.floatSlots.length; i++) {
      const f = this.floatSlots[i];
      const laid = !stowed && f.s >= laidFrom;
      if (!popup && !laid) {
        this.tmpM.makeScale(0, 0, 0);
        this.floats.setMatrixAt(i, this.tmpM);
        continue;
      }
      const rise = popup ? c.riseAt(f.s) : 1;
      if (this.risePrimed && rise >= 0.985 && this.prevRise[i] < 0.985 && i % 2 === 0) surfacing++;
      const inflate = smooth(0, 0.12, rise);
      const lift = liftOf(rise);
      const reefAmt = reefing && rise >= 1 ? 1 - clamp01((f.s - c.reefFront) / band) : 0;
      const eta = waveElevation(f.x, f.z, waveTime, waveHeight);
      const eta2 = waveElevation(f.x + f.tx * 0.6, f.z + f.tz * 0.6, waveTime, waveHeight);
      const pitch = Math.atan2(eta2 - eta, 0.6) * lift;
      this.tmpQ.setFromAxisAngle(this.yAxis, -Math.atan2(f.tz, f.tx));
      this.pitchQ.setFromAxisAngle(this.zAxis, pitch);
      this.tmpQ.multiply(this.pitchQ);
      const bed = f.floor + 0.24;
      this.tmpP.set(f.x, bed + (eta + 0.1 - reefAmt * 0.08 - bed) * lift, f.z);
      this.tmpS.set(1, (0.3 + 0.7 * inflate) * (1 - reefAmt * 0.15), 1.25 - 0.25 * inflate);
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      this.floats.setMatrixAt(i, this.tmpM);
      // A deflated tube reads dull; each float glows briefly as the inflation front fills it.
      this.tmpC.copy(this.deflated).lerp(this.amber, inflate).lerp(this.reefed, reefAmt).lerp(this.fouled, fouling * 0.6);
      if (inflate > 0 && inflate < 1) this.tmpC.multiplyScalar(1 + 1.6 * inflate * (1 - inflate));
      this.floats.setColorAt(i, this.tmpC);
      if (f.connector && ci < this.connectors.count) {
        this.tmpP.y -= 0.08;
        this.tmpS.set(1, 1, 1);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        this.connectors.setMatrixAt(ci++, this.tmpM);
      }
    }
    // White water where sections break the surface (a handful per frame; more means the run jumped, e.g. a pre-roll).
    if (surfacing > 0 && surfacing <= 6) {
      for (let i = 0; i < this.floatSlots.length; i += 2) {
        const rise = c.riseAt(this.floatSlots[i].s);
        if (rise >= 0.985 && this.prevRise[i] < 0.985) this.spawnFoam(this.floatSlots[i].x, this.floatSlots[i].z);
      }
    }
    if (popup) for (let i = 0; i < this.floatSlots.length; i++) this.prevRise[i] = c.riseAt(this.floatSlots[i].s);
    this.risePrimed = popup;
    this.updateFoam(rdt, waveTime, waveHeight);
    for (; ci < this.connectors.count; ci++) {
      this.tmpM.makeScale(0, 0, 0);
      this.connectors.setMatrixAt(ci, this.tmpM);
    }
    this.floats.instanceMatrix.needsUpdate = true;
    if (this.floats.instanceColor) this.floats.instanceColor.needsUpdate = true;
    this.connectors.instanceMatrix.needsUpdate = true;

    // Marker buoys bob; they come up with their section (pop-up) or are set as the curtain is laid (workboat).
    for (const b of this.buoys.children) {
      const a = b.userData.anchor as { x: number; z: number; s: number };
      const up = popup ? clamp01((c.riseAt(a.s) - 0.97) / 0.03) : !stowed && a.s >= laidFrom - 1 ? 1 : 0;
      b.visible = up > 0;
      b.position.y = waveElevation(a.x, a.z, waveTime, waveHeight) - 0.15 - (1 - up) * 1.6;
    }
    // Layout previews while stowed.
    this.previews.visible = stowed;
    for (const line of this.previews.children as THREE.Line[]) {
      const sel = line.userData.angle === L.angle;
      const mat = line.material as THREE.LineDashedMaterial;
      mat.opacity = sel ? 0.95 : 0.22;
      mat.color.set(sel ? 0xf5b94c : 0xb8c8d0);
    }
    // Reef front beacon.
    const showReef = c.mode === 'REEFING' && c.reefFront < L.length;
    this.reefMarker.visible = showReef;
    if (showReef) {
      const p = pointAtArc(L, Math.max(0, c.reefFront));
      this.reefMarker.position.set(p.x, waveElevation(p.x, p.z, waveTime, waveHeight) + 0.3, p.z);
      const pulse = 1 + 0.25 * Math.sin(SHARED.uTime.value * 5);
      this.reefMarker.scale.setScalar(pulse);
    }
  }

  private spawnFoam(x: number, z: number): void {
    const k = this.foamNext;
    this.foamNext = (k + 1) % FOAM;
    this.foamX[k] = x;
    this.foamZ[k] = z;
    this.foamRot[k] = (x * 12.9898 + z * 78.233) % (Math.PI * 2);
    this.foamAge[k] = 0;
  }

  /** Foam rings spread and fade on the water (additive: the instance colour is the intensity). */
  private updateFoam(rdt: number, waveTime: number, waveHeight: number): void {
    for (let k = 0; k < FOAM; k++) {
      const age = (this.foamAge[k] = Math.min(FOAM_LIFE, this.foamAge[k] + rdt));
      const t = age / FOAM_LIFE;
      if (t >= 1) {
        this.foam.setMatrixAt(k, this.tmpM.makeScale(0, 0, 0));
        continue;
      }
      const x = this.foamX[k];
      const z = this.foamZ[k];
      const r = 1.6 + 3.4 * (1 - (1 - t) * (1 - t));
      this.tmpP.set(x, waveElevation(x, z, waveTime, waveHeight) + 0.05, z);
      this.tmpQ.setFromAxisAngle(this.yAxis, this.foamRot[k]);
      this.tmpS.set(r, 1, r);
      this.foam.setMatrixAt(k, this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS));
      this.foam.setColorAt(k, this.tmpC.setScalar(1.05 * (1 - t) * (1 - t)));
    }
    this.foam.instanceMatrix.needsUpdate = true;
    if (this.foam.instanceColor) this.foam.instanceColor.needsUpdate = true;
  }

  /** Pickable meshes. */
  pickables(): THREE.Object3D[] {
    return [this.skirt, this.floats, this.connectors, this.buoys];
  }

  /** World position on the curtain at arc fraction f (for labels and cameras). */
  pointAt(fraction: number, y = 0.8): THREE.Vector3 {
    const p = pointAtArc(this.layout, this.layout.length * fraction);
    return new THREE.Vector3(p.x, y, p.z);
  }
}
