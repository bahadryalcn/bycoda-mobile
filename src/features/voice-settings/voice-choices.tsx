import { useState } from "react";
import { View } from "react-native";
import { useActiveMachine } from "@/state/machines";
import { useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { Button, Input, Notice, QueryState, SectionHeader, SelectField, SelectRow, Stack } from "@/ui/primitives";
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
export function VoiceChoices() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const { preferences, hydrated, storageError } = useVoicePreferences();
  const localSupported = machine?.capabilities?.includes("voice.local.v1") === true;
  const cloudSupported = machine?.capabilities?.includes("voice.cloud.v1") === true;
  const selectableModels = machine?.capabilities?.includes("voice.transcription-models.v1") === true;
  const keys = useHostQuery<{ openrouter?: unknown; elevenlabs?: unknown }>(["voice", "cloud"], "voice.cloud.status", {}, { enabled: cloudSupported });
  const models = useHostQuery<LocalVoiceModel[]>(["voice", "models"], "voice.local.models", {}, { enabled: localSupported,
    queryFn: async (client, signal) => parseLocalModels(await client.request("voice.local.models", {}, { signal })) });
  const cloudModels = useHostQuery<{ id: string; label: string }[]>(["voice", "cloud-models"], "voice.cloud.models", {}, {
    enabled: selectableModels && keys.data?.openrouter === true && preferences.engine === "cloud",
  });
  const vox = useHostQuery<{ ready?: boolean }>(["voice", "voxcpm2"], "voice.local.inspect",
    { config: { engine: "voxcpm2" } }, { enabled: localSupported });
  const [elevenDraft, setElevenDraft] = useState<string>();
  if (!machine) return null;
  const openrouter = cloudSupported && keys.data?.openrouter === true;
  const elevenlabs = cloudSupported && keys.data?.elevenlabs === true;
  const installed = models.data?.filter(model => model.installed && (model.id === "small" || model.id === "turbo")) ?? [];
  const update = (patch: Partial<VoicePreferences>) => void voicePreferences.getState().update(patch).catch(() => {});
  const engines: { value: SpeechEngine; label: string; detail?: string; disabled?: boolean }[] = [
    { value: "supertonic", label: "Supertonic", detail: copy("Bilgisayarda", "On the computer"), disabled: !localSupported },
    { value: "voxcpm2", label: "VoxCPM2", detail: vox.data?.ready === false ? copy("Bilgisayarda kurulum gerekiyor", "Needs setup on the computer") : undefined, disabled: !localSupported || vox.data?.ready === false },
    { value: "elevenlabs", label: "ElevenLabs", detail: copy("Bulutta", "In the cloud"), disabled: !elevenlabs },
  ];
  const elevenValue = elevenDraft ?? preferences.elevenVoice ?? "";
  return (
    <Stack>
      <SectionHeader title={copy("Seni anlama", "Understanding you")} />
      <View>
        <SelectRow label={machine.name} selected={preferences.engine === "local"} disabled={!hydrated || !localSupported}
          detail={copy("Whisper bu bilgisayarda", "Whisper on this computer")}
          onPress={() => update({ engine: "local" })} />
        <SelectRow label={copy("Bulut", "Cloud")} selected={preferences.engine === "cloud"} disabled={!hydrated || !openrouter}
          detail="OpenRouter"
          onPress={() => update({ engine: "cloud" })} />
      </View>
      {preferences.engine === "local" && localSupported ? <>
        <QueryState query={models} loading="inline" />
        <SelectField label={copy("Yazıya dökme modeli", "Transcription model")}
          value={selectableModels && installed.some(model => model.id === preferences.whisperModel) ? preferences.whisperModel ?? "" : ""}
          disabled={!hydrated || !selectableModels || !installed.length}
          options={[{ value: "", label: copy("Otomatik", "Automatic") }, ...installed.map(model => ({ value: model.id, label: model.label }))]}
          onChange={value => update({ whisperModel: value === "small" || value === "turbo" ? value : undefined })} />
      </> : null}
      {preferences.engine === "cloud" && openrouter && selectableModels ? <>
        <QueryState query={cloudModels} loading="inline" />
        <SelectField label={copy("Yazıya dökme modeli", "Transcription model")} value={preferences.cloudModel ?? ""}
          disabled={!hydrated || !cloudModels.data?.length}
          options={[{ value: "", label: copy("Otomatik", "Automatic") }, ...(cloudModels.data ?? []).map(model => ({ value: model.id, label: model.label }))]}
          onChange={value => update({ cloudModel: value || undefined })} />
      </> : null}
      {!selectableModels && (localSupported || openrouter) ? (
        <Notice message={copy("Ses modelleri için bu bilgisayarda bycoda’yı güncelle.", "Update bycoda on this computer for voice models.")} />
      ) : null}
      {preferences.engine === "cloud" && keys.isSuccess && !openrouter ? (
        <Notice tone="warning" message={copy("Bulut seçili ama bilgisayarda anahtar yok; konuşman anlaşılamaz. {p0} seç.", "Cloud is selected but the computer has no key, so your speech cannot be understood. Choose {p0}.", { p0: machine.name })} />
      ) : null}
      <SectionHeader title={copy("Asistanın sesi", "Assistant's voice")} />
      <View>
        {engines.map((engine) => (
          <SelectRow key={engine.value} label={engine.label} detail={engine.detail} selected={preferences.speech === engine.value}
            disabled={!hydrated || engine.disabled} onPress={() => update({ speech: engine.value })} />
        ))}
      </View>
      {preferences.speech === "supertonic" ? (
        <SelectField label={copy("Ses", "Voice")} value={preferences.speaker} disabled={!hydrated}
          options={SUPERTONIC_SPEAKERS.map(speaker => ({ value: speaker, label: speakerName(speaker, copy) }))}
          onChange={value => { const speaker = SUPERTONIC_SPEAKERS.find(item => item === value); if (speaker) update({ speaker }); }} />
      ) : null}
      {preferences.speech === "elevenlabs" && elevenlabs ? <>
        <Input label={copy("ElevenLabs ses kimliği", "ElevenLabs voice ID")} value={elevenValue}
          onChangeText={setElevenDraft} autoCapitalize="none" autoCorrect={false} />
        <Button label={copy("Kaydet", "Save")}
          disabled={!hydrated || elevenValue === (preferences.elevenVoice ?? "") || !/^[A-Za-z0-9]{0,64}$/.test(elevenValue)}
          onPress={() => update({ elevenVoice: elevenValue || undefined })} />
      </> : null}
      {storageError ? <Notice tone="warning" message={copy("Ses ayarları kaydedilemedi.", "Could not save voice settings.")} /> : null}
    </Stack>
  );
}
