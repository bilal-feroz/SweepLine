import * as THREE from 'three';
import { SITE, seabedDepth } from '../../config/site';
import { SeededRandom, valueNoise } from '../../simulation/seededRandom';
import { applyMedium, SHARED } from './shaderChunks';
import { makeSandTextures } from './textures';
import { makeRockGeometry } from '../assets/procedural/rocks';

/**
 * Seabed: bathymetry from the shared depth function, sand texture with
 * caustics, darker seagrass/algae patches, scattered rocks and seagrass.
 */
export class Seabed {
  readonly group = new THREE.Group();

  constructor() {
    this.group.name = 'seabed';
    const W = 1500;
    const D = 900;
    const segX = 300;
    const segZ = 180;
    const geo = new THREE.PlaneGeometry(W, D, segX, segZ);
    geo.rotateX(-Math.PI / 2);
    geo.translate(-10, 0, 110);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      let y = -seabedDepth(x, z);
      // Under the revetment the bed rises to meet the armour slope (hidden by it).
      if (z < SITE.shore.toeZ) y = Math.min(-0.6, y);
      pos.setY(i, y);
      const patch = valueNoise(7, x * 0.018 + 100) * valueNoise(11, z * 0.021 + 50);
      const sg = THREE.MathUtils.smoothstep(patch, 0.32, 0.5);
      const fine = 0.9 + 0.2 * valueNoise(13, x * 0.11 + z * 0.07);
      colors[i * 3] = (1 - sg * 0.55) * fine;
      colors[i * 3 + 1] = (1 - sg * 0.38) * fine;
      colors[i * 3 + 2] = (1 - sg * 0.5) * fine;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const sand = makeSandTextures(512);
    sand.map.repeat.set(W / 9, D / 9);
    sand.normal.repeat.set(W / 9, D / 9);
    const mat = applyMedium(
      new THREE.MeshStandardMaterial({
        map: sand.map,
        normalMap: sand.normal,
        normalScale: new THREE.Vector2(0.8, 0.8),
        vertexColors: true,
        roughness: 0.96,
        metalness: 0,
        envMapIntensity: 0.4,
      }),
      { caustics: true },
    );
    const bed = new THREE.Mesh(geo, mat);
    bed.receiveShadow = true;
    bed.name = 'seabed-mesh';
    this.group.add(bed);

    this.addRocks();
    this.addSeagrass();
  }

  private addRocks(): void {
    const rng = new SeededRandom(4242);
    const geo = makeRockGeometry(3, 1);
    const mat = applyMedium(new THREE.MeshStandardMaterial({ color: 0x8a8274, roughness: 0.95, flatShading: true }), { caustics: true });
    const count = 260;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const e = new THREE.Euler();
    let n = 0;
    for (let i = 0; i < count; i++) {
      // Clusters near the revetment toe and a few scattered outcrops.
      const cluster = rng.next() < 0.7;
      const x = rng.range(-320, 300);
      const z = cluster ? SITE.shore.toeZ + rng.range(0, 14) : rng.range(-30, 180);
      const sc = cluster ? rng.range(0.5, 1.6) : rng.range(0.3, 1.1);
      p.set(x, -seabedDepth(x, z) + sc * 0.25, z);
      e.set(rng.next() * 3, rng.next() * 3, rng.next() * 3);
      q.setFromEuler(e);
      s.set(sc * rng.range(0.8, 1.4), sc * rng.range(0.5, 0.9), sc * rng.range(0.8, 1.3));
      m.compose(p, q, s);
      mesh.setMatrixAt(n++, m);
    }
    mesh.count = n;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private addSeagrass(): void {
    // Thin swaying blades (vertex-animated) in a few patches.
    const blade = new THREE.PlaneGeometry(0.06, 0.7, 1, 4);
    blade.translate(0, 0.35, 0);
    const mat = applyMedium(
      new THREE.MeshStandardMaterial({ color: 0x5f7a43, roughness: 0.9, side: THREE.DoubleSide }),
      {
        caustics: false,
        key: 'seagrass',
        extra: (shader) => {
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            `#include <begin_vertex>
            float sway = sin(uTimeSG * 1.4 + instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.5) * 0.12 * position.y * position.y;
            transformed.x += sway;`,
          );
          shader.vertexShader = 'uniform float uTimeSG;\n' + shader.vertexShader;
          shader.uniforms.uTimeSG = SHARED.uTime;
        },
      },
    );
    const rng = new SeededRandom(777);
    const count = 4200;
    const mesh = new THREE.InstancedMesh(blade, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const patches: Array<[number, number, number]> = [];
    for (let i = 0; i < 26; i++) patches.push([rng.range(-280, 260), rng.range(-44, 120), rng.range(5, 14)]);
    let n = 0;
    for (let i = 0; i < count; i++) {
      const [cx, cz, r] = patches[i % patches.length];
      const a = rng.next() * Math.PI * 2;
      const d = Math.sqrt(rng.next()) * r;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      p.set(x, -seabedDepth(x, z), z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.next() * Math.PI);
      const h = rng.range(0.6, 1.5);
      s.set(1, h, 1);
      m.compose(p, q, s);
      mesh.setMatrixAt(n++, m);
    }
    mesh.count = n;
    this.group.add(mesh);
  }
}
