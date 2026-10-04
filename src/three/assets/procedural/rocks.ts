import * as THREE from 'three';

/** Irregular armour/seabed rock: displaced icosahedron. Displacement depends only on position, so seams stay closed. */
export function makeRockGeometry(seed: number, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const s = seed * 1.37;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const n =
      0.55 * Math.sin(v.x * 2.9 + s) * Math.sin(v.y * 3.3 + 2.1 * s) * Math.sin(v.z * 2.6 + 0.7 * s) +
      0.25 * Math.sin(v.x * 7.1 + 3.1 * s) * Math.sin(v.z * 6.3 - s) +
      0.12 * Math.sin(v.y * 11.0 + v.x * 9.0 + s);
    let r = 1 + 0.32 * n;
    // Facets: quantise slightly for a quarried look.
    r = Math.round(r * 9) / 9;
    v.multiplyScalar(r);
    if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.4;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
