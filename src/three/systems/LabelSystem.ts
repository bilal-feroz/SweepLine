import * as THREE from 'three';

/** 'single' = single view of the SweepLine world, 'base' = single view of the baseline world. */
export type LabelViewport = 'single' | 'base' | 'left' | 'right';
export type LabelTone = 'default' | 'teal' | 'amber' | 'red' | 'cyan';

export interface LabelDef {
  id: string;
  title: string;
  body?: string;
  tone?: LabelTone;
  anchor: () => THREE.Vector3 | null;
  viewports: LabelViewport[];
  /** Whether the label is shown for an above-water camera, an underwater camera, or both. */
  view: 'above' | 'below' | 'any';
  placement?: 'up' | 'right';
  maxDistance?: number;
  minDistance?: number;
  /** Selection kind emitted when the label is clicked. */
  pick?: string;
  /** Inline SVG markup shown in an icon well on the card. */
  icon?: string;
  /** Restrict the label to these app pages (all pages when omitted). */
  pages?: string[];
}

interface LabelEntry {
  def: LabelDef;
  el: HTMLDivElement;
  card: HTMLDivElement;
  title: HTMLDivElement;
  body: HTMLDivElement;
  shown: boolean;
  placed: boolean;
  content: string;
  x: number;
  y: number;
  opacity: number;
  viewport: LabelViewport;
  w: number;
  h: number;
  sizeDirty: boolean;
  stem: number;
  /** Horizontal card shift keeping it inside its viewport. */
  dx: number;
  /** Card drawn below the anchor (not enough room above). */
  below: boolean;
  vpLeft: number;
  vpRight: number;
  vpBottom: number;
}

const v = new THREE.Vector3();
const BASE_STEM = 24;
const GAP = 6;


/**
 * Anchored engineering labels (DOM overlay). Positions are projected from 3D
 * every frame (transforms only); overlapping cards are de-conflicted by
 * lengthening their leader stems. Text changes are applied at snapshot rate.
 * Equivalent to CSS2DRenderer but viewport-aware for the split compare view.
 */
export class LabelSystem {
  readonly layer: HTMLDivElement;
  private readonly entries = new Map<string, LabelEntry>();
  private readonly frame: LabelEntry[] = [];
  enabled = true;
  /** Viewport band at the top kept clear for the camera toolbar (px). */
  topReserved = 60;
  /** Current app page (labels may be page-specific). */
  page = '';
  /** Screen rectangles (viewport px) of HUD overlays that label cards keep clear of. */
  readonly obstacles: Array<{ l: number; r: number; t: number; b: number }> = [];
  private compact = false;
  onPick: ((pick: string) => void) | null = null;

  constructor() {
    this.layer = document.createElement('div');
    this.layer.className = 'sl-label-layer';
  }

  add(def: LabelDef): void {
    const el = document.createElement('div');
    el.className = `sl-label sl-label--${def.placement ?? 'up'}`;
    el.dataset.tone = def.tone ?? 'default';
    const card = document.createElement('div');
    card.className = 'sl-label-card';
    if (def.icon) {
      const icon = document.createElement('div');
      icon.className = 'sl-label-icon';
      icon.innerHTML = def.icon;
      card.appendChild(icon);
    }
    const text = document.createElement('div');
    text.className = 'sl-label-text';
    const title = document.createElement('div');
    title.className = 'sl-label-title';
    title.textContent = def.title;
    const body = document.createElement('div');
    body.className = 'sl-label-body';
    body.textContent = def.body ?? '';
    text.append(title, body);
    card.appendChild(text);
    const stem = document.createElement('div');
    stem.className = 'sl-label-stem';
    const dot = document.createElement('div');
    dot.className = 'sl-label-dot';
    el.append(card, stem, dot);
    if (def.pick) {
      card.style.pointerEvents = 'auto';
      card.style.cursor = 'pointer';
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onPick?.(def.pick!);
      });
    }
    el.style.opacity = '0';
    el.style.visibility = 'hidden';
    this.layer.appendChild(el);
    this.entries.set(def.id, {
      def,
      el,
      card,
      title,
      body,
      shown: false,
      placed: false,
      content: '',
      x: 0,
      y: 0,
      opacity: 0,
      viewport: 'single',
      w: 0,
      h: 0,
      sizeDirty: true,
      stem: BASE_STEM,
      dx: 0,
      below: false,
      vpLeft: 0,
      vpRight: 0,
      vpBottom: 0,
    });
  }

  setContent(id: string, title: string, body: string, tone: LabelTone = 'default'): void {
    const e = this.entries.get(id);
    if (!e) return;
    const key = `${title}|${body}|${tone}`;
    if (key === e.content) return;
    e.content = key;
    e.title.textContent = title;
    e.body.textContent = body;
    e.body.style.display = body ? '' : 'none';
    e.el.dataset.tone = tone;
    e.sizeDirty = true;
  }

  /** Compact cards (title only, smaller) for small viewports. */
  setCompact(compact: boolean): void {
    if (compact === this.compact) return;
    this.compact = compact;
    this.layer.classList.toggle('sl-label-layer--compact', compact);
    for (const e of this.entries.values()) e.sizeDirty = true;
  }

  beginFrame(): void {
    this.frame.length = 0;
    for (const e of this.entries.values()) e.placed = false;
  }

  place(camera: THREE.Camera, viewport: LabelViewport, offsetX: number, width: number, height: number, underwater: boolean): void {
    if (!this.enabled) return;
    for (const e of this.entries.values()) {
      const d = e.def;
      if (!d.viewports.includes(viewport)) continue;
      if (d.pages && !d.pages.includes(this.page)) continue;
      if (d.view === 'above' && underwater) continue;
      if (d.view === 'below' && !underwater) continue;
      const a = d.anchor();
      if (!a) continue;
      const dist = camera.position.distanceTo(a);
      if (d.maxDistance && dist > d.maxDistance) continue;
      if (d.minDistance && dist < d.minDistance) continue;
      v.copy(a).project(camera);
      if (v.z > 1 || v.z < -1) continue;
      const x = offsetX + ((v.x + 1) / 2) * width;
      const y = ((1 - v.y) / 2) * height;
      if (x < offsetX + 8 || x > offsetX + width - 8 || y < 40 || y > height - 8) continue;
      e.x = x;
      e.y = y;
      e.viewport = viewport;
      e.vpLeft = offsetX;
      e.vpRight = offsetX + width;
      e.vpBottom = height;
      e.opacity = d.maxDistance ? Math.min(1, (d.maxDistance - dist) / (d.maxDistance * 0.2)) : 1;
      e.placed = true;
      this.frame.push(e);
    }
  }

  endFrame(): void {
    this.resolveOverlaps();
    for (const e of this.entries.values()) {
      const show = this.enabled && e.placed;
      if (show) {
        e.el.style.transform = `translate3d(${e.x.toFixed(1)}px, ${e.y.toFixed(1)}px, 0)`;
        e.el.style.setProperty('--stem', `${e.stem.toFixed(0)}px`);
        e.el.style.setProperty('--card-dx', `${e.dx.toFixed(0)}px`);
        e.el.classList.toggle('sl-label--below', e.below);
        e.el.style.opacity = e.opacity.toFixed(2);
      } else if (e.shown) e.el.style.opacity = '0';
      if (show !== e.shown) e.el.style.visibility = show ? 'visible' : 'hidden';
      e.shown = show;
    }
  }

  /**
   * Lengthen leader stems so no two "up" cards overlap within a viewport; a card
   * with no room above its anchor (toolbar zone) is drawn below it instead.
   */
  private resolveOverlaps(): void {
    const ups = this.frame.filter((e) => (e.def.placement ?? 'up') === 'up');
    for (const e of ups) {
      if (e.sizeDirty || e.w === 0) {
        e.w = e.card.offsetWidth;
        e.h = e.card.offsetHeight;
        e.sizeDirty = e.w === 0;
      }
    }
    ups.sort((a, b) => b.y - a.y);
    // HUD overlays are obstacles in every viewport; placed cards only block their own viewport.
    const rects: Array<{ l: number; r: number; t: number; b: number; vp: LabelViewport | '*' }> = this.obstacles.map((o) => ({ ...o, vp: '*' as const }));
    const overlaps = (vp: LabelViewport, l: number, r: number, t: number, b: number) =>
      rects.find((o) => (o.vp === vp || o.vp === '*') && l < o.r + GAP && r > o.l - GAP && t < o.b + GAP && b > o.t - GAP);
    for (const e of ups) {
      let l = e.x - 14;
      e.dx = 0;
      if (l + e.w > e.vpRight - 8) e.dx = e.vpRight - 8 - (l + e.w);
      if (l + e.dx < e.vpLeft + 8) e.dx = e.vpLeft + 8 - l;
      l += e.dx;
      const r = l + e.w;
      let stem = BASE_STEM;
      for (let iter = 0; iter < 6; iter++) {
        const hit = overlaps(e.viewport, l, r, e.y - stem - e.h, e.y - stem);
        if (!hit) break;
        stem = e.y - (hit.t - GAP);
      }
      e.below = e.y - stem - e.h < this.topReserved;
      if (e.below) {
        stem = BASE_STEM;
        for (let iter = 0; iter < 6; iter++) {
          const hit = overlaps(e.viewport, l, r, e.y + stem, e.y + stem + e.h);
          if (!hit) break;
          stem = hit.b + GAP - e.y;
        }
        // No room above or below: drop the card rather than overlap or clip it.
        if (stem > 220 || e.y + stem + e.h > e.vpBottom - 6 || overlaps(e.viewport, l, r, e.y + stem, e.y + stem + e.h)) {
          e.placed = false;
          continue;
        }
        e.stem = stem;
        rects.push({ l, r, t: e.y + e.stem, b: e.y + e.stem + e.h, vp: e.viewport });
      } else {
        if (stem > 220 || overlaps(e.viewport, l, r, e.y - stem - e.h, e.y - stem)) {
          e.placed = false;
          continue;
        }
        e.stem = stem;
        rects.push({ l, r, t: e.y - e.stem - e.h, b: e.y - e.stem, vp: e.viewport });
      }
    }
  }
}
