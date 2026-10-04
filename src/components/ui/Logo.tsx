export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="sl-logo-a" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#22D3EE" />
          <stop offset="1" stopColor="#2DD4BF" />
        </linearGradient>
      </defs>
      <path d="M4 14c4.2-4.4 8.4-4.4 12.6 0s8.4 4.4 12.6 0 6.3-3.3 6.8-1.2" fill="none" stroke="url(#sl-logo-a)" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M4 22c4.2-4.4 8.4-4.4 12.6 0s8.4 4.4 12.6 0 6.3-3.3 6.8-1.2" fill="none" stroke="url(#sl-logo-a)" strokeWidth="3.4" strokeLinecap="round" opacity="0.72" />
      <path d="M6 32.5 34 27" fill="none" stroke="#F59E0B" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
