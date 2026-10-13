import { SettingsScreen } from "../../src/features/settings/settings-screen";
import { useMachines } from "../../src/state/machines";
export default function SettingsRoute() {
  const activeId = useMachines((s) => s.activeId);
  return <SettingsScreen key={activeId} />;
}
