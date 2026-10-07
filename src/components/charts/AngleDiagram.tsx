/**
 * Simplified current / curtain-angle diagram: the incoming current splits into a
 * small component pushing into the curtain and a large one sweeping along it.
 */
export function AngleDiagram({ angle, u, un, ut }: { angle: number; u: number; un: number; ut: number }) {
  const a = (angle * Math.PI) / 180;
  const x0 = 34;
  const y0 = 150;
  const L = 250;
  const x1 = x0 + L * Math.cos(a);
  const y1 = y0 - L * Math.sin(a);
  const px = x0 + 0.52 * L * Math.cos(a);
  const py = y0 - 0.52 * L * Math.sin(a);
  const V = 78;
  const tx = px + V * Math.cos(a) * Math.cos(a);
  const ty = py - V * Math.cos(a) * Math.sin(a);
  const nx = px + V * Math.sin(a) * Math.sin(a);
  const ny = py + V * Math.sin(a) * Math.cos(a);
  const arc = 46;
  return (
    <svg viewBox="0 0 320 172" className="h-auto w-full" role="img" aria-label={`Curtain at ${angle.toFixed(0)}° to the current, velocity split into sweeping and blocked components`}>
      <defs>
        {(
          [
            ['ah-c', '#22d3ee'],
            ['ah-t', '#2dd4bf'],
            ['ah-a', '#f5b94c'],
          ] as const
        ).map(([id, c]) => (
          <marker key={id} id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" fill={c} />
          </marker>
        ))}
      </defs>
      {[30, 54, 78].map((y) => (
        <line key={y} x1={10} y1={y} x2={78} y2={y} stroke="#22d3ee" strokeOpacity="0.45" strokeWidth="1.6" markerEnd="url(#ah-c)" />
      ))}
      <text x={10} y={18} fill="#7992A0" fontSize="11">
        Current
      </text>
      <line x1={x0} y1={y0} x2={x1} y2={y1} stroke="#f59e0b" strokeWidth="3.2" strokeLinecap="round" />
      {Array.from({ length: 11 }, (_, i) => (
        <circle key={i} cx={x0 + (L * Math.cos(a) * i) / 10} cy={y0 - (L * Math.sin(a) * i) / 10} r="2.6" fill="#fbbf24" />
      ))}
      <text x={x0 + 70} y={y0 + 17} fill="#f5b94c" fontSize="11">
        Guide curtain → throat
      </text>
      <path d={`M${x0 + arc} ${y0} A${arc} ${arc} 0 0 0 ${x0 + arc * Math.cos(a)} ${y0 - arc * Math.sin(a)}`} fill="none" stroke="#B9CBD3" strokeOpacity="0.7" />
      <line x1={x0} y1={y0} x2={x0 + arc + 26} y2={y0} stroke="#B9CBD3" strokeOpacity="0.35" strokeDasharray="3 3" />
      <text x={x0 + arc + 6} y={y0 - 6} fill="#e7f1f5" fontSize="12" fontWeight="600">
        {angle.toFixed(0)}°
      </text>
      <line x1={px} y1={py} x2={px + V} y2={py} stroke="#22d3ee" strokeWidth="2" markerEnd="url(#ah-c)" />
      <line x1={tx} y1={ty} x2={px + V} y2={py} stroke="#7992A0" strokeDasharray="3 3" />
      <line x1={nx} y1={ny} x2={px + V} y2={py} stroke="#7992A0" strokeDasharray="3 3" />
      <line x1={px} y1={py} x2={tx} y2={ty} stroke="#2dd4bf" strokeWidth="2.2" markerEnd="url(#ah-t)" />
      <line x1={px} y1={py} x2={nx} y2={ny} stroke="#f5b94c" strokeWidth="2.2" markerEnd="url(#ah-a)" />
      <text x={px + V + 6} y={py + 4} fill="#22d3ee" fontSize="11.5">
        U {u.toFixed(2)}
      </text>
      <text x={(px + tx) / 2 - 18 * Math.sin(a)} y={(py + ty) / 2 - 18 * Math.cos(a)} fill="#2dd4bf" fontSize="11.5" textAnchor="end">
        Uₜ {ut.toFixed(2)} sweep
      </text>
      <text x={nx + 4} y={ny + 15} fill="#f5b94c" fontSize="11.5">
        Uₙ {un.toFixed(2)} into curtain
      </text>
    </svg>
  );
}
