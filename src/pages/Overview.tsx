import { EnvelopeBadge, PageHeader } from '../components/layout/PageHeader';
import { CameraViewsPanel, KeyMetricsPanel, TimelinePanel } from '../components/panels/BottomPanels';
import { Inspector } from '../components/panels/Inspector';
import { ConditionsPanel, PerformancePanel, ScenarioControlsPanel } from '../components/panels/RailPanels';
import { CompareOverlay, CurrentCard, FlowLegend, SafetyBanner, UnderwaterHud, ViewportFooter, ViewportToolbar } from '../components/viewport/Hud';
import { ViewportSlot } from '../components/viewport/ViewportSlot';

export function Overview() {
  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
        <PageHeader
          eyebrow="Overview"
          title="SweepLine Operation"
          subtitle="Real-time simulation of jellyfish diversion and live bypass around a coastal intake"
          right={<EnvelopeBadge />}
        />
        <ViewportSlot className="min-h-[300px] flex-1 rounded-xl border border-line">
          <div className="pointer-events-none absolute inset-0 z-10">
            <div className="absolute top-3 left-3">
              <CurrentCard />
            </div>
            <div className="absolute top-[68px] left-3">
              <SafetyBanner />
            </div>
            <div className="absolute top-3 right-3">
              <ViewportToolbar />
            </div>
            <div className="absolute top-[56px] right-3">
              <Inspector />
            </div>
            <div className="absolute bottom-10 left-3">
              <FlowLegend />
            </div>
            <CompareOverlay />
            <UnderwaterHud />
            <ViewportFooter />
          </div>
        </ViewportSlot>
        <div className="grid h-[218px] shrink-0 grid-cols-[1fr_1.12fr_1.12fr] gap-3">
          <TimelinePanel />
          <KeyMetricsPanel />
          <CameraViewsPanel />
        </div>
      </div>
      <aside className="flex w-[318px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-line bg-deep/40 p-3 [&>*]:shrink-0">
        <PerformancePanel />
        <ConditionsPanel />
        <ScenarioControlsPanel compact />
      </aside>
    </div>
  );
}
