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
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5 min-[1600px]:gap-5 min-[1600px]:p-6">
        <PageHeader
          eyebrow="3D Visualiser"
          title={compare ? 'Baseline vs SweepLine' : 'Live Digital Twin'}
          subtitle={
            compare
              ? 'Same seed, same bloom, same conditions — both simulations run side by side.'
              : 'Explore the intake, jellyfish behaviour and system performance in real time.'
          }
        />
        <ViewportSlot className="@container min-h-[300px] flex-1 rounded-[18px] border border-line">
          <div className="pointer-events-none absolute inset-0 z-10">
            {!compare && (
              <div className="absolute top-4 left-4 @max-[1000px]:top-[68px]">
                <CurrentCard />
              </div>
            )}
            <div className="absolute top-[96px] left-4 @max-[1000px]:top-[150px]">
              <SafetyBanner />
            </div>
            <div className="absolute top-4 right-4">
              <ViewportToolbar full />
            </div>
            <div className="absolute top-[68px] right-4">
              <Inspector />
            </div>
            {!compare && (
              <div className="absolute bottom-10 left-4">
                <FlowLegend />
              </div>
            )}
            <CompareOverlay />
            <UnderwaterHud />
            <ViewportFooter />
          </div>
        </ViewportSlot>
        <div className="grid h-[212px] shrink-0 grid-cols-[1fr_1.15fr] gap-4">
          <EventLogCard />
          <TimelineWideCard />
        </div>
      </div>
      <aside className="flex w-[352px] shrink-0 flex-col gap-4 overflow-y-auto py-5 pr-5 min-[1600px]:w-[384px] min-[1600px]:py-6 min-[1600px]:pr-6 [&>*]:shrink-0">
        <OperationsCard />
        <StressTestCard />
        <LiveControlsCard />
        <TransferCard />
        <RunSettingsCard />
      </aside>
    </div>
  );
}
