import { useEffect, useState } from 'react';
import { useApp } from '../../app/store';
import { cn } from '../../utils/format';

export function Toast() {
  const toast = useApp((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || !visible) return null;
  const tone =
    toast.tone === 'alarm' ? 'border-red/50 text-red' : toast.tone === 'warn' ? 'border-amber/50 text-amber' : toast.tone === 'ok' ? 'border-teal/45 text-teal' : 'border-cyan/45 text-cyan';
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div key={toast.id} className={cn('glass animate-fade-in px-4 py-2.5 text-[12.5px] shadow-2xl', tone)}>
        <span className="text-ink">{toast.message}</span>
      </div>
    </div>
  );
}
