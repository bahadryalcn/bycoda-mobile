import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AssistantTranscriptPreference } from "./assistant-voice-presentation";

export function useAssistantTranscript() {
  const [visible, setVisible] = useState(false);
  const preference = useRef<AssistantTranscriptPreference | null>(null);
  if (!preference.current) preference.current = new AssistantTranscriptPreference(AsyncStorage);
  // Restore device preference without replacing an interaction made during the read.
  useEffect(() => {
    let mounted = true;
    void preference.current!.load().then(value => { if (mounted && value !== undefined) setVisible(value); }).catch(() => {});
    return () => { mounted = false; };
  }, []);
  return { visible, toggle: () => {
    const next = !visible;
    setVisible(next);
    void preference.current!.save(next).catch(() => {});
  } };
}
