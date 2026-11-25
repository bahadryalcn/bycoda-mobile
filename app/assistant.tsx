import { Stack, useLocalSearchParams } from "expo-router";
import { AssistantScreen } from "@/features/assistant/assistant-screen";
import { useCopy } from "@/ui/copy";
import { AssistantMinimizeButton, useAssistantVoiceBusy } from "@/features/assistant/assistant-companion";
import { assistantVoiceRequested } from "@/features/assistant/assistant-voice-presentation";
export default function AssistantRoute() {
  const copy = useCopy();
  const canMinimize = useAssistantVoiceBusy();
  // `job` and `questions` come from a tapped push ("the assistant needs you"); `voice` starts a call.
  const { job, questions, voice } = useLocalSearchParams<{ job?: string; questions?: string; voice?: string }>();
  return (
    <>
      {/* Minimize appears only while a call, dictation or read-aloud runs; otherwise Back is the one way out. */}
      <Stack.Screen options={{ title: copy("Asistan", "Assistant"), headerRight: canMinimize ? () => <AssistantMinimizeButton /> : undefined }} />
      <AssistantScreen focusJobId={job || undefined} focusQuestions={questions === "1"} voiceRequested={assistantVoiceRequested(voice)} />
    </>
  );
}
