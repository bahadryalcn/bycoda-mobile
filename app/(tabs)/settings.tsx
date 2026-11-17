import { SettingsScreen } from "../../src/features/settings/settings-screen";
import { useMachines } from "../../src/state/machines";
import { TabRootColumn } from "../../src/ui/tab-root-column";
export default function SettingsRoute() {
  const activeId = useMachines((s) => s.activeId);
  return <TabRootColumn><SettingsScreen key={activeId} /></TabRootColumn>;
}
