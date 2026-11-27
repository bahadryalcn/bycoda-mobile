import { useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { updateAssistantCallEpisode, useAssistantCallEpisode } from "./assistant-call-episode";
import { LEGACY_TRANSCRIPT_VISIBILITY_KEY } from "./assistant-voice-presentation";

/**
 * The call screen's transcript and composer, per call: both start closed for every call and survive
 * minimizing it. A device-wide choice made every later call open in the compact layout.
 */
export function useAssistantTranscript() {
  const episode = useAssistantCallEpisode();
  // The retired device preference is removed once, so no stale choice lingers in storage.
  useEffect(() => { void AsyncStorage.removeItem(LEGACY_TRANSCRIPT_VISIBILITY_KEY).catch(() => {}); }, []);
  const set = (patch: Parameters<typeof updateAssistantCallEpisode>[1]) => { if (episode) updateAssistantCallEpisode(episode.id, patch); };
  return {
    visible: !!episode?.transcript,
    toggle: () => set({ transcript: !episode?.transcript }),
    composer: !!episode?.composer,
    toggleComposer: () => set({ composer: !episode?.composer }),
  };
}
