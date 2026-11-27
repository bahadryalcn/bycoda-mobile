import type { Href } from "expo-router";
import { useCopy } from "@/ui/copy";
import { pushOnce } from "@/ui/navigation";
import { NavigationRow, SelectField } from "@/ui/primitives";
import { settingsRoutes } from "../settings/settings-routes";
import { DICTATION_LANGUAGE_OPTIONS, isDictationLanguage, type DictationPreferences } from "./dictation-preferences";

type Copy = ReturnType<typeof useCopy>;

/** The one most notable dictation option that is on, for the options row; nothing when all are off. */
export function dictationOptionsSummary(preferences: DictationPreferences, copy: Copy): string | undefined {
  if (preferences.dictationCleanup.enabled) return copy("Metin düzenleme açık", "Text cleanup on");
  const words = preferences.dictationDictionary.length;
  if (words) return copy("Özel kelime: {p0}", "Custom words: {p0}", { p0: String(words) });
  if (preferences.dictationRemoveFillers) return copy("Dolgu sözcükleri kaldırılır", "Filler words removed");
  return undefined;
}

/**
 * Settings → Voice and microphone → Speech to text: the dictation language (the desktop's Automatic plus
 * its spoken languages) and the row to the dictation options page. Both apply to dictation only; calls
 * keep their own turn settings.
 */
export function DictationRows({ preferences, disabled, onLanguage }: {
  preferences: DictationPreferences;
  disabled: boolean;
  onLanguage(language: string): void;
}) {
  const copy = useCopy();
  return <>
    <SelectField variant="row" label={copy("Sesle yazma dili", "Dictation language")}
      hint={copy("Konuştuğun dili seçmek kısa ve karışık cümlelerin doğru tanınmasına yardım eder.", "Choosing the language you speak helps short and mixed phrases to be recognized correctly.")}
      value={preferences.dictationLanguage} disabled={disabled}
      options={[
        { value: "auto", label: copy("Otomatik", "Automatic"), detail: copy("Konuştuğun dil algılanır", "Detects the language you speak") },
        ...DICTATION_LANGUAGE_OPTIONS.map(([value, label]) => ({ value, label })),
      ]}
      onChange={value => { if (isDictationLanguage(value) && value !== preferences.dictationLanguage) onLanguage(value); }} />
    <NavigationRow label={copy("Sesle yazma seçenekleri", "Dictation options")}
      detail={dictationOptionsSummary(preferences, copy)}
      onPress={() => pushOnce(settingsRoutes.dictation as Href)} />
  </>;
}
