import { router } from "expo-router";

/** The one entry other screens use to start a voice conversation: opens the Assistant and begins a call. */
export function startAssistantVoice() {
  router.navigate({ pathname: "/assistant", params: { voice: "1" } });
}
