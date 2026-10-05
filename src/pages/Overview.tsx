import { useMediaQuery } from '../app/hooks';
import { EnvelopeBadge, PageHeader } from '../components/layout/PageHeader';
import { Inspector } from '../components/panels/Inspector';
import { CameraViewsCard, KeyMetricsCard, PerformanceRail, TimelineCard } from '../components/panels/OverviewPanels';
import { CompareOverlay, CurrentCard, FlowLegend, SafetyBanner, UnderwaterHud, ViewportFooter, ViewportToolbar } from '../components/viewport/Hud';
import { ViewportSlot } from '../components/viewport/ViewportSlot';
import { cn } from '../utils/format';

export function Overview() {
  // Below 1600 px the camera feeds move into the rail so the bottom cards keep their size.
  const wide = useMediaQuery('(min-width: 1600px)');
  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 min-[1600px]:gap-5 min-[1600px]:p-6">
        <PageHeader
          eyebrow="Overview"
          title="SweepLine Operation"
          subtitle="Real-time simulation of jellyfish diversion and live bypass around a coastal intake."
          right={<EnvelopeBadge compact />}
        />
        <ViewportSlot className="min-h-[300px] flex-1 rounded-[18px] border border-line">
          <div className="pointer-events-none absolute inset-0 z-10">
            <div className="absolute top-4 left-4">
              <CurrentCard />
            </div>
            <div className="absolute top-[96px] left-4">
              <SafetyBanner />
            </div>
            <div className="absolute top-4 right-4">
              <ViewportToolbar />
            </div>
            <div className="absolute top-[68px] right-4">
              <Inspector />
            </div>
            <div className="absolute bottom-10 left-4">
              <FlowLegend />
            </div>
            <CompareOverlay />
            <UnderwaterHud />
            <ViewportFooter />
          </div>
        </ViewportSlot>
        <div
          className={cn(
            'grid h-[236px] shrink-0 gap-4',
            wide ? 'grid-cols-[minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(0,0.95fr)]' : 'grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]',
          )}
        >
          <TimelineCard />
          <KeyMetricsCard />
          {wide && <CameraViewsCard />}
        </div>
      </div>
      <aside className="flex w-[336px] shrink-0 flex-col gap-4 overflow-y-auto py-5 pr-5 min-[1600px]:w-[372px] min-[1600px]:py-6 min-[1600px]:pr-6 [&>*]:shrink-0">
        <PerformanceRail compact={!wide} />
        {!wide && <CameraViewsCard compact />}
      </aside>
    </div>
  );
}
