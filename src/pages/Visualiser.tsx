import { SlidersHorizontal, ShieldAlert, Gauge } from 'lucide-react';
import { useState } from 'react';
import { useApp } from '../app/store';
import { EnvelopeBadge, PageHeader } from '../components/layout/PageHeader';
import { TimelineSteps } from '../components/panels/BottomPanels';
import { Inspector } from '../components/panels/Inspector';
import { AdvancedPanel, EnvelopePanel, EventLog, OperationsPanel, StressTestPanel, TransferPanel } from '../components/panels/OpsPanels';
import { ConditionsPanel, ScenarioControlsPanel } from '../components/panels/RailPanels';
import { Panel } from '../components/ui/Panel';
import { CompareOverlay, CurrentCard, FlowLegend, SafetyBanner, UnderwaterHud, ViewportFooter, ViewportToolbar } from '../components/viewport/Hud';
import { ViewportSlot } from '../components/viewport/ViewportSlot';
import { cn } from '../utils/format';

const ALL_STAGES = [
  { key: 'bloom' as const, label: 'Bloom' },
  { key: 'warning' as const, label: 'Warning' },
  { key: 'deploy' as const, label: 'Deploy' },
  { key: 'sweep' as const, label: 'Sweep' },
  { key: 'transfer' as const, label: 'Transfer' },
  { key: 'release' as const, label: 'Release' },
  { key: 'recovery' as const, label: 'Recovery' },
];

type Tab = 'controls' | 'safety' | 'envelope';

export function Visualiser() {
  const [tab, setTab] = useState<Tab>('safety');
  const compare = useApp((s) => s.ui.compare);
  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
    { key: 'safety', label: 'Safety', icon: <ShieldAlert size={13} /> },
    { key: 'controls', label: 'Controls', icon: <SlidersHorizontal size={13} /> },
    { key: 'envelope', label: 'Envelope', icon: <Gauge size={13} /> },
  ];
  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <PageHeader
          eyebrow="3D Visualiser"
          title={compare ? 'Compare · Baseline vs SweepLine' : 'Live Digital Twin'}
          subtitle={
            compare
              ? 'Same seed, same bloom, same conditions — both simulations run simultaneously'
              : 'Click the curtain, throat, transfer module, intake or any jellyfish to inspect it'
          }
          right={<EnvelopeBadge />}
        />
        <ViewportSlot className="min-h-[320px] flex-1 rounded-xl border border-line">
          <div className="pointer-events-none absolute inset-0 z-10">
            {!compare && (
              <div className="absolute top-3 left-3">
                <CurrentCard />
              </div>
            )}
            <div className="absolute top-[68px] left-3">
              <SafetyBanner />
            </div>
            <div className="absolute top-3 right-3">
              <ViewportToolbar full />
            </div>
            <div className="absolute top-[92px] right-3">
              <Inspector />
            </div>
            {!compare && (
              <div className="absolute bottom-10 left-3">
                <FlowLegend />
              </div>
            )}
            <CompareOverlay />
            <UnderwaterHud />
            <ViewportFooter />
          </div>
        </ViewportSlot>
        <div className="grid h-[176px] shrink-0 grid-cols-[1.25fr_1fr] gap-3">
          <EventLog />
          <Panel title="Simulation Timeline" bodyClassName="flex flex-col justify-center">
            <TimelineSteps stages={ALL_STAGES} compact />
          </Panel>
        </div>
      </div>
      <aside className="flex w-[336px] shrink-0 flex-col border-l border-line bg-deep/40">
        <div className="flex gap-1 border-b border-line p-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'flex h-[30px] flex-1 items-center justify-center gap-1.5 rounded-lg text-[12px] transition-colors',
                tab === t.key ? 'bg-[#0f2233] text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.35)]' : 'text-muted hover:bg-panel-2 hover:text-ink',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 [&>*]:shrink-0">
          {tab === 'safety' && (
            <>
              <OperationsPanel />
              <StressTestPanel />
              <TransferPanel />
            </>
          )}
          {tab === 'controls' && (
            <>
              <ScenarioControlsPanel />
              <ConditionsPanel />
              <AdvancedPanel />
            </>
          )}
          {tab === 'envelope' && <EnvelopePanel detailed />}
        </div>
      </aside>
    </div>
  );
}
