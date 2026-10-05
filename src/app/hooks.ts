import { useEffect, useState } from 'react';
import type { HistorySample } from '../simulation/SimController';
import { controller } from '../simulation/SimController';
import { useApp } from './store';

export function useSnap() {
  return useApp((s) => s.snap);
}

/** Metric history polled at a fixed rate (never per frame). */
export function useHistory(lastN?: number, intervalMs = 1000): HistorySample[] {
  const read = () => (lastN ? controller.history.slice(-lastN) : controller.history.slice());
  const [data, setData] = useState<HistorySample[]>(read);
  useEffect(() => {
    setData(read());
    const id = setInterval(() => setData(read()), intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastN, intervalMs]);
  return data;
}

/** Live CSS media-query match (re-renders when it changes). */
export function useMediaQuery(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}
