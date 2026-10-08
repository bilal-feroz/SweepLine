import * as THREE from 'three';
import { SHARED } from './shaderChunks';

const SKY_GLSL = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
vec3 skyColor(vec3 d) {
  float y = d.y;
  vec3 col;
  if (y >= 0.0) {
    col = mix(uHorizon, uZenith, pow(y, 0.45));
  } else {
    col = mix(uHorizon * 0.92, uGround, smoothstep(0.0, 0.22, -y));
  }
  float s = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(s, 1400.0) * 46.0 + pow(s, 90.0) * 0.45 + pow(s, 8.0) * 0.14);
  col += uHorizon * 0.18 * pow(1.0 - abs(y), 10.0) * (0.55 + 0.45 * s);
  return col;
}
`;

function skyMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: SHARED.uSunDir,
      uSunColor: SHARED.uSunColor,
      uZenith: { value: new THREE.Color(0.03, 0.18, 0.6) },
      uHorizon: { value: new THREE.Color(0.45, 0.63, 0.8) },
      uGround: { value: new THREE.Color(0.2, 0.26, 0.3) },
      uWaterScatter: SHARED.uWaterScatter,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      uniform vec3 uWaterScatter;
      ${SKY_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = skyColor(d);
        // Camera below the surface: open water fades to the in-scattered water colour.
        if (cameraPosition.y < 0.0) {
          float depthDim = exp(cameraPosition.y * 0.09);
          col = uWaterScatter * (0.45 + 0.55 * depthDim) * (2.3 + 1.4 * clamp(d.y, -0.6, 1.0));
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

/**
 * Hazy Gulf daylight sky. Also renders itself once into a cube map (water
 * reflections) and a PMREM environment (PBR image-based lighting).
 */
export class SkyDome {
  readonly mesh: THREE.Mesh;
  readonly cubeTarget: THREE.WebGLCubeRenderTarget;
  readonly envMap: THREE.Texture;

  constructor(renderer: THREE.WebGLRenderer) {
    const geo = new THREE.SphereGeometry(1000, 48, 24);
    this.mesh = new THREE.Mesh(geo, skyMaterial());
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000;
    this.mesh.name = 'sky';

    // Bake the sky (without tone mapping) for reflections and IBL.
    const bakeScene = new THREE.Scene();
    const bakeMat = skyMaterial();
    bakeMat.toneMapped = false;
    bakeScene.add(new THREE.Mesh(geo, bakeMat));
    this.cubeTarget = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    const cubeCam = new THREE.CubeCamera(1, 2000, this.cubeTarget);
    cubeCam.update(renderer, bakeScene);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromCubemap(this.cubeTarget.texture).texture;
    pmrem.dispose();
    bakeMat.dispose();
  }

  /** Keep the dome centred on the camera. */
  follow(camera: THREE.Camera): void {
    this.mesh.position.copy(camera.position);
  }
}
