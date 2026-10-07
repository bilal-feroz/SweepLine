/**
 * Download-once cache for the map-intro data build. Raw source files are kept in
 * `.cache/map-intro/` (git-ignored) so re-running the build never hits the
 * network again unless `--refresh` is passed.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const CACHE_DIR = resolve(process.cwd(), '.cache/map-intro');
const REFRESH = process.argv.includes('--refresh');
const USER_AGENT = 'SweepLine-map-intro-build/1.0 (one-off build-time data preparation)';

/** Public Overpass instances, tried in order. */
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function cachePath(name: string): string {
  mkdirSync(CACHE_DIR, { recursive: true });
  return resolve(CACHE_DIR, name);
}

/** Fetch a URL once and cache the body under `name`. */
export async function cachedDownload(name: string, url: string): Promise<string> {
  const file = cachePath(name);
  if (!REFRESH && existsSync(file)) return readFileSync(file, 'utf8');
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      console.log(`  ↓ ${name} (attempt ${attempt})`);
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.text();
      writeFileSync(file, body);
      return body;
    } catch (err) {
      console.warn(`    ${name}: ${(err as Error).message}`);
      await sleep(2000 * attempt);
    }
  }
  throw new Error(`Could not download ${url}`);
}

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  nodes?: number[];
  geometry?: Array<{ lat: number; lon: number } | null>;
  tags?: Record<string, string>;
  members?: Array<{ type: string; ref: number; role: string; geometry?: Array<{ lat: number; lon: number } | null> }>;
}

/** Run an Overpass QL query once (cached by name + query hash), falling back across public instances. */
export async function cachedOverpass(name: string, query: string): Promise<OverpassElement[]> {
  const hash = createHash('sha1').update(query).digest('hex').slice(0, 10);
  const file = cachePath(`${name}.${hash}.json`);
  if (!REFRESH && existsSync(file)) return (JSON.parse(readFileSync(file, 'utf8')) as { elements: OverpassElement[] }).elements;
  for (let attempt = 0; attempt < OVERPASS.length * 3; attempt++) {
    const endpoint = OVERPASS[attempt % OVERPASS.length];
    try {
      console.log(`  ↓ overpass ${name} via ${new URL(endpoint).host} (attempt ${attempt + 1})`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      const body = await res.text();
      if (!res.ok || !body.trimStart().startsWith('{')) throw new Error(`HTTP ${res.status}`);
      const json = JSON.parse(body) as { elements: OverpassElement[]; remark?: string };
      if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) throw new Error(json.remark);
      writeFileSync(file, body);
      return json.elements;
    } catch (err) {
      console.warn(`    ${name}: ${(err as Error).message}`);
      await sleep(3000 + 2000 * Math.floor(attempt / OVERPASS.length));
    }
  }
  throw new Error(`Overpass query "${name}" failed on every instance`);
}
