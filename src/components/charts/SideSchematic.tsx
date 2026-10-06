import { useMemo } from 'react';
import { hash01 } from '../../simulation/seededRandom';

const W = 780;
const H = 382;
const TOP = 64;
const LEFT = 56;
const CURTAIN_X = 470;

/**
 * Cross-section through the curtain at its shallowest point, drawn from live
 * simulation values: skirt depth and blow-back, seabed clearance, bloom depth
 * distribution and wave height. Schematic — not to scale horizontally.
 */
export function SideSchematic({
  skirt,
  liftDeg,
  seabed,
  mean,
  sd,
  p90,
  hs,
  current,
  underPct,
  minClearance,
  jet = 0,
}: {
  skirt: number;
  liftDeg: number;
  seabed: number;
  mean: number;
  sd: number;
  p90: number;
  hs: number;
  current: number;
  underPct: number | null;
  minClearance: number;
  /** Active-flow jet output 0..1 (0 = passive curtain). */
  jet?: number;
}) {
  const dMax = Math.max(6, Math.ceil(seabed + 0.8));
  const k = (H - TOP - 26) / dMax;
  const y = (d: number) => TOP + d * k;
  const ySea = y(seabed);

  // Deterministic bloom sample following the configured depth distribution.
  const jellies = useMemo(() => {
    const out: Array<{ x: number; d: number; s: number }> = [];
    for (let i = 0; i < 46; i++) {
      const u1 = Math.max(1e-4, hash01(i, 1.7));
      const u2 = hash01(i, 9.3);
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      out.push({ x: 92 + hash01(i, 4.1) * 300, d: Math.max(0.25, mean + sd * z), s: 0.8 + hash01(i, 6.6) * 0.5 });
    }
    return out;
  }, [mean, sd]);

  const amp = Math.min(13, Math.max(2, (hs / 2) * k));
  let wave = `M0 ${TOP}`;
  for (let x = 0; x <= W; x += 10) wave += ` L${x} ${(TOP + amp * Math.sin(x / 38)).toFixed(1)}`;

  const lift = (liftDeg * Math.PI) / 180;
  const bx = CURTAIN_X + skirt * k * Math.sin(lift);
  const by = y(0) + skirt * k * Math.cos(lift);
  const clearance = seabed - skirt * Math.cos(lift);
  const dimX = Math.max(bx, CURTAIN_X) + 46;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Side section: skirt ${skirt.toFixed(1)} m, seabed ${seabed.toFixed(1)} m, bloom P90 ${p90.toFixed(1)} m`}>
      <defs>
        <linearGradient id="ss-sea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0f4a58" />
          <stop offset="1" stopColor="#06202b" />
        </linearGradient>
        <linearGradient id="ss-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0b1822" />
          <stop offset="1" stopColor="#11293a" />
        </linearGradient>
        <marker id="ss-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#7dd3fc" />
        </marker>
        <marker id="ss-dim" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#B9CBD3" />
        </marker>
        <marker id="ss-esc" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#f5b94c" />
        </marker>
        <marker id="ss-jet" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="#22d3ee" />
        </marker>
      </defs>
      <rect x="0" y="0" width={W} height={H} rx="12" fill="url(#ss-sky)" />
      <path d={`${wave} L${W} ${H} L0 ${H} Z`} fill="url(#ss-sea)" />
      <path d={wave} fill="none" stroke="#7dd3fc" strokeOpacity="0.55" strokeWidth="1.4" />
      {/* Seabed */}
      <path d={`M0 ${ySea + 6} L${W} ${ySea - 4} L${W} ${H} L0 ${H} Z`} fill="#2b2b24" />
      <path d={`M0 ${ySea + 6} L${W} ${ySea - 4}`} stroke="#6b6448" strokeWidth="1.5" />
      <text x={W - 14} y={H - 12} fill="#8a8466" fontSize="11" textAnchor="end">
        Seabed
      </text>
      {/* Depth axis */}
      {Array.from({ length: dMax + 1 }, (_, d) => (
        <g key={d}>
          <line x1={LEFT - 6} x2={LEFT} y1={y(d)} y2={y(d)} stroke="#4E6472" />
          <text x={LEFT - 10} y={y(d) + 4} fill="#7992A0" fontSize="11" textAnchor="end">
            {d} m
          </text>
        </g>
      ))}
      <line x1={LEFT} x2={LEFT} y1={y(0)} y2={y(dMax)} stroke="#4E6472" />
      {/* Current */}
      {[0.6, 1.6, 2.6].map((d) => (
        <line key={d} x1={LEFT + 14} x2={LEFT + 64} y1={y(d)} y2={y(d)} stroke="#7dd3fc" strokeWidth="1.6" markerEnd="url(#ss-arr)" opacity="0.8" />
      ))}
      <text x={LEFT + 12} y={TOP - 22} fill="#7dd3fc" fontSize="11.5">
        Current {current.toFixed(2)} m/s
      </text>
      {/* Bloom */}
      {jellies.map((j, i) => {
        const cy = y(Math.min(j.d, seabed - 0.2));
        const r = 5.2 * j.s;
        return (
          <g key={i} transform={`translate(${j.x} ${cy})`} opacity={0.75}>
            <path d={`M${-r} 0 A${r} ${r} 0 0 1 ${r} 0 Z`} fill="#cfe3ff" fillOpacity="0.55" />
            <path d={`M${-r * 0.5} 0 v${r * 1.1} M0 0 v${r * 1.4} M${r * 0.5} 0 v${r * 1.1}`} stroke="#cfe3ff" strokeOpacity="0.5" strokeWidth="0.8" />
          </g>
        );
      })}
      <line x1={LEFT + 4} x2={CURTAIN_X - 14} y1={y(p90)} y2={y(p90)} stroke="#B9CBD3" strokeOpacity="0.7" strokeDasharray="5 4" />
      <text x={LEFT + 10} y={y(p90) - 6} fill="#B9CBD3" fontSize="11.5">
        Bloom P90 {p90.toFixed(1)} m
      </text>
      {/* Under-skirt escape path */}
      {underPct !== null && underPct > 0 && (
        <g>
          <path
            d={`M${CURTAIN_X - 110} ${y(Math.min(p90, seabed - 0.4))} Q${bx} ${Math.min(by + 34, ySea - 6)} ${CURTAIN_X + 120} ${y(Math.min(p90, seabed - 0.4)) + 6}`}
            fill="none"
            stroke="#f5b94c"
            strokeWidth="1.6"
            strokeDasharray="5 4"
            markerEnd="url(#ss-esc)"
          />
          <text x={CURTAIN_X + 126} y={y(Math.min(p90, seabed - 0.4)) + 22} fill="#f5b94c" fontSize="11.5">
            Under-skirt escape {(underPct * 100).toFixed(1)}%
          </text>
        </g>
      )}
      {/* Active flow: conveyor jets run along the face (out of the page, toward the throat); foot jets push up at the hem */}
      {jet > 0.01 && (
        <g opacity={0.45 + 0.55 * jet}>
          {Array.from({ length: Math.max(2, Math.floor((by - y(0) - 14) / 30)) }, (_, i) => {
            const cy = y(0) + 18 + i * 30;
            return (
              <g key={i}>
                <circle cx={CURTAIN_X - 16} cy={cy} r="6" fill="none" stroke="#22d3ee" strokeWidth="1.4" />
                <circle cx={CURTAIN_X - 16} cy={cy} r="1.8" fill="#22d3ee" />
              </g>
            );
          })}
          {[0, 1, 2].map((i) => (
            <line
              key={i}
              x1={bx - 12 - i * 12}
              x2={bx - 12 - i * 12}
              y1={Math.min(by + 34, ySea - 8)}
              y2={by - 4}
              stroke="#22d3ee"
              strokeWidth="1.6"
              markerEnd="url(#ss-jet)"
            />
          ))}
          <text x={CURTAIN_X - 28} y={y(0) + 22} fill="#22d3ee" fontSize="11.5" textAnchor="end">
            Conveyor jets → throat
          </text>
          <text x={bx - 52} y={Math.min(by + 30, ySea - 10)} fill="#22d3ee" fontSize="11.5" textAnchor="end">
            Foot jets
          </text>
        </g>
      )}
      {/* Curtain: float, skirt with blow-back, ballast chain */}
      <path d={`M${CURTAIN_X} ${y(0)} Q${CURTAIN_X + (bx - CURTAIN_X) * 0.2} ${(y(0) + by) / 2} ${bx} ${by}`} fill="none" stroke="#1f7480" strokeWidth="7" strokeLinecap="round" />
      {[0, 1, 2, 3].map((i) => (
        <circle key={i} cx={bx - 6 + i * 4} cy={by + 2} r="2" fill="#9aa4a8" />
      ))}
      <ellipse cx={CURTAIN_X} cy={TOP - 1} rx="13" ry="7" fill="#F59E0B" stroke="#fcd38a" strokeWidth="1" />
      <text x={CURTAIN_X} y={TOP - 22} fill="#F5B94C" fontSize="11.5" textAnchor="middle">
        Float line
      </text>
      {/* Dimensions */}
      <line x1={dimX} x2={dimX} y1={y(0) + 3} y2={by - 3} stroke="#B9CBD3" markerStart="url(#ss-dim)" markerEnd="url(#ss-dim)" />
      <text x={dimX + 10} y={(y(0) + by) / 2} fill="#E7F1F5" fontSize="12" fontWeight="600">
        Skirt {skirt.toFixed(1)} m
      </text>
      <text x={dimX + 10} y={(y(0) + by) / 2 + 16} fill="#7992A0" fontSize="11">
        adjustable 1.5–4.0 m · blow-back {liftDeg.toFixed(1)}°
      </text>
      <line x1={dimX} x2={dimX} y1={by + 3} y2={ySea - 3} stroke="#B9CBD3" markerStart="url(#ss-dim)" markerEnd="url(#ss-dim)" />
      <text x={dimX + 10} y={(by + ySea) / 2 + 4} fill={clearance < minClearance ? '#f87171' : '#E7F1F5'} fontSize="12" fontWeight="600">
        Clearance {clearance.toFixed(1)} m
      </text>
      <text x={dimX + 10} y={(by + ySea) / 2 + 20} fill="#7992A0" fontSize="11">
        minimum {minClearance.toFixed(1)} m
      </text>
      <text x={W - 14} y={TOP - 22} fill="#7992A0" fontSize="11" textAnchor="end">
        Lee side (toward intake) →
      </text>
    </svg>
  );
}
