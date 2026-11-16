import { Stack, useLocalSearchParams } from "expo-router";
import { AssistantScreen } from "@/features/assistant/assistant-screen";
import { useCopy } from "@/ui/copy";
import { AssistantMinimizeButton } from "@/features/assistant/assistant-companion";
import { assistantVoiceRequested } from "@/features/assistant/assistant-voice-presentation";
export default function AssistantRoute() {
  const copy = useCopy();
  const { job, voice } = useLocalSearchParams<{ job?: string; voice?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: copy("Asistan", "Assistant"), headerRight: () => <AssistantMinimizeButton /> }} />
      <AssistantScreen focusJobId={job || undefined} voiceRequested={assistantVoiceRequested(voice)} />
    </>
  );
}
