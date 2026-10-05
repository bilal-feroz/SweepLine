import { useMediaQuery } from '../app/hooks';
import { useApp } from '../app/store';
import { EnvelopeBadge, PageHeader } from '../components/layout/PageHeader';
import { Inspector } from '../components/panels/Inspector';
import { CameraViewsCard, KeyMetricsCard, PerformanceRail, TimelineCard } from '../components/panels/OverviewPanels';
import { CompareOverlay, CurrentCard, FlowLegend, SafetyBanner, UnderwaterHud, ViewportFooter, ViewportToolbar } from '../components/viewport/Hud';
import { ViewportSlot } from '../components/viewport/ViewportSlot';
import { cn } from '../utils/format';

export function Overview() {
  // Below 1600 px the camera feeds move into the rail so the 3D view keeps its width.
  const wide = useMediaQuery('(min-width: 1600px)');
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
        <div
          className={cn(
            'grid h-[150px] shrink-0 gap-3',
            wide ? 'grid-cols-[minmax(0,1.3fr)_minmax(0,1.15fr)_minmax(0,0.9fr)]' : 'grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]',
          )}
        >
          <TimelineCard />
          <KeyMetricsCard />
          {wide && <CameraViewsCard />}
        </div>
      </div>
      <aside className="flex w-[304px] shrink-0 flex-col gap-3 overflow-y-auto py-4 pr-4 min-[1600px]:w-[344px] min-[1600px]:py-5 min-[1600px]:pr-5 [&>*]:shrink-0">
        <PerformanceRail compact={!wide} />
        {!wide && <CameraViewsCard compact />}
      </aside>
    </div>
  );
}
