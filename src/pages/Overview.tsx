import { useApp } from '../app/store';
import { EnvelopeBadge, PageHeader } from '../components/layout/PageHeader';
import { Inspector } from '../components/panels/Inspector';
import { CameraViewsCard, KeyMetricsCard, PerformanceRail, TimelineCard } from '../components/panels/OverviewPanels';
import { CompareOverlay, CurrentCard, FlowLegend, SafetyBanner, UnderwaterHud, ViewportFooter, ViewportToolbar } from '../components/viewport/Hud';
import { ViewportSlot } from '../components/viewport/ViewportSlot';

export function Overview() {
  const compare = useApp((s) => s.ui.compare);
  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 min-[1600px]:p-5">
        <PageHeader
          compact
          title="SweepLine Operation"
          subtitle="Real-time simulation of jellyfish diversion and live bypass around a coastal intake"
          right={<EnvelopeBadge short />}
        />
        <ViewportSlot className="min-h-[320px] flex-1 rounded-[16px] border border-line">
          <div className="pointer-events-none absolute inset-0 z-10">
            {!compare && (
              <div className="absolute top-3 left-3">
                <CurrentCard />
              </div>
            )}
            <div className="absolute top-[60px] left-3">
              <SafetyBanner />
            </div>
            <div className="absolute top-3 right-3">
              <ViewportToolbar />
            </div>
            <div className="absolute top-[54px] right-3">
              <Inspector />
            </div>
            <div className="absolute bottom-9 left-3">
              <FlowLegend />
            </div>
            <CompareOverlay />
            <UnderwaterHud />
            <ViewportFooter />
          </div>
        </ViewportSlot>
        <div className="grid h-[150px] shrink-0 grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-3">
          <TimelineCard />
          <KeyMetricsCard />
        </div>
      </div>
      <aside className="flex w-[320px] shrink-0 flex-col gap-3 overflow-y-auto py-4 pr-4 min-[1600px]:w-[360px] min-[1600px]:py-5 min-[1600px]:pr-5 [&>*]:shrink-0">
        <PerformanceRail />
        <CameraViewsCard />
      </aside>
    </div>
  );
}
