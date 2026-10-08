/**
 * Simulation and design assumptions.
 *
 * Every number in this file is a DESIGN ASSUMPTION used by the agent-based
 * engineering simulation. None of them is a validated field value. They are
 * grouped here so they can be reviewed, challenged and calibrated against flume
 * and field data later without touching simulation code.
 */
export const ASSUMPTIONS = {
  /** Fixed integration step for the agent model (simulated seconds). */
  timeStep: 0.1,

  agent: {
    /** Velocity relaxation time — gives inertia so trajectories bend gradually (s). */
    tau: 2.0,
    /** Self-propulsion from bell pulsation (m/s). */
    swimSpeedMin: 0.02,
    swimSpeedMax: 0.06,
    /** Small-scale stochastic motion amplitude (m/s). */
    turbulence: 0.022,
    /** Vertical swimming toward preferred depth: gain (1/s) and cap (m/s). */
    verticalGain: 0.06,
    verticalMax: 0.04,
    /** Vertical turbulent mixing amplitude (m/s). */
    verticalNoise: 0.014,
    /** Full-scale bell diameter range for Catostylus mosaicus (m). */
    bellDiameterMin: 0.3,
    bellDiameterMax: 0.45,
    /** Shallowest depth an agent will occupy (m). */
    minDepth: 0.3,
  },

  bloom: {
    /** Fraction of spawns drawn from the main (near-shore) patch; the rest is a broad background. */
    mainPatchFraction: 0.88,
    /** Slow lateral wander of the patch centre (m). */
    patchWander: 6,
    /**
     * Once an agent has passed the intake reference line clear of the site, it is no
     * longer tracked: it fades out over this distance (m) and leaves the simulation.
     * Its outcome is already counted.
     */
    passedFadeDistance: 30,
    /** Temporal patchiness of the arrival rate (± fraction). */
    rateVariation: 0.3,
    /**
     * Extent of the bloom when a run starts from the approach stage (m), used when the curtain is
     * not popped up automatically (workboat or manual deployment): the leading edge is still
     * upstream of every anchor layout.
     */
    approachFillFrom: -240,
    approachFillTo: -200,
    /**
     * With an automatic pop-up deployment the run starts with the bloom close in: its leading
     * edge lies just upstream of the curtain's upstream anchor, set back from every section by the
     * drift until that section has surfaced (early warning, deployment confirmation and its pop-up
     * time, × this margin), plus `popUpFrontGap` (m). Every section is up before the bloom reaches
     * it; behind the edge the bloom extends back to the spawn line.
     */
    popUpFrontMargin: 1.15,
    popUpFrontGap: 6,
    /** Stress-test bloom surge: a band this deep (m) ending this far (m) upstream of a guiding curtain. */
    surgeDepth: 45,
    surgeGap: 8,
  },

  curtain: {
    /** Thickness of the zone where the curtain influences an agent (m). */
    interactionRange: 3.0,
    /** Distance at which an agent is considered to be guided along the curtain (m). */
    guideDistance: 1.8,
    /** Closest stand-off of a bell centre from the skirt plane (m). */
    minStandoff: 0.35,
    /** Fraction of the blocked (normal) velocity redirected along the curtain tangent. */
    redirectGain: 0.6,
    /** Fraction of the blocked velocity that becomes downward entrainment at the skirt face. */
    entrainmentGain: 0.1,
    /** Skirt blow-back: tan(theta) = liftCoefficient * Un^2. */
    liftCoefficient: 4.6,
    /** Fraction of wave elevation that appears as relative heave between skirt edge and bloom. */
    relativeHeave: 0.5,
    moduleLength: 10,
    floatSpacing: 1.2,
    intermediateAnchorSpacing: 30,
    /** Deployment tow speed of the workboat (m/s ≈ 3 kn). */
    deploySpeed: 1.5,
    stowSpeed: 2.0,
    /** Skirt depth adjustment rate of the reefing winches (m/s). */
    skirtWinchRate: 0.3,
    /** Length behind the laying point over which the skirt drops to full depth (m). */
    skirtDropLag: 10,
    /** Length over which a reefed section transitions (m). */
    reefBand: 6,
    /** Minimum allowed clearance between skirt bottom and seabed (m). */
    seabedClearance: 1.0,
    skirtDepthMin: 1.5,
    skirtDepthMax: 4.0,
    /**
     * Adaptive skirt: while the bloom's P90 depth is below the skirt setpoint, the winches lower
     * the skirt to P90 + this margin (m), within the seabed clearance limit.
     */
    adaptiveSkirtMargin: 0.3,
    /** Wave overtopping: threshold Hs (m) and gain. */
    overtopThreshold: 1.0,
    overtopGain: 0.02,
  },

  /**
   * Active flow (SweepLine Active): low-velocity water jets built into the curtain.
   * Conveyor jets drive a gentle wall jet along the bloom face toward the throat, so the
   * sweep does not depend on the natural current; foot jets on the weighted hem push water
   * upward at the gap under the skirt (a "water skirt"). First-pass values from plane
   * wall-jet scaling, to be sized by CFD and flume tests.
   */
  jets: {
    /** Along-face velocity at the curtain face at 100 % output (m/s). */
    conveyorSpeed: 0.3,
    /** Width of the conveyor layer on the bloom side; the velocity falls to zero across it (m). */
    conveyorBand: 3.0,
    /** Upward velocity at the skirt's lower edge at 100 % output (m/s). */
    footUplift: 0.07,
    /** How far below the skirt edge the foot jets reach (m). */
    footReach: 1.5,
    /** Horizontal reach of the foot jets from the curtain plane (m). */
    footBand: 2.0,
    /** Time for the jets to reach the commanded output (s). */
    rampTime: 10,
    /** Water flow and pump power at 100 % output (first estimate; power scales with output cubed). */
    designFlowM3s: 1.5,
    designPowerKW: 50,
  },

  deploy: {
    /** Pop-up: valve checks before the float line starts inflating (s). */
    popUpDelay: 15,
    /** Pop-up: speed of the inflation front along the curtain from the throat end (m/s). */
    popUpSpeed: 2.5,
    /**
     * Pop-up: ascent speed of an inflated section from the seabed to the surface (m/s), so a
     * section takes ~10–16 s to surface over 5–8 m of water. A section guides only once its
     * float line is at the surface. Assumption — to be confirmed by flume tests.
     */
    riseSpeed: 0.5,
    /** Pop-up: sink speed of a vented section settling back onto the seabed when stowing (m/s). Assumption. */
    sinkSpeed: 0.35,
    /** Workboat option: crew and vessel mobilisation before laying starts (s). */
    workboatMobilisation: 900,
  },

  throat: {
    /** Bellmouth holding capacity per 1000 simulated agents. */
    holdCapacityPerThousand: 20,
    /** Advection speed through the bellmouth (m/s) = base + flow * transferFlowFraction. */
    funnelSpeedBase: 0.15,
    funnelSpeedFlow: 0.3,
  },

  transfer: {
    /**
     * Transfer rate at 100 % capacity, per 1000 simulated agents (agents/s). Sized so the
     * reference bloom — which arrives along the coast and almost all reaches the throat —
     * runs at roughly 55–75 % utilisation, leaving headroom for rate surges.
     */
    designRatePerThousand: 0.85,
    /** Nominal transfer water flow at 100 % capacity (m³/h). */
    designFlowM3h: 640,
    /** Time for the standby path to reach full capacity after a primary fault (s). */
    standbyActivationTime: 8,
    /**
     * Residual capacity of the passive open-flow line when no powered path is
     * available (fraction of design). Set to 0 to model no passive path.
     */
    passiveDrainFraction: 0.25,
    /** Mean velocity in the transfer line (m/s). */
    pipeVelocity: 1.5,
  },

  release: {
    /** Assumed transfer-line length to the safe release zone (m) — simulation assumption. */
    distanceOptions: [250, 500, 750] as const,
    jetSpeed: 0.35,
    /** Released jellyfish are tracked while they clear the outlet plume (s), then fade out over fadeTime and leave the simulation. */
    trackTime: 40,
    fadeTime: 10,
  },

  intake: {
    /** Time a jellyfish remains impinged on the screens before removal (s). */
    impingementDwell: 150,
  },

  safeOpen: {
    /** Fraction of curtain length reefed in the fast upstream-first step. */
    upstreamFraction: 0.4,
    upstreamReefSpeed: 2.0,
    /** Reef front speed while existing curtain traffic clears (m/s). */
    clearingReefSpeed: 0.45,
    finalReefSpeed: 1.5,
    /** Clearing ends when this many or fewer agents remain guided on active sections. */
    clearingThreshold: 2,
    maxClearingTime: 150,
    throatClearTimeout: 150,
    /** Hard-limit violations must persist this long before SafeOpen triggers (s). */
    violationDwell: 6,
    /** Delay between losing all powered transfer paths and SafeOpen initiation (s). */
    transferLossDelay: 2,
    rearmSpeed: 2.0,
  },

  sequence: {
    /** Early-warning message arrives this long after the bloom approach starts (s). */
    warningAt: 4,
    /** Envelope must be satisfied this long before auto-deployment begins (s). */
    deployConfirm: 2,
    /** Pre-roll used when a run starts in steady operation (s). */
    steadyPreRoll: 780,
    /** Integration step used only during pre-roll (s). Both engines use it, so the comparison stays fair. */
    preRollStep: 0.4,
  },

  loads: {
    /** Normal-velocity reference giving 100 % hydrodynamic load at full design skirt (m/s). */
    designNormalVelocity: 0.2,
    designSkirt: 4.0,
    designWave: 1.5,
    /** Guided agents per 1000-agent budget that represent 100 % biomass load. */
    designGuidedPerThousand: 260,
    hydroWeight: 0.55,
    waveWeight: 0.3,
    biomassWeight: 0.25,
  },

  metrics: {
    /** Intake contacts per minute per 1000 agents dividing LOW/MEDIUM/HIGH screen loading. */
    screenLoadMedium: 2.0,
    screenLoadHigh: 5.0,
    /** Rolling window for rates (s). */
    rateWindow: 300,
    /** Minimum resolved sample before a percentage is shown. */
    minSample: 12,
  },
} as const;
