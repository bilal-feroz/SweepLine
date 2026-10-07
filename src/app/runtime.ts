import { controller } from '../simulation/SimController';
import { SceneManager } from '../three/SceneManager';
import { useApp } from './store';

let scene: SceneManager | null = null;
let started = false;

/** The single 3D scene instance (created on first use — owns the WebGL context). */
export function getScene(): SceneManager {
  if (!scene) scene = new SceneManager(controller);
  return scene;
}

/**
 * Start the application runtime: one requestAnimationFrame loop advances the
 * simulation (fixed steps, sim-speed scaled) and renders the scene when a
 * viewport is mounted. React only receives throttled snapshots.
 */
export function startRuntime(): void {
  if (started) return;
  started = true;
  controller.setPublisher(
    (snap) => useApp.setState({ snap, historyVersion: controller.historyVersion }),
    (loading) => useApp.setState({ loading }),
  );
  const sm = getScene();
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.max(0, (now - last) / 1000);
    last = now;
    controller.frame(dt);
    sm.frame(dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  void controller.restart('steady', null);

  if (import.meta.env.DEV) installDevHooks(sm);
}

/**
 * Developer hooks (dev server only): render a frame on demand and save PNG
 * captures through the dev server (see vite.config.ts). Useful for render
 * checks when the browser window is hidden.
 */
function installDevHooks(sm: SceneManager): void {
  const post = (name: string, dataUrl: string) => fetch(`/__snapshot?name=${encodeURIComponent(name)}`, { method: 'POST', body: dataUrl });
  const render = (frames: number, dt = 1 / 60) => {
    sm.forceResize();
    for (let i = 0; i < frames; i++) {
      controller.frame(dt);
      sm.frame(dt);
    }
  };
  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((res) => {
      const i = new Image();
      i.onload = () => res(i);
      i.src = src;
    });

  async function capture(name: string, frames: number): Promise<string> {
    const { toPng } = await import('html-to-image');
    document.documentElement.classList.add('sl-capture');
    try {
      return await captureInner(toPng, name, frames);
    } finally {
      document.documentElement.classList.remove('sl-capture');
    }
  }

  async function captureInner(toPng: typeof import('html-to-image').toPng, name: string, frames: number): Promise<string> {
    render(frames);
    const gl = sm.renderer.domElement;
    const glUrl = gl.toDataURL('image/png');
    // Canvases stall the rasteriser in hidden windows: exclude them and composite them directly.
    const noCanvas = (n: HTMLElement) => !(n instanceof HTMLCanvasElement);
    const root = document.getElementById('root')!;
    const thumbs = [...root.querySelectorAll('canvas')].filter((c) => c !== gl);
    // Full-screen overlays (the opening intro) sit above the 3D view: composite them last.
    const overlays = [...root.querySelectorAll<HTMLElement>('[data-capture-overlay]')];
    const isOverlay = (n: HTMLElement) => n instanceof HTMLElement && n.dataset.captureOverlay !== undefined;
    const full = await toPng(root, { pixelRatio: 1, filter: (n) => noCanvas(n) && !isOverlay(n) });
    const slot = gl.closest('[data-viewport]') as HTMLElement | null;
    let overlay: string | null = null;
    if (slot) {
      const prev = slot.style.background;
      slot.style.background = 'transparent';
      overlay = await toPng(slot, { pixelRatio: 1, filter: noCanvas });
      slot.style.background = prev;
    }
    const [fullImg, glImg] = await Promise.all([loadImage(full), loadImage(glUrl)]);
    const c = document.createElement('canvas');
    c.width = fullImg.width;
    c.height = fullImg.height;
    const ctx = c.getContext('2d')!;
    const rr = root.getBoundingClientRect();
    ctx.fillStyle = '#050b11';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(fullImg, 0, 0);
    for (const t of thumbs) {
      const r = t.getBoundingClientRect();
      ctx.drawImage(t, r.left - rr.left, r.top - rr.top, r.width, r.height);
    }
    if (slot && gl.isConnected) {
      const r = gl.getBoundingClientRect();
      ctx.drawImage(glImg, r.left - rr.left, r.top - rr.top, r.width, r.height);
      if (overlay) {
        const o = await loadImage(overlay);
        const sr = slot.getBoundingClientRect();
        ctx.drawImage(o, sr.left - rr.left, sr.top - rr.top, sr.width, sr.height);
      }
    }
    for (const el of overlays) {
      const img = await loadImage(await toPng(el, { pixelRatio: 1, filter: noCanvas }));
      const r = el.getBoundingClientRect();
      ctx.drawImage(img, r.left - rr.left, r.top - rr.top, r.width, r.height);
    }
    await post(name, c.toDataURL('image/png'));
    return `${c.width}x${c.height}`;
  }

  (window as unknown as Record<string, unknown>).__sl = {
    controller,
    scene: sm,
    store: useApp,
    /** Save the 3D canvas only. */
    async shot(name = 'shot', frames = 2, dt = 1 / 60) {
      render(frames, dt);
      await post(name, sm.renderer.domElement.toDataURL('image/png'));
      return `${sm.renderer.domElement.width}x${sm.renderer.domElement.height}`;
    },
    /** Save the whole UI (DOM + 3D canvas). */
    async page(name = 'page', frames = 2) {
      // html-to-image waits on requestAnimationFrame, which is paused in hidden windows.
      const raf = window.requestAnimationFrame;
      window.requestAnimationFrame = ((cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 16)) as typeof window.requestAnimationFrame;
      try {
        return await capture(name, frames);
      } finally {
        window.requestAnimationFrame = raf;
      }
    },
  };
}

export { controller };
