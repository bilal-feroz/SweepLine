/**
 * Connects the mounted intro player to development tooling:
 *
 *   await __mapIntroAt(2500)   // render exactly that frame and stop (mounts the intro if needed)
 *   await __mapIntroPlay(0)    // play from a time (ms), including the hand-off
 *   __mapIntroSkip()           // skip to the hand-off
 *
 * Installed in development builds only.
 */
import { useApp } from '../../app/store';
import type { IntroPlayer } from './IntroPlayer';

export interface IntroCommand {
  kind: 'at' | 'play';
  ms: number;
  resolve: () => void;
}

let current: IntroPlayer | null = null;
/** The command that mounted the intro; kept until the intro ends so a remount repeats it. */
let mounting: IntroCommand | null = null;

export function mountCommand(): IntroCommand | null {
  return mounting;
}

export function attachPlayer(p: IntroPlayer): void {
  current = p;
}

export function detachPlayer(p: IntroPlayer): void {
  if (current === p) current = null;
}

/** Called when the intro has finished and unmounts. */
export function introEnded(): void {
  mounting = null;
}

function request(kind: IntroCommand['kind'], ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (current) {
      if (kind === 'at') current.freezeAt(ms);
      else current.playFrom(ms);
      resolve();
      return;
    }
    mounting = { kind, ms, resolve };
    useApp.setState({ intro: true });
  });
}

export function installIntroDevHooks(): void {
  const w = window as unknown as Record<string, unknown>;
  w.__mapIntroAt = (ms: number) => request('at', ms);
  w.__mapIntroPlay = (ms = 0) => request('play', ms);
  w.__mapIntroSkip = () => current?.skip();
}
