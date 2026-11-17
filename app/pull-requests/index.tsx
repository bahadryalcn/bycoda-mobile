import { Stack } from "expo-router";
import { useCopy } from "@/ui/copy";
import { PullRequestsScreen } from "@/features/pull-requests/ui/list-screen";
export default function PullRequestsRoute() {
  const copy = useCopy();
  return <><Stack.Screen options={{ title: copy("Pull request’ler", "Pull requests") }} /><PullRequestsScreen /></>;
}
