import { ChevronDown, Download, FileJson, FileSpreadsheet, Gauge, Pause, Play, Thermometer, Waves, Wind, Droplets } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/store';
import { controller } from '../../simulation/SimController';
import { SCENARIOS } from '../../simulation/scenarios';
import { clockDate, clockTime, cn, downloadText } from '../../utils/format';
import { LogoMark } from '../ui/Logo';

function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open, close]);
  return ref;
}

function Stat({ icon, value, unit, label }: { icon: React.ReactNode; value: string; unit: string; label: string }) {
  return (
    <div className="flex items-center gap-2" title={`${label} — simulation input`}>
      <span className="text-muted">{icon}</span>
      <div className="leading-tight whitespace-nowrap">
        <div className="num text-[13px] text-ink">
          {value}
          <span className="ml-0.5 text-[10.5px] text-ink-2">{unit}</span>
        </div>
        <div className="text-[10px] text-muted">{label}</div>
      </div>
    </div>
  );
}

export function TopBar() {
  const snap = useApp((s) => s.snap);
  const showToast = useApp((s) => s.showToast);
  const setUI = useApp((s) => s.setUI);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const scRef = useOutsideClose(scenarioOpen, () => setScenarioOpen(false));
  const exRef = useOutsideClose(exportOpen, () => setExportOpen(false));
  const p = snap?.params;
  const paused = snap?.paused ?? false;
  const speed = snap?.speed ?? 5;

  const exportJson = () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadText(`sweepline-run-${controller.params.seed}-${stamp}.json`, JSON.stringify(controller.exportRun(), null, 2));
    setExportOpen(false);
    showToast('Simulation run exported (JSON)', 'ok');
  };
  const exportCsv = () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    downloadText(`sweepline-metrics-${controller.params.seed}-${stamp}.csv`, controller.exportCsv(), 'text/csv');
    setExportOpen(false);
    showToast('Metric history exported (CSV)', 'ok');
  };

  return (
    <header className="relative z-30 flex h-[60px] shrink-0 items-center border-b border-line bg-deep/95">
      <div className="flex h-full w-[224px] shrink-0 items-center gap-3 border-r border-line px-5">
        <LogoMark size={32} />
        <div className="leading-tight">
          <div className="text-[17px] font-semibold tracking-tight text-ink">SweepLine</div>
          <div className="text-[10.5px] text-muted">Jellyfish Bypass Visualiser</div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3 px-4">
        <div
          className={cn(
            'flex h-[28px] items-center gap-2 rounded-md border px-2.5 text-[11px] font-semibold tracking-[0.08em]',
            paused ? 'border-amber/40 bg-amber/10 text-amber' : 'border-green/30 bg-green/10 text-green',
          )}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', paused ? 'bg-amber' : 'animate-pulse-soft bg-green')} />
          {paused ? 'PAUSED' : 'LIVE'}
        </div>
        <span className="tag !text-[10px] !text-ink-2">Simulation</span>

        <div className="relative" ref={scRef}>
          <button
            type="button"
            onClick={() => setScenarioOpen((o) => !o)}
            className="flex h-[30px] items-center gap-2 rounded-lg px-2 text-[13px] text-ink-2 transition-colors hover:bg-panel-3 hover:text-ink"
          >
            <span className="hidden text-muted min-[1700px]:inline">Reference scenario:</span>
            <span className="truncate whitespace-nowrap">UAE Coastal Intake</span>
            <span className="hidden whitespace-nowrap text-dim min-[1800px]:inline">· {snap?.scenarioName ?? 'Reference conditions'}</span>
            <ChevronDown size={14} className="text-muted" />
          </button>
          {scenarioOpen && (
            <div className="glass absolute top-[36px] left-0 z-50 w-[320px] animate-fade-in p-1.5 shadow-2xl">
              <div className="px-2.5 pt-1.5 pb-2 text-[11px] text-muted">
                Reference coastal intake geometry — schematic, not ENEC facility data.
              </div>
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setScenarioOpen(false);
                    setUI({ page: 'visualiser' });
                    void controller.runScenario(s.id);
                  }}
                  className="flex w-full items-start justify-between gap-2 rounded-md px-2.5 py-2 text-left hover:bg-panel-3"
                >
                  <span>
                    <span className="block text-[12.5px] text-ink">{s.name}</span>
                    <span className="block text-[11px] text-muted">{s.tagline}</span>
                  </span>
                  <span className={cn('tag mt-0.5', s.tone === 'failure' ? '!text-red' : s.tone === 'stress' ? '!text-amber' : '!text-teal')}>
                    Run
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hidden shrink-0 items-center gap-4 pr-4 lg:flex 2xl:gap-6">
        <span className="hidden min-[1360px]:contents">
          <Stat icon={<Thermometer size={16} strokeWidth={1.6} />} value={p ? p.waterTemp.toFixed(1) : '—'} unit="°C" label="Water Temp" />
          <Stat icon={<Droplets size={16} strokeWidth={1.6} />} value={p ? p.salinity.toFixed(1) : '—'} unit="PSU" label="Salinity" />
        </span>
        <Stat icon={<Wind size={16} strokeWidth={1.6} />} value={p ? p.currentSpeed.toFixed(2) : '—'} unit="m/s" label="Current" />
        <Stat icon={<Waves size={16} strokeWidth={1.6} />} value={p ? p.waveHeight.toFixed(1) : '—'} unit="m" label="Wave Hs" />
        <span className="tag" title="These values are simulation inputs">SIM</span>
      </div>

      <div className="flex h-full shrink-0 items-center gap-2.5 border-l border-line pr-4 pl-4">
        <div className="leading-tight">
          <div className="num text-[17px] font-medium text-ink">{snap ? clockTime(snap.clockMs) : '--:--:--'}</div>
          <div className="text-[10.5px] text-muted">{snap ? clockDate(snap.clockMs) : ''}</div>
        </div>
        <div className="seg">
          {[1, 5, 20].map((s) => (
            <button key={s} type="button" data-active={speed === s} onClick={() => controller.setSpeed(s)} className="num !px-2.5" title={`Simulation speed ${s}×`}>
              {s}x
            </button>
          ))}
        </div>
        <button type="button" className="btn !w-[30px] !px-0" title={paused ? 'Resume simulation' : 'Pause simulation'} onClick={() => controller.togglePause()}>
          {paused ? <Play size={14} /> : <Pause size={14} />}
        </button>
        <div className="relative" ref={exRef}>
          <button type="button" className="btn btn-primary" onClick={() => setExportOpen((o) => !o)}>
            <Download size={14} />
            <span className="hidden min-[1500px]:inline">Export Run</span>
          </button>
          {exportOpen && (
            <div className="glass absolute top-[36px] right-0 z-50 w-[250px] animate-fade-in p-1.5 shadow-2xl">
              <button type="button" onClick={exportJson} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-panel-3">
                <FileJson size={15} className="text-cyan" />
                <span>
                  <span className="block text-[12.5px]">Simulation run (JSON)</span>
                  <span className="block text-[11px] text-muted">Scenario, seed, parameters, metrics, events</span>
                </span>
              </button>
              <button type="button" onClick={exportCsv} className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left hover:bg-panel-3">
                <FileSpreadsheet size={15} className="text-teal" />
                <span>
                  <span className="block text-[12.5px]">Metric history (CSV)</span>
                  <span className="block text-[11px] text-muted">Baseline vs SweepLine time series</span>
                </span>
              </button>
              <div className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 text-[10.5px] text-dim">
                <Gauge size={11} /> Values are simulation estimates
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
