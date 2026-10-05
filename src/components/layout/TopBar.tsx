import { ChevronDown, Download, Droplets, FileJson, FileSpreadsheet, Gauge, Pause, Play, Thermometer, Waves, Wind } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../../app/store';
import { controller } from '../../simulation/SimController';
import { SCENARIOS } from '../../simulation/scenarios';
import { clockDate, clockTime, cn, downloadText } from '../../utils/format';
import { LogoMark } from '../ui/Logo';

export function useOutsideClose(open: boolean, close: () => void) {
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

function Stat({ icon, value, unit, label }: { icon: ReactNode; value: string; unit: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5" title={`${label} — simulation input`}>
      <span className="text-ink-2">{icon}</span>
      <div className="leading-tight whitespace-nowrap">
        <div className="num text-[15px] text-ink">
          {value}
          <span className="ml-1 text-[12px] text-ink-2">{unit}</span>
        </div>
        <div className="text-[12px] text-muted">{label}</div>
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
    <header className="relative z-30 flex h-[72px] shrink-0 items-center border-b border-line bg-[#060f17]">
      <div className="flex h-full w-[232px] shrink-0 items-center gap-3 border-r border-line px-5 min-[1600px]:w-[256px]">
        <LogoMark size={38} />
        <div className="leading-tight">
          <div className="text-[20px] font-bold tracking-tight text-white">SweepLine</div>
          <div className="text-[12px] text-ink-2">Jellyfish Bypass Visualiser</div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-3 px-5">
        <span className={cn('pill !h-[32px] !px-3 !text-[12.5px]', paused && '')} data-tone={paused ? 'amber' : undefined}>
          <span className={cn('h-2 w-2 rounded-full bg-current', !paused && 'animate-pulse-soft')} />
          {paused ? 'PAUSED' : 'LIVE'}
        </span>
        <span className="pill !h-[32px] !px-3 !text-[12px]" data-tone="muted">
          SIMULATION
        </span>

        <div className="relative min-w-0" ref={scRef}>
          <button
            type="button"
            onClick={() => setScenarioOpen((o) => !o)}
            className="flex h-[34px] max-w-full items-center gap-2 rounded-lg px-2.5 text-[15px] text-ink transition-colors hover:bg-panel-3"
          >
            <span className="truncate whitespace-nowrap">UAE Coastal Intake</span>
            <span className="hidden whitespace-nowrap text-[13px] text-muted min-[1800px]:inline">· {snap?.scenarioName ?? 'Reference conditions'}</span>
            <ChevronDown size={16} className="text-muted" />
          </button>
          {scenarioOpen && (
            <div className="glass absolute top-[42px] left-0 z-50 w-[340px] animate-fade-in p-1.5 shadow-2xl">
              <div className="px-3 pt-2 pb-2 text-[12px] text-muted">Reference coastal intake geometry — schematic, not ENEC facility data.</div>
              {SCENARIOS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setScenarioOpen(false);
                    setUI({ page: 'visualiser' });
                    void controller.runScenario(s.id);
                  }}
                  className="flex w-full items-start justify-between gap-2 rounded-lg px-3 py-2 text-left hover:bg-panel-3"
                >
                  <span>
                    <span className="block text-[13.5px] text-ink">{s.name}</span>
                    <span className="block text-[12px] text-muted">{s.tagline}</span>
                  </span>
                  <span className="pill mt-0.5 !h-[22px] !text-[10.5px]" data-tone={s.tone === 'failure' ? 'red' : s.tone === 'stress' ? 'amber' : undefined}>
                    Run
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="hidden shrink-0 items-center gap-4 pr-5 lg:flex min-[1600px]:gap-7" title="Simulation inputs (not live sensor data)">
        <span className="hidden min-[1280px]:contents">
          <Stat icon={<Thermometer size={19} strokeWidth={1.6} />} value={p ? p.waterTemp.toFixed(1) : '—'} unit="°C" label="Water Temp" />
        </span>
        <span className="hidden min-[1540px]:contents">
          <Stat icon={<Droplets size={19} strokeWidth={1.6} />} value={p ? p.salinity.toFixed(1) : '—'} unit="PSU" label="Salinity" />
        </span>
        <Stat icon={<Wind size={19} strokeWidth={1.6} />} value={p ? p.currentSpeed.toFixed(2) : '—'} unit="m/s" label="Current" />
        <Stat icon={<Waves size={19} strokeWidth={1.6} />} value={p ? p.waveHeight.toFixed(1) : '—'} unit="m" label="Wave Hs" />
        <span className="tag hidden !h-[24px] !px-2 !text-[11px] min-[1700px]:inline-flex">SIM INPUTS</span>
      </div>

      <div className="flex h-full shrink-0 items-center gap-3 border-l border-line pr-4 pl-5">
        <div className="leading-tight">
          <div className="num text-[21px] font-medium text-white">{snap ? clockTime(snap.clockMs) : '--:--:--'}</div>
          <div className="text-[12px] text-muted">{snap ? clockDate(snap.clockMs) : ''}</div>
        </div>
        <div className="seg !p-[3px]">
          {[1, 5, 20].map((s) => (
            <button key={s} type="button" data-active={speed === s} onClick={() => controller.setSpeed(s)} className="num !h-[30px] !px-3" title={`Simulation speed ${s}×`}>
              {s}x
            </button>
          ))}
        </div>
        <button type="button" className="btn !h-[36px] !w-[36px] !px-0" title={paused ? 'Resume simulation' : 'Pause simulation'} onClick={() => controller.togglePause()}>
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <div className="relative" ref={exRef}>
          <button type="button" className="btn btn-primary !h-[36px]" onClick={() => setExportOpen((o) => !o)}>
            <Download size={15} />
            <span className="hidden min-[1500px]:inline">Export Run</span>
          </button>
          {exportOpen && (
            <div className="glass absolute top-[42px] right-0 z-50 w-[260px] animate-fade-in p-1.5 shadow-2xl">
              <button type="button" onClick={exportJson} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-panel-3">
                <FileJson size={16} className="text-cyan" />
                <span>
                  <span className="block text-[13px]">Simulation run (JSON)</span>
                  <span className="block text-[11.5px] text-muted">Scenario, seed, parameters, metrics, events</span>
                </span>
              </button>
              <button type="button" onClick={exportCsv} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-panel-3">
                <FileSpreadsheet size={16} className="text-teal" />
                <span>
                  <span className="block text-[13px]">Metric history (CSV)</span>
                  <span className="block text-[11.5px] text-muted">Baseline vs SweepLine time series</span>
                </span>
              </button>
              <div className="flex items-center gap-1.5 px-3 pt-1.5 pb-1 text-[11px] text-dim">
                <Gauge size={11} /> Values are simulation estimates
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
