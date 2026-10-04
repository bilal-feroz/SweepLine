import { useEffect, useRef, type ReactNode } from 'react';
import { getScene } from '../../app/runtime';
import { cn } from '../../utils/format';

/**
 * Hosts the single shared Three.js canvas. The WebGL canvas is re-parented into
 * whichever page mounts a slot (the context survives), so the 3D scene keeps
 * its state when navigating between Overview and 3D Visualiser.
 */
export function ViewportSlot({ children, className }: { children?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sm = getScene();
    sm.attach(el);
    return () => sm.detach(el);
  }, []);
  return (
    <div ref={ref} className={cn('relative overflow-hidden bg-[#06121b]', className)} data-viewport>
      {children}
    </div>
  );
}
