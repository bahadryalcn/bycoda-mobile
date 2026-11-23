import { useState } from "react";
import { View } from "react-native";
import { useActiveMachine } from "@/state/machines";
import { sameReviewedMachine, useConnectionScope } from "@/state/connection-scope";
import type { ReviewedMachine } from "@/state/reviewed-machine";
import { useHostQuery } from "@/state/queries";
import { useActiveHostLinkDown } from "@/state/host-runtime-state";
import { useCopy } from "@/ui/copy";
import { Body, Button, Input, Notice, QueryState, SectionHeader, SelectField, SelectRow, Stack } from "@/ui/primitives";
import { PreferenceStorageNotice } from "@/ui/preference-storage-notice";
import { parseLocalModels, type LocalVoiceModel } from "./voice-models-model";
import { DICTATION_MODELS } from "../../../../src/features/voice/model/dictationModels";
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
export function VoiceChoices({ showStorageNotice = true }: { showStorageNotice?: boolean }) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const linkDown = useActiveHostLinkDown();
  const { preferences, hydrated, storageError, retry } = useVoicePreferences();
  const scope = useConnectionScope();
  const review = scope.review;
  const localSupported = machine?.capabilities?.includes("voice.local.v1") === true;
  const cloudSupported = machine?.capabilities?.includes("voice.cloud.v1") === true;
  const selectableModels = machine?.capabilities?.includes("voice.transcription-models.v1") === true;
  const keys = useHostQuery<{ openrouter?: boolean; elevenlabs?: boolean; openai?: boolean; xai?: boolean }>(["voice", "cloud"], "voice.cloud.status", {}, { enabled: cloudSupported });
  const models = useHostQuery<LocalVoiceModel[]>(["voice", "models"], "voice.local.models", {}, { enabled: localSupported,
    queryFn: async (client, signal) => parseLocalModels(await client.request("voice.local.models", {}, { signal })) });
  const cloudModels = useHostQuery<{ id: string; label: string }[]>(["voice", "cloud-models"], "voice.cloud.models", {}, {
    enabled: selectableModels && keys.data?.openrouter === true && preferences.engine === "cloud",
  });
  const vox = useHostQuery<{ ready?: boolean }>(["voice", "voxcpm2"], "voice.local.inspect",
    { config: { engine: "voxcpm2" } }, { enabled: localSupported });
  const [drafts, setDrafts] = useState<ReadonlyMap<string, { review: ReviewedMachine; value: string }>>(() => new Map());
  if (!machine || !review) return null;
  const openrouter = cloudSupported && keys.data?.openrouter === true;
  const openai = cloudSupported && keys.data?.openai === true;
  const xai = cloudSupported && keys.data?.xai === true;
  const needsCloudSetup = copy("Bilgisayarda kurulum gerekiyor", "Needs setup on the computer");
  const needsHostUpdate = copy("Ses modelleri için bu bilgisayarda bycoda’yı güncelle", "Update bycoda on this computer for voice models.");
  const elevenlabs = cloudSupported && keys.data?.elevenlabs === true;
  const desktopVoice = [openai && "OpenAI Realtime", xai && "Grok Voice"].filter(Boolean).join(" · ");
  const recognitionReady = preferences.engine === "local"
    ? localSupported && models.isSuccess
    : preferences.engine === "cloud" && keys.isSuccess && openrouter;
  const installed = models.data?.filter(model => model.installed && (model.id === "small" || model.id === "turbo")) ?? [];
  const update = (patch: Partial<VoicePreferences>, onApplied?: () => void) => {
    if (!scope.isCurrent()) return;
    void voicePreferences.getState().update(() => {
      if (!scope.isCurrent()) throw new Error("Voice settings connection changed");
      return patch;
    }).then(onApplied).catch(() => {});
  };
  const engines: { value: SpeechEngine; label: string; detail?: string; disabled?: boolean }[] = [
    { value: "supertonic", label: "Supertonic", detail: copy("Bilgisayarda", "On the computer"), disabled: !localSupported },
    { value: "voxcpm2", label: "VoxCPM2", detail: vox.data?.ready === false ? copy("Bilgisayarda kurulum gerekiyor", "Needs setup on the computer") : undefined, disabled: !localSupported || vox.data?.ready === false },
    { value: "elevenlabs", label: "ElevenLabs", detail: elevenlabs ? copy("Bulutta", "In the cloud") : needsCloudSetup, disabled: !elevenlabs },
  ];
  const draft = drafts.get(review.id);
  const elevenValue = (draft && sameReviewedMachine(draft.review, review) ? draft.value : preferences.elevenVoice) ?? "";
  return (
    <Stack>
      <SectionHeader title={copy("Seni anlama", "Understanding you")} />
      <View>
        <SelectRow label={machine.name} selected={preferences.engine === "local"} disabled={!hydrated || !localSupported}
          detail={copy("Whisper bu bilgisayarda", "Whisper on this computer")}
          onPress={() => update({ engine: "local" })} />
        <SelectRow label="OpenRouter" selected={preferences.engine === "cloud"} disabled={!hydrated || !openrouter}
          detail={copy("Bulutta", "In the cloud")}
          onPress={() => update({ engine: "cloud" })} />
        <SelectRow label="OpenAI" selected={preferences.engine === "openai"} disabled={!hydrated || !openai}
          detail={openai ? "Codex" : keys.isSuccess && keys.data?.openai === undefined ? needsHostUpdate : needsCloudSetup}
          onPress={() => update({ engine: "openai" })} />
        <SelectRow label="Grok" selected={preferences.engine === "xai"} disabled={!hydrated || !xai}
          detail={xai ? DICTATION_MODELS.xai[0]?.label : keys.isSuccess && keys.data?.xai === undefined ? needsHostUpdate : needsCloudSetup}
          onPress={() => update({ engine: "xai" })} />
      </View>
      {preferences.engine === "local" && localSupported ? <>
        <QueryState query={models} loading="inline" compact />
        {selectableModels ? <SelectField label={copy("Yazıya dökme modeli", "Transcription model")}
          value={installed.some(model => model.id === preferences.whisperModel) ? preferences.whisperModel ?? "" : ""}
          disabled={!hydrated || !installed.length}
          options={[{ value: "", label: copy("Otomatik", "Automatic") }, ...installed.map(model => ({ value: model.id, label: model.label }))]}
          onChange={value => update({ whisperModel: value === "small" || value === "turbo" ? value : undefined })} /> : null}
      </> : null}
      {preferences.engine === "cloud" && openrouter && selectableModels ? <>
        <QueryState query={cloudModels} loading="inline" compact />
        <SelectField label={copy("Yazıya dökme modeli", "Transcription model")} value={preferences.cloudModel ?? ""}
          disabled={!hydrated || !cloudModels.data?.length}
          options={[{ value: "", label: copy("Otomatik", "Automatic") }, ...(cloudModels.data ?? []).map(model => ({ value: model.id, label: model.label }))]}
          onChange={value => update({ cloudModel: value || undefined })} />
      </> : null}
      {preferences.engine === "openai" && openai ?
        <SelectField label={copy("Yazıya dökme modeli", "Transcription model")} value={preferences.openaiModel ?? ""}
          disabled={!hydrated}
          options={[{ value: "", label: copy("Otomatik", "Automatic") }, ...DICTATION_MODELS.openai.map(model => ({ value: model.id, label: model.label }))]}
          onChange={value => update({ openaiModel: value || undefined })} /> : null}
      {!linkDown && recognitionReady && !selectableModels ? (
        <Notice message={needsHostUpdate} />
      ) : null}
      {preferences.engine === "cloud" && keys.isSuccess && !openrouter ? (
        <Notice tone="warning" message={copy("Bulut seçili ama bilgisayarda anahtar yok; konuşman anlaşılamaz. {p0} seç.", "Cloud is selected but the computer has no key, so your speech cannot be understood. Choose {p0}.", { p0: machine.name })} />
      ) : null}
      <SelectField label={copy("Asistanın sesi", "Assistant's voice")} value={preferences.speech}
        options={engines} disabled={!hydrated}
        onChange={(speech) => {
          if (engines.some((engine) => engine.value === speech && !engine.disabled)) update({ speech });
        }} />
      {desktopVoice ? <Body muted>{copy("Masaüstünde canlı sesli görüşme: {p0}", "Live voice on desktop: {p0}", { p0: desktopVoice })}</Body> : null}
      {preferences.speech === "supertonic" ? (
        <SelectField label={copy("Ses", "Voice")} value={preferences.speaker} disabled={!hydrated}
          options={SUPERTONIC_SPEAKERS.map(speaker => ({ value: speaker, label: speakerName(speaker, copy) }))}
          onChange={value => { const speaker = SUPERTONIC_SPEAKERS.find(item => item === value); if (speaker) update({ speaker }); }} />
      ) : null}
      {preferences.speech === "elevenlabs" && elevenlabs ? <>
        <Input label={copy("ElevenLabs ses kimliği", "ElevenLabs voice ID")} value={elevenValue}
          onChangeText={(value) => {
            if (scope.isCurrent()) setDrafts((previous) => new Map(previous).set(review.id, { review, value }));
          }} autoCapitalize="none" autoCorrect={false} />
        <Button label={copy("Kaydet", "Save")}
          disabled={!hydrated || elevenValue === (preferences.elevenVoice ?? "") || !/^[A-Za-z0-9]{0,64}$/.test(elevenValue)}
          onPress={() => update({ elevenVoice: elevenValue || undefined }, () => {
            setDrafts((previous) => {
              if (!draft || previous.get(review.id) !== draft) return previous;
              const next = new Map(previous);
              next.delete(review.id);
              return next;
            });
          })} />
      </> : null}
      {showStorageNotice ? <PreferenceStorageNotice error={storageError} retry={retry} /> : null}
    </Stack>
  );
}
