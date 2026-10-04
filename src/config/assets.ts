/**
 * Replaceable 3D assets.
 *
 * Drop Hyper3D (or any) GLB/GLTF files into /public/models/ using the paths
 * below. If a file is missing the scene silently uses the procedural fallback,
 * so the application always runs. Transforms here are applied to the loaded
 * model only — simulation geometry (curtain line, throat, intake mouth) lives
 * in src/config/site.ts and never changes when a model is swapped.
 *
 *   scale     uniform scale (or [x, y, z])
 *   rotation  Euler XYZ in degrees
 *   offset    world-space position in metres (y-up, still water at y = 0)
 */
export interface AssetEntry {
  url: string;
  enabled: boolean;
  scale: number | [number, number, number];
  rotation: [number, number, number];
  offset: [number, number, number];
  /** Short description shown in the README / asset panel. */
  role: string;
}

export const assetConfig = {
  /**
   * One jellyfish model, instanced hundreds of times. The loader merges its
   * meshes and normalises it to a 1.0 m bell diameter, then the instancing
   * system scales each agent to its true 0.30–0.45 m bell size.
   * Model orientation: bell up (+y). Use `rotation` to correct other exports.
   */
  jellyfish: {
    url: '/models/blue-blubber.glb',
    enabled: true,
    scale: 1,
    rotation: [0, 0, 0],
    offset: [0, 0, 0],
    role: 'Blue Blubber jellyfish (instanced; near LOD)',
  },
  intake: {
    url: '/models/coastal-intake.glb',
    enabled: true,
    scale: 1,
    rotation: [0, 0, 0],
    offset: [39, 0, -58],
    role: 'Coastal intake structure with screens (screen face at z = −34)',
  },
  breakwater: {
    url: '/models/breakwater.glb',
    enabled: true,
    scale: 1,
    rotation: [0, 0, 0],
    offset: [0, 0, -56],
    role: 'Rock revetment / breakwater along the coastline',
  },
  curtain: {
    url: '/models/guide-curtain.glb',
    enabled: true,
    scale: 1,
    rotation: [0, 0, 0],
    offset: [0, 0, 0],
    role: 'One float element of the guide curtain, instanced along the float line (long axis = x)',
  },
  throat: {
    url: '/models/recovery-throat.glb',
    enabled: true,
    scale: 1,
    rotation: [0, 0, 0],
    offset: [-12, 0, -4.6],
    role: 'Recovery throat bellmouth (mouth plane at x = −12, axis +x)',
  },
  transfer: {
    url: '/models/transfer-module.glb',
    enabled: true,
    scale: 1,
    rotation: [0, 0, 0],
    offset: [-1.5, 1.4, -4.6],
    role: 'Large-aperture low-shear transfer module (replaces both module housings)',
  },
} satisfies Record<string, AssetEntry>;

export type AssetKey = keyof typeof assetConfig;
