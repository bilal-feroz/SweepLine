/**
 * Runs the geographic intro: one requestAnimationFrame loop writes the camera
 * transform, layer opacities, labels and the schematic overlay straight to the
 * DOM (React only mounts the scaffolding), holds on the reference site until
 * the digital twin is ready, then hands off to the Three.js view. The run waits
 * at its first moment (bloom approaching, curtain stowed) until the hand-off.
 */
import { getScene } from '../../app/runtime';
import { useApp } from '../../app/store';
import { SITE } from '../../config/site';
import { controller } from '../../simulation/SimController';
import { orbitPose, presetPose, type CameraPose } from '../../three/cameras/CameraRig';
import { approachingBloom } from '../../utils/format';
import { handoffPose, type ScreenRect } from './handoff';
import { bloomDots, buildSchematic, currentStreaks, shoreline, SiteFrame, subPath, type Polyline, type Schematic } from './introStory';
import { buildChoreography, flightProgress, stateAt, T, type IntroState } from './introTimeline';
import { apply, cameraAffine, fadeIn, multiply, niceLength, ramp, svgMatrix, viewportOf, type Affine, type IntroViewport, type MapCamera } from './mapCamera';
import { MapLabels, type Box } from './mapLabels';

export type IntroMode = 'play' | 'frozen' | 'reduced';

const SMALL_SCREEN = 600;
/** Pre-roll chunk cap while the map animates (ms); chunks then run only in idle time between frames. */
const PREROLL_SLICE_ANIMATING = 8;
/** Real-time warm-up of the 3D view behind the map (shadow map, post-processing shaders) before it is suspended. */
const WARMUP_MS = 420;
/**
 * The first 3D frame stalls while shaders are set up, so it is drawn while nothing on the map moves
 * but the slow opening push-in (the UAE caption's hold, intro seconds) if the background compile
 * has finished by then, otherwise once the map has landed on the site, where the intro holds until
 * it has been drawn.
 */
const WARMUP_WINDOW = [0.46, 0.96] as const;
/** Longest wait on the landed site for the background compile before warming up regardless (ms). */
const COMPILE_WAIT_MS = 4000;
/** Speed-up applied to the rest of the sequence after a skip. */
const SKIP_SPEED = 2.4;

const AMBER: [number, number, number] = [245, 185, 76];
const TEAL: [number, number, number] = [45, 212, 191];

function q<T extends Element>(root: ParentNode, sel: string): T {
  const e = root.querySelector(sel);
  if (!e) throw new Error(`Intro element missing: ${sel}`);
  return e as T;
}

/** Write an opacity (and hide the element when it is fully transparent) only when it changes. */
function setOpacity(el: HTMLElement | SVGElement, o: number, cache: Map<Element, number>): void {
  const prev = cache.get(el);
  if (prev !== undefined && Math.abs(prev - o) < 0.003) return;
  cache.set(el, o);
  el.style.opacity = o.toFixed(3);
  el.style.display = o < 0.004 ? 'none' : '';
}

function mixRgb(a: [number, number, number], b: [number, number, number], k: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * k)}, ${Math.round(a[1] + (b[1] - a[1]) * k)}, ${Math.round(a[2] + (b[2] - a[2]) * k)})`;
}

function rectOf(el: Element | null): ScreenRect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
}

export class IntroPlayer {
  private readonly root: HTMLDivElement;
  private readonly svg: SVGSVGElement;
  private readonly camGroup: SVGGElement;
  private readonly site = new SiteFrame();
  private readonly choreo = buildChoreography(this.site.offshoreUpRot);
  private readonly labels: MapLabels;
  private readonly opacity = new Map<Element, number>();
  private readonly els: Record<string, HTMLElement | SVGElement> = {};
  private readonly m: Affine = [1, 0, 0, 1, 0, 0];
  private readonly mSite: Affine = [1, 0, 0, 1, 0, 0];
  private schematic: Schematic | null = null;
  private guide: Polyline | null = null;

  private mode: IntroMode;
  private t = 0;
  private ambient = 0;
  private speed = 1;
  private raf = 0;
  private last = 0;
  /** Loop frames run so far: shader work starts only once the first map frame is on screen. */
  private frames = 0;
  private compiled = false;
  /** When the 3D warm-up started (-1: not yet). */
  private warmAt = -1;
  private vp: IntroViewport;
  private canvas: ScreenRect | null = null;
  private slot: ScreenRect | null = null;
  private handoff: CameraPose | null = null;
  private flightStarted = false;
  private finished = false;
  private noHandoff = false;
  private exiting = false;
  private holdSince = -1;
  private lastMorph = -1;
  private lastStatus = '';
  private pipelineLit = -1;
  private eyebrowPlaced = false;
  private savedSlice: number;
  private savedPaused: boolean | null = null;
  private savedMaxDistance = 0;
  private readonly cleanups: Array<() => void> = [];

  constructor(
    root: HTMLDivElement,
    mode: IntroMode,
    private readonly onDone: () => void,
  ) {
    this.root = root;
    this.mode = mode;
    this.svg = q(root, 'svg');
    this.camGroup = q(root, '[data-cam]');
    for (const e of root.querySelectorAll<HTMLElement | SVGElement>('[data-l],[data-s],[data-o]')) {
      const key = e.getAttribute('data-l') ?? e.getAttribute('data-s') ?? e.getAttribute('data-o');
      if (key) this.els[key] = e;
    }
    this.labels = new MapLabels(q(root, '[data-o="labels"]'));
    this.vp = viewportOf(root.clientWidth || window.innerWidth, root.clientHeight || window.innerHeight);
    this.savedSlice = controller.preRollSliceMs;
  }

  // ------------------------------------------------------------------ lifecycle

  /** Begin at `atMs` (frozen mode renders that frame and stops). */
  start(atMs = 0): void {
    const sm = getScene();
    this.savedMaxDistance = sm.controls.maxDistance;
    this.updateSlice();
    this.setHud(0);
    this.measure();
    void document.fonts?.ready.then(() => {
      if (!this.finished) this.labels.measure();
    });

    const onResize = () => this.measure();
    window.addEventListener('resize', onResize);
    // Only Escape skips; clicks and other keys do nothing while the intro plays.
    const onKey = (e: KeyboardEvent) => {
      if (this.mode !== 'frozen' && e.key === 'Escape') this.skip();
    };
    window.addEventListener('keydown', onKey);
    const unsub = useApp.subscribe((s, prev) => {
      if (s.ui.page !== prev.ui.page && s.ui.page !== 'live') this.leaveWithoutHandoff();
    });
    const onVisibility = () => this.updateSlice();
    document.addEventListener('visibilitychange', onVisibility);
    this.cleanups.push(
      () => window.removeEventListener('resize', onResize),
      () => window.removeEventListener('keydown', onKey),
      () => document.removeEventListener('visibilitychange', onVisibility),
      unsub,
    );

    if (this.mode === 'frozen') {
      this.freezeAt(atMs);
      return;
    }
    this.holdRun();
    if (this.mode === 'reduced') {
      // No zoom: the reference-site frame, then a short fade once the twin is ready.
      this.t = T.site;
      this.render(T.site, 0);
      this.loop(performance.now());
      return;
    }
    this.t = atMs / 1000;
    this.ambient = this.t;
    this.render(this.t, this.ambient);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    for (const c of this.cleanups.splice(0)) c();
    this.labels.dispose();
    this.restore(!this.finished);
  }

  /**
   * While the map animates on screen, the pre-roll runs in short chunks in the idle time
   * between frames, so it never delays one. In a hidden tab timers are throttled and
   * nothing animates, so the normal budget lets initialisation finish.
   */
  private updateSlice(): void {
    const animating = this.mode === 'play' && !this.finished && document.visibilityState === 'visible';
    controller.preRollSliceMs = animating ? PREROLL_SLICE_ANIMATING : this.savedSlice;
    controller.preRollIdle = animating;
  }

  /** Undo every side effect on the app (also on an early unmount). */
  private restore(resetCamera: boolean): void {
    const sm = getScene();
    controller.preRollSliceMs = this.savedSlice;
    controller.preRollIdle = false;
    sm.renderSuspended = false;
    sm.controls.maxDistance = this.savedMaxDistance || sm.controls.maxDistance;
    this.releaseRun();
    if (resetCamera && this.handoff) sm.rig.snap('aerial', controller.sweepline.curtain!.layout);
    this.setHud(null);
  }

  /** Keep the run at its current moment (the bloom approach) until the 3D view takes over. */
  private holdRun(): void {
    if (this.savedPaused !== null) return;
    this.savedPaused = controller.paused;
    controller.paused = true;
  }

  private releaseRun(): void {
    if (this.savedPaused === null) return;
    controller.paused = this.savedPaused;
    this.savedPaused = null;
  }

  // ------------------------------------------------------------------ public controls

  /** Skip: jump to the reference-site frame and play the hand-off quickly. */
  skip(): void {
    if (this.finished || this.mode === 'frozen') return;
    if (this.mode === 'reduced') return;
    if (this.t >= T.flyStart) {
      this.complete(true);
      return;
    }
    if (this.t < T.site) {
      this.t = T.site;
      this.ambient = Math.max(this.ambient, T.site);
    }
    this.speed = SKIP_SPEED;
  }

  /** Render exactly the frame at `ms` and stop (development capture). */
  freezeAt(ms: number): void {
    this.mode = 'frozen';
    this.updateSlice();
    cancelAnimationFrame(this.raf);
    this.holdRun();
    this.measure();
    this.labels.measure();
    this.t = Math.max(0, Math.min(T.end, ms / 1000));
    this.ambient = this.t;
    this.render(this.t, this.ambient);
  }

  /** Resume normal playback from `ms` (the run is released at the hand-off, as on opening). */
  playFrom(ms: number): void {
    this.holdRun();
    this.mode = 'play';
    this.finished = false;
    this.flightStarted = false;
    this.speed = 1;
    this.updateSlice();
    this.t = Math.max(0, ms / 1000);
    this.ambient = this.t;
    // From the start the warm-up runs again; later on, the 3D view is treated as warmed up.
    this.frames = 0;
    this.warmAt = this.t < 0.5 ? -1 : performance.now() - WARMUP_MS;
    cancelAnimationFrame(this.raf);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ loop

  private readonly loop = (now: number): void => {
    if (this.finished) return;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.frames++;
    this.prepare3d();
    const ready = this.ready();
    if (this.mode === 'reduced') {
      if (ready || this.noHandoff) {
        this.exitFade();
        return;
      }
      this.updateProgress(true);
      this.raf = requestAnimationFrame(this.loop);
      return;
    }
    this.ambient += dt;
    let t = this.t + dt * this.speed;
    // Without a 3D view to land in (another page, zero-size canvas) the intro simply fades away.
    if (t >= T.site && !this.handoff && controller.ready) this.noHandoff = true;
    if (t >= T.site && this.t <= T.site + 1e-6 && !ready) t = T.site; // hold on the site
    if (this.noHandoff && t >= T.site) {
      this.exitFade();
      return;
    }
    this.t = t;
    // The run starts as the map gives way to the 3D view.
    if (this.t >= T.fadeStart) this.releaseRun();
    if (this.t >= T.end) {
      this.complete(false);
      return;
    }
    this.render(this.t, this.ambient);
    this.raf = requestAnimationFrame(this.loop);
  };

  private ready(): boolean {
    return controller.ready && !useApp.getState().loading.active && this.handoff !== null && (this.mode !== 'play' || this.warmAt >= 0);
  }

  /**
   * Shader work for the 3D view starts once the first map frame is on screen: background
   * compilation from the second frame, then the warm-up on a still map (see WARMUP_WINDOW).
   */
  private prepare3d(): void {
    if (this.mode !== 'play' || this.warmAt >= 0) return;
    if (this.frames === 2) void getScene().precompile().then(() => (this.compiled = true));
    if (this.frames <= 2) return;
    const still = this.t >= WARMUP_WINDOW[0] && this.t < WARMUP_WINDOW[1];
    const landed = this.t >= T.site - 1e-6;
    const overdue = landed && this.holdSince >= 0 && performance.now() - this.holdSince > COMPILE_WAIT_MS;
    if ((this.compiled && (still || landed)) || overdue) this.warmAt = performance.now();
  }

  // ------------------------------------------------------------------ measurement

  private measure(): void {
    const w = this.root.clientWidth || window.innerWidth;
    const h = this.root.clientHeight || window.innerHeight;
    this.vp = viewportOf(w, h);
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.labels.measure();
    const sm = getScene();
    // The scene resizes its canvas from a ResizeObserver, which runs after this resize
    // handler (and not at all in a hidden tab): bring it up to date before measuring.
    if (sm.attached) sm.forceResize();
    this.canvas = sm.attached ? rectOf(sm.renderer.domElement) : null;
    this.slot = rectOf(sm.renderer.domElement.closest('[data-viewport]'));
    if (this.canvas) {
      const final = this.choreo.camera(T.site);
      const m = cameraAffine(final, this.vp, this.site.lock[0], this.site.lock[1]);
      this.handoff = handoffPose(m, this.site.toSvg, this.canvas, sm.camera.fov);
      // A tall portrait canvas can need more height than the orbit limit allows.
      sm.controls.maxDistance = Math.max(this.savedMaxDistance, this.handoff.pos.y * 1.1);
      if (this.mode !== 'reduced' && (this.t >= T.render || this.t < 0.6) && this.t < T.flyStart) sm.rig.setPose(this.handoff);
    } else this.handoff = null;
    this.placeChrome();
  }

  /** Position the caption, mask and wordmark against the app layout underneath. */
  private placeChrome(): void {
    const slot = this.slot ?? { left: 12, top: 72, width: this.vp.w - 24, height: this.vp.h - 84 };
    const eyebrowRect = rectOf(document.querySelector('[data-live-eyebrow]'));
    this.eyebrowPlaced = eyebrowRect !== null;
    const ex = eyebrowRect ? eyebrowRect.left : slot.left + 38;
    const ey = eyebrowRect ? eyebrowRect.top : slot.top + 34;
    const set = (key: string, x: number, y: number) => {
      const e = this.els[key] as HTMLElement;
      e.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    };
    set('captions', ex, ey);
    set('handoff-text', ex, ey);
    const mask = this.els.mask as HTMLElement;
    mask.style.left = `${slot.left}px`;
    mask.style.top = `${slot.top}px`;
    mask.style.width = `${slot.width}px`;
    mask.style.height = `${slot.height}px`;
    const brand = rectOf(document.querySelector('[data-topbar-brand]'));
    set('wordmark', brand ? brand.left : 20, brand ? brand.top : 15);
  }

  // ------------------------------------------------------------------ frame

  private render(t: number, a: number): void {
    const cam: MapCamera = this.choreo.camera(t);
    const st = stateAt(t, cam.span);
    const m = cameraAffine(cam, this.vp, this.site.lock[0], this.site.lock[1], this.m);
    this.camGroup.setAttribute('transform', svgMatrix(m));
    multiply(m, this.site.toSvg, this.mSite);
    const small = this.vp.s < SMALL_SCREEN;

    this.renderLevels(st, small);
    this.renderStory(st, a);
    this.renderOverlay(t, st, cam, small);
    this.sync3d(t);
    this.updateProgress(false);
    // The Live headline (whose eyebrow the closing caption becomes) appears with the first snapshot.
    if (!this.eyebrowPlaced && t > 3 && document.querySelector('[data-live-eyebrow]')) this.placeChrome();
    // The map is hidden until its first frame has been laid out (see intro.css).
    if (!this.root.hasAttribute('data-ready')) this.root.setAttribute('data-ready', '');
  }

  private renderLevels(st: IntroState, small: boolean): void {
    const o = (k: string, v: number) => setOpacity(this.els[k], v, this.opacity);
    // Finer fills fade in over coarser ones that stay opaque until covered; lines crossfade.
    o('ne-fill', st.neFill);
    o('ne-line', 1 - st.regional);
    o('uae', st.uae);
    o('ad', st.abuDhabi);
    o('borders', st.borders * (1 - st.dest));
    o('reg-fill', st.regional * st.regFill);
    o('reg-line', st.regional * (1 - st.local));
    o('loc-fill', st.local * st.localKeep);
    o('loc-line', st.local * (1 - st.dest));
    o('loc-minor', small ? 0 : 1);
    o('dest', st.dest);
    if (st.dest > 0 && Math.abs(st.morph - this.lastMorph) > 1e-4) {
      this.lastMorph = st.morph;
      const s = shoreline(st.morph, this.site.waterlineZ);
      this.els['dest-land'].setAttribute('d', s.land);
      this.els['dest-line'].setAttribute('d', s.line);
    }
  }

  private renderStory(st: IntroState, a: number): void {
    const o = (k: string, v: number) => setOpacity(this.els[k], v, this.opacity);
    if (!this.schematic) {
      const layout = controller.sweepline.curtain!.layout;
      this.schematic = buildSchematic(layout);
      const sc = this.schematic;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < sc.curtain.x.length; i++) pts.push([sc.curtain.x[i], sc.curtain.z[i]]);
      for (let i = 0; i < sc.route.x.length; i++) pts.push([sc.route.x[i], sc.route.z[i]]);
      let acc = 0;
      const guide: Polyline = { x: [], z: [], s: [], length: 0 };
      pts.forEach(([x, z], i) => {
        if (i > 0) acc += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
        guide.x.push(x);
        guide.z.push(z);
        guide.s.push(acc);
      });
      guide.length = acc;
      this.guide = guide;
      this.els.intake.setAttribute('d', sc.intake);
      this.els['intake-face'].setAttribute('d', sc.intakeFace);
      const rel = this.els.release;
      rel.setAttribute('cx', String(sc.release.x));
      rel.setAttribute('cy', String(sc.release.z));
      rel.setAttribute('r', String(sc.release.r));
      const th = this.els.throat;
      th.setAttribute('cx', String(sc.throat.x));
      th.setAttribute('cy', String(sc.throat.z));
    }
    const sc = this.schematic;
    const g = this.guide!;
    const story = Math.max(st.haze, st.dots, st.current, st.intake);
    o('story', story > 0 ? 1 : 0);
    o('reticle', st.reticle * (1 - st.reticleToIntake));
    if (story <= 0 && st.reticle <= 0) return;

    o('haze', st.haze * 0.9);
    o('dots', st.dots);
    if (st.dots > 0) {
      const d = bloomDots(controller.sweepline, controller.ready, a);
      this.els['dots-bright'].setAttribute('d', d.bright);
      this.els['dots-dim'].setAttribute('d', d.dim);
    }
    o('streaks', st.current);
    if (st.current > 0) {
      const c = currentStreaks(a);
      this.els['streak-tails'].setAttribute('d', c.tails);
      this.els['streak-heads'].setAttribute('d', c.heads);
    }

    o('intake', st.intake * 0.9);
    o('intake-face', st.intake);
    (this.els['intake-face'] as SVGElement).style.stroke = mixRgb(AMBER, TEAL, st.intakeSafe);
    o('curtain', st.curtainDraw > 0 ? 1 : 0);
    if (st.curtainDraw > 0) this.els.curtain.setAttribute('d', subPath(sc.curtain, 0, sc.curtain.length * st.curtainDraw));
    o('route', st.routeDraw > 0 ? 1 : 0);
    if (st.routeDraw > 0) this.els.route.setAttribute('d', subPath(sc.route, 0, sc.route.length * st.routeDraw));
    o('throat', fadeIn(st.curtainDraw, 0.75, 1));
    o('release', fadeIn(st.routeDraw, 0.8, 1));
    o('pulse', st.pulse);
    if (st.pulse > 0) {
      // A short highlight travels the guide path: along the curtain, into the throat, around the intake.
      const L = g.length;
      const head = ((a * 150) % (L + 140)) - 20;
      this.els.pulse.setAttribute('d', subPath(g, head - 46, head));
    }

    // Reticle (screen space) on the reference point.
    const [rx, ry] = apply(this.m, this.site.lock[0], this.site.lock[1]);
    (this.els.reticle as SVGElement).setAttribute('transform', `translate(${rx.toFixed(1)} ${ry.toFixed(1)})`);
    const ring = this.els['reticle-ring'];
    ring.setAttribute('r', (15 - 9 * st.reticleToIntake).toFixed(2));
    const pulse = this.els['reticle-pulse'];
    const pk = st.reticlePulse;
    pulse.setAttribute('r', (15 + 34 * Math.sqrt(pk)).toFixed(2));
    (pulse as SVGElement).style.opacity = (pk > 0 && pk < 1 ? 0.55 * (1 - pk) : 0).toFixed(3);
  }

  private renderOverlay(t: number, st: IntroState, cam: MapCamera, small: boolean): void {
    const o = (k: string, v: number) => setOpacity(this.els[k], v, this.opacity);
    // Geographic labels give way as the schematic takes over.
    const geoFade = 1 - Math.max(st.dest, fadeIn(t, 3.35, 3.7));
    const obstacles: Box[] = [];
    const [rx, ry] = apply(this.m, this.site.lock[0], this.site.lock[1]);
    if (st.reticle > 0.05) obstacles.push({ l: rx - 22, t: ry - 22, r: rx + 240, b: ry + 22 });
    this.labels.update(this.m, cam.span, cam.rot, geoFade, small, obstacles);

    // Project annotations.
    const siteLabel = this.els['site-label'] as HTMLElement;
    o('site-label', st.siteLabel);
    if (st.siteLabel > 0) siteLabel.style.transform = `translate3d(${(rx + 22).toFixed(1)}px, ${(ry - 15).toFixed(1)}px, 0)`;
    o('intake-label', st.intakeLabel);
    if (st.intakeLabel > 0) {
      // Beside the intake's seaward corner (upstream side, where the bloom arrives).
      const [ix, iy] = apply(this.mSite, SITE.intake.x0 - 8, SITE.intake.mouthZ + 3);
      const il = this.els['intake-label'] as HTMLElement;
      il.style.transform = `translate3d(${ix.toFixed(1)}px, ${iy.toFixed(1)}px, 0)`;
      il.style.color = mixRgb(AMBER, TEAL, st.intakeSafe);
    }
    o('current-label', st.currentLabel * st.map);
    if (st.currentLabel > 0) {
      const [cx, cy] = apply(this.mSite, -150, 132);
      (this.els['current-label'] as HTMLElement).style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
      const ax = this.mSite[0];
      const ay = this.mSite[1];
      (this.els['current-arrow'] as HTMLElement).style.transform = `rotate(${((Math.atan2(ay, ax) * 180) / Math.PI).toFixed(1)}deg)`;
    }
    // Captions and hand-off text.
    o('cap-uae', st.captionUae);
    o('cap-west', st.captionWest);
    o('cap-coast', st.captionCoast);
    o('eyebrow', st.eyebrow);
    if (st.eyebrow > 0) {
      const b = approachingBloom(controller.params.bloomDensity);
      const eb = this.els.eyebrow as HTMLElement;
      if (eb.dataset.text !== b.text) {
        eb.dataset.text = b.text;
        eb.dataset.tone = b.tone;
        (this.els['eyebrow-text'] as HTMLElement).textContent = b.text;
      }
    }
    o('pipeline', st.pipeline);
    const lit = Math.min(4, Math.floor(st.pipelineStep + 1e-6));
    if (lit !== this.pipelineLit) {
      this.pipelineLit = lit;
      (this.els.pipeline as HTMLElement).querySelectorAll('[data-step]').forEach((w, i) => w.toggleAttribute('data-lit', i < lit));
    }
    o('wordmark', st.wordmark);
    o('tagline', fadeIn(t, 4.3, 4.6) * (1 - fadeIn(t, 5.45, 5.8)));
    (this.els.mask as HTMLElement).style.setProperty('--mask', st.mask.toFixed(3));
    o('mask', st.mask > 0.002 ? 1 : 0);

    // Map surfaces and their furniture fade together.
    o('map', st.map);
    o('scale', st.map);
    o('attrib', st.map);
    if (st.map > 0) this.updateScale(cam);

    const stage = t < 1.15 ? 'United Arab Emirates' : t < 2.5 ? 'Abu Dhabi, western coast' : t < 3.2 ? 'Al Dhannah coast' : t < T.fadeStart ? 'SweepLine reference site — schematic coastal intake (engineering simulation)' : 'Entering the live digital twin';
    if (stage !== this.lastStatus) {
      this.lastStatus = stage;
      (this.els.status as HTMLElement).textContent = stage;
    }
    this.setHud(st.hud);
  }

  private updateScale(cam: MapCamera): void {
    const kmPerPx = cam.span / this.vp.s;
    const len = niceLength(kmPerPx * 110);
    const px = len / kmPerPx;
    (this.els['scale-bar'] as HTMLElement).style.width = `${px.toFixed(1)}px`;
    const text = len >= 1 ? `${len} km` : `${Math.round(len * 1000)} m`;
    const el = this.els['scale-text'] as HTMLElement;
    if (el.textContent !== text) el.textContent = text;
  }

  /** "Initialising digital twin · 82%" while the intro waits on the reference site. */
  private updateProgress(force: boolean): void {
    const holding = force || (this.t >= T.site - 1e-6 && !this.ready() && !this.noHandoff);
    if (holding && this.holdSince < 0) this.holdSince = performance.now();
    if (!holding) this.holdSince = -1;
    // A short hold (the first 3D frame) passes without a message.
    const vis = holding ? ramp(performance.now() - this.holdSince, 600, 900) : 0;
    setOpacity(this.els.progress, vis, this.opacity);
    if (vis > 0) {
      const l = useApp.getState().loading;
      const p = l.active ? l.progress : 1;
      (this.els['progress-text'] as HTMLElement).textContent = l.active ? `Initialising digital twin · ${Math.round(p * 100)}%` : 'Initialising digital twin…';
      (this.els['progress-bar'] as HTMLElement).style.transform = `scaleX(${Math.max(0.02, p).toFixed(3)})`;
    }
  }

  // ------------------------------------------------------------------ Three.js hand-off

  private sync3d(t: number): void {
    const sm = getScene();
    if (!sm.attached || !this.handoff || this.noHandoff) return;
    const warm = this.mode === 'play' && this.warmAt >= 0 && performance.now() - this.warmAt < WARMUP_MS;
    // Behind the landed map the view renders from its warm-up on (at once when there is no zoom).
    const live = t >= T.render && (this.mode !== 'play' || this.warmAt >= 0);
    sm.renderSuspended = !(warm || live);
    if (t < T.flyStart) {
      if (this.mode === 'frozen' || warm || live) {
        const p = this.handoff;
        if (!sm.camera.position.equals(p.pos) || !sm.controls.target.equals(p.target)) sm.rig.setPose(p);
      }
      return;
    }
    const aerial = presetPose('aerial', controller.sweepline.curtain!.layout);
    if (this.mode === 'frozen') {
      const pose = orbitPose(this.handoff, aerial, flightProgress(t), { pos: this.handoff.pos.clone(), target: this.handoff.target.clone() });
      sm.rig.setPose(pose);
      return;
    }
    if (!this.flightStarted) {
      this.flightStarted = true;
      // Normally k = 0; a dev replay can start mid-flight.
      const k = flightProgress(t);
      sm.rig.setPose(k > 0 ? orbitPose(this.handoff, aerial, k, { pos: this.handoff.pos.clone(), target: this.handoff.target.clone() }) : this.handoff);
      sm.rig.flyTo(aerial, Math.max(0.2, (T.flyDuration * (1 - k)) / this.speed), 'orbit');
    }
  }

  // ------------------------------------------------------------------ endings

  /** Normal end (or skip during the flight): reveal the app and unmount. */
  private complete(immediate: boolean): void {
    if (this.finished) return;
    this.finished = true;
    cancelAnimationFrame(this.raf);
    const sm = getScene();
    if (immediate && this.handoff) sm.rig.snap('aerial', controller.sweepline.curtain!.layout);
    for (const c of this.cleanups.splice(0)) c();
    this.restore(false);
    this.onDone();
  }

  /** Fade the whole overlay away (reduced motion, or no 3D view to hand off to). */
  private exitFade(): void {
    if (this.exiting) return;
    this.exiting = true;
    this.finished = true;
    cancelAnimationFrame(this.raf);
    const sm = getScene();
    // Whatever the 3D camera was doing for the hand-off, the Live view opens on its normal perspective.
    if (this.handoff) sm.rig.snap('aerial', controller.sweepline.curtain!.layout);
    sm.renderSuspended = false;
    this.setHud(1);
    this.root.style.transition = 'opacity 320ms ease';
    this.root.style.opacity = '0';
    window.setTimeout(() => {
      for (const c of this.cleanups.splice(0)) c();
      this.restore(false);
      this.onDone();
    }, 340);
  }

  private leaveWithoutHandoff(): void {
    this.noHandoff = true;
    if (this.mode === 'frozen') return;
    if (this.t < T.site) this.t = T.site;
    if (this.mode === 'reduced' || this.t >= T.fadeStart) this.exitFade();
  }

  // ------------------------------------------------------------------ app chrome

  /** Opacity of the Live page HUD and 3D labels (null restores them). */
  private setHud(o: number | null): void {
    for (const el of document.querySelectorAll<HTMLElement>('[data-live-hud], .sl-label-layer')) {
      if (o === null) el.style.opacity = '';
      else el.style.opacity = o.toFixed(3);
    }
  }
}
