import { useState } from "react";
import { useActiveMachine } from "@/state/machines";
import { sameReviewedMachine, useConnectionScope } from "@/state/connection-scope";
import type { ReviewedMachine } from "@/state/reviewed-machine";
import { useHostQuery } from "@/state/queries";
import { useActiveHostLinkDown } from "@/state/host-runtime-state";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { Body, Input, NavigationGroup, Notice, QueryState, Section, SelectField, Stack, StateView, ToggleField } from "@/ui/primitives";
import { PreferenceStorageNotice } from "@/ui/preference-storage-notice";
import { parseLocalModels, type LocalVoiceModel } from "./voice-models-model";
import { DICTATION_MODELS } from "../../../../src/features/voice/model/dictationModels";
import {
  SUPERTONIC_SPEAKERS, TURN_PAUSES, useVoicePreferences, voicePreferences,
  type SpeechEngine, type SupertonicSpeaker, type TranscriptionEngine, type TurnPause, type VoicePreferences,
} from "./voice-preferences";

type Copy = ReturnType<typeof useCopy>;
/** "Erkek 1" for M1, "Kadın 3" for F3. */
export const speakerName = (speaker: SupertonicSpeaker, copy: Copy) =>
  speaker.startsWith("F") ? copy("Kadın {p0}", "Female {p0}", { p0: speaker.slice(1) }) : copy("Erkek {p0}", "Male {p0}", { p0: speaker.slice(1) });

/** The assistant's voice in a few words: the speaker for Supertonic, otherwise the engine. */
export function speechSummary(speech: SpeechEngine, speaker: SupertonicSpeaker, copy: Copy) {
  return speech === "voxcpm2" ? "VoxCPM2" : speech === "elevenlabs" ? "ElevenLabs" : speakerName(speaker ?? "M1", copy);
}

/** Desktop "Wait before replying" names: Natural pause, Longer pause, Extra time. */
export function turnPauseLabel(pause: TurnPause, copy: Copy) {
  return pause === 4 ? copy("Ek süre", "Extra time") : pause === 2.5 ? copy("Daha uzun duraklama", "Longer pause") : copy("Doğal duraklama", "Natural pause");
}

/**
 * What the connected computer offers for voice, read once per group. The Host decides availability;
 * a missing key or an old Host only greys out its option and says why.
 */
function useVoiceAvailability() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const { preferences } = useVoicePreferences();
  const localSupported = machine?.capabilities?.includes("voice.local.v1") === true;
  const cloudSupported = machine?.capabilities?.includes("voice.cloud.v1") === true;
  const selectableModels = machine?.capabilities?.includes("voice.transcription-models.v1") === true;
  const keys = useHostQuery<{ openrouter?: boolean; elevenlabs?: boolean; openai?: boolean; xai?: boolean }>(["voice", "cloud"], "voice.cloud.status", {}, { enabled: cloudSupported });
  const models = useHostQuery<LocalVoiceModel[]>(["voice", "models"], "voice.local.models", {}, { enabled: localSupported,
    queryFn: async (client, signal) => parseLocalModels(await client.request("voice.local.models", {}, { signal })) });
  const vox = useHostQuery<{ ready?: boolean }>(["voice", "voxcpm2"], "voice.local.inspect",
    { config: { engine: "voxcpm2" } }, { enabled: localSupported });
  const openrouter = cloudSupported && keys.data?.openrouter === true;
  const openai = cloudSupported && keys.data?.openai === true;
  const xai = cloudSupported && keys.data?.xai === true;
  const elevenlabs = cloudSupported && keys.data?.elevenlabs === true;
  const needsCloudSetup = copy("Bilgisayarda kurulum gerekiyor", "Needs setup on the computer");
  const needsHostUpdate = copy("Ses modelleri için bu bilgisayarda bycoda’yı güncelle", "Update bycoda on this computer for voice models.");
  const engines: { value: SpeechEngine; label: string; detail?: string; disabled?: boolean }[] = [
    { value: "supertonic", label: copy("Doğal (Supertonic)", "Natural (Supertonic)"),
      detail: localSupported ? copy("Hızlı ve gizli: bu bilgisayarın işlemcisinde çalışır.", "Fast and private: runs on this computer's processor.") : needsHostUpdate,
      disabled: !localSupported },
    { value: "voxcpm2", label: copy("Yüksek kalite (VoxCPM2)", "High quality (VoxCPM2)"),
      detail: vox.data?.ready === false ? needsCloudSetup : copy("Yüksek kalite daha zengin duyulur ama NVIDIA GPU gerektirir.", "High quality sounds richer but needs an NVIDIA GPU."),
      disabled: !localSupported || vox.data?.ready === false },
    { value: "elevenlabs", label: "ElevenLabs",
      detail: elevenlabs ? copy("Doğal bulut sesi. Bilgisayardan yalnızca yanıt metni çıkar.", "Natural cloud voice. Only the reply text leaves this computer.") : needsCloudSetup,
      disabled: !elevenlabs },
  ];
  return { machine, preferences, localSupported, cloudSupported, selectableModels, keys, models, openrouter, openai, xai, elevenlabs, needsCloudSetup, needsHostUpdate, engines };
}

/** Saves one choice to this phone, only while the computer it was made for is still the connected one. */
function useVoiceUpdate() {
  const scope = useConnectionScope();
  return (patch: Partial<VoicePreferences>, onApplied?: () => void) => {
    if (!scope.isCurrent()) return;
    void voicePreferences.getState().update(() => {
      if (!scope.isCurrent()) throw new Error("Voice settings connection changed");
      return patch;
    }).then(onApplied).catch(() => {});
  };
}

/**
 * "Ses": one choice for how the assistant sounds, used on the page and in the call's settings. Supertonic
 * lists its speakers with the engine as the secondary line; VoxCPM2 and ElevenLabs are single entries.
 * It saves the same speech and speaker values as the two rows it replaces.
 */
function VoiceRow() {
  const copy = useCopy();
  const { preferences, hydrated } = useVoicePreferences();
  const { engines } = useVoiceAvailability();
  const update = useVoiceUpdate();
  const [natural, highQuality, eleven] = engines;
  const options = [
    ...SUPERTONIC_SPEAKERS.map((speaker) => ({ value: `supertonic:${speaker}`, label: speakerName(speaker, copy),
      detail: natural.disabled ? natural.detail : natural.label, disabled: natural.disabled })),
    { value: "voxcpm2", label: highQuality.label, detail: highQuality.disabled ? highQuality.detail : undefined, disabled: highQuality.disabled },
    { value: "elevenlabs", label: eleven.label, detail: eleven.disabled ? eleven.detail : undefined, disabled: eleven.disabled },
  ];
  const current = preferences.speech === "supertonic" ? `supertonic:${preferences.speaker}` : preferences.speech;
  return <SelectField variant="row" label={copy("Ses", "Voice")} value={current} disabled={!hydrated} options={options}
    onChange={(value) => {
      const [speech, speaker] = value.split(":");
      const engine = engines.find((item) => item.value === speech);
      if (!engine || engine.disabled) return;
      if (speech === "supertonic") {
        const chosen = SUPERTONIC_SPEAKERS.find((item) => item === speaker);
        if (chosen) update({ speech: "supertonic", speaker: chosen });
      } else update({ speech: engine.value });
    }} />;
}

/** Wait before replying and the owner's own turn end, as select row and switch. */
function TurnRows() {
  const copy = useCopy();
  const { preferences, hydrated } = useVoicePreferences();
  const update = useVoiceUpdate();
  return <>
    <SelectField variant="row" label={copy("Yanıtlamadan önce bekle", "Wait before replying")}
      value={String(preferences.turnPause)} disabled={!hydrated || preferences.manualTurnEnd}
      hint={preferences.manualTurnEnd
        ? copy("Otomatik duraklama algılama kapalı. Hazır olduğunda Şimdi gönder’e dokun.", "Automatic pause detection is off. Tap Send now when you are ready.")
        : undefined}
      options={TURN_PAUSES.map(pause => ({ value: String(pause), label: turnPauseLabel(pause, copy),
        detail: copy("{p0} saniye", "{p0} seconds", { p0: pause.toLocaleString() }) }))}
      onChange={value => { const pause = TURN_PAUSES.find(item => String(item) === value); if (pause) update({ turnPause: pause }); }} />
    <ToggleField label={copy("Konuşmamın ne zaman biteceğine ben karar veririm", "I decide when my turn ends")}
      help={copy("Uzun duraklamalarda dinleme sürer; göndermek için Şimdi gönder’e dokun.", "Long pauses keep listening. Tap Send now to send your speech.")}
      value={preferences.manualTurnEnd} disabled={!hydrated}
      onChange={manualTurnEnd => update({ manualTurnEnd })} />
  </>;
}

/** Settings → Voice assistant → Voice: how the assistant sounds on calls from this phone. */
export function VoiceGroup() {
  const copy = useCopy();
  const { machine, elevenlabs } = useVoiceAvailability();
  const { preferences, hydrated } = useVoicePreferences();
  const scope = useConnectionScope();
  const review = scope.review;
  const update = useVoiceUpdate();
  const [drafts, setDrafts] = useState<ReadonlyMap<string, { review: ReviewedMachine; value: string }>>(() => new Map());
  if (!machine || !review) return null;
  const draft = drafts.get(review.id);
  const elevenValue = (draft && sameReviewedMachine(draft.review, review) ? draft.value : preferences.elevenVoice) ?? "";
  const elevenValid = /^[A-Za-z0-9]{0,64}$/.test(elevenValue);
  // The voice ID commits when the field is left, like every other choice on this page; no separate Save.
  const commitEleven = () => {
    if (!hydrated || !elevenValid || elevenValue === (preferences.elevenVoice ?? "")) return;
    update({ elevenVoice: elevenValue || undefined }, () => {
      setDrafts((previous) => {
        if (!draft || previous.get(review.id) !== draft) return previous;
        const next = new Map(previous);
        next.delete(review.id);
        return next;
      });
    });
  };
  return (
    <Stack>
      <NavigationGroup>
        <VoiceRow />
      </NavigationGroup>
      {preferences.speech === "elevenlabs" && elevenlabs ? (
        <Input label={copy("ElevenLabs ses kimliği", "ElevenLabs voice ID")} value={elevenValue}
          hint={copy("İsteğe bağlı. Boş bırakılırsa varsayılan ses kullanılır.", "Optional. Empty uses the default voice.")}
          error={elevenValid ? undefined : copy("Yalnızca harf ve rakam kullan.", "Use letters and numbers only.")}
          onChangeText={(value) => {
            if (scope.isCurrent()) setDrafts((previous) => new Map(previous).set(review.id, { review, value }));
          }}
          onBlur={commitEleven} onSubmitEditing={commitEleven}
          autoCapitalize="none" autoCorrect={false} />
      ) : null}
    </Stack>
  );
}

/** Settings → Voice assistant → Dictation: who turns the owner's speech into text, as on the desktop. */
export function DictationGroup() {
  const copy = useCopy();
  const linkDown = useActiveHostLinkDown();
  const { machine, preferences, localSupported, selectableModels, keys, models, openrouter, openai, xai, needsCloudSetup, needsHostUpdate } = useVoiceAvailability();
  const { hydrated } = useVoicePreferences();
  const update = useVoiceUpdate();
  const cloudModels = useHostQuery<{ id: string; label: string }[]>(["voice", "cloud-models"], "voice.cloud.models", {}, {
    enabled: selectableModels && keys.data?.openrouter === true && preferences.engine === "cloud",
  });
  if (!machine) return null;
  const recognitionReady = preferences.engine === "local"
    ? localSupported && models.isSuccess
    : preferences.engine === "cloud" && keys.isSuccess && openrouter;
  const installed = models.data?.filter(model => model.installed && (model.id === "small" || model.id === "turbo")) ?? [];
  const recognizers: { value: TranscriptionEngine; label: string; detail?: string; disabled?: boolean }[] = [
    { value: "local", label: copy("Bu bilgisayar", "This computer"), detail: copy("{p0} üzerinde Whisper", "Whisper on {p0}", { p0: machine.name }), disabled: !localSupported },
    { value: "cloud", label: "OpenRouter", detail: openrouter ? copy("Bulutta", "In the cloud") : needsCloudSetup, disabled: !openrouter },
    { value: "openai", label: "OpenAI", detail: openai ? "Codex" : keys.isSuccess && keys.data?.openai === undefined ? needsHostUpdate : needsCloudSetup, disabled: !openai },
    { value: "xai", label: "Grok", detail: xai ? DICTATION_MODELS.xai[0]?.label : keys.isSuccess && keys.data?.xai === undefined ? needsHostUpdate : needsCloudSetup, disabled: !xai },
  ];
  return (
    <Section title={copy("Dikte", "Dictation")}>
      <NavigationGroup>
        <SelectField variant="row" label={copy("Dikte tanıma", "Dictation recognition")} value={preferences.engine}
          hint={copy("Sesli görüşmelerde de konuşmanı bu tanır.", "Also recognizes your speech in voice calls.")}
          disabled={!hydrated} options={recognizers}
          onChange={engine => { if (recognizers.some(item => item.value === engine && !item.disabled)) update({ engine }); }} />
        {preferences.engine === "local" && localSupported && selectableModels ? (
          <SelectField variant="row" label={copy("Yazıya dökme modeli", "Transcription model")}
            value={installed.some(model => model.id === preferences.whisperModel) ? preferences.whisperModel ?? "" : ""}
            disabled={!hydrated || !installed.length}
            options={[{ value: "", label: copy("Otomatik", "Automatic") }, ...installed.map(model => ({ value: model.id, label: model.label }))]}
            onChange={value => update({ whisperModel: value === "small" || value === "turbo" ? value : undefined })} />
        ) : null}
        {preferences.engine === "cloud" && openrouter && selectableModels ? (
          <SelectField variant="row" label={copy("Yazıya dökme modeli", "Transcription model")} value={preferences.cloudModel ?? ""}
            disabled={!hydrated || !cloudModels.data?.length}
            options={[{ value: "", label: copy("Otomatik", "Automatic") }, ...(cloudModels.data ?? []).map(model => ({ value: model.id, label: model.label }))]}
            onChange={value => update({ cloudModel: value || undefined })} />
        ) : null}
        {preferences.engine === "openai" && openai ? (
          <SelectField variant="row" label={copy("Yazıya dökme modeli", "Transcription model")} value={preferences.openaiModel ?? ""}
            disabled={!hydrated}
            options={[{ value: "", label: copy("Otomatik", "Automatic") }, ...DICTATION_MODELS.openai.map(model => ({ value: model.id, label: model.label }))]}
            onChange={value => update({ openaiModel: value || undefined })} />
        ) : null}
      </NavigationGroup>
      {preferences.engine === "local" && localSupported ? <QueryState query={models} loading="inline" compact /> : null}
      {preferences.engine === "cloud" && openrouter && selectableModels ? <QueryState query={cloudModels} loading="inline" compact /> : null}
      {!linkDown && recognitionReady && !selectableModels ? <StateView size="compact" title={needsHostUpdate} /> : null}
      {preferences.engine === "cloud" && keys.isSuccess && !openrouter ? (
        <Notice tone="warning" message={copy("Bulut seçili ama bilgisayarda anahtar yok; konuşman anlaşılamaz. {p0} seç.", "Cloud is selected but the computer has no key, so your speech cannot be understood. Choose {p0}.", { p0: machine.name })} />
      ) : null}
    </Section>
  );
}

/** Settings → Voice assistant → Conversation style: turn taking and sleep, with the desktop's words. */
export function ConversationStyleGroup() {
  const copy = useCopy();
  const { uiStyles } = useMobileTheme();
  return (
    <Section title={copy("Konuşma tarzı", "Conversation style")}>
      <NavigationGroup>
        <TurnRows />
      </NavigationGroup>
      <Body muted style={uiStyles.caption}>{copy(
        "Telefonda yanıt çalarken mikrofon kapalıdır. Araya girmek için Konuşmayı durdur’a dokun.",
        "On the phone the microphone is closed while a reply plays. To interrupt, tap Stop speaking.",
      )}</Body>
    </Section>
  );
}

/**
 * The voice choices that can change during a call, in the assistant's settings sheet: voice and turn
 * taking. Everything else lives on Settings → Voice assistant.
 */
export function VoiceChoices({ showStorageNotice = true }: { showStorageNotice?: boolean }) {
  const machine = useActiveMachine();
  const { storageError, retry } = useVoicePreferences();
  const review = useConnectionScope().review;
  if (!machine || !review) return null;
  return (
    <Stack>
      <NavigationGroup>
        <VoiceRow />
        <TurnRows />
      </NavigationGroup>
      {showStorageNotice ? <PreferenceStorageNotice error={storageError} retry={retry} /> : null}
    </Stack>
  );
}
