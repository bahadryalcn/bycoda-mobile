import { ManagementScreen } from "../../src/features/management";
import { useLocalSearchParams } from "expo-router";
export default function InboxRoute() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  return <ManagementScreen key={view ?? "attention"} section="inbox" />;
}
