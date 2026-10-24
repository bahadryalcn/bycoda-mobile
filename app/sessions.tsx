import { useLocalSearchParams } from "expo-router";
import { ActiveSessionsScreen } from "../src/features/workspace/active-sessions-screen";

export default function SessionsRoute() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  return <ActiveSessionsScreen overview={view !== "active"} />;
}
