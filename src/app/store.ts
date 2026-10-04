import { create } from 'zustand';
import type { LoadingState, SimSnapshot } from '../simulation/SimController';
import type { EngineKind } from '../simulation/types';
import type { CameraPreset } from '../three/cameras/CameraRig';

export type Page = 'overview' | 'visualiser' | 'scenarios' | 'performance' | 'environment' | 'system' | 'validation' | 'cost';

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
  sidebarCollapsed: boolean;
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

const PAGES: Page[] = ['overview', 'visualiser', 'scenarios', 'performance', 'environment', 'system', 'validation', 'cost'];

/** Initial page from the URL hash so deep links and refreshes land on the right page. */
function initialPage(): Page {
  if (typeof window === 'undefined') return 'overview';
  const h = window.location.hash.replace(/^#\/?/, '') as Page;
  return PAGES.includes(h) ? h : 'overview';
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
    sidebarCollapsed: false,
  },
  toast: null,
  setUI: (partial) => set((s) => ({ ui: { ...s.ui, ...partial } })),
  setCamera: (camera) => set((s) => ({ ui: { ...s.ui, camera, cameraNonce: s.ui.cameraNonce + 1 } })),
  showToast: (message, tone = 'info') => set({ toast: { id: toastId++, message, tone } }),
}));
