import * as THREE from 'three';
import {
  BloomEffect,
  DepthOfFieldEffect,
  EffectComposer,
  EffectPass,
  KernelSize,
  LUT3DEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
  TiltShiftEffect,
  VignetteEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { GradeEffect } from './GradeEffect';
import { createLookLUT } from './lookLut';
import { UnderwaterEffect } from './UnderwaterEffect';

/** A viewport on the canvas in CSS pixels, origin bottom-left (as WebGLRenderer.setViewport). */
export interface ViewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Per-view inputs that steer the camera-dependent effects. */
export interface ViewState {
  underwater: boolean;
  /** Camera distance to its orbit target (m). */
  targetDistance: number;
  /** Angle of the view direction below the horizon (degrees). */
  pitchDeg: number;
  /** World point the underwater depth of field focuses on. */
  focus: THREE.Vector3;
}

/**
 * Pixels rendered per frame before the internal resolution is scaled down. Keeps the GPU cost of
 * the scene and post chain bounded on large high-DPI windows (about 12 ms on a laptop RTX 3050).
 */
const PIXEL_BUDGET = 2.4e6;

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Post-processing for the 3D view (pmndrs/postprocessing + N8AO):
 *
 *   scene (HDR, 4× MSAA) → ambient occlusion → [above water] tilt-shift · bloom · grade · LUT · vignette
 *                                            → [underwater]  light shafts + wobble
 *                                                            → depth of field · bloom · grade · LUT · vignette
 *                                            → SMAA → canvas
 *
 * Each view (the single view, or each half of Compare) runs the whole chain at its own size into
 * its own viewport, so depth-based effects always see the projection they were rendered with.
 * The grade replaces renderer tone mapping: everything upstream stays linear HDR.
 */
export class PostPipeline {
  readonly composer: EffectComposer;
  readonly ao: N8AOPostPass;
  readonly tiltShift: TiltShiftEffect;
  readonly dof: DepthOfFieldEffect;
  readonly underwater: UnderwaterEffect;
  private readonly abovePass: EffectPass;
  private readonly shaftPass: EffectPass;
  private readonly underPass: EffectPass;
  private readonly renderer: THREE.WebGLRenderer;
  private width = 0;
  private height = 0;
  /** Called with the (sized) scene target before each view renders, outside any render call. */
  beforeRender: ((sceneTarget: THREE.WebGLRenderTarget) => void) | null = null;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, sun: THREE.DirectionalLight) {
    this.renderer = renderer;
    const samples = Math.min(4, renderer.capabilities.maxSamples);
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: samples });
    this.composer.autoRenderToScreen = true;

    this.composer.addPass(new RenderPass(scene, camera));

    // Contact shadows where structures meet the ground, the revetment and the water line.
    this.ao = new N8AOPostPass(scene, camera, 512, 512);
    this.ao.configuration.transparencyAware = false;
    this.ao.autoDetectTransparency = false;
    this.ao.configuration.halfRes = true;
    this.ao.configuration.gammaCorrection = false;
    this.ao.setQualityMode('Medium');
    this.ao.configuration.intensity = 2.4;
    this.ao.configuration.distanceFalloff = 1.0;
    this.ao.configuration.color = new THREE.Color(0x0b1820);
    this.composer.addPass(this.ao);

    const bloom = () =>
      new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.0, luminanceSmoothing: 0.35, intensity: 0.55, radius: 0.72 });
    const look = createLookLUT();
    const lut = () => new LUT3DEffect(look, { tetrahedralInterpolation: true });
    const vignette = () => new VignetteEffect({ offset: 0.32, darkness: 0.42 });

    // Miniature look for high oblique views: sharp band through the subject, soft foreground and horizon.
    // The band sits a little low so the bloom in the foreground stays sharp; mostly the far coast softens.
    this.tiltShift = new TiltShiftEffect({ offset: -0.14, focusArea: 0.82, feather: 0.36, kernelSize: KernelSize.SMALL, resolutionScale: 0.5 });
    this.abovePass = new EffectPass(camera, this.tiltShift, bloom(), new GradeEffect(), lut(), vignette());
    this.abovePass.dithering = true;
    this.composer.addPass(this.abovePass);

    // Underwater: light shafts and wobble first, so the depth of field softens distant shafts too.
    this.underwater = new UnderwaterEffect(camera, sun);
    this.shaftPass = new EffectPass(camera, this.underwater);
    this.shaftPass.enabled = false;
    this.composer.addPass(this.shaftPass);
    this.dof = new DepthOfFieldEffect(camera, { focusDistance: 12, focusRange: 14, bokehScale: 1.4, resolutionScale: 0.5 });
    this.underPass = new EffectPass(camera, this.dof, bloom(), new GradeEffect(), lut(), vignette());
    this.underPass.dithering = true;
    this.underPass.enabled = false;
    this.composer.addPass(this.underPass);

    this.composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));
  }

  /** The multisampled HDR target the scene is rendered into (read back by the water for refraction). */
  get sceneTarget(): THREE.WebGLRenderTarget {
    return this.composer.inputBuffer;
  }

  /** Size every buffer for a view of `width × height` device pixels (no-op if unchanged). */
  private setSize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    // EffectComposer.setSize() would also resize the canvas, so mirror it here for the view size.
    this.composer.inputBuffer.setSize(width, height);
    this.composer.outputBuffer.setSize(width, height);
    (this.composer as unknown as { depthRenderTarget: THREE.WebGLRenderTarget | null }).depthRenderTarget?.setSize(width, height);
    for (const pass of this.composer.passes) pass.setSize(width, height);
  }

  /**
   * Internal render size of a view: its drawing-buffer size, scaled down when the frame would
   * exceed the pixel budget (large high-DPI windows); the final pass upsamples to the canvas.
   * `share` is this view's fraction of the frame (½ for each Compare half).
   */
  viewSize(rect: ViewRect, share = 1): [number, number] {
    const pr = this.renderer.getPixelRatio();
    const w = rect.width * pr;
    const h = rect.height * pr;
    const s = Math.min(1, Math.sqrt((PIXEL_BUDGET * share) / Math.max(1, w * h)));
    return [Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))];
  }

  /** Steer the camera-dependent effects for the view about to be rendered. */
  configure(view: ViewState): void {
    this.abovePass.enabled = !view.underwater;
    this.shaftPass.enabled = view.underwater;
    this.underPass.enabled = view.underwater;
    // AO radius follows the viewing scale: tight contact shadows up close, broader from the air.
    this.ao.configuration.aoRadius = Math.min(6, Math.max(0.6, view.targetDistance * 0.022));
    // Tilt-shift only for high oblique views (not top-down, not close-ups).
    const tilt = smooth(70, 170, view.targetDistance) * (1 - smooth(52, 74, view.pitchDeg));
    this.tiltShift.blendMode.opacity.value = tilt;
    this.dof.target = view.focus;
  }

  /** Render the scene through the chain into one viewport of the canvas. */
  render(rect: ViewRect, dt: number, share = 1): void {
    const [w, h] = this.viewSize(rect, share);
    this.setSize(w, h);
    this.beforeRender?.(this.composer.inputBuffer);
    const r = this.renderer;
    r.setViewport(rect.x, rect.y, rect.width, rect.height);
    r.setScissor(rect.x, rect.y, rect.width, rect.height);
    r.setScissorTest(true);
    this.composer.render(dt);
    r.setScissorTest(false);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
