/**
 * Geographic labels for the intro: HTML elements above the SVG map, projected
 * through the map camera each frame but never rotated or scaled with it. Names
 * come verbatim from the generated source data; this file only decides when
 * and how prominently each one appears.
 */
import { MAP_INTRO_DATA } from '../../data/mapIntro.generated';
import type { MapLabelData, MapLabelKind } from '../../data/mapIntroTypes';
import { apply, fadeIn, fadeOut, ramp, smoothstep, type Affine } from './mapCamera';

interface LabelRule {
  /** Fully visible between these spans (km across the short side). */
  min: number;
  max: number;
  priority: number;
  /** Kept on small screens. */
  essential?: boolean;
  /** Point labels get a dot and sit to its right; area labels are centred. */
  dot?: boolean;
}

const KIND_RULES: Record<MapLabelKind, LabelRule> = {
  country: { min: 300, max: Infinity, priority: 6, essential: true },
  sea: { min: 260, max: Infinity, priority: 5, essential: true },
  emirate: { min: 210, max: 520, priority: 5, essential: true },
  capital: { min: 170, max: Infinity, priority: 7, dot: true, essential: true },
  city: { min: 240, max: Infinity, priority: 5, dot: true },
  region: { min: 45, max: 235, priority: 8, essential: true },
  town: { min: 9, max: 150, priority: 4, dot: true },
  island: { min: 9, max: 140, priority: 4 },
  road: { min: 5, max: 30, priority: 3 },
};

/** Per-label adjustments (ids from the generated data). */
const OVERRIDES: Record<string, Partial<LabelRule> & { hidden?: boolean }> = {
  // The caption names the UAE; neighbours stay subdued.
  'country-are': { hidden: true },
  // Al Dhannah is the destination: a city label held through the coastal approach.
  'osm-node-12455279025': { min: 4.5, max: 130, priority: 9, essential: true },
  'osm-node-6279196240': { priority: 6 },
  'osm-relation-13054470': { priority: 6, min: 6 },
};

export interface MapLabel {
  data: MapLabelData;
  rule: LabelRule;
  el: HTMLDivElement;
  /** Text box relative to the anchor (px), measured after layout. */
  box: { l: number; t: number; r: number; b: number };
  /** svg km */
  sx: number;
  sy: number;
  opacity: number;
  lastTransform: string;
}

export interface Box {
  l: number;
  t: number;
  r: number;
  b: number;
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

export class MapLabels {
  readonly labels: MapLabel[] = [];
  private readonly placed: Array<Box & { w: number }> = [];

  constructor(readonly root: HTMLElement) {
    for (const d of MAP_INTRO_DATA.labels) {
      const o = OVERRIDES[d.id];
      if (o?.hidden) continue;
      const rule = { ...KIND_RULES[d.kind], ...o };
      const div = el('div', 'sl-ml') as HTMLDivElement;
      div.dataset.kind = d.kind;
      if (rule.dot) div.dataset.dot = '';
      if (rule.dot) div.appendChild(el('span', 'sl-ml-dot'));
      const text = el('span', 'sl-ml-text');
      text.appendChild(el('span', 'sl-ml-en', d.en));
      if (d.ar && d.kind !== 'road') {
        const ar = el('span', 'sl-ml-ar', d.ar);
        ar.lang = 'ar';
        ar.dir = 'rtl';
        text.appendChild(ar);
      }
      div.appendChild(text);
      div.title = d.source;
      root.appendChild(div);
      this.labels.push({ data: d, rule, el: div, box: { l: 0, t: 0, r: 0, b: 0 }, sx: d.x, sy: -d.y, opacity: -1, lastTransform: '' });
    }
  }

  /** Remove the label elements (the player is being torn down). */
  dispose(): void {
    for (const l of this.labels) l.el.remove();
    this.labels.length = 0;
  }

  /** Measure label boxes (call after fonts load and on resize). */
  measure(): void {
    for (const l of this.labels) {
      const text = l.el.querySelector('.sl-ml-text') as HTMLElement;
      const prevT = l.el.style.transform;
      l.el.style.transform = 'translate3d(0px, 0px, 0)';
      const base = l.el.getBoundingClientRect();
      const r = text.getBoundingClientRect();
      l.el.style.transform = prevT;
      l.box = { l: r.left - base.left - 3, t: r.top - base.top - 2, r: r.right - base.left + 3, b: r.bottom - base.top + 2 };
    }
  }

  /**
   * Place labels for this frame. `fade` scales all label opacity (e.g. while the
   * schematic takes over), `rotDeg` is the camera rotation (for road labels),
   * `obstacles` are screen boxes labels must avoid.
   */
  update(m: Affine, span: number, rotDeg: number, fade: number, small: boolean, obstacles: Box[]): void {
    const placed = this.placed;
    placed.length = 0;
    for (const o of obstacles) placed.push({ ...o, w: 1 });
    const order = this.labels.slice().sort((a, b) => b.rule.priority - a.rule.priority);
    for (const l of order) {
      const r = l.rule;
      let o = fade * fadeIn(span, r.min * 0.72, r.min) * (r.max === Infinity ? 1 : fadeOut(span, r.max, r.max * 1.4));
      if (small && !r.essential) o = 0;
      const [x, y] = apply(m, l.sx, l.sy);
      if (o > 0.01) {
        const b = { l: x + l.box.l, t: y + l.box.t, r: x + l.box.r, b: y + l.box.b };
        let worst = 0;
        const area = Math.max(1, (b.r - b.l) * (b.b - b.t));
        for (const p of placed) {
          const iw = Math.min(b.r, p.r) - Math.max(b.l, p.l);
          const ih = Math.min(b.b, p.b) - Math.max(b.t, p.t);
          if (iw > 0 && ih > 0) worst = Math.max(worst, ((iw * ih) / area) * p.w);
        }
        // Soft, frame-stable collision handling: overlapping lower-priority labels fade out.
        o *= 1 - smoothstep(ramp(worst, 0.02, 0.28));
        if (o > 0.05) placed.push({ ...b, w: o });
      }
      let transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      if (l.data.kind === 'road' && l.data.angle !== undefined) {
        // Follow the road on screen, kept upright.
        let a = -l.data.angle + rotDeg;
        a = ((a + 540) % 360) - 180;
        if (a > 90) a -= 180;
        if (a < -90) a += 180;
        transform += ` rotate(${a.toFixed(1)}deg)`;
      }
      if (Math.abs(o - l.opacity) > 0.004) {
        l.opacity = o;
        l.el.style.opacity = o.toFixed(3);
        l.el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
      }
      if (o >= 0.01 && transform !== l.lastTransform) {
        l.lastTransform = transform;
        l.el.style.transform = transform;
      }
    }
  }
}
