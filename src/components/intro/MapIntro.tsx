import { useEffect, useRef, type SVGProps } from 'react';
import { useApp } from '../../app/store';
import { MAP_INTRO_DATA } from '../../data/mapIntro.generated';
import type { MapRect } from '../../data/mapIntroTypes';
import { LogoMark } from '../ui/Logo';
import { attachPlayer, detachPlayer, installIntroDevHooks, introEnded, mountCommand } from './introControl';
import { IntroPlayer, type IntroMode } from './IntroPlayer';
import { HAZE, SiteFrame } from './introStory';
import { svgMatrix } from './mapCamera';
import './intro.css';

if (import.meta.env.DEV) installIntroDevHooks();

const { national: N, regional: R, local: L } = MAP_INTRO_DATA.levels;
const SITE_FRAME = new SiteFrame();
const UAE = MAP_INTRO_DATA.labels.find((l) => l.id === 'country-are');

/** Map-km rectangle as path data (SVG y is south). */
const rectPath = (r: MapRect) => `M${r.x0} ${-r.y1}H${r.x1}V${-r.y0}H${r.x0}Z`;
const scale = (u: number) => `scale(${u})`;
const STEPS = ['Deploy', 'Sweep', 'Transfer', 'Release'];

type Paint = SVGProps<SVGPathElement>;
const thin = { vectorEffect: 'non-scaling-stroke', strokeLinejoin: 'round' } as const;

/**
 * Map paint, kept as SVG presentation attributes. Land is dark slate (the UAE a
 * step brighter), water is the near-black page behind the map; cyan / teal are
 * reserved for SweepLine annotations and amber for the intake at risk.
 */
const P = {
  land: { fill: '#0c1720', stroke: '#8cb2c6', strokeOpacity: 0.2, strokeWidth: 0.8, ...thin },
  uae: { fill: '#13232f', stroke: '#a5cada', strokeOpacity: 0.34, strokeWidth: 0.9, ...thin },
  emirate: { fill: '#22d3ee', fillOpacity: 0.045, stroke: '#22d3ee', strokeOpacity: 0.42, strokeWidth: 1, ...thin },
  border: { fill: 'none', stroke: '#96c8dc', strokeOpacity: 0.26, strokeWidth: 0.9, strokeDasharray: '4 3', ...thin },
  landNear: { fill: '#13232f' },
  coast: { fill: 'none', stroke: '#a5cada', strokeOpacity: 0.4, strokeWidth: 0.9, ...thin },
  coastDest: { fill: 'none', stroke: '#b4d6e4', strokeOpacity: 0.55, strokeWidth: 1.1, ...thin },
  road: { fill: 'none', stroke: '#96bed2', strokeOpacity: 0.22, strokeWidth: 1.2, strokeLinecap: 'round', ...thin },
  roadMinor: { fill: 'none', stroke: '#96bed2', strokeOpacity: 0.1, strokeWidth: 0.7, ...thin },
  streakTail: { fill: 'none', stroke: '#2dd4bf', strokeOpacity: 0.16, strokeWidth: 1, strokeLinecap: 'round', ...thin },
  streakHead: { fill: 'none', stroke: '#5eead4', strokeOpacity: 0.7, strokeWidth: 1.4, strokeLinecap: 'round', ...thin },
  intake: { fill: '#e7f1f5', fillOpacity: 0.05, stroke: '#e7f1f5', strokeOpacity: 0.45, strokeWidth: 1, ...thin },
  intakeFace: { fill: 'none', stroke: '#f5b94c', strokeWidth: 2.6, strokeLinecap: 'round', ...thin },
  guide: { fill: 'none', stroke: '#2dd4bf', strokeWidth: 2, strokeLinecap: 'round', ...thin },
  route: { fill: 'none', stroke: '#2dd4bf', strokeOpacity: 0.75, strokeWidth: 1.3, strokeDasharray: '5 4', strokeLinecap: 'round', ...thin },
  node: { fill: '#050b11', stroke: '#2dd4bf', strokeWidth: 1.2, ...thin },
  pulse: { fill: 'none', stroke: '#c9fbf3', strokeWidth: 2.4, strokeLinecap: 'round', ...thin },
  dots: { fill: 'none', stroke: '#e8f9ff', strokeOpacity: 0.82, strokeWidth: 3.6, strokeLinecap: 'round', ...thin },
  dotsDim: { fill: 'none', stroke: '#bee8f6', strokeOpacity: 0.45, strokeWidth: 2.8, strokeLinecap: 'round', ...thin },
} satisfies Record<string, Paint>;

/**
 * Each zoom level draws its fill and its lines separately: the finer level's fill
 * fades in over a still-opaque coarser fill (same colour, no brightness dip), while
 * coastlines and roads crossfade.
 */
function LevelFill({ unit, d, paint }: { unit: number; d: string; paint: Paint }) {
  return <path {...paint} stroke="none" transform={scale(unit)} d={d} />;
}

/**
 * Opening sequence: the UAE → Abu Dhabi → Al Dhafra → Al Dhannah coast →
 * SweepLine reference site, handing off into the Three.js digital twin.
 * React mounts this scaffolding once; {@link IntroPlayer} animates it.
 */
export function MapIntro() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const done = () => {
      introEnded();
      useApp.setState({ intro: false });
    };
    // A dev command may have mounted the intro (window.__mapIntroAt / __mapIntroPlay).
    const cmd = mountCommand();
    const mode: IntroMode = cmd?.kind === 'at' ? 'frozen' : reduced && !cmd ? 'reduced' : 'play';
    const player = new IntroPlayer(root, mode, done);
    attachPlayer(player);
    player.start(cmd?.ms ?? 0);
    cmd?.resolve();
    return () => {
      detachPlayer(player);
      player.destroy();
    };
  }, []);

  return (
    <div ref={ref} className="sl-intro" role="presentation" data-capture-overlay>
      <div className="sl-intro-map" data-o="map">
        <div className="sl-intro-water" />
        <svg className="sl-intro-svg" aria-hidden="true" focusable="false">
          <defs>
            <clipPath id="sli-out-reg" clipPathUnits="userSpaceOnUse">
              <path clipRule="evenodd" d={rectPath(N.rect) + rectPath(R.rect)} />
            </clipPath>
            <radialGradient id="sli-haze">
              <stop offset="0" stopColor="#d9f6ff" stopOpacity="0.2" />
              <stop offset="0.55" stopColor="#a8e6f5" stopOpacity="0.075" />
              <stop offset="1" stopColor="#a8e6f5" stopOpacity="0" />
            </radialGradient>
          </defs>

          <g data-cam>
            {/* National — Natural Earth. Outside the regional extent its fill stays as the only land. */}
            <g clipPath="url(#sli-out-reg)">
              <LevelFill unit={N.unit} d={N.land} paint={P.land} />
            </g>
            <g data-l="ne-fill">
              <LevelFill unit={N.unit} d={N.land} paint={P.land} />
            </g>
            <path data-l="uae" {...P.uae} transform={scale(N.unit)} d={N.uae} />
            <path data-l="ne-line" {...P.land} fill="none" transform={scale(N.unit)} d={N.land} />
            <path data-l="ad" {...P.emirate} transform={scale(N.unit)} d={N.abuDhabi} />
            <path data-l="borders" {...P.border} transform={scale(N.unit)} d={N.borders} />

            {/* Regional — OpenStreetMap, western Abu Dhabi */}
            <g data-l="reg-fill">
              <LevelFill unit={R.unit} d={R.land} paint={P.landNear} />
            </g>
            <g data-l="reg-line">
              <path {...P.road} transform={scale(R.unit)} d={R.roads} />
              <path {...P.coast} transform={scale(R.unit)} d={R.coast} />
            </g>

            {/* Local — OpenStreetMap, Al Dhannah coast */}
            <g data-l="loc-fill">
              <LevelFill unit={L.unit} d={L.land} paint={P.landNear} />
            </g>
            <g data-l="loc-line">
              <path data-l="loc-minor" {...P.roadMinor} transform={scale(L.unit)} d={L.roadsMinor} />
              <path {...P.road} transform={scale(L.unit)} d={L.roadsMajor} />
              <path {...P.coast} transform={scale(L.unit)} d={L.coast} />
            </g>

            {/* Reference site — schematic frame (metres), shared with the 3D scene */}
            <g transform={svgMatrix(SITE_FRAME.toSvg)}>
              <g data-l="dest">
                <path data-l="dest-land" {...P.landNear} />
                <path data-l="dest-line" {...P.coastDest} />
              </g>
              <g data-s="story">
                <g data-s="haze">
                  {HAZE.map((h, i) => (
                    <ellipse key={i} cx={h.x} cy={h.z} rx={h.rx} ry={h.rz} fill="url(#sli-haze)" opacity={h.o} />
                  ))}
                </g>
                <g data-s="streaks">
                  <path data-s="streak-tails" {...P.streakTail} />
                  <path data-s="streak-heads" {...P.streakHead} />
                </g>
                <path data-s="intake" {...P.intake} />
                <path data-s="intake-face" {...P.intakeFace} />
                <path data-s="curtain" {...P.guide} />
                <path data-s="route" {...P.route} />
                <circle data-s="throat" r="4.5" {...P.node} />
                <circle data-s="release" {...P.node} />
                <path data-s="pulse" {...P.pulse} />
                <g data-s="dots">
                  <path data-s="dots-dim" {...P.dotsDim} />
                  <path data-s="dots-bright" {...P.dots} />
                </g>
              </g>
            </g>
          </g>

          {/* Screen-space reticle on the reference site */}
          <g data-s="reticle" fill="none" stroke="#22d3ee" strokeWidth={1.2}>
            <circle data-s="reticle-pulse" r="15" strokeOpacity={0.9} strokeWidth={1} />
            <circle data-s="reticle-ring" r="15" />
            <path d="M-25 0h7M18 0h7M0 -25v7M0 18v7" />
            <circle r="1.7" fill="#22d3ee" stroke="none" />
          </g>
        </svg>
      </div>

      <div className="sl-intro-labels" data-o="labels" aria-hidden="true" />

      <div className="sl-intro-annot sl-intro-site" data-o="site-label" aria-hidden="true">
        <span className="sl-intro-site-title">SweepLine reference site</span>
        <span className="sl-intro-site-sub">Schematic coastal intake · engineering simulation</span>
      </div>
      <div className="sl-intro-annot sl-intro-intake" data-o="intake-label" aria-hidden="true">
        Coastal intake
      </div>
      <div className="sl-intro-annot sl-intro-current" data-o="current-label" aria-hidden="true">
        <span className="sl-intro-arrow" data-o="current-arrow">
          →
        </span>
        Simulated current · alongshore
      </div>

      <div className="sl-intro-mask" data-o="mask" />

      <div className="sl-intro-captions" data-o="captions" aria-hidden="true">
        <div className="sl-intro-cap" data-o="cap-uae">
          <span className="sl-intro-cap-en">{UAE?.en ?? 'United Arab Emirates'}</span>
          {UAE?.ar && (
            <span className="sl-intro-cap-ar" lang="ar" dir="rtl">
              {UAE.ar}
            </span>
          )}
        </div>
        <div className="sl-intro-cap" data-o="cap-west">
          <span className="sl-intro-cap-en">Abu Dhabi · Western coast</span>
        </div>
        <div className="sl-intro-cap" data-o="cap-coast">
          <span className="sl-intro-cap-en">Al Dhannah coast</span>
        </div>
      </div>

      <div className="sl-intro-handoff" data-o="handoff-text" aria-hidden="true">
        <div className="sl-intro-eyebrow" data-o="eyebrow">
          <span className="sl-intro-eyebrow-dot" />
          <span data-o="eyebrow-text" />
        </div>
        <div className="sl-intro-pipeline" data-o="pipeline">
          {STEPS.map((s, i) => (
            <span key={s} className="sl-intro-step">
              {i > 0 && <span className="sl-intro-step-arrow">→</span>}
              <span data-step>{s}</span>
            </span>
          ))}
        </div>
        <div className="sl-intro-progress" data-o="progress">
          <span data-o="progress-text" />
          <span className="sl-intro-progress-track">
            <span className="sl-intro-progress-bar" data-o="progress-bar" />
          </span>
        </div>
      </div>

      <div className="sl-intro-wordmark" data-o="wordmark" aria-hidden="true">
        <LogoMark size={30} />
        <span className="sl-intro-wordmark-name">SweepLine</span>
        <span className="sl-intro-wordmark-tag" data-o="tagline">
          Adaptive live jellyfish bypass
        </span>
      </div>

      <div className="sl-intro-scale" data-o="scale" aria-hidden="true">
        <span className="sl-intro-scale-text" data-o="scale-text" />
        <span className="sl-intro-scale-bar" data-o="scale-bar" />
      </div>
      <div className="sl-intro-attrib" data-o="attrib">
        {MAP_INTRO_DATA.attribution}
      </div>
      <p className="sr-only" data-o="status" aria-live="polite" />
      <p className="sr-only">Opening sequence — press Escape to skip.</p>
    </div>
  );
}
