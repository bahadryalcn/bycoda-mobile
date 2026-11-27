import { useState, type ReactNode } from "react";
import { useActiveMachine } from "@/state/machines";
import { sameReviewedMachine, useConnectionScope } from "@/state/connection-scope";
import type { ReviewedMachine } from "@/state/reviewed-machine";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useActiveHostLinkDown } from "@/state/host-runtime-state";
import { useCopy } from "@/ui/copy";
import { useLocale } from "@/i18n";
import { Input, NavigationGroup, Notice, QueryState, Section, SelectField, StateView, ToggleField } from "@/ui/primitives";
import { parseLocalModels, type LocalVoiceModel } from "./voice-models-model";
import { normalizeDictationPreferences } from "./dictation-preferences";
import { DictationRows } from "./dictation-rows";
import { DICTATION_MODELS } from "../../../../src/features/voice/model/dictationModels";
import { SPEAKER_IDS } from "../../../../src/shared/model/voice-realtime/voiceSpeakers";
import {
  VOICE_REALTIME_RELAY_CAPABILITY, type VoiceCallMode, type VoiceCallSettingsPatch, type VoiceCallSettingsResult,
} from "../../../../src/shared/model/host-contracts/voice";
import {
  SUPERTONIC_SPEAKERS, TURN_PAUSES, useVoicePreferences, voicePreferences,
  type SpeechEngine, type SupertonicSpeaker, type TranscriptionEngine, type TurnPause, type VoicePreferences,
} from "./voice-preferences";

type Copy = ReturnType<typeof useCopy>;
type SignInState = "ready" | "missing" | "expired";
/** `signIn` says why a sign-in is unusable; a Host without it reports only the yes/no flags. */
type CloudStatus = { openrouter?: boolean; elevenlabs?: boolean; openai?: boolean; xai?: boolean; signIn?: { openai?: SignInState; xai?: SignInState } };
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
  const keys = useHostQuery<CloudStatus>(["voice", "cloud"], "voice.cloud.status", {}, { enabled: cloudSupported });
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
  const needsElevenKey = copy("Bilgisayarda ElevenLabs anahtarı gerekli", "Needs an ElevenLabs key on the computer");
  /**
   * Why OpenAI or Grok cannot be chosen, as the one step to take on the computer. An older Host reports
   * no flag at all (an update, not a missing sign-in), and an unanswered status is never called a missing one.
   */
  const signInNeeded = (provider: "openai" | "xai") => {
    if (!cloudSupported) return needsHostUpdate;
    if (keys.isError) return copy("Bilgisayardan okunamadı; bağlantıyı kontrol et", "Could not read from the computer; check the connection");
    if (!keys.isSuccess) return copy("Bilgisayar kontrol ediliyor…", "Checking the computer…");
    if (keys.data?.[provider] === undefined) return needsHostUpdate;
    if (provider === "openai") return copy("Bilgisayarda Codex’e giriş yap (codex login)", "Sign in to Codex on the computer (codex login)");
    return keys.data.signIn?.xai === "expired"
      ? copy("Grok oturumu doldu; bilgisayarda Grok Build’i bir kez aç", "Grok sign-in expired; open Grok Build once on the computer")
      : copy("Bilgisayarda Grok Build’i aç ve giriş yap (grok login)", "Open Grok Build on the computer and sign in (grok login)");
  };
  const engines: { value: SpeechEngine; label: string; detail?: string; disabled?: boolean }[] = [
    { value: "supertonic", label: copy("Doğal", "Natural"),
      detail: localSupported ? `Supertonic · ${copy("Hızlı ve gizli: {p0} işlemcisinde çalışır.", "Fast and private: runs on the processor of {p0}.", { p0: machine?.name ?? "" })}` : needsHostUpdate,
      disabled: !localSupported },
    { value: "voxcpm2", label: copy("Yüksek kalite", "High quality"),
      detail: !localSupported ? needsHostUpdate : vox.data?.ready === false ? needsCloudSetup : `VoxCPM2 · ${copy("Daha zengin duyulur; NVIDIA ekran kartı gerekir.", "Sounds richer; needs an NVIDIA graphics card.")}`,
      disabled: !localSupported || vox.data?.ready === false },
    { value: "elevenlabs", label: "ElevenLabs",
      detail: elevenlabs ? copy("Doğal bulut sesi. Bilgisayardan yalnızca yanıt metni çıkar.", "Natural cloud voice. Only the reply text leaves this computer.")
        : !cloudSupported ? needsHostUpdate : needsElevenKey,
      disabled: !elevenlabs },
  ];
  return { machine, preferences, localSupported, cloudSupported, selectableModels, keys, models, openrouter, openai, xai, elevenlabs, needsCloudSetup, needsHostUpdate, signInNeeded, engines };
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
 * How a voice conversation runs. "Through the computer" recognizes speech and voices the reply on the
 * computer. Grok Voice and OpenAI Realtime are live speech-to-speech modes that also run on the computer,
 * with its own sign-in, while the phone is only microphone and speaker. The choice and the live speaker
 * are saved on the computer. A mode that cannot be chosen stays listed with the one step that enables it:
 * the sign-in to make on the computer, or the bycoda update that lets the computer relay it. A computer
 * with neither a sign-in nor the relay shows no row.
 */
function ConversationModeRows() {
  const copy = useCopy();
  const { machine, keys, openai, xai, needsHostUpdate, signInNeeded } = useVoiceAvailability();
  const relay = machine?.capabilities?.includes(VOICE_REALTIME_RELAY_CAPABILITY) === true;
  const call = useHostQuery<VoiceCallSettingsResult>(["voice", "call-settings"], "voice.call.settings.get", {}, { enabled: relay && (openai || xai) });
  const save = useHostMutation<VoiceCallSettingsResult>("voice.call.settings.set", ["voice", "call-settings"]);
  // Nothing is listed before the computer has answered, or when it has neither a sign-in nor the relay.
  if (!keys.isSuccess || (relay ? keys.data?.openai === undefined && keys.data?.xai === undefined : !openai && !xai)) return null;
  const settings = relay ? call.data?.settings : undefined;
  const signedIn = { grok: xai && (call.data?.signedIn.grok ?? true), openai: openai && (call.data?.signedIn.openai ?? true) };
  const live = copy("{p0} üzerinde çalışır; telefon mikrofon ve hoparlördür", "Runs on {p0}; the phone is microphone and speaker", { p0: machine?.name ?? "" });
  const unavailable = !relay || !settings || save.isPending;
  const liveMode = (value: "grok" | "openai", label: string, provider: "xai" | "openai") => ({
    value, label, detail: !signedIn[value] ? signInNeeded(provider) : relay ? live : needsHostUpdate, disabled: unavailable || !signedIn[value] });
  const options: { value: VoiceCallMode; label: string; detail?: string; disabled?: boolean }[] = [
    { value: "local", label: copy("Bilgisayar üzerinden", "Through the computer"),
      detail: copy("{p0} konuşmanı tanır ve yanıtı seslendirir", "{p0} recognizes your speech and voices the reply", { p0: machine?.name ?? "" }) },
    // A computer that cannot relay yet lists only the modes it is signed in to, as an update away.
    ...(relay || xai ? [liveMode("grok", "Grok Voice", "xai")] : []),
    ...(relay || openai ? [liveMode("openai", "OpenAI Realtime", "openai")] : []),
  ];
  const mode = settings?.mode ?? "local";
  const change = (patch: VoiceCallSettingsPatch) => { if (relay && settings && !save.isPending) save.mutate(patch); };
  const speakers = mode === "grok" || mode === "openai" ? SPEAKER_IDS[mode] : undefined;
  return <>
    <SelectField variant="row" label={copy("Görüşme şekli", "Call mode")} value={mode} options={options}
      error={save.isError ? copy("Seçim bilgisayara kaydedilemedi. Tekrar dene.", "The choice could not be saved on the computer. Try again.") : undefined}
      onChange={(value) => {
        const option = options.find(item => item.value === value);
        if (option && !option.disabled && option.value !== mode) change({ mode: option.value });
      }} />
    {speakers && settings ? (
      <SelectField variant="row" label={copy("Canlı konuşmacı", "Live speaker")} disabled={save.isPending}
        value={mode === "grok" ? settings.grokVoice : settings.openaiVoice}
        options={speakers.map(id => ({ value: id, label: id.charAt(0).toUpperCase() + id.slice(1) }))}
        onChange={(value) => {
          if (!speakers.includes(value)) return;
          change(mode === "grok" ? { grokVoice: value } : { openaiVoice: value });
        }} />
    ) : null}
  </>;
}

/**
 * The assistant's spoken reply, chosen as on the desktop from one list: Natural (Supertonic), High quality
 * (VoxCPM2) or ElevenLabs. Each option says what it needs from the computer; the speaker belongs to
 * Supertonic and is listed only while it is chosen. Nothing is synthesized on the phone.
 */
function ReplyVoiceRows() {
  const copy = useCopy();
  const { preferences, hydrated } = useVoicePreferences();
  const { engines } = useVoiceAvailability();
  const update = useVoiceUpdate();
  const natural = engines[0]!;
  return <>
    <SelectField variant="row" label={copy("Yanıt sesi", "Reply voice")} value={preferences.speech} disabled={!hydrated}
      options={engines.map(engine => ({ value: engine.value, label: engine.label, detail: engine.detail, disabled: engine.disabled }))}
      onChange={(value) => {
        const engine = engines.find(item => item.value === value);
        if (engine && !engine.disabled && engine.value !== preferences.speech) update({ speech: engine.value });
      }} />
    {preferences.speech === "supertonic" ? (
      <SelectField variant="row" label={copy("Konuşmacı", "Speaker")} value={preferences.speaker} disabled={!hydrated || natural.disabled}
        options={SUPERTONIC_SPEAKERS.map(speaker => ({ value: speaker, label: speakerName(speaker, copy) }))}
        onChange={(value) => {
          const chosen = SUPERTONIC_SPEAKERS.find(item => item === value);
          if (chosen) update({ speech: "supertonic", speaker: chosen });
        }} />
    ) : null}
  </>;
}

/** Settings → Voice assistant → Assistant's voice: how the assistant answers on calls from this phone. */
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
    <Section title={copy("Asistanın sesi", "Assistant's voice")}>
      <NavigationGroup>
        <ConversationModeRows />
        <ReplyVoiceRows />
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
    </Section>
  );
}

type Transcriber = TranscriptionEngine | "phone";

/**
 * Settings → Voice assistant → Speech to text: who turns the owner's speech into text. The computer's
 * engines (Whisper on the computer, or OpenAI, Grok and OpenRouter through the computer's sign-in) serve
 * both dictation and calls. "This phone" recognizes dictation on the phone itself; calls keep a
 * computer engine, chosen in the extra "In voice calls" row. `localModels` (the computer's model manager)
 * appears only while Whisper on the computer is in use, folded away.
 */
export function DictationGroup({ localModels }: { localModels?: ReactNode }) {
  const copy = useCopy();
  const linkDown = useActiveHostLinkDown();
  const { machine, preferences, localSupported, selectableModels, keys, models, openrouter, openai, xai, needsHostUpdate, signInNeeded } = useVoiceAvailability();
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
  const signIn = copy("Bilgisayardaki oturumla", "With the computer's sign-in");
  // Grok has one transcription model, so its row names it; OpenAI's models are the row below.
  const grokModel = DICTATION_MODELS.xai[0]!.label;
  const computerEngines: { value: TranscriptionEngine; label: string; detail?: string; disabled?: boolean }[] = [
    { value: "local", label: copy("{p0} (Whisper)", "{p0} (Whisper)", { p0: machine.name }),
      detail: localSupported ? copy("Bilgisayarında çalışır", "Runs on your computer") : needsHostUpdate, disabled: !localSupported },
    { value: "openai", label: "OpenAI", detail: openai ? signIn : signInNeeded("openai"), disabled: !openai },
    { value: "xai", label: "Grok", detail: xai ? `${grokModel} · ${signIn}` : signInNeeded("xai"), disabled: !xai },
    { value: "cloud", label: "OpenRouter", detail: openrouter ? copy("Bilgisayardaki anahtarla", "With the computer's key")
      : copy("Bilgisayarda OpenRouter anahtarı gerekli", "Needs an OpenRouter key on the computer"), disabled: !openrouter },
  ];
  const transcribers: { value: Transcriber; label: string; detail?: string; disabled?: boolean }[] = [
    { value: "phone", label: copy("Bu telefon (cihaz içi)", "This phone (on-device)"),
      detail: copy("Yalnızca sesle yazma; görüşmeler bilgisayarda kalır", "Dictation only; calls stay on the computer") },
    ...computerEngines,
  ];
  const chooseComputer = (engine: string, patch: Partial<VoicePreferences> = {}) => {
    const choice = computerEngines.find(item => item.value === engine && !item.disabled);
    if (choice) update({ engine: choice.value, ...patch });
  };
  return (
    <Section title={copy("Konuşmanı yazıya çevirme", "Speech to text")}>
      <NavigationGroup>
        <SelectField variant="row" label={copy("Yazıya çeviren", "Transcribed by")}
          hint={copy("Söylediklerini metne çevirir. Asistanın sesini değiştirmez.", "Turns what you say into text. It does not change the assistant's voice.")}
          value={preferences.phoneDictation ? "phone" : preferences.engine}
          disabled={!hydrated} options={transcribers}
          onChange={value => value === "phone" ? update({ phoneDictation: true }) : chooseComputer(value, { phoneDictation: false })} />
        {preferences.phoneDictation ? (
          <SelectField variant="row" label={copy("Sesli görüşmelerde", "In voice calls")}
            hint={copy("Telefon yalnızca sesle yazmayı çevirir. Görüşmelerde konuşmanı bilgisayar çevirir.", "The phone transcribes dictation only. In calls, the computer transcribes your speech.")}
            value={preferences.engine} disabled={!hydrated} options={computerEngines}
            onChange={value => chooseComputer(value)} />
        ) : null}
        {preferences.engine === "local" && localSupported && selectableModels ? (
          <SelectField variant="row" label={copy("Yazıya çevirme modeli", "Transcription model")}
            value={installed.some(model => model.id === preferences.whisperModel) ? preferences.whisperModel ?? "" : ""}
            disabled={!hydrated || !installed.length}
            options={[{ value: "", label: copy("Otomatik", "Automatic") }, ...installed.map(model => ({ value: model.id, label: model.label }))]}
            onChange={value => update({ whisperModel: value === "small" || value === "turbo" ? value : undefined })} />
        ) : null}
        {preferences.engine === "cloud" && openrouter && selectableModels ? (
          <SelectField variant="row" label={copy("Yazıya çevirme modeli", "Transcription model")} value={preferences.cloudModel ?? ""}
            disabled={!hydrated || !cloudModels.data?.length}
            options={[{ value: "", label: copy("Otomatik", "Automatic") }, ...(cloudModels.data ?? []).map(model => ({ value: model.id, label: model.label }))]}
            onChange={value => update({ cloudModel: value || undefined })} />
        ) : null}
        {preferences.engine === "openai" && openai ? (
          <SelectField variant="row" label={copy("Yazıya çevirme modeli", "Transcription model")} value={preferences.openaiModel ?? ""}
            disabled={!hydrated}
            options={[{ value: "", label: copy("Otomatik", "Automatic") }, ...DICTATION_MODELS.openai.map(model => ({ value: model.id, label: model.label }))]}
            onChange={value => update({ openaiModel: value || undefined })} />
        ) : null}
        {/* The desktop's dictation settings: the language here, the rest on Dictation options. */}
        <DictationRows preferences={normalizeDictationPreferences(preferences)} disabled={!hydrated}
          onLanguage={dictationLanguage => update({ dictationLanguage })} />
      </NavigationGroup>
      {preferences.engine === "local" && localSupported ? <QueryState query={models} loading="inline" compact /> : null}
      {preferences.engine === "cloud" && openrouter && selectableModels ? <QueryState query={cloudModels} loading="inline" compact /> : null}
      {!linkDown && recognitionReady && !selectableModels ? <StateView size="compact" title={needsHostUpdate} /> : null}
      {preferences.engine === "cloud" && keys.isSuccess && !openrouter ? (
        <Notice tone="warning" message={copy("OpenRouter seçili ama bilgisayarda anahtar yok; konuşman anlaşılamaz. {p0} seç.", "OpenRouter is selected but the computer has no key, so your speech cannot be understood. Choose {p0}.", { p0: machine.name })} />
      ) : null}
      {preferences.engine === "local" ? localModels : null}
    </Section>
  );
}

/** Wait before replying and the owner's own turn end, as select row and switch. */
function TurnRows() {
  const copy = useCopy(), locale = useLocale();
  const { preferences, hydrated } = useVoicePreferences();
  const update = useVoiceUpdate();
  const seconds = new Intl.NumberFormat(locale);
  return <>
    <SelectField variant="row" label={copy("Yanıtlamadan önce bekle", "Wait before replying")}
      value={String(preferences.turnPause)} disabled={!hydrated || preferences.manualTurnEnd}
      options={TURN_PAUSES.map(pause => ({ value: String(pause), label: turnPauseLabel(pause, copy),
        detail: copy("{p0} saniye", "{p0} seconds", { p0: seconds.format(pause) }) }))}
      onChange={value => { const pause = TURN_PAUSES.find(item => String(item) === value); if (pause) update({ turnPause: pause }); }} />
    <ToggleField label={copy("Sıramı elle bitir", "End my turn myself")}
      help={copy("Sessizlik dinlemeyi bitirmez; bitirince görüşmede Gönder’e dokun.", "Silence keeps listening. Tap Send in the call when you are done.")}
      value={preferences.manualTurnEnd} disabled={!hydrated}
      onChange={manualTurnEnd => update({ manualTurnEnd })} />
  </>;
}

/** Settings → Voice assistant → Conversation style: turn taking, with the desktop's words. */
export function ConversationStyleGroup() {
  const copy = useCopy();
  return (
    <Section title={copy("Görüşme tarzı", "Call style")}>
      <NavigationGroup>
        <TurnRows />
      </NavigationGroup>
    </Section>
  );
}
