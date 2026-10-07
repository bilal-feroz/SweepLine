export const pct = (v: number | null | undefined, digits = 0): string => (v === null || v === undefined || !Number.isFinite(v) ? '—' : `${(v * 100).toFixed(digits)}%`);

export const num = (v: number | null | undefined, digits = 1): string => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(digits));

export const int = (v: number | null | undefined): string => (v === null || v === undefined ? '—' : Math.round(v).toLocaleString('en-GB'));

export function clockTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function clockDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function bloomLabel(density: number): string {
  return density >= 0.9 ? 'Extreme bloom' : density >= 0.65 ? 'Dense bloom' : density >= 0.4 ? 'Moderate bloom' : 'Light bloom';
}

/** "Dense bloom approaching" and its tone for a bloom density (Live headline and the opening intro). */
export function approachingBloom(density: number): { text: string; tone: 'red' | 'amber' } {
  return { text: `${bloomLabel(density)} approaching`, tone: density >= 0.65 ? 'red' : 'amber' };
}

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type Tone = 'ok' | 'info' | 'warn' | 'alarm' | 'muted';

export const toneText: Record<Tone, string> = {
  ok: 'text-teal',
  info: 'text-cyan',
  warn: 'text-amber',
  alarm: 'text-red',
  muted: 'text-muted',
};

export const toneBg: Record<Tone, string> = {
  ok: 'bg-teal',
  info: 'bg-cyan',
  warn: 'bg-amber',
  alarm: 'bg-red',
  muted: 'bg-dim',
};

/** Trigger a browser download of text content. */
export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
