import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { useApp, type UIState, type SelectionKind } from '../app/store';
import { SITE } from '../config/site';
import { S_APPROACHING, S_TRANSFERRED } from '../simulation/Agent';
import { pointAtArc } from '../simulation/geometry';
import type { SimController, SimSnapshot } from '../simulation/SimController';
import type { SimulationEngine } from '../simulation/SimulationEngine';
import type { EngineKind } from '../simulation/types';
import { waveElevation } from '../simulation/waves';
import { AssetLoader } from './assets/AssetLoader';
import { adaptExternalJellyGeometry, buildJellyfishGeometry, FAR_LOD, NEAR_LOD } from './assets/procedural/jellyfishGeometry';
import { buildWorkboat } from './assets/procedural/workboat';
import { CameraRig, presetPose, type CameraPreset } from './cameras/CameraRig';
import { buildCoast } from './environment/Coast';
import { Seabed } from './environment/Seabed';
import { SHARED } from './environment/shaderChunks';
import { SkyDome } from './environment/Sky';
import { UnderwaterFx } from './environment/Underwater';
import { Water } from './environment/Water';
import { Annotations } from './systems/Annotations';
import { CurrentField } from './systems/CurrentField';
import { CurtainSystem } from './systems/CurtainSystem';
import { JetSystem } from './systems/JetSystem';
import { jellyShader, JellyfishSystem } from './systems/JellyfishSystem';
import { LabelSystem, type LabelViewport } from './systems/LabelSystem';
import { iconSvg } from '../components/ui/icons';
import { ReleaseSystem } from './systems/ReleaseSystem';
import { TransferSystem } from './systems/TransferSystem';

const WORLDS: EngineKind[] = ['baseline', 'sweepline'];

interface Thumb {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  preset: Exclude<CameraPreset, 'free'>;
  camera: THREE.PerspectiveCamera;
}


/**
 * Owns the WebGL renderer and the 3D digital twin. One renderer serves both the
 * single view and the split Baseline | SweepLine compare view (scissor
 * viewports). Simulation state is read straight from the engines each frame.
 */
export class SceneManager {
  readonly container: HTMLDivElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly rig: CameraRig;
  readonly labels = new LabelSystem();
  private readonly ctrl: SimController;
  private readonly sky: SkyDome;
  private readonly water: Water;
  private readonly underwaterFx = new UnderwaterFx();
  private readonly curtain: CurtainSystem;
  private readonly jets = new JetSystem();
  private readonly transfer: TransferSystem;
  private readonly release: ReleaseSystem;
  private readonly annotations = new Annotations();
  private readonly workboat: THREE.Group;
  private readonly sweepGroup = new THREE.Group();
  private readonly coast: ReturnType<typeof buildCoast>;
  private jellies!: Record<EngineKind, JellyfishSystem>;
  private readonly flows: Record<EngineKind, CurrentField>;
  private readonly sun: THREE.DirectionalLight;
  private slot: HTMLElement | null = null;
  private readonly resizeObs: ResizeObserver;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private ui: UIState;
  private snap: SimSnapshot | null = null;
  private readonly thumbs = new Map<string, Thumb>();
  /** Feeds to render on the next frame (just added or resized). */
  private readonly dirtyThumbs = new Set<string>();
  private thumbTimer = 0;
  private thumbIndex = 0;
  private infoTimer = 0;
  private bloomTimer = 0;
  private readonly bloomAnchor = new THREE.Vector3(-150, 1, -10);
  private bloomAnchorValid = false;
  private dimAnchor: THREE.Vector3 | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private pointerDown: { x: number; y: number } | null = null;
  private shadowFrames = 0;
  private realTime = 0;
  private lastMarkerSeq = -1;
  private readonly boatPos = new THREE.Vector3();
  private boatYaw = 0;
  private readonly tmpV = new THREE.Vector3();
  readonly assets = new AssetLoader();

  constructor(ctrl: SimController) {
    this.ctrl = ctrl;
    this.ui = useApp.getState().ui;
    this.container = document.createElement('div');
    this.container.className = 'sl-viewport-root';
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: false });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.domElement.className = 'sl-canvas';
    this.container.appendChild(this.renderer.domElement);
    this.container.appendChild(this.labels.layer);

    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.12, 12000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxDistance = 1100;
    this.controls.minDistance = 1.5;
    this.controls.zoomSpeed = 0.9;
    this.controls.rotateSpeed = 0.6;
    this.controls.panSpeed = 0.8;
    this.controls.screenSpacePanning = true;
    this.rig = new CameraRig(this.camera, this.controls);
    this.rig.onPresetChange = (p) => {
      if (p === 'free' && useApp.getState().ui.camera !== 'free') useApp.getState().setUI({ camera: 'free' });
    };

    // ------------------------------------------------ lighting & sky
    this.sky = new SkyDome(this.renderer);
    this.scene.add(this.sky.mesh);
    this.scene.environment = this.sky.envMap;
    this.scene.environmentIntensity = 0.55;
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.5);
    const sd = SHARED.uSunDir.value;
    this.sun.position.set(sd.x * 400, sd.y * 400, sd.z * 400);
    this.sun.target.position.set(0, 0, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -170;
    sc.right = 170;
    sc.top = 140;
    sc.bottom = -140;
    sc.near = 50;
    sc.far = 900;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.5;
    this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xa9c9df, 0x6d6150, 0.9));

    // ------------------------------------------------ environment
    this.water = new Water(this.sky.cubeTarget.texture);
    this.scene.add(this.water.mesh);
    this.scene.add(new Seabed().group);
    this.coast = buildCoast();
    this.scene.add(this.coast.group);
    this.scene.add(this.underwaterFx.group);

    // ------------------------------------------------ SweepLine installation (SweepLine world only)
    this.sweepGroup.name = 'sweepline-installation';
    this.curtain = new CurtainSystem(ctrl.params.anchorAngle);
    this.transfer = new TransferSystem();
    this.release = new ReleaseSystem();
    this.workboat = buildWorkboat();
    this.sweepGroup.add(this.curtain.group, this.jets.group, this.transfer.group, this.release.group, this.workboat);
    this.scene.add(this.sweepGroup);
    this.scene.add(this.annotations.group);

    // ------------------------------------------------ agents and flow (one per world)
    this.buildJellies(null, null);
    this.flows = {
      baseline: new CurrentField('flow-baseline'),
      sweepline: new CurrentField('flow-sweepline'),
    };
    for (const w of WORLDS) this.scene.add(this.flows[w].group);

    this.setupLabels();
    this.rig.snap('aerial', ctrl.sweepline.curtain!.layout);
    this.boatPos.set(this.transfer.throat.mx + 8, 0, this.transfer.throat.mz + 9);

    // ------------------------------------------------ interaction
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => (this.pointerDown = { x: e.clientX, y: e.clientY }));
    el.addEventListener('pointerup', (e) => {
      if (!this.pointerDown) return;
      const moved = Math.hypot(e.clientX - this.pointerDown.x, e.clientY - this.pointerDown.y);
      this.pointerDown = null;
      if (moved < 5) this.pick(e);
    });
    this.resizeObs = new ResizeObserver(() => this.resize());

    useApp.subscribe((s, prev) => {
      if (s.ui !== prev.ui) this.onUI(s.ui, prev.ui);
      if (s.snap !== prev.snap && s.snap) this.onSnapshot(s.snap);
    });
    this.applyFlowView(this.ui.flowView);
    this.labels.onPick = (kind) => this.select({ kind: kind as SelectionKind });
    void this.loadAssets();
  }

  // ------------------------------------------------------------------ assets

  private buildJellies(nearGeo: THREE.BufferGeometry | null, map: THREE.Texture | null): void {
    const near = nearGeo ?? buildJellyfishGeometry(NEAR_LOD);
    const far = buildJellyfishGeometry(FAR_LOD);
    const mat = jellyShader(map);
    if (this.jellies) for (const w of WORLDS) this.scene.remove(this.jellies[w].group);
    this.jellies = {
      baseline: new JellyfishSystem(near, far, mat, this.ctrl.baseline.pool.capacity, 'jellies-baseline'),
      sweepline: new JellyfishSystem(near, far, mat, this.ctrl.sweepline.pool.capacity, 'jellies-sweepline'),
    };
    for (const w of WORLDS) this.scene.add(this.jellies[w].group);
  }

  private async loadAssets(): Promise<void> {
    const [jelly, intake, breakwater, curtain, throat, transfer] = await Promise.all([
      this.assets.load('jellyfish'),
      this.assets.load('intake'),
      this.assets.load('breakwater'),
      this.assets.load('curtain'),
      this.assets.load('throat'),
      this.assets.load('transfer'),
    ]);
    if (jelly) {
      const ex = AssetLoader.extractGeometry(jelly);
      if (ex) this.buildJellies(adaptExternalJellyGeometry(ex.geometry), ex.map);
    }
    if (intake) {
      this.coast.intake.visible = false;
      intake.scene.traverse((o) => (o.userData.pick = 'intake'));
      this.coast.group.add(intake.scene);
    }
    if (breakwater) {
      this.coast.breakwater.visible = false;
      this.coast.group.add(breakwater.scene);
    }
    if (curtain) {
      const ex = AssetLoader.extractGeometry(curtain);
      if (ex) {
        ex.geometry.computeBoundingBox();
        const size = new THREE.Vector3();
        ex.geometry.boundingBox!.getSize(size);
        const s = 1.0 / Math.max(size.x, 0.01);
        ex.geometry.scale(s, s, s);
        ex.geometry.center();
        this.curtain.setFloatGeometry(ex.geometry);
      }
    }
    if (throat) {
      this.transfer.throatGroup.children.forEach((c, i) => {
        if (i === 0) c.visible = false;
      });
      throat.scene.traverse((o) => (o.userData.pick = 'throat'));
      this.transfer.throatGroup.add(throat.scene);
    }
    if (transfer) {
      transfer.scene.traverse((o) => (o.userData.pick = 'transfer'));
      this.transfer.moduleGroup.add(transfer.scene);
    }
    this.shadowFrames = 0;
  }

  // ------------------------------------------------------------------ DOM attachment

  attach(slot: HTMLElement): void {
    if (this.slot === slot) return;
    this.slot = slot;
    slot.prepend(this.container);
    this.resizeObs.disconnect();
    this.resizeObs.observe(slot);
    this.resize();
  }

  detach(slot: HTMLElement): void {
    if (this.slot !== slot) return;
    this.resizeObs.disconnect();
    if (this.container.parentElement === slot) slot.removeChild(this.container);
    this.slot = null;
  }

  get attached(): boolean {
    return this.slot !== null;
  }

  /** Re-measure the host slot (ResizeObserver does not fire while the page is hidden). */
  forceResize(): void {
    this.resize();
  }

  private resize(): void {
    if (!this.slot) return;
    const w = Math.max(1, this.slot.clientWidth);
    const h = Math.max(1, this.slot.clientHeight);
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
  }

  registerThumbnail(key: string, canvas: HTMLCanvasElement, preset: Exclude<CameraPreset, 'free'>): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cam = new THREE.PerspectiveCamera(48, canvas.width / canvas.height, 0.12, 12000);
    this.thumbs.set(key, { canvas, ctx, preset, camera: cam });
    this.dirtyThumbs.add(key);
    this.thumbTimer = 0;
  }

  /** Re-render a feed on the next frame (e.g. after its canvas was resized). */
  refreshThumbnail(key: string): void {
    if (this.thumbs.has(key)) this.dirtyThumbs.add(key);
  }

  unregisterThumbnail(key: string): void {
    this.thumbs.delete(key);
    this.dirtyThumbs.delete(key);
  }

  // ------------------------------------------------------------------ store sync

  private onUI(ui: UIState, prev: UIState): void {
    this.ui = ui;
    const layout = this.ctrl.sweepline.curtain!.layout;
    if (ui.compare !== prev.compare) {
      if (ui.compare) this.rig.goTo('compare', layout, 1.6);
      else if (ui.camera !== 'free') this.rig.goTo(ui.camera as Exclude<CameraPreset, 'free'>, layout, 1.6);
    }
    if ((ui.camera !== prev.camera || ui.cameraNonce !== prev.cameraNonce) && ui.camera !== 'free') {
      if (!(ui.compare && ui.camera === prev.camera)) this.rig.goTo(ui.camera as Exclude<CameraPreset, 'free'>, layout, 1.7);
    }
    if (ui.flowView !== prev.flowView) this.applyFlowView(ui.flowView);
    this.labels.enabled = ui.labels;
    this.labels.topReserved = 10;
    this.labels.page = ui.page;
    for (const w of WORLDS) this.jellies[w].selectedId = ui.selection?.kind === 'jelly' && ui.selection.engine === w ? ui.selection.agentId ?? -1 : -1;
    if (!ui.follow || ui.selection?.kind !== 'jelly') this.rig.followTarget = null;
  }

  private applyFlowView(on: boolean): void {
    SHARED.uFlowDim.value = on ? 1 : 0;
    for (const w of WORLDS) {
      this.flows[w].setFlowMode(on);
      this.jellies[w].setStateColors(on);
    }
    this.annotations.captureZone.visible = on;
  }

  private onSnapshot(s: SimSnapshot): void {
    this.snap = s;
    const sw = s.sweepline;
    const b = s.baseline;
    const density = s.params.bloomDensity;
    const densityLabel = density >= 0.85 ? 'Very high density' : density >= 0.65 ? 'High density' : density >= 0.4 ? 'Moderate density' : 'Low density';
    this.labels.setContent('bloom', 'Jellyfish Bloom', `${densityLabel} · P90 ${s.bloom.p90.toFixed(1)} m`, density >= 0.65 ? 'red' : 'amber');
    const mode = s.curtain.mode;
    const cs = s.curtain;
    const jets = s.params.activeFlow && cs.jetOutput > 0.01 ? `jets ${Math.round(cs.jetOutput * 100)}%` : 'passive';
    const curtainBody =
      mode === 'STOWED'
        ? `${cs.angle}° layout · ${s.params.deployMode === 'popup' ? 'stowed on seabed' : 'stowed'}`
        : mode === 'REEFING' || mode === 'REEFED'
          ? `Reefing · ${cs.reefedPct.toFixed(0)}% reefed`
          : mode === 'DEPLOYING'
            ? cs.deployDelay > 0
              ? cs.deployMode === 'workboat'
                ? 'Workboat mobilising'
                : 'Pop-up · inflating'
              : `${cs.deployMode === 'popup' ? 'Rising' : 'Laying'} · ${cs.deployedPct.toFixed(0)}%`
            : `${cs.angle}° · ${cs.skirtActual.toFixed(1)} m skirt · ${jets}`;
    this.labels.setContent('curtain', 'Guide Curtain', curtainBody, mode === 'REEFING' || mode === 'REEFED' ? 'amber' : 'default');
    const occ = sw.throatOccupancy;
    this.labels.setContent(
      'throat',
      'Recovery Throat',
      s.transfer.path === 'NONE' && mode === 'STOWED' ? 'Standby' : `Occupancy ${(Math.min(occ, 1.5) * 100).toFixed(0)}%`,
      occ >= 0.85 ? 'red' : occ >= 0.6 ? 'amber' : 'teal',
    );
    const util = sw.transferUtilisation;
    const path = s.transfer.path === 'STANDBY' ? 'standby path' : s.transfer.path === 'PASSIVE' ? 'passive line only' : s.transfer.path === 'NONE' ? 'idle' : 'primary';
    this.labels.setContent(
      'transfer',
      'Transfer Module',
      util === null ? 'Low-shear · idle' : `${(Math.min(util, 1) * 100).toFixed(0)}% utilisation · ${path}`,
      s.transfer.primary === 'FAULT' ? (s.transfer.standby === 'ONLINE' ? 'amber' : 'red') : 'default',
    );
    const intakeBody = (m: typeof b) =>
      m.intakeContactPct === null ? 'Existing protection remains' : `Contact ${(m.intakeContactPct * 100).toFixed(0)}% · load ${m.screenLoad}`;
    this.labels.setContent('intake', 'Intake Screens', 'Existing protection remains', 'default');
    this.labels.setContent('intake-base', 'Intake Screens', intakeBody(b), b.screenLoad === 'HIGH' ? 'red' : b.screenLoad === 'MEDIUM' ? 'amber' : 'default');
    this.labels.setContent('intake-left', 'Intake Screens', intakeBody(b), b.screenLoad === 'HIGH' ? 'red' : 'amber');
    this.labels.setContent('intake-right', 'Intake Screens', intakeBody(sw), sw.screenLoad === 'HIGH' ? 'red' : sw.screenLoad === 'MEDIUM' ? 'amber' : 'teal');
    this.labels.setContent('release', 'Safe Release', `Down-current · ${s.params.releaseDistance} m line`, 'default');
    this.labels.setContent('skirt-dim', 'Skirt depth', `${s.curtain.skirtActual.toFixed(1)} m`, 'cyan');
    this.labels.setContent('bloom-p90', 'Bloom P90 depth', `${s.bloom.p90.toFixed(1)} m`, s.bloom.p90 > s.curtain.skirtActual ? 'amber' : 'teal');
  }

  private setupLabels(): void {
    const above = 'above' as const;
    const layout = () => this.ctrl.sweepline.curtain!.layout;
    this.labels.add({
      id: 'bloom',
      title: 'Jellyfish Bloom',
      icon: iconSvg('jellyfish', 22),
      anchor: () => (this.bloomAnchorValid ? this.bloomAnchor : null),
      viewports: ['single', 'base'],
      view: above,
      pick: 'bloom',
      maxDistance: 900,
    });
    this.labels.add({
      id: 'curtain',
      title: 'Guide Curtain',
      icon: iconSvg('curtain', 22),
      anchor: () => {
        const p = pointAtArc(layout(), layout().length * 0.36);
        return this.tmpAnchor('curtain', p.x, 1.2, p.z);
      },
      viewports: ['single'],
      view: above,
      pick: 'curtain',
    });
    this.labels.add({
      id: 'throat',
      title: 'Recovery Throat',
      icon: iconSvg('throat', 22),
      anchor: () => this.transfer.anchors().throat,
      viewports: ['single'],
      view: above,
      pick: 'throat',
    });
    this.labels.add({
      id: 'transfer',
      title: 'Transfer Module',
      icon: iconSvg('transfer', 22),
      pages: ['visualiser', 'system'],
      anchor: () => this.transfer.anchors().transferLow,
      viewports: ['single'],
      view: above,
      pick: 'transfer',
      maxDistance: 600,
    });
    const intakeAnchor = new THREE.Vector3((SITE.intake.x0 + SITE.intake.x1) / 2 + 8, SITE.intake.deckY + 0.4, SITE.intake.mouthZ + 0.6);
    for (const [id, vp] of [
      ['intake', ['single']],
      ['intake-base', ['base']],
      ['intake-left', ['left']],
      ['intake-right', ['right']],
    ] as const) {
      this.labels.add({
        id,
        title: 'Intake Screens',
        icon: iconSvg('intake', 22),
        pages: id === 'intake' ? ['visualiser', 'system'] : undefined,
        anchor: () => intakeAnchor,
        viewports: [...vp] as LabelViewport[],
        view: above,
        pick: 'intake',
      });
    }
    this.labels.add({
      id: 'release',
      title: 'Safe Release',
      icon: iconSvg('release', 22),
      anchor: () => this.release.anchor(),
      viewports: ['single'],
      view: above,
      pick: 'release',
      maxDistance: 900,
    });
    this.labels.add({
      id: 'skirt-dim',
      title: 'Skirt depth',
      anchor: () => this.dimAnchor,
      viewports: ['single'],
      view: 'below',
      placement: 'right',
      tone: 'cyan',
      maxDistance: 60,
    });
    this.labels.add({
      id: 'bloom-p90',
      title: 'Bloom P90 depth',
      anchor: () => {
        const p = pointAtArc(layout(), layout().length * 0.88);
        return this.tmpAnchor('p90', p.x + p.nx * 4, -(this.snap?.bloom.p90 ?? 2.8), p.z + p.nz * 4);
      },
      viewports: ['single'],
      view: 'below',
      placement: 'right',
      maxDistance: 60,
    });
  }

  private readonly anchorCache = new Map<string, THREE.Vector3>();
  private tmpAnchor(key: string, x: number, y: number, z: number): THREE.Vector3 {
    let v = this.anchorCache.get(key);
    if (!v) {
      v = new THREE.Vector3();
      this.anchorCache.set(key, v);
    }
    return v.set(x, y, z);
  }

  // ------------------------------------------------------------------ selection

  private select(sel: { kind: SelectionKind; engine?: EngineKind; agentId?: number }): void {
    const ui = useApp.getState().ui;
    if (sel.kind === 'jelly' && sel.engine && sel.agentId !== undefined) this.ctrl.select(sel.engine, sel.agentId);
    else this.ctrl.select('sweepline', null);
    useApp.getState().setUI({ selection: sel, follow: sel.kind === 'jelly' ? ui.follow : false });
  }

  private pick(e: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    let x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let world: EngineKind = this.ui.displayed;
    let w = rect.width;
    if (this.ui.compare) {
      const half = rect.width / 2;
      world = x < half ? 'baseline' : 'sweepline';
      if (x >= half) x -= half;
      w = half;
      this.camera.aspect = half / rect.height;
      this.camera.updateProjectionMatrix();
    }
    const ndc = new THREE.Vector2((x / w) * 2 - 1, -(y / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const targets: THREE.Object3D[] = [this.coast.intake];
    const jel = this.jellies[world];
    jel.near.mesh.computeBoundingSphere();
    jel.far.mesh.computeBoundingSphere();
    targets.push(jel.near.mesh, jel.far.mesh);
    if (world === 'sweepline') targets.push(...this.curtain.pickables(), this.transfer.group, this.release.group);
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      if (h.object === jel.near.mesh || h.object === jel.far.mesh) {
        const slot = jel.slotFor(h.object, h.instanceId ?? -1);
        const engine = this.ctrl.engine(world);
        if (slot >= 0 && engine.pool.state[slot] !== 0) {
          this.select({ kind: 'jelly', engine: world, agentId: engine.pool.id[slot] });
          return;
        }
        continue;
      }
      let o: THREE.Object3D | null = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o && o.userData.pick) {
        this.select({ kind: o.userData.pick as SelectionKind });
        return;
      }
    }
    this.ctrl.select('sweepline', null);
    useApp.getState().setUI({ selection: null, follow: false });
  }

  // ------------------------------------------------------------------ per-frame

  private configureForCamera(cam: THREE.Camera): boolean {
    const underwater = cam.position.y < 0;
    this.water.configureForCamera(underwater);
    this.sky.follow(cam);
    this.underwaterFx.update(underwater, this.pixelRatio);
    return underwater;
  }

  private setWorld(world: EngineKind): void {
    this.sweepGroup.visible = world === 'sweepline';
    for (const w of WORLDS) {
      this.jellies[w].group.visible = w === world;
      this.flows[w].group.visible = w === world;
    }
    this.annotations.setWorld(world);
  }

  frame(dtReal: number): void {
    const dt = Math.min(dtReal, 0.1);
    this.realTime += dt;
    SHARED.uTime.value = this.realTime;
    SHARED.uWaveTime.value = this.realTime;
    const ctrl = this.ctrl;
    const params = ctrl.params;
    SHARED.uWaveAmp.value = params.waveHeight * 0.5;
    const simDt = ctrl.ready && !ctrl.paused ? dt * ctrl.speed : 0;
    const sw = ctrl.sweepline;
    const c = sw.curtain!;
    const tr = sw.transfer!;

    // A run restart resets the engines' marker sequence — forget stale flashes.
    if (sw.markerSeq < this.lastMarkerSeq) this.annotations.reset();
    this.lastMarkerSeq = sw.markerSeq;

    // SweepLine installation.
    this.curtain.update(c, this.realTime, params.waveHeight, this.ui.flowView);
    this.jets.update(c, this.realTime, simDt, params.waveHeight);
    this.transfer.update({
      occupancy: tr.queue.length / sw.holdCapacity,
      primary: tr.primaryStatus,
      standby: tr.standbyStatus,
      path: tr.activePath,
      flowFraction: tr.availability() * Math.min(1, 0.35 + tr.processedEMA / Math.max(tr.capacityRate(), 1e-3)),
      throatOpen: tr.throatOpen,
      time: this.realTime,
      waveTime: this.realTime,
      waveHeight: params.waveHeight,
    });
    this.release.update(sw.releaseEMA, tr.throatOpen || sw.releaseEMA > 0.002, this.realTime, this.realTime, params.waveHeight);
    this.updateWorkboat(dt);

    // Worlds to draw this frame.
    const worlds: EngineKind[] = this.ui.compare ? ['baseline', 'sweepline'] : [this.ui.displayed];
    for (const w of worlds) this.flows[w].update(ctrl.engine(w), simDt, dt);

    // Annotations.
    this.annotations.ingestMarkers(ctrl.baseline, this.realTime);
    this.annotations.ingestMarkers(sw, this.realTime);
    this.annotations.update(this.realTime, this.camera);
    const underwaterView = this.camera.position.y < 0;
    const showDim = !this.ui.compare && this.ui.displayed === 'sweepline' && (underwaterView || this.ui.camera === 'curtain');
    this.dimAnchor = this.annotations.updateDimension(c.mode === 'STOWED' ? null : c.layout, 0.83, c.skirtActual * c.liftCos, showDim);
    this.annotations.updateBloomPlane(c.layout, this.snap?.bloom.p90 ?? 2.8, showDim && underwaterView);

    this.bloomTimer -= dt;
    if (this.bloomTimer <= 0) {
      this.bloomTimer = 0.5;
      this.updateBloomAnchor(ctrl.engine(this.ui.compare ? 'sweepline' : this.ui.displayed));
    }

    // Selection marker and follow.
    let selPos: THREE.Vector3 | null = null;
    const sel = this.ui.selection;
    if (sel?.kind === 'jelly' && sel.engine && sel.agentId !== undefined) {
      const e = ctrl.engine(sel.engine);
      const slot = e.pool.findById(sel.agentId);
      if (slot >= 0 && e.pool.state[slot] !== S_TRANSFERRED) {
        selPos = this.tmpV.set(e.pool.px[slot], e.pool.py[slot], e.pool.pz[slot]);
        if (this.ui.follow) this.rig.followTarget = selPos.clone();
      } else this.rig.followTarget = null;
    }
    this.annotations.setSelection(selPos, this.camera);

    this.rig.update(dt);
    if (!this.slot) return;

    // Static shadow map: refresh for the first few frames (and after asset swaps).
    if (this.shadowFrames < 3) {
      this.renderer.shadowMap.needsUpdate = true;
      this.shadowFrames++;
    }

    this.renderThumbnails(dt, worlds);

    const underwater = this.configureForCamera(this.camera);
    this.labels.beginFrame();
    const r = this.renderer;
    if (this.ui.compare) {
      const half = Math.floor(this.width / 2);
      this.labels.setCompact(half < 640);
      this.camera.aspect = half / this.height;
      this.camera.updateProjectionMatrix();
      r.setScissorTest(true);
      for (const [i, w] of (['baseline', 'sweepline'] as EngineKind[]).entries()) {
        const x0 = i === 0 ? 0 : half;
        const wd = i === 0 ? half : this.width - half;
        this.setWorld(w);
        this.jellies[w].update(ctrl.engine(w), this.camera, true);
        r.setViewport(x0, 0, wd, this.height);
        r.setScissor(x0, 0, wd, this.height);
        r.render(this.scene, this.camera);
        this.labels.place(this.camera, i === 0 ? 'left' : 'right', x0, wd, this.height, underwater);
      }
      r.setScissorTest(false);
    } else {
      const w = this.ui.displayed;
      this.labels.setCompact(this.width < 760);
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.setWorld(w);
      this.jellies[w].update(ctrl.engine(w), this.camera, true);
      r.setViewport(0, 0, this.width, this.height);
      r.render(this.scene, this.camera);
      this.labels.place(this.camera, w === 'sweepline' ? 'single' : 'base', 0, this.width, this.height, underwater);
    }
    this.labels.endFrame();

    this.infoTimer -= dt;
    if (this.infoTimer <= 0) {
      this.infoTimer = 0.25;
      this.updateLabelObstacles();
      const t = this.controls.target;
      const dx = t.x - this.camera.position.x;
      const dz = t.z - this.camera.position.z;
      const heading = (((112 + (Math.atan2(-dz, dx) * 180) / Math.PI) % 360) + 360) % 360;
      const ui = useApp.getState().ui;
      const depth = Math.max(0, -this.camera.position.y);
      if (ui.underwater !== underwater || Math.abs(ui.cameraDepth - depth) > 0.15 || Math.abs(ui.cameraHeading - heading) > 2) {
        useApp.getState().setUI({ underwater, cameraDepth: depth, cameraHeading: heading });
      }
    }
  }

  /** Collect the HUD overlays in the current viewport ([data-hud]) so labels avoid them. */
  private updateLabelObstacles(): void {
    const obs = this.labels.obstacles;
    obs.length = 0;
    if (!this.slot) return;
    const base = this.renderer.domElement.getBoundingClientRect();
    for (const el of this.slot.querySelectorAll<HTMLElement>('[data-hud]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      obs.push({ l: r.left - base.left, r: r.right - base.left, t: r.top - base.top, b: r.bottom - base.top });
    }
  }

  private renderThumbnails(dt: number, worlds: EngineKind[]): void {
    if (this.thumbs.size === 0) return;
    // A just-added or resized feed renders immediately; otherwise feeds refresh in turn.
    let th: Thumb | undefined;
    const next = this.dirtyThumbs.values().next();
    if (!next.done) {
      this.dirtyThumbs.delete(next.value);
      th = this.thumbs.get(next.value);
    }
    if (!th) {
      this.thumbTimer -= dt;
      if (this.thumbTimer > 0) return;
      this.thumbTimer = 0.35;
      const list = [...this.thumbs.values()];
      th = list[this.thumbIndex % list.length];
      this.thumbIndex++;
    }
    // Match the feed's resolution and shape to its on-screen tile (no stretching or cropping).
    const cw = th.canvas.clientWidth;
    const ch = th.canvas.clientHeight;
    if (cw > 0 && ch > 0) {
      const scale = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(64, Math.round(cw * scale));
      const h = Math.max(48, Math.round(ch * scale));
      if (th.canvas.width !== w || th.canvas.height !== h) {
        th.canvas.width = w;
        th.canvas.height = h;
      }
    }
    const layout = this.ctrl.sweepline.curtain!.layout;
    const pose = presetPose(th.preset, layout);
    th.camera.position.copy(pose.pos);
    th.camera.lookAt(pose.target);
    th.camera.aspect = th.canvas.width / th.canvas.height;
    th.camera.updateProjectionMatrix();
    const world = this.ui.compare ? 'sweepline' : worlds[0];
    const tw = Math.min(th.canvas.width, this.width);
    const thh = Math.min(th.canvas.height, this.height);
    this.setWorld(world);
    this.jellies[world].update(this.ctrl.engine(world), th.camera, th.preset !== 'underwater' && th.preset !== 'throat');
    this.configureForCamera(th.camera);
    const r = this.renderer;
    r.setScissorTest(true);
    r.setViewport(0, 0, tw, thh);
    r.setScissor(0, 0, tw, thh);
    r.render(this.scene, th.camera);
    r.setScissorTest(false);
    const pr = this.renderer.getPixelRatio();
    const src = this.renderer.domElement;
    th.ctx.drawImage(src, 0, src.height - thh * pr, tw * pr, thh * pr, 0, 0, th.canvas.width, th.canvas.height);
  }

  /** Anchor the bloom label at the centroid of the approaching bloom that is visible in the current view. */
  private updateBloomAnchor(e: SimulationEngine): void {
    const p = e.pool;
    const v = this.tmpV;
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (let i = 0; i < p.capacity; i++) {
      if (p.state[i] !== S_APPROACHING) continue;
      const x = p.px[i];
      if (x > -30) continue;
      v.set(x, 0.5, p.pz[i]).project(this.camera);
      if (v.z > 1 || v.x < -0.78 || v.x > 0.55 || v.y < -0.72 || v.y > 0.45) continue;
      sx += x;
      sz += p.pz[i];
      n++;
    }
    if (n > 10) {
      const tx = sx / n;
      const tz = sz / n;
      if (!this.bloomAnchorValid) this.bloomAnchor.set(tx, 1, tz);
      else this.bloomAnchor.lerp(v.set(tx, 1, tz), 0.25);
      this.bloomAnchorValid = true;
    } else this.bloomAnchorValid = false;
  }

  private updateWorkboat(dt: number): void {
    const c = this.ctrl.sweepline.curtain!;
    const L = c.layout;
    const th = this.transfer.throat;
    let tx = th.mx + 8;
    let tz = th.mz + 9;
    let yaw = 0;
    let s = -1;
    const byBoat = c.deployMode === 'workboat';
    if (byBoat && ((c.mode === 'DEPLOYING' && c.deployDelay <= 0) || c.mode === 'STOWING')) s = Math.min(L.length, Math.max(0, L.length - c.deployFront));
    else if (byBoat && (c.mode === 'REEFING' || c.mode === 'UNREEFING')) s = Math.min(L.length, Math.max(0, c.reefFront));
    if (s >= 0) {
      const p = pointAtArc(L, s);
      tx = p.x + p.nx * 4;
      tz = p.z + p.nz * 4;
      const dir = c.mode === 'DEPLOYING' ? -1 : 1;
      yaw = -Math.atan2(p.tz * dir, p.tx * dir);
    }
    const k = Math.min(1, dt * 1.5);
    this.boatPos.x += (tx - this.boatPos.x) * k;
    this.boatPos.z += (tz - this.boatPos.z) * k;
    let dy = yaw - this.boatYaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.boatYaw += dy * Math.min(1, dt * 1.2);
    const eta = waveElevation(this.boatPos.x, this.boatPos.z, this.realTime, this.ctrl.params.waveHeight);
    this.workboat.position.set(this.boatPos.x, eta - 0.25, this.boatPos.z);
    this.workboat.rotation.set(Math.sin(this.realTime * 0.9) * 0.03, this.boatYaw, Math.sin(this.realTime * 1.1) * 0.04);
  }

  /** Reset the camera to the active preset (or perspective). */
  resetView(): void {
    const layout = this.ctrl.sweepline.curtain!.layout;
    const preset = this.ui.compare ? 'compare' : this.ui.camera === 'free' ? 'aerial' : this.ui.camera;
    this.rig.goTo(preset as Exclude<CameraPreset, 'free'>, layout, 1.4);
  }
}
