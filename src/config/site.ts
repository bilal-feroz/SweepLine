/**
 * Reference coastal intake geometry — schematic, not ENEC facility data.
 *
 * World frame (used by both the simulation and the Three.js scene):
 *   - units are metres, y is up, still-water level is y = 0
 *   - +x runs along-shore in the nominal current direction (bearing 112°, ESE)
 *   - +z runs offshore (bearing 022°, NNE); the coastline lies toward −z
 *
 * Everything the agent model treats as physical structure (shoreline, intake
 * mouth, recovery throat, release outlet) is defined here so that a replaced
 * GLB model never changes simulation behaviour.
 */
export const SITE = {
  /** Compass bearing that the world +x axis points toward (degrees). */
  bearingOfPlusX: 112,

  shore: {
    /** Toe of the rock revetment — offshore limit of the armour slope. */
    toeZ: -50,
    /** Crest of the revetment / crown wall line. */
    crestZ: -62,
    crestY: 3.4,
    landY: 3.0,
  },

  bathymetry: {
    depthAtToe: 6.0,
    /** Seabed deepening per metre offshore. */
    slope: 0.045,
    maxDepth: 16,
  },

  intake: {
    /** Seaward screen face spans x0..x1 at z = mouthZ, facing offshore (+z). */
    x0: 20,
    x1: 58,
    mouthZ: -34,
    backZ: -84,
    sillDepth: 6.2,
    deckY: 3.8,
    bays: 5,
    pierWidth: 1.4,
  },

  /** Simplified intake draw: sink toward the screen face. */
  intakeSuction: {
    /** Approach velocity at the screen face (m/s). */
    v0: 0.3,
    /** Decay length scale (m). */
    r0: 7,
    /** Distance beyond which the draw is neglected (m). */
    range: 52,
  },

  curtain: {
    /** Downstream end of the guide curtain where it meets the recovery throat rim. */
    endX: -12,
    endZ: -8,
    /**
     * Upstream end, tied into the revetment toe: no gap between the curtain and the
     * rocks for jellyfish hugging the shore (agents can come no closer than z = −51).
     */
    upstreamAnchorZ: -51.5,
    /** Radius of the smooth funnel curve leading into the throat. */
    funnelRadius: 18,
    /** Polyline sampling interval along the straight section (m). */
    sampleSpacing: 1.0,
  },

  throat: {
    halfWidth: 3.4,
    halfHeight: 2.25,
    /** Depth of the bellmouth centreline below still water (m). */
    centerDepth: 1.95,
    /** Bellmouth length from mouth plane to transfer inlet (m). */
    length: 7.0,
    outletRadius: 0.7,
  },

  /** Floating transfer pipeline route (plan view, x/z pairs) from the transfer module to the outlet. */
  pipeRoute: [
    [-1.5, -4.6],
    [10, 1],
    [40, 16],
    [88, 38],
    [126, 58],
    [146, 68],
  ] as ReadonlyArray<readonly [number, number]>,

  release: {
    /** Schematic position of the safe-release outlet (down-current, outside the intake capture area). */
    x: 150,
    z: 70,
    dirX: 0.9,
    dirZ: 0.44,
  },

  /** Agents leaving these bounds are considered to have passed the site. */
  domain: { xMin: -300, xMax: 300, zMin: -52, zMax: 200 },

  spawn: {
    x: -240,
    jitterX: 12,
    /**
     * Centre and spread of the bloom's lateral (cross-shore) distribution. The
     * reference bloom drifts along the coast in the band the intake draws from —
     * between the revetment and the curtain's offshore end — rather than far offshore,
     * where it would pass the site without involving the intake or SweepLine.
     */
    zCenter: -28,
    zSigma: 10,
    zMin: -49.5,
    zMax: -8,
    /** Along-shore distance an agent travels from spawn to exit — used to hold population density. */
    traverseLength: 530,
  },
} as const;

/** Seabed depth below still water (positive metres) — shared by the simulation and seabed/water shaders. */
export function seabedDepth(x: number, z: number): number {
  const b = SITE.bathymetry;
  const dz = z - SITE.shore.toeZ;
  if (dz < 0) return Math.max(0.5, b.depthAtToe + dz * 0.75);
  const d =
    b.depthAtToe +
    b.slope * dz +
    0.35 * Math.sin(x * 0.019 + z * 0.011) +
    0.22 * Math.sin(x * 0.047 - z * 0.031);
  return Math.min(d, b.maxDepth);
}

/** GLSL twin of {@link seabedDepth}. Keep both in sync. */
export const SEABED_DEPTH_GLSL = /* glsl */ `
float seabedDepth(vec2 p) {
  float dz = p.y - (${SITE.shore.toeZ.toFixed(3)});
  if (dz < 0.0) return max(0.5, ${SITE.bathymetry.depthAtToe.toFixed(3)} + dz * 0.75);
  float d = ${SITE.bathymetry.depthAtToe.toFixed(3)} + ${SITE.bathymetry.slope.toFixed(4)} * dz
    + 0.35 * sin(p.x * 0.019 + p.y * 0.011)
    + 0.22 * sin(p.x * 0.047 - p.y * 0.031);
  return min(d, ${SITE.bathymetry.maxDepth.toFixed(3)});
}
`;

/** Convert a compass bearing (direction of travel) to a unit world-plane vector (x, z). */
export function bearingToWorld(bearingDeg: number): { x: number; z: number } {
  const a = ((bearingDeg - SITE.bearingOfPlusX) * Math.PI) / 180;
  return { x: Math.cos(a), z: -Math.sin(a) };
}

/** Compass point label (16-wind) for a bearing. */
export function compassLabel(bearingDeg: number): string {
  const pts = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const i = Math.round((((bearingDeg % 360) + 360) % 360) / 22.5) % 16;
  return pts[i];
}
