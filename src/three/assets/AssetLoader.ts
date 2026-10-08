import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { assetConfig, type AssetEntry, type AssetKey } from '../../config/assets';
import { applyMedium } from '../environment/shaderChunks';

export interface LoadedAsset {
  key: AssetKey;
  scene: THREE.Group;
}

const DEG = Math.PI / 180;

/** Model URLs present in public/models at build time (vite.config.ts). */
declare const __BUNDLED_MODELS__: string[];

/**
 * Loads optional GLB assets. Missing files resolve to `null` (no broken
 * models, no thrown errors) and callers fall back to procedural geometry.
 */
export class AssetLoader {
  private readonly loader: GLTFLoader;
  readonly status: Partial<Record<AssetKey, 'loaded' | 'fallback'>> = {};

  constructor() {
    this.loader = new GLTFLoader();
    // The Draco decoder ships with three.js and is bundled by Vite (resolved via import.meta.url).
    this.loader.setDRACOLoader(new DRACOLoader());
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  private async exists(url: string): Promise<boolean> {
    // A production build knows which models it shipped, so it never requests (and 404s on) the others.
    if (import.meta.env.PROD && !__BUNDLED_MODELS__.includes(url)) return false;
    try {
      const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (!res.ok) return false;
      const type = res.headers.get('content-type') ?? '';
      // Dev servers may answer unknown paths with the SPA index page.
      return !type.includes('text/html');
    } catch {
      return false;
    }
  }

  async load(key: AssetKey): Promise<LoadedAsset | null> {
    const entry: AssetEntry = assetConfig[key];
    if (!entry.enabled || !(await this.exists(entry.url))) {
      this.status[key] = 'fallback';
      return null;
    }
    try {
      const gltf = await this.loader.loadAsync(entry.url);
      const root = new THREE.Group();
      root.name = `asset:${key}`;
      const model = gltf.scene;
      const s = entry.scale;
      if (Array.isArray(s)) model.scale.set(s[0], s[1], s[2]);
      else model.scale.setScalar(s);
      model.rotation.set(entry.rotation[0] * DEG, entry.rotation[1] * DEG, entry.rotation[2] * DEG);
      root.add(model);
      root.position.set(entry.offset[0], entry.offset[1], entry.offset[2]);
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) applyMedium(m as THREE.MeshStandardMaterial, { caustics: true, key: `asset-${key}` });
        });
      });
      this.status[key] = 'loaded';
      return { key, scene: root };
    } catch (err) {
      console.warn(`[SweepLine] Could not load ${entry.url}; using procedural fallback.`, err);
      this.status[key] = 'fallback';
      return null;
    }
  }

  /**
   * Extract a single merged geometry (with baked transforms) and the first
   * material's colour map from a loaded asset — used to instance the jellyfish.
   */
  static extractGeometry(asset: LoadedAsset): { geometry: THREE.BufferGeometry; map: THREE.Texture | null } | null {
    const geos: THREE.BufferGeometry[] = [];
    let map: THREE.Texture | null = null;
    asset.scene.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(asset.scene.matrixWorld).invert();
    asset.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = mesh.geometry.clone();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld));
      const keep = ['position', 'normal', 'uv'];
      for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      geos.push(g.index ? g.toNonIndexed() : g);
      const m = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial;
      if (!map && m && m.map) map = m.map;
    });
    if (geos.length === 0) return null;
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) return null;
    return { geometry: merged, map };
  }
}
