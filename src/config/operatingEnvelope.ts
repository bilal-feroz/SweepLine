/**
 * Assumed operating envelope for SweepLine V1.
 *
 * These thresholds are DESIGN ASSUMPTIONS pending flume calibration and coastal
 * pilot data. "hard" limits trigger automatic SafeOpen when exceeded during
 * operation (after a short dwell) and block deployment. "advisory" limits are
 * reported with a recommended action but do not force SafeOpen.
 */
export const OPERATING_ENVELOPE = {
  currentSpeed: { label: 'Current speed', unit: 'm/s', near: 0.48, max: 0.6, kind: 'hard' as const },
  waveHeight: { label: 'Wave height (Hs)', unit: 'm', near: 1.2, max: 1.5, kind: 'hard' as const },
  attackAngle: { label: 'Current–curtain angle', unit: '°', min: 10, max: 30, nearMargin: 2, kind: 'hard' as const },
  bloomDepth: {
    label: 'Bloom P90 depth',
    unit: 'm',
    /** P90 deeper than the deepest available skirt: SweepLine cannot intercept the bloom. */
    absoluteMax: 4.0,
    kind: 'advisory' as const,
  },
  seabedClearance: { label: 'Skirt–seabed clearance', unit: 'm', min: 1.0, kind: 'hard' as const },
  curtainLoad: { label: 'Curtain load', unit: '%', near: 80, max: 100, kind: 'hard' as const },
  transferUtilisation: { label: 'Transfer utilisation', unit: '%', near: 85, max: 100, kind: 'hard' as const },
  throatOccupancy: { label: 'Throat occupancy', unit: '%', near: 60, max: 90, kind: 'hard' as const },
  transferPath: { label: 'Transfer path', unit: '', kind: 'hard' as const },
} as const;

export type EnvelopeKey = keyof typeof OPERATING_ENVELOPE;
