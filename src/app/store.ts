import { create } from 'zustand';
import type { LoadingState, SimSnapshot } from '../simulation/SimController';
import type { EngineKind } from '../simulation/types';
import type { CameraPreset } from '../three/cameras/CameraRig';

export type Page = 'live' | 'how' | 'evidence';

export type SelectionKind = 'curtain' | 'throat' | 'transfer' | 'intake' | 'bloom' | 'release' | 'jelly';

export interface Selection {
  kind: SelectionKind;
  engine?: EngineKind;
  agentId?: number;
}

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'warn' | 'alarm' | 'ok';
}

export interface UIState {
  page: Page;
  /** Which world is shown in single view. */
  displayed: EngineKind;
  compare: boolean;
  flowView: boolean;
  labels: boolean;
  camera: CameraPreset;
  /** Increments to request a camera move even if the preset is unchanged. */
  cameraNonce: number;
  selection: Selection | null;
  follow: boolean;
  underwater: boolean;
  cameraDepth: number;
  cameraHeading: number;
}

interface AppState {
  snap: SimSnapshot | null;
  loading: LoadingState;
  historyVersion: number;
  ui: UIState;
  toast: Toast | null;
  setUI: (partial: Partial<UIState>) => void;
  setCamera: (camera: CameraPreset) => void;
  showToast: (message: string, tone?: Toast['tone']) => void;
}

let toastId = 1;

export const PAGES: Page[] = ['live', 'how', 'evidence'];

/** Older page links map onto the three pages. */
const LEGACY: Record<string, Page> = {
  overview: 'live',
  visualiser: 'live',
  scenarios: 'live',
  system: 'how',
  environment: 'how',
  performance: 'evidence',
  validation: 'evidence',
  cost: 'evidence',
};

/** Page for a URL hash (null when it names no page). */
export function pageFromHash(hash: string): Page | null {
  const h = hash.replace(/^#\/?/, '');
  if ((PAGES as string[]).includes(h)) return h as Page;
  return LEGACY[h] ?? null;
}

/** Initial page from the URL hash so deep links and refreshes land on the right page. */
function initialPage(): Page {
  if (typeof window === 'undefined') return 'live';
  return pageFromHash(window.location.hash) ?? 'live';
}

export const useApp = create<AppState>((set) => ({
  snap: null,
  loading: { active: true, progress: 0, label: 'Initialising digital twin' },
  historyVersion: 0,
  ui: {
    page: initialPage(),
    displayed: 'sweepline',
    compare: false,
    flowView: false,
    labels: true,
    camera: 'aerial',
    cameraNonce: 0,
    selection: null,
    follow: false,
    underwater: false,
    cameraDepth: 0,
    cameraHeading: 0,
  },
  toast: null,
  setUI: (partial) => set((s) => ({ ui: { ...s.ui, ...partial } })),
  setCamera: (camera) => set((s) => ({ ui: { ...s.ui, camera, cameraNonce: s.ui.cameraNonce + 1 } })),
  showToast: (message, tone = 'info') => set({ toast: { id: toastId++, message, tone } }),
}));
