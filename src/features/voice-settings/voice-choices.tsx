import { View } from "react-native";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { ChoiceChip, Notice, SectionHeader, SelectRow, Stack } from "@/ui/primitives";
import { space } from "@/ui/tokens";
import { parseLocalModels, type LocalVoiceModel } from "./voice-models-model";
import { SUPERTONIC_SPEAKERS, useVoicePreferences, voicePreferences, type SpeechEngine, type SupertonicSpeaker, type VoicePreferences } from "./voice-preferences";

type Copy = ReturnType<typeof useCopy>;
/** "Erkek 1" for M1, "Kadın 3" for F3. */
export const speakerName = (speaker: SupertonicSpeaker, copy: Copy) =>
  speaker.startsWith("F") ? copy("Kadın {p0}", "Female {p0}", { p0: speaker.slice(1) }) : copy("Erkek {p0}", "Male {p0}", { p0: speaker.slice(1) });

/** The assistant's voice in a few words: the speaker for Supertonic, otherwise the engine. */
export function speechSummary(speech: SpeechEngine, speaker: SupertonicSpeaker, copy: Copy) {
  return speech === "voxcpm2" ? "VoxCPM2" : speech === "elevenlabs" ? "ElevenLabs" : speakerName(speaker ?? "M1", copy);
}

/**
 * The two choices a voice call depends on, as on the desktop: who understands the owner (speech
 * recognition on the computer or in the cloud) and how the assistant sounds (engine and speaker).
 * The Host still decides availability; a missing key only greys out its row.
 */
export function VoiceChoices({ inCall = false }: { inCall?: boolean }) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const { preferences, hydrated } = useVoicePreferences();
  const localSupported = machine?.capabilities?.includes("voice.local.v1") === true;
  const cloudSupported = machine?.capabilities?.includes("voice.cloud.v1") === true;
  const keys = useHostQuery<{ openrouter?: unknown; elevenlabs?: unknown }>(["voice", "cloud"], "voice.cloud.status", {}, { enabled: cloudSupported });
  const models = useHostQuery<LocalVoiceModel[]>(["voice", "models"], "voice.local.models", {}, { enabled: localSupported,
    queryFn: async (client, signal) => parseLocalModels(await client.request("voice.local.models", {}, { signal })) });
  if (!machine) return null;
  const openrouter = cloudSupported && keys.data?.openrouter === true;
  const elevenlabs = cloudSupported && keys.data?.elevenlabs === true;
  const whisper = models.data?.filter((model) => model.installed).at(-1)?.label;
  const update = (patch: Partial<VoicePreferences>) => void voicePreferences.getState().update(patch);
  // A call holds one speech runtime for its whole length; a new voice applies from the next call.
  const voiceLocked = inCall;
  const engines: { value: SpeechEngine; label: string; detail: string; disabled?: boolean }[] = [
    { value: "supertonic", label: "Supertonic", detail: copy("Hızlı · işlemcide çalışır", "Fast · runs on the processor") },
    { value: "voxcpm2", label: "VoxCPM2", detail: copy("Daha doğal · ekran kartı gerekir", "More natural · needs a graphics card") },
    { value: "elevenlabs", label: "ElevenLabs", detail: elevenlabs ? copy("Bulutta", "In the cloud") : copy("Bilgisayarda anahtar yok", "No key on the computer"), disabled: !elevenlabs },
  ];
  return (
    <Stack>
      <SectionHeader title={copy("Seni anlama", "Understanding you")} />
      <View>
        <SelectRow label={machine.name} selected={preferences.engine === "local"} disabled={!hydrated}
          detail={whisper ?? copy("Whisper bu bilgisayarda", "Whisper on this computer")}
          onPress={() => update({ engine: "local" })} />
        <SelectRow label={copy("Bulut", "Cloud")} selected={preferences.engine === "cloud"} disabled={!hydrated || !openrouter}
          detail={openrouter ? "OpenRouter" : copy("Bilgisayarda OpenRouter anahtarı yok", "No OpenRouter key on the computer")}
          onPress={() => update({ engine: "cloud" })} />
      </View>
      {preferences.engine === "cloud" && keys.isSuccess && !openrouter ? (
        <Notice tone="warning" message={copy("Bulut seçili ama bilgisayarda anahtar yok; konuşman anlaşılamaz. {p0} seç.", "Cloud is selected but the computer has no key, so your speech cannot be understood. Choose {p0}.", { p0: machine.name })} />
      ) : null}
      <SectionHeader title={copy("Asistanın sesi", "Assistant's voice")} />
      {voiceLocked ? <Notice message={copy("Ses görüşme bitince değiştirilebilir.", "The voice can be changed after the call.")} /> : null}
      <View>
        {engines.map((engine) => (
          <SelectRow key={engine.value} label={engine.label} detail={engine.detail} selected={preferences.speech === engine.value}
            disabled={!hydrated || voiceLocked || engine.disabled} onPress={() => update({ speech: engine.value })} />
        ))}
      </View>
      {preferences.speech === "supertonic" ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {SUPERTONIC_SPEAKERS.map((speaker) => (
            <ChoiceChip key={speaker} label={speakerName(speaker, copy)} selected={preferences.speaker === speaker}
              disabled={!hydrated || voiceLocked} onPress={() => update({ speaker })} />
          ))}
        </View>
      ) : null}
    </Stack>
  );
}
