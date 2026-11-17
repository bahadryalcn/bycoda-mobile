import { ManagementScreen } from "../../src/features/management";
import { useLocalSearchParams } from "expo-router";
import { TabRootColumn } from "../../src/ui/tab-root-column";
export default function InboxRoute() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  return <TabRootColumn><ManagementScreen key={view ?? "attention"} section="inbox" /></TabRootColumn>;
}
