import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mediumMaterial } from '../../environment/shaderChunks';

/** Lofted hull: stations along x (stern → bow), U-shaped sections. */
function hullGeometry(): THREE.BufferGeometry {
  const stations = 14;
  const sectionPts = 9;
  const L = 8.2;
  const pos: number[] = [];
  for (let i = 0; i <= stations; i++) {
    const u = i / stations;
    const x = -L / 2 + u * L;
    const bowTaper = u > 0.62 ? Math.pow((u - 0.62) / 0.38, 1.7) : 0;
    const beam = 1.45 * (1 - 0.92 * bowTaper) * (0.94 + 0.06 * Math.sin(u * Math.PI));
    const depth = 1.05 * (1 - 0.35 * bowTaper);
    const sheer = 0.9 + 0.45 * bowTaper;
    for (let j = 0; j < sectionPts; j++) {
      const a = (j / (sectionPts - 1)) * Math.PI;
      const z = Math.cos(a) * beam;
      const y = sheer - Math.sin(a) * (depth + sheer) * Math.pow(Math.sin(a), 0.6);
      pos.push(x, y, z);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < stations; i++) {
    for (let j = 0; j < sectionPts - 1; j++) {
      const a = i * sectionPts + j;
      const b = a + sectionPts;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // Transom.
  const base = 0;
  for (let j = 1; j < sectionPts - 1; j++) idx.push(base, base + j + 1, base + j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Small curtain-handling workboat with a deployment reel. ~8 m LOA. */
export function buildWorkboat(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'workboat';
  const hull = new THREE.Mesh(hullGeometry(), mediumMaterial({ color: 0x1f3a4a, roughness: 0.55, metalness: 0.15, side: THREE.DoubleSide }));
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(8.0, 0.18, 2.95), mediumMaterial({ color: 0xe8a33a, roughness: 0.5 }));
  stripe.position.set(0, 0.85, 0);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.12, 2.5), mediumMaterial({ color: 0x5b6670, roughness: 0.8 }, false));
  deck.position.set(-0.4, 0.92, 0);

  const white = mediumMaterial({ color: 0xe9eef0, roughness: 0.45 }, false);
  const cabinParts = [
    new THREE.BoxGeometry(2.2, 1.5, 2.0).translate(1.0, 1.75, 0),
    new THREE.BoxGeometry(1.8, 0.12, 2.15).translate(1.0, 2.56, 0),
  ];
  const cabin = new THREE.Mesh(mergeGeometries(cabinParts)!, white);
  const glass = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.55, 1.7).translate(2.11, 2.0, 0),
    new THREE.MeshStandardMaterial({ color: 0x0b1e2a, roughness: 0.1, metalness: 0.6 }),
  );
  const amber = mediumMaterial({ color: 0xf59e0b, roughness: 0.5 }, false);
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.7, 20).rotateX(Math.PI / 2).translate(-2.4, 1.6, 0), amber);
  const reelCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.08, 20).rotateX(Math.PI / 2),
    mediumMaterial({ color: 0x2b3640, roughness: 0.6 }, false),
  );
  const flangeA = reelCore.clone();
  flangeA.position.set(-2.4, 1.6, 0.86);
  const flangeB = reelCore.clone();
  flangeB.position.set(-2.4, 1.6, -0.86);
  const steel = mediumMaterial({ color: 0x9aa4ab, roughness: 0.4, metalness: 0.6 }, false);
  const aFrame = new THREE.Mesh(
    mergeGeometries([
      new THREE.BoxGeometry(0.12, 2.2, 0.12).translate(-3.6, 2.0, 1.0),
      new THREE.BoxGeometry(0.12, 2.2, 0.12).translate(-3.6, 2.0, -1.0),
      new THREE.BoxGeometry(0.14, 0.14, 2.14).translate(-3.6, 3.08, 0),
    ])!,
    steel,
  );
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6).translate(0.8, 3.3, 0), steel);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8).translate(0.8, 4.15, 0), new THREE.MeshBasicMaterial({ color: 0xffd28a }));
  group.add(hull, stripe, deck, cabin, glass, reel, flangeA, flangeB, aFrame, mast, lamp);
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return group;
}
