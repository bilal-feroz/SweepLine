import { SITE } from '../../config/site';
import { getCurtainLayout } from '../../simulation/geometry';
import { ANCHOR_ANGLES, type AnchorAngle } from '../../simulation/types';

const X0 = -215;
const X1 = 175;
const Z0 = -96;
const Z1 = 95;
const W = 780;
const S = W / (X1 - X0);
const H = (Z1 - Z0) * S;
const sx = (x: number) => (x - X0) * S;
const sy = (z: number) => (z - Z0) * S;

/**
 * Plan-view schematic drawn directly from the simulation geometry (site config
 * and curtain layouts) — reference geometry, not facility data.
 */
export function PlanSchematic({ selected, reefFraction = 0 }: { selected: AnchorAngle; reefFraction?: number }) {
  const I = SITE.intake;
  const th = getCurtainLayout(selected).throat;
  const pipe = [[th.mx + 11, th.mz], ...SITE.pipeRoute.slice(1), [SITE.release.x, SITE.release.z]] as Array<readonly [number, number]>;
  const capR = 30;
  const north = { x: -0.375, y: 0.927 };
  const bloom: Array<[number, number, number]> = [];
  for (let i = 0; i < 70; i++) {
    const a = Math.sin(i * 12.9898) * 43758.5453;
    const b = Math.sin(i * 78.233) * 12345.678;
    const fx = a - Math.floor(a);
    const fz = b - Math.floor(b);
    bloom.push([-205 + fx * 70, -46 + fz * 70, 1.4 + (i % 3) * 0.5]);
  }
  return (
    <svg viewBox={`0 0 ${W} ${H.toFixed(0)}`} className="h-auto w-full" role="img" aria-label="Plan view of the reference site: curtain layouts, recovery throat, transfer line, intake and release zone">
      <defs>
        <pattern id="rev" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="#4E6472" strokeWidth="1.2" />
        </pattern>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#7dd3fc" />
        </marker>
        <linearGradient id="sea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0d3a44" />
          <stop offset="1" stopColor="#08202c" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width={W} height={H} fill="url(#sea)" rx="10" />
      {/* Land and revetment */}
      <rect x="0" y="0" width={W} height={sy(SITE.shore.crestZ)} fill="#1c2a30" />
      <rect x="0" y={sy(SITE.shore.crestZ)} width={W} height={sy(SITE.shore.toeZ) - sy(SITE.shore.crestZ)} fill="url(#rev)" opacity="0.9" />
      <text x="12" y="18" fill="#7992A0" fontSize="11" letterSpacing="0.08em">
        LAND · REVETMENT
      </text>
      {/* Intake capture zone (modelled) */}
      <ellipse cx={sx((I.x0 + I.x1) / 2)} cy={sy(I.mouthZ)} rx={((I.x1 - I.x0) / 2 + capR) * S} ry={capR * S} fill="rgba(248,113,113,0.12)" stroke="rgba(248,113,113,0.5)" strokeDasharray="4 3" />
      <rect x={sx(I.x0 - 2.4)} y={sy(-96)} width={(I.x1 - I.x0 + 4.8) * S} height={sy(I.mouthZ) - sy(-96)} fill="#9aa4a8" rx="2" />
      <text x={sx((I.x0 + I.x1) / 2)} y={sy(I.mouthZ) + capR * S + 14} fill="#fca5a5" fontSize="10.5" textAnchor="middle">
        Intake capture zone (modelled)
      </text>
      <text x={sx((I.x0 + I.x1) / 2)} y={sy(-72)} fill="#0b151f" fontSize="10.5" fontWeight="600" textAnchor="middle">
        INTAKE
      </text>
      {/* Bloom */}
      {bloom.map(([x, z, r], i) => (
        <circle key={i} cx={sx(x)} cy={sy(z)} r={r} fill="#cfe3ff" opacity="0.5" />
      ))}
      <text x={sx(-190)} y={sy(32)} fill="#B9CBD3" fontSize="11">
        Bloom approaching
      </text>
      {/* Current arrows */}
      {[-30, 10, 50].map((z) => (
        <line key={z} x1={sx(-120)} y1={sy(z)} x2={sx(-60)} y2={sy(z)} stroke="#7dd3fc" strokeWidth="1.6" markerEnd="url(#arr)" opacity="0.8" />
      ))}
      <text x={sx(-118)} y={sy(64)} fill="#7dd3fc" fontSize="10.5">
        Current (along-shore)
      </text>
      {/* Curtain layouts */}
      {ANCHOR_ANGLES.map((a) => {
        const L = getCurtainLayout(a);
        const pts: string[] = [];
        for (let i = 0; i < L.n; i += 2) pts.push(`${sx(L.px[i]).toFixed(1)},${sy(L.pz[i]).toFixed(1)}`);
        pts.push(`${sx(L.px[L.n - 1]).toFixed(1)},${sy(L.pz[L.n - 1]).toFixed(1)}`);
        const sel = a === selected;
        return (
          <g key={a}>
            <polyline points={pts.join(' ')} fill="none" stroke={sel ? '#F59E0B' : '#7992A0'} strokeWidth={sel ? 3.2 : 1.2} strokeDasharray={sel ? undefined : '5 4'} opacity={sel ? 1 : 0.6} strokeLinecap="round" />
            <circle cx={sx(L.upstream.x)} cy={sy(L.upstream.z)} r={sel ? 4 : 3} fill={sel ? '#F2C230' : '#7992A0'} />
            <text x={sx(L.upstream.x) - 4} y={sy(L.upstream.z) + 16} fill={sel ? '#fcd38a' : '#7992A0'} fontSize="10.5" textAnchor="middle">
              {a}°
            </text>
          </g>
        );
      })}
      {/* Upstream-first reef marker */}
      {reefFraction > 0 && (() => {
        const L = getCurtainLayout(selected);
        const k = Math.min(L.n - 1, Math.floor(reefFraction * (L.n - 1)));
        return <circle cx={sx(L.px[k])} cy={sy(L.pz[k])} r="6" fill="none" stroke="#F5B94C" strokeWidth="2" />;
      })()}
      {/* Throat and transfer line */}
      <rect x={sx(th.mx) - 2} y={sy(th.mz - th.halfWidth)} width={(th.length + 2) * S} height={th.halfWidth * 2 * S} rx="4" fill="#4f7c86" stroke="#22D3EE" strokeWidth="1.2" />
      <polyline points={pipe.map(([x, z]) => `${sx(x).toFixed(1)},${sy(z).toFixed(1)}`).join(' ')} fill="none" stroke="#22D3EE" strokeWidth="2" strokeDasharray="6 4" />
      <circle cx={sx(SITE.release.x)} cy={sy(SITE.release.z)} r={12 * S + 6} fill="rgba(45,212,191,0.12)" stroke="#2DD4BF" strokeDasharray="3 3" />
      <text x={sx(th.mx) - 8} y={sy(th.mz) - 12} fill="#8ff0ff" fontSize="10.5" textAnchor="end">
        Recovery throat + transfer
      </text>
      <text x={sx(SITE.release.x) - 22} y={sy(SITE.release.z) + 4} fill="#7eeadf" fontSize="10.5" textAnchor="end">
        Safe release (down-current)
      </text>
      <text x={sx(62)} y={sy(8)} fill="#8ff0ff" fontSize="10.5">
        Low-shear transfer line
      </text>
      {/* Scale bar and north arrow */}
      <g transform={`translate(18, ${H - 18})`}>
        <line x1="0" y1="0" x2={50 * S} y2="0" stroke="#B9CBD3" strokeWidth="2" />
        <line x1="0" y1="-4" x2="0" y2="4" stroke="#B9CBD3" />
        <line x1={50 * S} y1="-4" x2={50 * S} y2="4" stroke="#B9CBD3" />
        <text x={25 * S} y="-7" fill="#B9CBD3" fontSize="10" textAnchor="middle">
          50 m
        </text>
      </g>
      <g transform={`translate(${W - 32}, 34)`}>
        <circle r="16" fill="rgba(5,11,17,0.6)" stroke="rgba(150,200,220,0.25)" />
        <line x1={-north.x * 10} y1={-north.y * 10} x2={north.x * 10} y2={north.y * 10} stroke="#B9CBD3" strokeWidth="1.5" />
        <circle cx={north.x * 10} cy={north.y * 10} r="2.5" fill="#f87171" />
        <text x={north.x * 22} y={north.y * 22 + 4} fill="#f87171" fontSize="10" fontWeight="700" textAnchor="middle">
          N
        </text>
      </g>
    </svg>
  );
}
