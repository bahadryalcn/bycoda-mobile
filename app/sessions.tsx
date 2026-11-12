import { useLocalSearchParams } from "expo-router";
import { ActiveSessionsScreen } from "../src/features/workspace/active-sessions-screen";

export default function SessionsRoute() {
  const { view, new: create } = useLocalSearchParams<{ view?: string; new?: string }>();
  return <ActiveSessionsScreen overview={view !== "active"} initialCreate={create === "1"} />;
}
