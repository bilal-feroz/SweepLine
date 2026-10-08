/**
 * The intro's choreography: the camera curve and every timed opacity / progress
 * value, as pure functions of intro time `t` (seconds) and the current map span.
 * Nothing here holds state, so any frame can be reproduced exactly
 * (`window.__mapIntroAt(ms)` in development).
 */
import { band, betaEase, fadeIn, fadeOut, ramp, smootherstep, type MapCamera } from './mapCamera';

/** Key times (seconds). */
export const T = {
  /** Reference site reached; the intro holds here until the digital twin is ready. */
  site: 4.45,
  /** Three.js resumes rendering behind the map (in the hand-off pose) once the zoom has all but landed. */
  render: 4.38,
  /** Map → 3D crossfade. */
  fadeStart: 4.5,
  fadeEnd: 5.0,
  /** Camera flight from the hand-off pose to the normal perspective. */
  flyStart: 5.0,
  flyDuration: 2.3,
  /** Chrome (top bar, HUD) reveal. */
  revealStart: 5.65,
  revealEnd: 6.9,
  end: 7.4,
} as const;

/** Opening composition: span (km across the short side) and the lock point's (reference site's) screen position, in short-side units. */
const START = { span: 700, px: -0.22, py: 0.06 };

/** Final composition: site slightly below and left of centre, offshore up (rotation set from the data). */
export const FINAL = { span: 0.4, px: -0.12, py: 0.2 };

/**
 * Zoom progress (0 → 1 in log span) over [0, T.site]. Its speed ∝ x³(1−x)^1.4 in normalised
 * time: a slow establishing push-in, one steady build to the fastest zoom over the coast,
 * then a long ease-out that lands on the site with zero speed and zero deceleration — no
 * surges between map levels and no braking at the end.
 */
const zoomEase = betaEase(4, 2.4);

/** The bank onto the schematic orientation starts here and ends on landing. */
const BANK_START = 3.0;

export interface Choreography {
  camera(t: number): MapCamera;
}

/** Build the camera curves for a final rotation (degrees clockwise). */
export function buildChoreography(finalRot: number): Choreography {
  const l0 = Math.log(START.span);
  const l1 = Math.log(FINAL.span);
  return {
    camera(t: number): MapCamera {
      const tt = Math.min(t, T.site);
      const u = zoomEase(tt / T.site);
      // The site drifts to its final screen position in step with the zoom: one direction, no reversals.
      return {
        span: Math.exp(l0 + (l1 - l0) * u),
        px: START.px + (FINAL.px - START.px) * u,
        py: START.py + (FINAL.py - START.py) * u,
        rot: finalRot * smootherstep(ramp(tt, BANK_START, T.site)),
      };
    },
  };
}

/** Everything else that changes with time, evaluated per frame. */
export interface IntroState {
  // Map levels
  /** Natural Earth fill inside the regional extent (removed once OpenStreetMap land covers it). */
  neFill: number;
  /** Regional fill (removed once local land covers it). */
  regFill: number;
  uae: number;
  abuDhabi: number;
  borders: number;
  regional: number;
  local: number;
  /** Local level is withdrawn as the schematic takes over the destination. */
  localKeep: number;
  dest: number;
  /** Real shoreline → schematic shoreline (0 → 1). */
  morph: number;
  // Story
  reticle: number;
  reticlePulse: number;
  /** Reticle collapsing onto the intake (0 → 1). */
  reticleToIntake: number;
  siteLabel: number;
  haze: number;
  dots: number;
  current: number;
  currentLabel: number;
  intake: number;
  intakeLabel: number;
  /** Intake marker amber (risk) → teal (protected). */
  intakeSafe: number;
  /** Guide path reveal: curtain then transfer route (0 → 1 each). */
  curtainDraw: number;
  routeDraw: number;
  pulse: number;
  // Overlay
  captionUae: number;
  captionWest: number;
  captionCoast: number;
  eyebrow: number;
  pipeline: number;
  /** Pipeline words lit so far (0 → 4). */
  pipelineStep: number;
  wordmark: number;
  mask: number;
  map: number;
  hud: number;
}

/** Evaluate the timed values at intro time `t` for a camera span (km). */
export function stateAt(t: number, span: number): IntroState {
  return {
    neFill: fadeIn(span, 118, 145),
    regFill: fadeIn(span, 10, 13),
    uae: fadeIn(span, 135, 235),
    abuDhabi: band(t, 0.55, 1.2, 2.1, 2.6) * fadeIn(span, 110, 200),
    borders: fadeIn(span, 5, 14),
    regional: fadeOut(span, 145, 215),
    local: fadeOut(span, 13, 22),
    localKeep: fadeIn(span, 0.85, 1.3),
    dest: fadeOut(span, 1.6, 2.6),
    morph: smootherstep(ramp(t, 4.0, 4.36)),
    reticle: fadeIn(t, 3.02, 3.28),
    reticlePulse: ramp(t, 3.28, 4.0),
    reticleToIntake: smootherstep(ramp(t, 4.02, 4.3)),
    siteLabel: band(t, 3.18, 3.45, 4.0, 4.24),
    haze: fadeIn(t, 3.45, 3.95),
    dots: fadeIn(t, 3.55, 4.0),
    current: fadeIn(t, 3.6, 4.0),
    currentLabel: fadeIn(t, 3.78, 4.05),
    intake: fadeIn(t, 3.88, 4.12),
    intakeLabel: band(t, 4.08, 4.3, T.fadeStart, 4.75),
    intakeSafe: fadeIn(t, 4.33, 4.5),
    curtainDraw: smootherstep(ramp(t, 4.02, 4.24)),
    routeDraw: smootherstep(ramp(t, 4.18, 4.42)),
    pulse: fadeIn(t, 4.3, 4.45),
    // Captions hand over one at a time (never two lines of text overlapping).
    captionUae: band(t, 0.12, 0.45, 0.98, 1.16),
    captionWest: band(t, 1.2, 1.45, 2.28, 2.46),
    captionCoast: band(t, 2.5, 2.75, 3.45, 3.66),
    eyebrow: band(t, 3.82, 4.1, 6.05, 6.5),
    // Gone before the HUD fades in: the headline's title takes this line.
    pipeline: band(t, 4.0, 4.22, 5.55, 5.95),
    pipelineStep: 4 * ramp(t, 4.02, 4.44),
    wordmark: band(t, 4.22, 4.55, 6.3, 6.8),
    mask: band(t, 4.18, 4.48, T.revealStart, 6.45),
    map: fadeOut(t, T.fadeStart, T.fadeEnd),
    hud: fadeIn(t, 6.0, T.revealEnd),
  };
}

/** Scene progress (0 → 1) of the camera flight at intro time `t`. */
export function flightProgress(t: number): number {
  return ramp(t, T.flyStart, T.flyStart + T.flyDuration);
}
