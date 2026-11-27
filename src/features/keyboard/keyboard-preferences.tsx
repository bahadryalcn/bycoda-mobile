import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";
import { createKeyboardPreferences } from "./keyboard-preference-store";
import Keyboard from "lucide-react-native/icons/keyboard";
import { Notice, SettingIcon, ToggleField } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";

export const useKeyboardPreferences = createKeyboardPreferences(AsyncStorage);
export function useKeyboardPreferenceHydration() {
  // Reason: load persisted keyboard behavior before enabling plain Enter interception.
  useEffect(() => { void useKeyboardPreferences.getState().hydrate(); }, []);
}
export function KeyboardSettings() {
  const copy = useCopy();
  useKeyboardPreferenceHydration();
  const state = useKeyboardPreferences();
  return (
    <ToggleField label={copy("Donanım klavyesinde Enter gönderir", "Enter sends with a hardware keyboard")}
      icon={<SettingIcon glyph={Keyboard} />}
      help={copy("Shift+Enter yeni satır ekler. Ekran klavyesinde Enter her zaman yeni satır ekler.", "Shift+Enter adds a newline. Enter on the software keyboard always adds a newline.")}
      value={state.enterSends} disabled={!state.hydrated}
      onChange={(value) => { void state.setEnterSends(value); }} />
  );
}
/** Rendered below the settings group, like the sibling preferences' storage warnings. */
export function KeyboardPreferenceNotice() {
  const copy = useCopy();
  const error = useKeyboardPreferences((state) => state.error);
  return error
    ? <Notice tone="warning" message={copy("Klavye tercihi kaydedilemedi veya yüklenemedi. Yeniden seçerek dene.", "The keyboard preference could not be saved or loaded. Select it again to retry.")} />
    : null;
}
