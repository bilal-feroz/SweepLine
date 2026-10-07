/**
 * Build the geographic intro data (run manually, not at app runtime):
 *
 *   npm run build:map-intro            # uses cached downloads in .cache/map-intro
 *   npm run build:map-intro -- --refresh
 *
 * Sources (downloaded once, cached):
 *   - Natural Earth 1:10m (public domain): land, countries, Abu Dhabi emirate,
 *     land borders, sea names and city points.
 *   - OpenStreetMap via Overpass (ODbL, © OpenStreetMap contributors): the
 *     western Abu Dhabi coastline and islands, major roads and selected
 *     place / region names.
 *
 * Output: src/data/mapIntro.generated.ts — projected (local equirectangular,
 * kilometres), clipped and simplified per zoom level, with label names taken
 * verbatim from source tags. Nothing here is fetched by the app at runtime.
 *
 * The reference site is a cartographic choice: a natural stretch of beach
 * south-west of Jebel Dhanna, kept clear of the Shuweihat and Ruwais
 * facilities. Its schematic intake geometry comes from src/config/site.ts and
 * does not represent any real installation.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SITE, seabedDepth } from '../src/config/site';
import type { MapIntroData, MapLabelData, MapLabelKind } from '../src/data/mapIntroTypes';
import { encodeLines, encodeRings, type EncodedPath } from './map-intro/encode';
import { cachedDownload, cachedOverpass, type OverpassElement } from './map-intro/fetch';
import {
  buildLand,
  clipLineToRect,
  clipRingToRect,
  joinWays,
  LocalProjection,
  pointInRing,
  rectFromLonLat,
  signedArea,
  simplifyLine,
  simplifyRing,
  type CoastWay,
  type Pt,
  type Rect,
  type Ring,
} from './map-intro/geo';

// ------------------------------------------------------------------ configuration

/** Reference coast point (lon, lat) the schematic intake is placed on. */
const SITE_REF = { lon: 52.5055, lat: 24.1052 };
/** Natural Earth release (pinned so the output is reproducible). */
const NE_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/';

/** Zoom-level extents (lon/lat) and simplification tolerances (km). */
const LEVELS = {
  national: { west: 43.5, south: 15.5, east: 64.5, north: 33.0, tol: 0.45, minArea: 0.8, unit: 0.1 },
  regional: { west: 51.2, south: 23.35, east: 54.15, north: 24.8, tol: 0.045, minArea: 0.01, unit: 0.01 },
  local: { west: 52.3, south: 23.92, east: 52.8, north: 24.38, tol: 0.006, minArea: 0.0004, unit: 0.001 },
};
/** Destination window in site-frame metres (x along-shore, z offshore). */
const DEST = { x0: -3600, x1: 3600, z0: -2600, z1: 1800, tol: 1.2 };

/** OpenStreetMap features to label (names are read from their tags). */
const OSM_LABELS: Array<{ ref: string; kind: MapLabelKind }> = [
  { ref: 'relation/13249274', kind: 'region' }, // Al Dhafrah Region
  { ref: 'node/12455279025', kind: 'city' }, // Al Dhannah
  { ref: 'node/6279196240', kind: 'town' }, // Al Ruwais
  { ref: 'node/1388349998', kind: 'town' }, // Al Mirfa
  { ref: 'node/4454361289', kind: 'town' }, // Sila
  { ref: 'node/9976893616', kind: 'town' }, // Ghiyathi
  { ref: 'node/1192612011', kind: 'town' }, // Zayed City
  { ref: 'relation/13054470', kind: 'island' }, // Sir Bani Yas
  { ref: 'way/13648996', kind: 'island' }, // Dalma
  { ref: 'node/9971490740', kind: 'island' }, // Marawah
  { ref: 'relation/9326281', kind: 'island' }, // Abu Al Abyad
];

/**
 * Cartographic anchors for area labels whose source has no usable label point
 * in view (seas, large countries, the region). Each must fall inside its
 * source polygon where one is available — checked below.
 */
const ANCHORS: Record<string, { lon: number; lat: number }> = {
  'ne:sea:Persian Gulf': { lon: 53.05, lat: 25.55 },
  'ne:sea:Gulf of Oman': { lon: 57.75, lat: 24.75 },
  'ne:country:SAU': { lon: 50.6, lat: 22.75 },
  'ne:country:OMN': { lon: 56.7, lat: 22.4 },
  'ne:country:QAT': { lon: 51.2, lat: 25.3 },
  'ne:emirate:AE-AZ': { lon: 53.55, lat: 23.25 },
  'osm:region': { lon: 52.62, lat: 23.62 },
};

// ------------------------------------------------------------------ helpers

type Geo = { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] } | { type: 'LineString'; coordinates: number[][] } | { type: 'MultiLineString'; coordinates: number[][][] };
interface Feature {
  properties: Record<string, unknown>;
  geometry: Geo;
}

async function ne(name: string): Promise<Feature[]> {
  const body = await cachedDownload(`${name}.geojson`, `${NE_URL}${name}.geojson`);
  return (JSON.parse(body) as { features: Feature[] }).features;
}

const isArabic = (s: string | undefined | null) => !!s && /[؀-ۿ]/.test(s);
const isLatin = (s: string | undefined | null) => !!s && /[A-Za-z]/.test(s) && !isArabic(s);

/** English and Arabic names from OSM tags: name:en / name:ar first, then `name` when it is in that script. */
function osmNames(tags: Record<string, string>): { en: string | null; ar: string | null; enKey: string; arKey: string } {
  const en = tags['name:en'] ?? (isLatin(tags.name) ? tags.name : null);
  const ar = tags['name:ar'] ?? (isArabic(tags.name) ? tags.name : null);
  return { en, ar, enKey: tags['name:en'] ? 'name:en' : 'name', arKey: tags['name:ar'] ? 'name:ar' : 'name' };
}

function polygonsOf(g: Geo): number[][][][] {
  if (g.type === 'Polygon') return [g.coordinates];
  if (g.type === 'MultiPolygon') return g.coordinates;
  return [];
}

function linesOf(g: Geo): number[][][] {
  if (g.type === 'LineString') return [g.coordinates];
  if (g.type === 'MultiLineString') return g.coordinates;
  return [];
}

const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

/** Project, clip, simplify and filter polygon rings (outer rings and holes keep their winding). */
function prepPolygons(polys: number[][][][], P: LocalProjection, rc: Rect, tol: number, minArea: number): Ring[] {
  const out: Ring[] = [];
  for (const poly of polys) {
    for (const ring of poly) {
      const pr: Ring = ring.slice(0, -1).map(([lon, lat]) => P.project(lon, lat));
      const clipped = clipRingToRect(pr, rc);
      if (clipped.length < 3) continue;
      const s = simplifyRing(clipped, tol);
      if (!s || Math.abs(signedArea(s)) < minArea) continue;
      out.push(s);
    }
  }
  return out;
}

function report(name: string, p: EncodedPath): EncodedPath {
  console.log(`  ${name.padEnd(22)} ${String(p.n).padStart(6)} pts  ${(p.d.length / 1024).toFixed(1).padStart(7)} KB`);
  return p;
}

// ------------------------------------------------------------------ main

async function main(): Promise<void> {
  console.log('Map intro data build');

  // ---------------------------------------------------------------- sources
  const [neLand, neCountries, neAdmin1, neBorders, neMarine, nePlaces] = await Promise.all([
    ne('ne_10m_land'),
    ne('ne_10m_admin_0_countries'),
    ne('ne_10m_admin_1_states_provinces'),
    ne('ne_10m_admin_0_boundary_lines_land'),
    ne('ne_10m_geography_marine_polys'),
    ne('ne_10m_populated_places'),
  ]);
  const R = LEVELS.regional;
  const L = LEVELS.local;
  const rb = `(${R.south},${R.west},${R.north},${R.east})`;
  const lb = `(${L.south},${L.west},${L.north},${L.east})`;
  const coastEls = await cachedOverpass('coastline-regional', `[out:json][timeout:240];way["natural"="coastline"]${rb};out geom;`);
  const roadsRegional = await cachedOverpass('roads-regional', `[out:json][timeout:180];way["highway"~"^(motorway|trunk)$"]${rb};out tags geom;`);
  const roadsLocal = await cachedOverpass('roads-local', `[out:json][timeout:180];way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]${lb};out tags geom;`);
  const ids = { node: [] as string[], way: [] as string[], relation: [] as string[] };
  for (const l of OSM_LABELS) {
    const [t, id] = l.ref.split('/') as ['node' | 'way' | 'relation', string];
    ids[t].push(id);
  }
  const labelEls = await cachedOverpass(
    'label-features',
    `[out:json][timeout:120];(node(id:${ids.node.join(',')});way(id:${ids.way.join(',')});rel(id:${ids.relation.join(',')}););out tags center;`,
  );

  // ---------------------------------------------------------------- site placement
  // Join the coastline (land on the left), find the mainland chain nearest the reference
  // point and fit the local shoreline: its direction is the schematic +x axis.
  const P0 = new LocalProjection(SITE_REF.lon, SITE_REF.lat);
  const toWays = (proj: LocalProjection): CoastWay[] =>
    coastEls
      .filter((e) => e.nodes && e.geometry)
      .map((e) => ({ nodes: e.nodes!, pts: (e.geometry!.filter(Boolean) as Array<{ lat: number; lon: number }>).map((g) => proj.project(g.lon, g.lat)) }));
  const joined0 = joinWays(toWays(P0));
  let best: { d: number; chain: Pt[]; i: number } | null = null;
  for (const ch of joined0.chains) {
    for (let i = 0; i < ch.length; i++) {
      const d = Math.hypot(ch[i][0], ch[i][1]);
      if (!best || d < best.d) best = { d, chain: ch, i };
    }
  }
  if (!best || best.d > 0.5) throw new Error('No mainland coastline within 500 m of SITE_REF');
  const fitPts: Pt[] = [];
  {
    const { chain, i } = best;
    fitPts.push(chain[i]);
    for (let k = i + 1, s = 0; k < chain.length && s < 0.9; k++) {
      s += Math.hypot(chain[k][0] - chain[k - 1][0], chain[k][1] - chain[k - 1][1]);
      fitPts.push(chain[k]);
    }
    for (let k = i - 1, s = 0; k >= 0 && s < 0.9; k--) {
      s += Math.hypot(chain[k][0] - chain[k + 1][0], chain[k][1] - chain[k + 1][1]);
      fitPts.unshift(chain[k]);
    }
  }
  const mx = fitPts.reduce((a, p) => a + p[0], 0) / fitPts.length;
  const my = fitPts.reduce((a, p) => a + p[1], 0) / fitPts.length;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of fitPts) {
    sxx += (p[0] - mx) ** 2;
    sxy += (p[0] - mx) * (p[1] - my);
    syy += (p[1] - my) ** 2;
  }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let tx = Math.cos(ang);
  let ty = Math.sin(ang);
  const wdx = fitPts[fitPts.length - 1][0] - fitPts[0][0];
  const wdy = fitPts[fitPts.length - 1][1] - fitPts[0][1];
  if (tx * wdx + ty * wdy < 0) {
    tx = -tx;
    ty = -ty;
  }
  // Offshore normal = shoreline direction rotated clockwise (land lies on the left of +x).
  const nx = ty;
  const ny = -tx;
  // Waterline on the schematic revetment (y = 0 on the slope from toe to crest), as in Coast.ts.
  const toeZ = SITE.shore.toeZ + 0.5;
  const toeY = -seabedDepth(0, SITE.shore.toeZ + 1) - 0.3;
  const waterlineZ = toeZ + (SITE.shore.crestZ - toeZ) * ((0 - toeY) / (SITE.shore.crestY - toeY));
  const intakeX = (SITE.intake.x0 + SITE.intake.x1) / 2;
  // Foot of the reference point on the fitted shoreline; the intake centre sits there.
  const along = -mx * tx - my * ty;
  const footX = mx + tx * along;
  const footY = my + ty * along;
  // Site origin: intakeX metres back along +x, and -waterlineZ metres offshore of the shoreline.
  const ox = footX - (tx * intakeX) / 1000 - (nx * waterlineZ) / 1000;
  const oy = footY - (ty * intakeX) / 1000 - (ny * waterlineZ) / 1000;
  const [lon0, lat0] = P0.unproject(ox, oy);
  const P = new LocalProjection(lon0, lat0);
  const bearingX = ((Math.atan2(tx, ty) * 180) / Math.PI + 360) % 360;
  const bearingZ = (bearingX + 90) % 360;
  let maxDev = 0;
  for (const p of fitPts) maxDev = Math.max(maxDev, Math.abs((p[0] - mx) * nx + (p[1] - my) * ny));
  console.log(
    `  site origin ${lat0.toFixed(5)}N ${lon0.toFixed(5)}E · +x bearing ${bearingX.toFixed(1)}° · offshore ${bearingZ.toFixed(1)}° · shoreline fit ±0.9 km, max dev ${(maxDev * 1000).toFixed(0)} m · waterline z ${waterlineZ.toFixed(2)} m`,
  );

  // Site frame <-> map km.
  const ux: Pt = [tx, ty];
  const uz: Pt = [nx, ny];
  const toSite = (p: Pt): Pt => [(p[0] * ux[0] + p[1] * ux[1]) * 1000, (p[0] * uz[0] + p[1] * uz[1]) * 1000];

  // ---------------------------------------------------------------- national (Natural Earth)
  console.log('national');
  const N = LEVELS.national;
  const nRect = rectFromLonLat(P, N.west, N.south, N.east, N.north);
  const landRings = prepPolygons(
    neLand.flatMap((f) => polygonsOf(f.geometry)),
    P,
    nRect,
    N.tol,
    N.minArea,
  );
  const uae = neCountries.find((f) => f.properties.ADM0_A3 === 'ARE')!;
  const uaeRings = prepPolygons(polygonsOf(uae.geometry), P, nRect, N.tol * 0.6, 0.3);
  const abuDhabi = neAdmin1.find((f) => f.properties.iso_3166_2 === 'AE-AZ')!;
  const adRings = prepPolygons(polygonsOf(abuDhabi.geometry), P, nRect, N.tol * 0.6, 0.3);
  const borderLines: Pt[][] = [];
  for (const f of neBorders) {
    for (const line of linesOf(f.geometry)) {
      const pr = line.map(([lon, lat]) => P.project(lon, lat));
      for (const piece of clipLineToRect(pr, nRect)) borderLines.push(simplifyLine(piece, N.tol * 0.5));
    }
  }
  const national = {
    land: report('land', encodeRings(landRings, N.unit)),
    uae: report('uae', encodeRings(uaeRings, N.unit)),
    abuDhabi: report('abu dhabi emirate', encodeRings(adRings, N.unit)),
    borders: report('borders', encodeLines(borderLines, N.unit)),
  };

  // ---------------------------------------------------------------- regional + local (OpenStreetMap)
  const joined = joinWays(toWays(P));
  console.log(`  coastline: ${joined.rings.length} closed rings, ${joined.chains.length} open chains`);
  const coastLevel = (lv: typeof R) => {
    const rc = rectFromLonLat(P, lv.west, lv.south, lv.east, lv.north);
    const rings = joined.rings.map((r) => simplifyRing(r, lv.tol)).filter((r): r is Ring => !!r && Math.abs(signedArea(r)) >= lv.minArea);
    const chains = joined.chains.map((c) => simplifyLine(c, lv.tol));
    // The rectangle centre is sea for both extents (checked visually); land is closed along the boundary.
    const land = buildLand(rings, chains, rc, false);
    const strokes: Pt[][] = [];
    for (const r of rings) strokes.push(...clipLineToRect([...r, r[0]], rc));
    for (const c of chains) strokes.push(...clipLineToRect(c, rc));
    return { rc, land, strokes };
  };
  console.log('regional');
  const reg = coastLevel(R);
  console.log('local');
  const loc = coastLevel(L);

  const roadLines = (els: OverpassElement[], rc: Rect, tol: number, pick: (hw: string) => boolean): Pt[][] => {
    const out: Pt[][] = [];
    for (const w of els) {
      if (!w.geometry || !pick(w.tags?.highway ?? '')) continue;
      const pr = (w.geometry.filter(Boolean) as Array<{ lat: number; lon: number }>).map((g) => P.project(g.lon, g.lat));
      for (const piece of clipLineToRect(pr, rc)) out.push(simplifyLine(piece, tol));
    }
    return out;
  };
  const major = (hw: string) => hw === 'motorway' || hw === 'trunk' || hw === 'primary';
  const minor = (hw: string) => hw === 'secondary' || hw === 'tertiary';
  const regional = {
    land: report('regional land', encodeRings(reg.land, R.unit)),
    coast: report('regional coast', encodeLines(reg.strokes, R.unit)),
    roads: report('regional roads', encodeLines(roadLines(roadsRegional, reg.rc, R.tol, major), R.unit)),
  };
  const local = {
    land: report('local land', encodeRings(loc.land, L.unit)),
    coast: report('local coast', encodeLines(loc.strokes, L.unit)),
    roadsMajor: report('local roads major', encodeLines(roadLines(roadsLocal, loc.rc, L.tol, major), L.unit)),
    roadsMinor: report('local roads minor', encodeLines(roadLines(roadsLocal, loc.rc, L.tol * 1.5, minor), L.unit)),
  };

  // ---------------------------------------------------------------- destination (site frame, metres)
  // The real shoreline around the reference point, in schematic coordinates, for the
  // coast-straightening hand-off. x must increase monotonically along it.
  const destRectKm: Rect = { x0: -4.2, y0: -4.2, x1: 4.2, y1: 4.2 };
  let destLine: Pt[] = [];
  for (const ch of joined.chains) {
    for (const piece of clipLineToRect(ch, destRectKm)) {
      const s = piece.map(toSite);
      const inWin = s.filter((p) => p[0] >= DEST.x0 - 200 && p[0] <= DEST.x1 + 200 && p[1] >= DEST.z0 && p[1] <= DEST.z1);
      if (inWin.length > destLine.length) destLine = inWin;
    }
  }
  destLine = simplifyLine(destLine, DEST.tol);
  for (let i = 1; i < destLine.length; i++) if (destLine[i][0] <= destLine[i - 1][0]) throw new Error('Destination shoreline is not monotonic in x — choose another reference point');
  const islandsNear = joined.rings.filter((r) => r.some((p) => Math.abs(p[0]) < 4 && Math.abs(p[1]) < 4)).length;
  if (islandsNear) console.warn(`  ! ${islandsNear} island(s) inside the destination window are not drawn in the schematic hand-off`);
  console.log(`  destination shoreline ${destLine.length} pts, x ${destLine[0][0].toFixed(0)}..${destLine[destLine.length - 1][0].toFixed(0)} m`);

  // ---------------------------------------------------------------- labels
  const labels: MapLabelData[] = [];
  const at = (lon: number, lat: number) => {
    const [x, y] = P.project(lon, lat);
    return { x: round(x), y: round(y) };
  };
  const anchorIn = (key: string, rings: number[][][][] | null) => {
    const a = ANCHORS[key];
    if (rings) {
      const pt = P.project(a.lon, a.lat);
      const inside = rings.some((poly) => pointInRing(pt, poly[0].map(([lon, lat]) => P.project(lon, lat))));
      if (!inside) throw new Error(`Label anchor ${key} is outside its source polygon`);
    }
    return at(a.lon, a.lat);
  };
  for (const a3 of ['ARE', 'SAU', 'OMN', 'QAT']) {
    const f = neCountries.find((c) => c.properties.ADM0_A3 === a3)!;
    const p = f.properties as Record<string, string | number>;
    const pos = a3 === 'ARE' ? at(Number(p.LABEL_X), Number(p.LABEL_Y)) : anchorIn(`ne:country:${a3}`, polygonsOf(f.geometry));
    labels.push({ id: `country-${a3.toLowerCase()}`, kind: 'country', en: String(p.NAME_EN), ar: String(p.NAME_AR), ...pos, source: `Natural Earth admin-0 ${a3} · NAME_EN / NAME_AR` });
  }
  for (const [name, id] of [
    ['Persian Gulf', 'sea-gulf'],
    ['Gulf of Oman', 'sea-oman'],
  ] as const) {
    const f = neMarine.find((m) => m.properties.name === name)!;
    const p = f.properties as Record<string, string | null>;
    // Natural Earth records "Arabian Gulf" as the alternate English name (namealt); its Arabic name is name_ar.
    const en = p.namealt ?? p.name_en ?? p.name!;
    labels.push({
      id,
      kind: 'sea',
      en: en!,
      ar: p.name_ar,
      ...anchorIn(`ne:sea:${name}`, polygonsOf(f.geometry)),
      source: `Natural Earth marine polys · ${p.namealt ? 'namealt' : 'name_en'} / name_ar`,
    });
  }
  {
    const p = abuDhabi.properties as Record<string, string>;
    labels.push({ id: 'emirate-abu-dhabi', kind: 'emirate', en: p.name_en, ar: p.name_ar, ...anchorIn('ne:emirate:AE-AZ', polygonsOf(abuDhabi.geometry)), source: 'Natural Earth admin-1 AE-AZ · name_en / name_ar' });
  }
  for (const [name, kind] of [
    ['Abu Dhabi', 'capital'],
    ['Dubai', 'city'],
    ['Al Ayn', 'city'],
  ] as const) {
    const f = nePlaces.find((c) => c.properties.ADM0_A3 === 'ARE' && c.properties.NAME === name)!;
    const p = f.properties as Record<string, string>;
    const [lon, lat] = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
    labels.push({ id: `place-${String(p.NAME_EN).toLowerCase().replace(/\s+/g, '-')}`, kind, en: p.NAME_EN, ar: p.NAME_AR, ...at(lon, lat), source: 'Natural Earth populated places · NAME_EN / NAME_AR' });
  }
  for (const l of OSM_LABELS) {
    const [t, id] = l.ref.split('/');
    const el = labelEls.find((e) => e.type === t && String(e.id) === id);
    if (!el?.tags) throw new Error(`OSM ${l.ref} missing`);
    const names = osmNames(el.tags);
    if (!names.en) throw new Error(`OSM ${l.ref} has no English name`);
    const c = el.center ?? { lat: el.lat!, lon: el.lon! };
    const pos = l.kind === 'region' ? anchorIn('osm:region', null) : at(c.lon, c.lat);
    labels.push({
      id: `osm-${t}-${id}`,
      kind: l.kind,
      en: names.en,
      ar: names.ar,
      ...pos,
      source: `OpenStreetMap ${l.ref} · ${names.enKey}${names.ar ? ` / ${names.arKey}` : ''}`,
    });
  }
  // Road label: the named motorway nearest the site, anchored a little inland of it.
  {
    let bestRoad: { d: number; p: Pt; dir: Pt; tags: Record<string, string> } | null = null;
    for (const w of roadsLocal) {
      const t = w.tags ?? {};
      if (t.highway !== 'motorway' || !(t['name:en'] || isLatin(t.name))) continue;
      const pts = (w.geometry?.filter(Boolean) as Array<{ lat: number; lon: number }>).map((g) => P.project(g.lon, g.lat));
      for (let i = 1; i < pts.length; i++) {
        const m: Pt = [(pts[i][0] + pts[i - 1][0]) / 2, (pts[i][1] + pts[i - 1][1]) / 2];
        // Prefer a point ~4 km along-coast east of the site, where the road is clear of the coastline.
        const d = Math.hypot(m[0] - 3.5, m[1] + 3.5);
        if (!bestRoad || d < bestRoad.d) bestRoad = { d, p: m, dir: [pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]], tags: t };
      }
    }
    if (bestRoad) {
      const n = osmNames(bestRoad.tags);
      const angle = (Math.atan2(bestRoad.dir[1], bestRoad.dir[0]) * 180) / Math.PI;
      const ref = bestRoad.tags.ref ? `${bestRoad.tags.ref} · ` : '';
      labels.push({ id: 'road-e11', kind: 'road', en: `${ref}${n.en}`, ar: n.ar, x: round(bestRoad.p[0]), y: round(bestRoad.p[1]), angle: round(angle, 1), source: `OpenStreetMap highway=motorway · ref / ${n.enKey}` });
    }
  }
  for (const l of labels) console.log(`  label ${l.kind.padEnd(8)} ${l.en} | ${l.ar ?? '—'}  (${l.x}, ${l.y})`);

  // ---------------------------------------------------------------- write
  const rectOut = (rc: Rect) => ({ x0: round(rc.x0), y0: round(rc.y0), x1: round(rc.x1), y1: round(rc.y1) });
  const data: MapIntroData = {
    generatedAt: new Date().toISOString().slice(0, 10),
    attribution: '© OpenStreetMap contributors · Natural Earth',
    projection: { kind: 'local-equirectangular', lon0: round(lon0, 6), lat0: round(lat0, 6), radiusKm: 6371.0088 },
    site: { bearingX: round(bearingX, 2), waterlineZ: round(waterlineZ, 2) },
    levels: {
      national: { unit: N.unit, rect: rectOut(nRect), land: national.land.d, uae: national.uae.d, abuDhabi: national.abuDhabi.d, borders: national.borders.d },
      regional: { unit: R.unit, rect: rectOut(reg.rc), land: regional.land.d, coast: regional.coast.d, roads: regional.roads.d },
      local: { unit: L.unit, rect: rectOut(loc.rc), land: local.land.d, coast: local.coast.d, roadsMajor: local.roadsMajor.d, roadsMinor: local.roadsMinor.d },
    },
    destination: {
      rect: { x0: DEST.x0, x1: DEST.x1, z0: DEST.z0, z1: DEST.z1 },
      shoreline: destLine.flatMap((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]),
    },
    labels,
  };
  // One field per line keeps diffs of a regenerated file readable.
  const j = (v: unknown) => JSON.stringify(v);
  const level = (name: string, o: Record<string, unknown>) =>
    `    ${name}: {\n${Object.entries(o)
      .map(([k, v]) => `      ${k}: ${j(v)},`)
      .join('\n')}\n    },`;
  const body = `// Generated by scripts/build-map-intro-data.ts on ${data.generatedAt} — do not edit by hand.
// Sources: Natural Earth 1:10m (public domain) and OpenStreetMap (ODbL, © OpenStreetMap contributors).
// Projection: local equirectangular about the schematic site origin, kilometres (x east, y north).
import type { MapIntroData } from './mapIntroTypes';

export const MAP_INTRO_DATA: MapIntroData = {
  generatedAt: ${j(data.generatedAt)},
  attribution: ${j(data.attribution)},
  projection: ${j(data.projection)},
  site: ${j(data.site)},
  levels: {
${level('national', data.levels.national)}
${level('regional', data.levels.regional)}
${level('local', data.levels.local)}
  },
  destination: {
    rect: ${j(data.destination.rect)},
    shoreline: ${j(data.destination.shoreline)},
  },
  labels: [
${data.labels.map((l) => `    ${j(l)},`).join('\n')}
  ],
};
`;
  const file = resolve(process.cwd(), 'src/data/mapIntro.generated.ts');
  writeFileSync(file, body);
  console.log(`wrote ${file} (${(body.length / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
