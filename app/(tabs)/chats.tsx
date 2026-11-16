import { ActiveSessionsScreen } from "../../src/features/workspace/active-sessions-screen";
import { TabletOverview } from "../../src/features/workspace/tablet-overview";
import { useActiveMachine } from "../../src/state/machines";
import { useAdaptiveLayout } from "../../src/ui/adaptive-layout";
import { SplitView } from "../../src/ui/split-view";

export default function ChatsRoute() {
  const { split } = useAdaptiveLayout();
  const machine = useActiveMachine();
  // Without a computer the list already owns the connect state; an overview beside it would repeat it.
  if (!split || !machine) return <ActiveSessionsScreen overview />;
  return <SplitView list={<ActiveSessionsScreen overview urgency />} detail={<TabletOverview />} />;
}
