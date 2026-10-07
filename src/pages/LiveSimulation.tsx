import { Inspector } from '../components/panels/Inspector';
import { CompactTimeline, EventLogMenu, LiveHeadline, SafeOpenPanel, StressTestMenu } from '../components/panels/LivePanels';
import { FlowLegend, UnderwaterHud, ViewportToolbar } from '../components/viewport/Hud';
import { ViewportSlot } from '../components/viewport/ViewportSlot';

/**
 * 01 — Live Simulation: the 3D scene fills the page; a headline states the
 * situation, SweepLine's response and the result. Everything else is contextual.
 */
export function LiveSimulation() {
  return (
    <div className="flex min-w-0 flex-1 p-3">
      <ViewportSlot className="min-h-[360px] flex-1 rounded-[16px] border border-line">
        <div className="pointer-events-none absolute inset-0 z-10">
          <div className="absolute top-4 left-4 flex flex-col items-start gap-3">
            <LiveHeadline />
            <SafeOpenPanel />
          </div>
          <div className="absolute top-4 right-4">
            <ViewportToolbar />
          </div>
          <div className="absolute top-[58px] right-4">
            <Inspector />
          </div>
          <div className="absolute right-4 bottom-[74px] flex items-end gap-2">
            <EventLogMenu />
            <StressTestMenu />
          </div>
          <div className="absolute bottom-[74px] left-4">
            <FlowLegend />
          </div>
          <UnderwaterHud />
          <div className="absolute inset-x-4 bottom-4">
            <CompactTimeline />
          </div>
        </div>
      </ViewportSlot>
    </div>
  );
}
