/** Shape of the generated geographic intro data (see scripts/build-map-intro-data.ts). */

export interface MapRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type MapLabelKind = 'country' | 'sea' | 'emirate' | 'region' | 'capital' | 'city' | 'town' | 'island' | 'road';

/** A place name taken verbatim from Natural Earth or OpenStreetMap source tags. */
export interface MapLabelData {
  id: string;
  kind: MapLabelKind;
  en: string;
  /** Arabic name when the source supplies one (never translated by us). */
  ar: string | null;
  /** Map kilometres: x east, y north of the projection origin. */
  x: number;
  y: number;
  /** Road labels: road direction at the anchor (degrees, counter-clockwise from east). */
  angle?: number;
  /** Dataset and tags the names were read from. */
  source: string;
}

/**
 * SVG path data is in integer multiples of the level `unit` (km) with SVG y
 * pointing south, so a path renders inside `scale(unit)` in map kilometres.
 */
export interface MapIntroData {
  generatedAt: string;
  attribution: string;
  projection: { kind: 'local-equirectangular'; lon0: number; lat0: number; radiusKm: number };
  site: {
    /** Compass bearing of schematic +x on the map (shoreline direction, land on the left). */
    bearingX: number;
    /** Schematic waterline on the revetment (site metres, z). */
    waterlineZ: number;
  };
  levels: {
    national: { unit: number; rect: MapRect; land: string; uae: string; abuDhabi: string; borders: string };
    regional: { unit: number; rect: MapRect; land: string; coast: string; roads: string };
    local: { unit: number; rect: MapRect; land: string; coast: string; roadsMajor: string; roadsMinor: string };
  };
  destination: {
    /** Window in site metres (x along-shore, z offshore). */
    rect: { x0: number; x1: number; z0: number; z1: number };
    /** Real shoreline in site metres as x0, z0, x1, z1, … with x increasing. */
    shoreline: number[];
  };
  labels: MapLabelData[];
}
