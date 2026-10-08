import * as THREE from 'three';
import { SEABED_DEPTH_GLSL } from '../../config/site';
import { WAVES_GLSL } from '../../simulation/waves';
import { MEDIUM_GLSL, SHARED } from './shaderChunks';
import { makeFoamNoise } from './textures';

/** Grid coordinates: dense in the working area, geometrically coarser toward the horizon. */
function axisCoords(core: number, spacing: number, outer: number, outerSegs: number): number[] {
  const out: number[] = [];
  const n = Math.round(core / spacing);
  const ratio = Math.pow(outer / core, 1 / outerSegs);
  const ext: number[] = [];
  let v = core;
  for (let i = 0; i < outerSegs; i++) {
    v *= ratio;
    ext.push(v);
  }
  for (let i = ext.length - 1; i >= 0; i--) out.push(-ext[i]);
  for (let i = -n; i <= n; i++) out.push(i * spacing);
  for (const e of ext) out.push(e);
  return out;
}

function buildGrid(): THREE.BufferGeometry {
  const xs = axisCoords(380, 2.5, 7000, 26);
  const zs = axisCoords(320, 2.5, 7000, 26);
  const nx = xs.length;
  const nz = zs.length;
  const pos = new Float32Array(nx * nz * 3);
  let k = 0;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      pos[k++] = xs[i];
      pos[k++] = 0;
      pos[k++] = zs[j];
    }
  }
  const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  k = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      idx[k++] = a;
      idx[k++] = c;
      idx[k++] = b;
      idx[k++] = b;
      idx[k++] = c;
      idx[k++] = d;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

const CENTER = new THREE.Vector2(-10, 40);

/** Surface displacement shared by the water and its depth cap. */
const SURFACE_VERTEX = /* glsl */ `
  ${WAVES_GLSL}
  uniform vec2 uCenter;
  varying vec3 vWorld;
  varying vec3 vView;
  varying vec2 vSlope;
  varying float vElev;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float fade = 1.0 - smoothstep(380.0, 900.0, length(wp.xz - uCenter));
    vec2 slope;
    float e = waveElevation(wp.xz, slope) * fade;
    wp.y += e;
    vWorld = wp.xyz;
    vSlope = slope * fade;
    vElev = e;
    vec4 mv = viewMatrix * wp;
    vView = mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

type FramebufferProps = { __webglFramebuffer?: WebGLFramebuffer; __webglMultisampledFramebuffer?: WebGLFramebuffer };

/**
 * Ocean surface: shared analytic sea state (vertex), detail normals, Fresnel sky reflection, sun
 * glitter, and a Snell's-window underside.
 *
 * Seen from above inside the post-processing chain, the surface refracts what lies beneath it:
 * just before the water draws, everything already rendered (seabed, rocks, skirt, bloom) is copied
 * with its depth into a backdrop. The water then bends each view ray at the wavy surface, samples
 * the backdrop where the bent ray lands, and adds foam wherever the backdrop meets the surface
 * (revetment, floats, pontoon, piles). Underwater colour and absorption are applied to the
 * submerged objects themselves, so shallow sand reads turquoise and the channel deep teal.
 * Without a backdrop the surface falls back to partial transparency.
 */
export class Water {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  /** Depth-only copy of the surface drawn last, so depth-based post effects see the water plane. */
  readonly depthCap: THREE.Mesh;
  /** The render target the scene is drawn into when refraction is available. */
  backdropSource: (() => THREE.WebGLRenderTarget | null) | null = null;
  private readonly backdrop: THREE.WebGLRenderTarget;
  private underwater = false;

  constructor(envCube: THREE.CubeTexture) {
    // The same ripple normals drive the caustics, so the light pattern moves with this surface.
    const normalMap = SHARED.uRippleMap.value;
    this.backdrop = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      depthTexture: new THREE.DepthTexture(1, 1, THREE.FloatType),
    });
    this.backdrop.texture.name = 'Water.Backdrop';
    this.backdrop.texture.generateMipmaps = false;
    this.backdrop.texture.minFilter = THREE.LinearFilter;
    this.backdrop.texture.magFilter = THREE.LinearFilter;
    const depthTex = this.backdrop.depthTexture!;
    depthTex.minFilter = THREE.NearestFilter;
    depthTex.magFilter = THREE.NearestFilter;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
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
        uEnv: { value: envCube },
        uNormalMap: { value: normalMap },
        uFoamNoise: { value: makeFoamNoise(256) },
        uShallow: { value: new THREE.Color(0.02, 0.52, 0.5) },
        uDeep: { value: new THREE.Color(0.004, 0.095, 0.2) },
        uCenter: { value: CENTER },
        uRefract: { value: 0 },
        uBackdrop: { value: this.backdrop.texture },
        uBackdropDepth: { value: depthTex },
        uBackdropSize: { value: new THREE.Vector2(1, 1) },
        uProj: { value: new THREE.Matrix4() },
        uNearFar: { value: new THREE.Vector2(0.1, 1000) },
      },
      vertexShader: SURFACE_VERTEX,
      fragmentShader: /* glsl */ `
        uniform samplerCube uEnv;
        uniform sampler2D uNormalMap;
        uniform sampler2D uFoamNoise;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform float uTime;
        uniform float uWaveAmp;
        uniform float uRefract;
        uniform sampler2D uBackdrop;
        uniform highp sampler2D uBackdropDepth;
        uniform vec2 uBackdropSize;
        uniform mat4 uProj;
        uniform vec2 uNearFar;
        varying vec3 vWorld;
        varying vec3 vView;
        varying vec2 vSlope;
        varying float vElev;
        ${MEDIUM_GLSL}
        ${SEABED_DEPTH_GLSL}
        float viewZ(float depth) {
          return (uNearFar.x * uNearFar.y) / ((uNearFar.y - uNearFar.x) * depth - uNearFar.y);
        }
        // Breaking white water: drifting patches and fine bubbles (0..1).
        float foamPattern(vec2 p) {
          float a = texture2D(uFoamNoise, p / 5.5 + vec2(uTime * 0.021, -uTime * 0.013)).r;
          float b = texture2D(uFoamNoise, p / 1.6 + vec2(-uTime * 0.034, uTime * 0.027)).g;
          return a * 0.55 + b * 0.45;
        }
        // How strongly a backdrop point (below = metres under the surface) touches the water line.
        float contactAt(float below, float reach) {
          return (1.0 - smoothstep(0.0, reach, below)) * step(-1.5, below);
        }
        void main() {
          float dist = length(cameraPosition - vWorld);
          vec2 uv1 = vWorld.xz / 23.0 + vec2(uTime * 0.013, uTime * 0.009);
          vec2 uv2 = vWorld.xz / 8.5 + vec2(-uTime * 0.021, uTime * 0.014);
          vec2 uv3 = vWorld.xz / 3.1 + vec2(uTime * 0.03, -uTime * 0.025);
          vec3 n1 = texture2D(uNormalMap, uv1).xyz * 2.0 - 1.0;
          vec3 n2 = texture2D(uNormalMap, uv2).xyz * 2.0 - 1.0;
          vec3 n3 = texture2D(uNormalMap, uv3).xyz * 2.0 - 1.0;
          float chop = 0.55 + uWaveAmp * 0.9;
          vec2 detail = (n1.xy * 0.6 + n2.xy * 0.4 + n3.xy * 0.22 * (1.0 - smoothstep(20.0, 120.0, dist))) * 0.46 * chop;
          detail *= 1.0 - smoothstep(180.0, 1600.0, dist) * 0.85;
          vec3 N = normalize(vec3(-vSlope.x - detail.x, 1.0, -vSlope.y - detail.y));
          vec3 V = normalize(cameraPosition - vWorld);

          if (gl_FrontFacing) {
            // N·V can round a hair above 1, and pow() of a negative base is NaN on D3D.
            float NdV = clamp(dot(N, V), 0.0, 1.0);
            float F = 0.02 + 0.98 * pow(1.0 - NdV, 5.0);
            vec3 R = reflect(-V, N);
            R.y = abs(R.y);
            vec3 refl = textureCube(uEnv, R).rgb;
            float sr = max(dot(R, uSunDir), 0.0);
            // Sun glitter comes from facets far finer than the shading normal: tilt the normal by two
            // fast, short ripple octaves so the glare breaks into sparkles instead of smooth blotches.
            vec2 sp = texture2D(uNormalMap, vWorld.xz / 0.9 + vec2(uTime * 0.11, -uTime * 0.07)).xy * 2.0 - 1.0;
            vec2 sp2 = texture2D(uNormalMap, vWorld.xz / 0.37 + vec2(-uTime * 0.13, uTime * 0.09)).xy * 2.0 - 1.0;
            vec3 Ng = normalize(N + vec3(sp.x + sp2.x * 0.7, 0.0, sp.y + sp2.y * 0.7) * 0.5 * chop);
            float sg = max(dot(reflect(-V, Ng), uSunDir), 0.0);
            float glint = pow(sg, 1400.0) * 9.0 + pow(sr, 160.0) * 0.3;
            float depth = seabedDepth(vWorld.xz);
            vec3 body = mix(uShallow, uDeep, smoothstep(2.0, 14.0, depth));
            float crest = clamp(vElev / max(uWaveAmp, 0.05), 0.0, 1.0);
            vec3 sss = vec3(0.04, 0.42, 0.36) * pow(max(dot(V, -uSunDir) * 0.5 + 0.5, 0.0), 3.0) * crest * 0.35;
            // Wave-break foam along the revetment waterline.
            float shore = smoothstep(-52.5, -56.8, vWorld.z) * step(-58.5, vWorld.z);
            float foamN = texture2D(uNormalMap, vWorld.xz / 6.0 + vec2(uTime * 0.02, 0.0)).x;
            float foam = shore * smoothstep(0.45, 0.75, foamN + 0.35 * sin(vWorld.x * 0.21 + uTime * 0.9)) * (0.6 + uWaveAmp);
            vec3 foamCol = vec3(0.78, 0.86, 0.88);
            vec3 glintCol = uSunColor * glint * (1.0 - uFlowDim * 0.6);

            if (uRefract > 0.5) {
              // ---- Refraction through the surface into the backdrop.
              vec2 suv = gl_FragCoord.xy / uBackdropSize;
              float rayLen = length(vView);
              float bz = viewZ(texture2D(uBackdropDepth, suv).r);
              float behind = rayLen * (bz / vView.z - 1.0);
              vec3 Vd = -V;
              vec3 Rr = refract(Vd, N, 1.0 / 1.333);
              vec3 target = vWorld + Rr * clamp(behind, 0.0, 6.0);
              vec4 clip = uProj * viewMatrix * vec4(target, 1.0);
              vec2 ruv = clip.xy / clip.w * 0.5 + 0.5;
              float bzR = viewZ(texture2D(uBackdropDepth, ruv).r);
              // Reject samples off screen or in front of the surface (above-water objects).
              if (any(lessThan(ruv, vec2(0.0))) || any(greaterThan(ruv, vec2(1.0))) || bzR > vView.z - 0.05) ruv = suv;
              vec3 refr = texture2D(uBackdrop, ruv).rgb;
              // Nothing behind the surface (beyond the modelled seabed) or very far: open-water body colour.
              vec3 deepCol = slMedium(body * 0.68 + sss, vWorld);
              float open = max(step(0.99999, texture2D(uBackdropDepth, ruv).r), smoothstep(320.0, 1500.0, dist));
              vec3 under = mix(refr, deepCol, open);
              // Reflection and glint travel only the air path from this point to the camera.
              float hz = slHaze(cameraPosition, vWorld, dist);
              float dim = 1.0 - 0.38 * uFlowDim;
              vec3 col = under * (1.0 - F) + mix(refl * 0.92, uHazeColor, hz) * dim * F + glintCol * (1.0 - hz) + sss * (1.0 - F) * 0.5;
              // ---- Contact foam: where the backdrop surface comes up to the water line (a thin, solid
              // line), plus weaker taps on rings around the pixel (0.3 m and 0.7 m on the surface) that
              // fray it outward into broken white water.
              float reach = 0.16 + 0.2 * uWaveAmp;
              float hitY = cameraPosition.y + Vd.y * rayLen * (bz / vView.z);
              float contact = contactAt(vWorld.y - hitY, reach);
              vec2 pScale = vec2(uProj[0][0], uProj[1][1]);
              vec2 ndc = vView.xy * pScale / -vView.z;
              for (int i = 0; i < 8; i++) {
                float ring = i < 4 ? 0.15 : 0.35;
                float a = float(i) * 1.5708 + (i < 4 ? 0.0 : 0.785);
                vec2 o = vec2(cos(a), sin(a)) * pScale * ring / max(-vView.z, 0.5);
                float tz = viewZ(texture2D(uBackdropDepth, suv + o).r);
                // Height where the tap's view ray meets the backdrop (view → world).
                vec3 pv = vec3((ndc + o * 2.0) / pScale * -tz, tz);
                float ty = (vec4(pv - viewMatrix[3].xyz, 0.0) * viewMatrix).y;
                contact = max(contact, contactAt(vWorld.y - ty, reach) * (i < 4 ? 0.62 : 0.32));
              }
              contact *= 1.0 - open;
              float fp = foamPattern(vWorld.xz);
              // The noise threshold falls as contact strengthens: solid at the line, bubbles at the fringe.
              float edgeFoam = smoothstep(1.0 - contact, 1.16 - contact, fp) * contact;
              float f = clamp(max(foam, edgeFoam * (0.75 + 0.35 * uWaveAmp)), 0.0, 0.78) * (1.0 - smoothstep(160.0, 650.0, dist));
              vec3 lit = foamCol * (0.45 + 0.5 * max(dot(N, uSunDir), 0.0));
              col = mix(col, mix(lit, uHazeColor, hz) * dim, f);
              gl_FragColor = vec4(col, 1.0);
            } else {
              // ---- Fallback: partially transparent surface over the submerged scene.
              vec3 col = body * 0.68 + sss;
              col = mix(col, refl * 0.92, F) + glintCol;
              col = mix(col, foamCol, clamp(foam, 0.0, 0.85));
              float alpha = mix(0.4 + 0.2 * smoothstep(4.0, 14.0, depth), 1.0, F);
              alpha = max(alpha, clamp(foam, 0.0, 0.85));
              alpha = mix(alpha, 1.0, smoothstep(250.0, 1800.0, dist));
              col = slMedium(col, vWorld);
              gl_FragColor = vec4(col, alpha);
            }
          } else {
            // Seen from below: Snell's window to the sky, total internal reflection outside it.
            vec3 I = normalize(vWorld - cameraPosition);
            float cosI = dot(I, N);
            float window = smoothstep(0.62, 0.71, cosI);
            vec3 skyIn = mix(vec3(0.25, 0.55, 0.62), vec3(0.65, 0.85, 0.92), window) * window;
            vec3 sunU = normalize(vec3(uSunDir.x * 0.72, uSunDir.y, uSunDir.z * 0.72));
            float sd = max(dot(I, sunU), 0.0);
            // Outside the window the underside mirrors the bright water column; ripples catch light.
            float ripple = 0.5 + 0.5 * (n1.x * 0.6 + n2.y * 0.4);
            vec3 tir = uWaterScatter * (3.2 + 2.2 * ripple) + vec3(0.02, 0.06, 0.06) * pow(clamp(ripple, 0.0, 1.0), 3.0);
            vec3 col = mix(tir, skyIn * 1.5, window) + uSunColor * (pow(sd, 260.0) * 6.0 + pow(sd, 18.0) * 0.35) * window;
            col = slMedium(col, vWorld);
            gl_FragColor = vec4(col, 1.0);
          }
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
      // Both faces in one draw: the surface is opaque where it refracts, and this keeps one copy per frame.
      forceSinglePass: true,
    });
    const grid = buildGrid();
    this.mesh = new THREE.Mesh(grid, this.material);
    this.mesh.position.set(CENTER.x, 0, CENTER.y);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = 'water';
    this.mesh.onBeforeRender = (renderer, _scene, camera) => this.captureBackdrop(renderer, camera);

    this.depthCap = new THREE.Mesh(
      grid,
      new THREE.ShaderMaterial({
        uniforms: { uWaveAmp: SHARED.uWaveAmp, uWaveTime: SHARED.uWaveTime, uCenter: { value: CENTER } },
        vertexShader: SURFACE_VERTEX,
        fragmentShader: 'void main() { gl_FragColor = vec4(0.0); }',
        side: THREE.DoubleSide,
        transparent: true,
        colorWrite: false,
        depthWrite: true,
        forceSinglePass: true,
      }),
    );
    this.depthCap.position.copy(this.mesh.position);
    this.depthCap.frustumCulled = false;
    this.depthCap.renderOrder = 1000;
    this.depthCap.name = 'water-depth-cap';
  }

  /** Render the surface after submerged content from above, and first (opaque) from below. */
  configureForCamera(underwater: boolean): void {
    this.underwater = underwater;
    this.mesh.renderOrder = underwater ? -10 : 10;
    this.material.depthWrite = underwater;
    this.depthCap.visible = !underwater;
  }

  /** Match the backdrop to the scene target's size and depth format (call outside a render). */
  prepare(renderer: THREE.WebGLRenderer, source: THREE.WebGLRenderTarget): void {
    const bd = this.backdrop;
    const depthType = source.depthTexture?.type ?? THREE.UnsignedIntType;
    const depth = bd.depthTexture!;
    if (bd.width === source.width && bd.height === source.height && depth.type === depthType) return;
    // A blit copies depth only between identical formats.
    if (depth.type !== depthType) {
      depth.type = depthType;
      bd.dispose();
    }
    bd.setSize(source.width, source.height);
    renderer.initRenderTarget(bd);
  }

  /**
   * Runs just before the surface draws: copy what is already in the scene target (colour and
   * depth, resolving MSAA) into the backdrop the surface refracts.
   */
  private captureBackdrop(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const u = this.material.uniforms;
    const src = renderer.getRenderTarget();
    const bd = this.backdrop;
    u.uRefract.value = 0;
    if (this.underwater || src === null || src !== this.backdropSource?.()) return;
    if (src.width !== bd.width || src.height !== bd.height) return;
    const props = renderer.properties;
    const sp = props.get(src) as FramebufferProps;
    const readFb = sp.__webglMultisampledFramebuffer ?? sp.__webglFramebuffer;
    const drawFb = (props.get(bd) as FramebufferProps).__webglFramebuffer;
    if (!readFb || !drawFb) return;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const state = renderer.state;
    state.bindFramebuffer(gl.READ_FRAMEBUFFER, readFb);
    state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, drawFb);
    gl.blitFramebuffer(0, 0, src.width, src.height, 0, 0, bd.width, bd.height, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    state.bindFramebuffer(gl.FRAMEBUFFER, readFb);
    const cam = camera as THREE.PerspectiveCamera;
    u.uBackdropSize.value.set(bd.width, bd.height);
    u.uProj.value.copy(cam.projectionMatrix);
    u.uNearFar.value.set(cam.near, cam.far);
    u.uRefract.value = 1;
  }
}
