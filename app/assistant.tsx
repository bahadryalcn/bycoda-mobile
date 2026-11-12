import { Stack, useLocalSearchParams } from "expo-router";
import { AssistantScreen } from "@/features/assistant/assistant-screen";
import { useCopy } from "@/ui/copy";
export default function AssistantRoute() {
  const copy = useCopy();
  const { job } = useLocalSearchParams<{ job?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: copy("Asistan", "Assistant") }} />
      <AssistantScreen focusJobId={job || undefined} />
    </>
  );
}
