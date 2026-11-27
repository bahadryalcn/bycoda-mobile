import { useLocalSearchParams } from "expo-router";
import { AssistantScreen } from "@/features/assistant/assistant-screen";
import { assistantVoiceRequested } from "@/features/assistant/assistant-voice-presentation";
export default function AssistantRoute() {
  // `job` and `questions` come from a tapped push ("the assistant needs you"); `voice` starts a call.
  const { job, questions, voice, home } = useLocalSearchParams<{ job?: string; questions?: string; voice?: string; home?: string }>();
  // The screen owns the title and the top row's actions (Minimize joins them while a call, dictation or read-aloud runs).
  return <AssistantScreen focusJobId={job || undefined} focusQuestions={questions === "1"} voiceRequested={assistantVoiceRequested(voice)} homeRequest={home || undefined} />;
}
