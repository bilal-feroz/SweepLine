import type { SVGProps } from 'react';

/**
 * Domain icons not available in lucide (24×24, stroke-based, lucide-compatible).
 * The raw SVG markup is also used by the 3D label system (plain DOM).
 */
export const ICON_PATHS = {
  jellyfish:
    '<path d="M4.5 11.5a7.5 7.5 0 0 1 15 0v.5h-15z"/><path d="M7 12.5c0 2.6-1.3 3.6-1.3 6.5"/><path d="M10.2 12.5c0 2.5 1 3.4.2 7"/><path d="M13.8 12.5c0 2.5-1 3.4-.2 7"/><path d="M17 12.5c0 2.6 1.3 3.6 1.3 6.5"/>',
  curtain:
    '<path d="M3 6.5 21 10"/><circle cx="6" cy="7.1" r="1.2"/><circle cx="12" cy="8.3" r="1.2"/><circle cx="18" cy="9.4" r="1.2"/><path d="M6 8.8v9.2M9 9.4v10M12 10v10M15 10.6v9.6M18 11.1v8.4"/>',
  throat: '<path d="M3 5h18"/><path d="M4 5c0 4 4 6 6 7.5V20h4v-7.5c2-1.5 6-3.5 6-7.5"/><path d="M9 9.5h6"/>',
  transfer: '<path d="M3 9h9a3 3 0 0 1 3 3v0a3 3 0 0 0 3 3h3"/><path d="M18 12l3 3-3 3"/><path d="M3 6v6"/><path d="M8 6v6"/>',
  intake: '<path d="M3 20h18"/><path d="M5 20v-9M9.5 20v-9M14.5 20v-9M19 20v-9"/><path d="M2.5 11 12 5l9.5 6z"/>',
  release: '<path d="M2 9c2-1.6 4-1.6 6 0s4 1.6 6 0"/><path d="M2 14c2-1.6 4-1.6 6 0s4 1.6 6 0"/><path d="M15.5 14H22"/><path d="M19.5 11.5 22 14l-2.5 2.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2.2 5.3-5.3 2.2 2.2-5.3z"/>',
  bellmouth: '<path d="M2 7c4 0 6 2 7 5"/><path d="M2 17c4 0 6-2 7-5"/><path d="M9 12h13"/><path d="M18 9l3 3-3 3"/>',
} as const;

export type DomainIcon = keyof typeof ICON_PATHS;

export function iconSvg(name: DomainIcon, size = 20): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name]}</svg>`;
}

export function Icon({ name, size = 20, strokeWidth = 1.7, ...rest }: { name: DomainIcon; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICON_PATHS[name] }}
      {...rest}
    />
  );
}

/** Decorative translucent jellyfish illustration (scenario cards, empty states). */
export function JellyIllustration({ tone = '#22d3ee', className }: { tone?: string; className?: string }) {
  const id = `jg-${tone.replace('#', '')}`;
  return (
    <svg viewBox="0 0 160 170" className={className} aria-hidden="true">
      <defs>
        <radialGradient id={`${id}-bell`} cx="50%" cy="35%" r="65%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.55" stopColor={tone} stopOpacity="0.32" />
          <stop offset="1" stopColor={tone} stopOpacity="0.06" />
        </radialGradient>
        <linearGradient id={`${id}-arm`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.4" />
          <stop offset="1" stopColor={tone} stopOpacity="0" />
        </linearGradient>
      </defs>
      <g>
        <path d="M22 70C22 34 48 14 80 14s58 20 58 56c0 6-8 9-14 7-10-3-16 4-24 3-8-1-12-6-20-6s-12 5-20 6c-8 1-14-6-24-3-6 2-14-1-14-7z" fill={`url(#${id}-bell)`} stroke={tone} strokeOpacity="0.45" strokeWidth="1.2" />
        <path d="M40 40c10-12 26-18 40-18" fill="none" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round" />
        {[
          'M56 82c-6 16 6 22-2 40s4 22-4 36',
          'M70 84c-3 18 8 24 1 42s5 20 1 34',
          'M90 84c3 18-8 24-1 42s-5 20-1 34',
          'M104 82c6 16-6 22 2 40s-4 22 4 36',
        ].map((d) => (
          <path key={d} d={d} fill="none" stroke={`url(#${id}-arm)`} strokeWidth="7" strokeLinecap="round" opacity="0.8" />
        ))}
        {['M48 80c-10 22-6 40-16 62', 'M112 80c10 22 6 40 16 62', 'M80 86c0 26-4 46 0 70'].map((d) => (
          <path key={d} d={d} fill="none" stroke={tone} strokeOpacity="0.28" strokeWidth="1.2" strokeLinecap="round" />
        ))}
      </g>
    </svg>
  );
}
