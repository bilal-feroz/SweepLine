import type { FailureKey, SimParams } from './types';

export type ScenarioAction =
  | { kind: 'fail'; failure: FailureKey }
  | { kind: 'clear'; failure: FailureKey }
  | { kind: 'params'; params: Partial<SimParams>; message: string };

export interface ScenarioStep {
  /** Simulated seconds after the run (or its pre-roll) starts. */
  at: number;
  action: ScenarioAction;
}

export interface Scenario {
  id: string;
  name: string;
  tagline: string;
  description: string;
  /** What the scenario is designed to demonstrate. */
  demonstrates: string[];
  params: Partial<SimParams>;
  /** 'sequence' runs from bloom approach (warning → deploy …); 'steady' pre-rolls into live operation. */
  start: 'sequence' | 'steady';
  script?: ScenarioStep[];
  tone: 'nominal' | 'stress' | 'failure';
}

const NORMAL: Partial<SimParams> = {
  bloomDensity: 0.55,
  currentSpeed: 0.28,
  currentBearing: 112,
  bloomMeanDepth: 1.7,
  bloomDepthSD: 0.6,
  skirtDepth: 2.5,
  waveHeight: 0.6,
  anchorAngle: 20,
  transferCapacity: 0.8,
  standbyEnabled: true,
};

/**
 * Scenario presets. Each loads real parameter values into the simulation; the
 * outcomes are computed by the agent model, never scripted.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: 'normal',
    name: 'Normal Bloom',
    tagline: 'Typical seasonal bloom inside the envelope',
    description:
      'Moderate bloom density near the surface. Runs the full sequence from bloom approach and early warning through deployment, sweep, transfer and release.',
    demonstrates: ['Full DETECT → DEPLOY → SWEEP → TRANSFER → RELEASE sequence', 'Diversion along the angled curtain'],
    params: NORMAL,
    start: 'sequence',
    tone: 'nominal',
  },
  {
    id: 'extreme',
    name: 'Extreme Bloom',
    tagline: 'Maximum density, deeper distribution',
    description:
      'Peak bloom density with a deeper distribution. Transfer utilisation and throat occupancy approach their limits — watch the throat indicator move from green to amber.',
    demonstrates: ['Transfer utilisation near capacity', 'Throat occupancy rising', 'Curtain biomass loading'],
    params: { ...NORMAL, bloomDensity: 1.0, currentSpeed: 0.34, bloomMeanDepth: 2.1, bloomDepthSD: 0.7, skirtDepth: 3.0, waveHeight: 0.9, transferCapacity: 0.85 },
    start: 'steady',
    tone: 'stress',
  },
  {
    id: 'deep',
    name: 'Deep Bloom',
    tagline: 'Bloom sits below the skirt setpoint',
    description:
      'Most of the bloom sits deeper than the 2.5 m skirt setpoint. The winches lower the skirt automatically to 4.0 m, the most the seabed clearance allows, and the foot jets lift animals close to the hem — switch to the underwater camera to see the deepest few still slip underneath.',
    demonstrates: ['Adaptive skirt depth', 'Under-skirt escape at the clearance limit', 'Foot jets at the hem'],
    params: { ...NORMAL, bloomDensity: 0.7, bloomMeanDepth: 3.4, bloomDepthSD: 0.45, skirtDepth: 2.5 },
    start: 'steady',
    tone: 'stress',
  },
  {
    id: 'high-current',
    name: 'High Current',
    tagline: 'Current exceeds the assumed envelope',
    description:
      'A 0.72 m/s current exceeds the assumed 0.60 m/s limit. The warning arrives but deployment is rejected — SweepLine reports DO NOT DEPLOY instead of faking success.',
    demonstrates: ['Operating-envelope check', 'Deployment rejected outside validated envelope'],
    params: { ...NORMAL, currentSpeed: 0.72, bloomDensity: 0.65 },
    start: 'sequence',
    tone: 'stress',
  },
  {
    id: 'high-waves',
    name: 'High Waves',
    tagline: 'Sea state builds during operation',
    description:
      'Starts in normal operation; significant wave height then builds to 1.8 m. The hard limit is exceeded and SafeOpen retracts the curtain automatically, upstream end first.',
    demonstrates: ['Automatic SafeOpen on envelope exceedance', 'Wave overtopping of the float line'],
    params: { ...NORMAL, waveHeight: 0.8 },
    start: 'steady',
    script: [
      { at: 30, action: { kind: 'params', params: { waveHeight: 1.25 }, message: 'Sea state increasing — Hs 1.25 m' } },
      { at: 70, action: { kind: 'params', params: { waveHeight: 1.8 }, message: 'Sea state increasing — Hs 1.8 m' } },
    ],
    tone: 'stress',
  },
  {
    id: 'slack-tide',
    name: 'Slack Tide',
    tagline: 'The current dies away during operation',
    description:
      'Starts in normal operation; the along-shore current then slackens to 0.06 m/s. A passive curtain stops sweeping and jellyfish stall against it, while the conveyor jets keep the bloom moving to the throat. Switch Active flow off to compare.',
    demonstrates: ['Active flow independent of the tide', 'Conveyor jets vs passive sweep'],
    params: { ...NORMAL },
    start: 'steady',
    script: [
      { at: 30, action: { kind: 'params', params: { currentSpeed: 0.15 }, message: 'Current slackening — 0.15 m/s' } },
      { at: 70, action: { kind: 'params', params: { currentSpeed: 0.06 }, message: 'Slack tide — current 0.06 m/s' } },
    ],
    tone: 'stress',
  },
  {
    id: 'transfer-failure',
    name: 'Transfer Failure',
    tagline: 'Primary transfer fault, standby takes over',
    description:
      'A primary transfer fault is injected during operation. The standby transfer path activates automatically and capacity is restored — the first fail-safe.',
    demonstrates: ['Transfer fault detection', 'Standby transfer activation'],
    params: { ...NORMAL, bloomDensity: 0.7 },
    start: 'steady',
    script: [{ at: 40, action: { kind: 'fail', failure: 'transferPrimary' } }],
    tone: 'failure',
  },
  {
    id: 'safeopen',
    name: 'SafeOpen Demonstration',
    tagline: 'Primary and standby transfer both fail',
    description:
      'Primary transfer fails, the standby activates, then the standby also fails. SafeOpen reefs the upstream end first, clears existing curtain traffic, progressively reefs the rest and restores baseline intake protection.',
    demonstrates: ['Upstream-first reefing', 'Existing traffic clearing', 'Return to baseline protection'],
    params: { ...NORMAL, bloomDensity: 0.7 },
    start: 'steady',
    script: [
      { at: 30, action: { kind: 'fail', failure: 'transferPrimary' } },
      { at: 90, action: { kind: 'fail', failure: 'transferStandby' } },
    ],
    tone: 'failure',
  },
  {
    id: 'workboat',
    name: 'Workboat Deployment',
    tagline: 'Same bloom, laid by boat instead of popping up',
    description:
      'The curtain is laid by a workboat after a 15-minute mobilisation (assumption) instead of rising from the seabed. The leading edge of the bloom reaches the intake before the curtain is in place: the late-deployment leak the pop-up curtain removes.',
    demonstrates: ['Late-deployment leakage', 'Pop-up vs workboat response time'],
    params: { ...NORMAL, deployMode: 'workboat' },
    start: 'sequence',
    tone: 'stress',
  },
];

export function getScenario(id: string | null | undefined): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
