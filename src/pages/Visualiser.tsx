import { useApp } from '../app/store';
import { PageHeader } from '../components/layout/PageHeader';
import { Inspector } from '../components/panels/Inspector';
import { EventLogCard, LiveControlsCard, OperationsCard, RunSettingsCard, StressTestCard, TimelineWideCard, TransferCard } from '../components/panels/VisualiserPanels';
import { CompareOverlay, CurrentCard, FlowLegend, SafetyBanner, UnderwaterHud, ViewportFooter, ViewportToolbar } from '../components/viewport/Hud';
import { ViewportSlot } from '../components/viewport/ViewportSlot';

export function Visualiser() {
  const compare = useApp((s) => s.ui.compare);
  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-4 min-[1600px]:p-5">
        <PageHeader
          compact
          title={compare ? 'Baseline vs SweepLine' : 'Live Digital Twin'}
          subtitle={
            compare
              ? 'Same seed, same bloom, same conditions — both simulations run side by side'
              : 'Explore the intake, jellyfish behaviour and system performance in real time'
          }
        />
        <ViewportSlot className="@container min-h-[320px] flex-1 rounded-[16px] border border-line">
          <div className="pointer-events-none absolute inset-0 z-10">
            {!compare && (
              <div className="absolute top-3 left-3 @max-[760px]:top-[52px]">
                <CurrentCard />
              </div>
            )}
            <div className="absolute top-[60px] left-3 @max-[760px]:top-[100px]">
              <SafetyBanner />
            </div>
            <div className="absolute top-3 right-3">
              <ViewportToolbar full />
            </div>
            <div className="absolute top-[54px] right-3">
              <Inspector />
            </div>
            {!compare && (
              <div className="absolute bottom-9 left-3">
                <FlowLegend />
              </div>
            )}
            <CompareOverlay />
            <UnderwaterHud />
            <ViewportFooter />
          </div>
        </ViewportSlot>
        <div className="grid h-[150px] shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-3">
          <EventLogCard />
          <TimelineWideCard />
        </div>
      </div>
      <aside className="flex w-[352px] shrink-0 flex-col gap-3 overflow-y-auto py-4 pr-4 min-[1600px]:w-[384px] min-[1600px]:py-5 min-[1600px]:pr-5 [&>*]:shrink-0">
        <OperationsCard />
        <StressTestCard />
        <LiveControlsCard />
        <TransferCard />
        <RunSettingsCard />
      </aside>
    </div>
  );
}
