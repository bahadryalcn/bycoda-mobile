import { useEffect, useRef, useState } from "react";
import { router, type Href } from "expo-router";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { PreferenceStorageNotice } from "@/ui/preference-storage-notice";
import AudioLines from "lucide-react-native/icons/audio-lines";
import { ActionMenu, Body, Button, ConfirmationCard, Disclosure, ErrorNotice, NavigationGroup, NavigationRow, QueryState, ScopeLine, Section, SettingIcon, StateView, StatusText, ValueRow } from "@/ui/primitives";
import { formatBytes } from "../settings/local-data-sizes";
import { SettingsPage } from "../settings/settings-page";
import { downloadPercent, modelBusy, modelRowState, parseLocalModels, parseModelJob, type LocalVoiceModel, type ModelAction } from "./voice-models-model";
import { ConversationStyleGroup, DictationGroup, speechSummary, VoiceGroup } from "./voice-choices";
import { useVoicePreferences } from "./voice-preferences";
import { MicrophonePriority } from "./microphone-priority";
import { MicrophoneAccessRow } from "./microphone-access";

/** Where Settings → Voice assistant lives; the settings index and the assistant's settings both link here. */
export const VOICE_SETTINGS_ROUTE = "/settings/voice";

/**
 * The value of the Voice assistant row. It never claims a connection that does not exist: without a
 * computer it says what to do, with one it names the speaker (one fact, no joined pair).
 */
export function useVoiceSettingsSummary() {
  const copy = useCopy();
  const { preferences } = useVoicePreferences();
  const machine = useActiveMachine();
  if (!machine) return copy("Bilgisayar bağla", "Connect a computer");
  return copy("Ses: {p0}", "Voice: {p0}", { p0: speechSummary(preferences.speech, preferences.speaker, copy) });
}

/** Settings index row: opens the Voice assistant page. */
export function VoiceSettings() {
  const copy = useCopy();
  const summary = useVoiceSettingsSummary();
  return (
    <NavigationRow
      label={copy("Sesli asistan", "Voice assistant")}
      icon={<SettingIcon glyph={AudioLines} />}
      detail={summary}
      onPress={() => router.push(VOICE_SETTINGS_ROUTE as Href)}
    />
  );
}

/** Settings → Voice assistant: Microphone, Voice, Dictation and Conversation style, as the desktop groups them. */
export function VoiceSettingsScreen() {
  const copy = useCopy();
  return (
    <SettingsPage title={copy("Sesli asistan", "Voice assistant")}>
      <VoiceSettingsBody />
    </SettingsPage>
  );
}

export function VoiceSettingsBody() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const connection = useConnectionScope();
  const hydratedMachines = useMachines((state) => state.hydrated);
  const connectionPending = useMachines((state) => state.connectionPending);
  const storageError = useMachines((state) => state.storageError);
  const { preferences, hydrated, storageError: preferenceError, retry: retryPreference } = useVoicePreferences();
  const localSupported = machine?.capabilities?.includes("voice.local.v1") === true;
  const waitingForComputer = !hydratedMachines || (!machine && connectionPending);
  const ready = !!machine && !storageError && !waitingForComputer;
  // Screen's own gap spaces the groups; the computer these choices serve is the page's scope line.
  return (
    <>
      {ready ? <ScopeLine scope={{ computer: machine.name }} /> : null}
      <PreferenceStorageNotice error={preferenceError} retry={retryPreference} />
      {storageError || waitingForComputer ? (
        <QueryState query={{ error: storageError, isLoading: waitingForComputer }} loading="content" />
      ) : !machine ? (
        <StateView compact illustration="connect-computer"
          title={copy("Ses için bağlı bir bilgisayar gerekir", "Voice needs a connected computer")}
          description={copy("Konuşmanı tanıyan ve asistanı seslendiren bilgisayardır.", "The computer recognizes your speech and gives the assistant its voice.")}
          action={{ label: copy("Bilgisayar bağla", "Connect a computer"), onPress: () => router.navigate("/machines") }} />
      ) : null}
      {ready ? <VoiceGroup /> : null}
      <Section title={copy("Mikrofon", "Microphone")}>
        <NavigationGroup>
          <MicrophonePriority order={preferences.micOrder} disabled={!hydrated} />
          <MicrophoneAccessRow />
        </NavigationGroup>
      </Section>
      {ready ? <>
        <DictationGroup />
        <ConversationStyleGroup />
        <LocalModels key={connection.token} supported={localSupported} computer={machine.name} current={connection.isCurrent} />
        <Body muted>{copy(
          "Uyandırma sözcüklerini ve dikte sözlüğünü masaüstündeki Ses ayarlarından düzenleyebilirsin.",
          "Manage wake phrases and the dictation dictionary in Voice settings on desktop.",
        )}</Body>
      </> : null}
    </>
  );
}

/**
 * Dictation → Transcription models on the computer: one group, one row per model. Download is the row
 * action when a model is missing; Test and Remove sit in the row's menu once it is installed.
 */
function LocalModels({ supported, computer, current }: { supported: boolean; computer: string; current(): boolean }) {
  const copy = useCopy();
  const [confirming, setConfirming] = useState<LocalVoiceModel | null>(null);
  const models = useHostQuery<LocalVoiceModel[]>(["voice", "models"], "voice.local.models", {}, { enabled: supported,
    queryFn: async (client, signal) => parseLocalModels(await client.request("voice.local.models", {}, { signal })) });
  const status = useHostQuery(["voice", "modelStatus"], "voice.local.modelStatus", {}, { enabled: supported,
    // Poll only while the Host is downloading, testing or deleting.
    interval: (data) => (modelBusy(parseModelJob(data)) ? 1500 : false) });
  const setup = useHostQuery<{ state?: string }>(["voice", "setup"], "voice.local.setupStatus", {}, { enabled: supported });
  const action = useHostMutation("voice.local.modelAction", [["voice"]]);
  const cancel = useHostMutation("voice.local.modelCancel", [["voice"]]);
  const job = parseModelJob(status.data);
  const working = modelBusy(job);
  const busy = working || action.isPending;
  const wasWorking = useRef(false);
  // Reason: the Host finishes a download, test or removal on its own; when its job settles the
  // installed flags change, so the model list is read again instead of showing the old state.
  useEffect(() => {
    if (wasWorking.current && !working) void models.refetch();
    wasWorking.current = working;
  }, [working, models]);
  // A quick removal or test can finish before any poll sees it working: read the job once after the
  // Host accepts the action and refresh the list when it has already settled.
  const run = (model: LocalVoiceModel, kind: ModelAction) => {
    if (!current()) return;
    void action.mutateAsync({ action: kind, id: model.id })
      .then(() => current() ? status.refetch() : undefined)
      .then((result) => { if (current() && result && !modelBusy(parseModelJob(result.data))) return models.refetch(); })
      .catch(() => undefined);
  };
  const label = (model: LocalVoiceModel) => {
    switch (modelRowState(model, job)) {
      case "downloading": {
        const percent = downloadPercent(job);
        return percent === undefined ? copy("İndiriliyor…", "Downloading…") : `${copy("İndiriliyor…", "Downloading…")} ${percent}% · ${formatBytes(job.bytesDone ?? 0)} / ${formatBytes(job.bytesTotal ?? 0)}`;
      }
      case "testing": return copy("Sınanıyor…", "Testing…");
      case "removing": return copy("Kaldırılıyor…", "Removing…");
      case "installed": return copy("{p0} üzerinde yüklü", "Installed on {p0}", { p0: computer });
      case "failed": return job.detail ?? copy("İşlem başarısız", "Action failed");
      default: return copy("Yüklü değil", "Not installed");
    }
  };
  const activeModel = working ? models.data?.find(model => model.id === job.id) : undefined;
  return (
    <Disclosure
      label={copy("Yazıya dökme modelleri", "Transcription models")}
      defaultExpanded={working}
      detail={activeModel ? `${activeModel.label} · ${label(activeModel)}` : undefined}
    >
      {!supported ? <StateView size="compact" title={copy("Ses modelleri için {p0} üzerindeki bycoda’yı güncelleyin.", "Update bycoda on {p0} for voice models.", { p0: computer })} /> : <>
        {setup.data?.state === "installing" ? <StatusText tone="live" label={copy("Ses kurulumu sürüyor.", "Voice setup is running.")} /> : null}
        <QueryState query={models} loading="inline" compact />
        {models.data?.length ? <NavigationGroup>
          {models.data.map((model) => {
            const state = modelRowState(model, job);
            const rowWorking = state === "downloading" || state === "testing" || state === "removing";
            const name = model.sizeBytes ? `${model.label} · ${formatBytes(model.sizeBytes)}` : model.label;
            const trailing = rowWorking
              ? <Button label={copy("İptal", "Cancel")} tone="quiet" density="compact" busy={cancel.isPending} onPress={() => {
                if (current()) void cancel.mutateAsync({}).catch(() => undefined);
              }} />
              : model.installed
                ? <ActionMenu label={copy("{p0} işlemleri", "{p0} actions", { p0: model.label })} actions={[
                  { key: "test", label: copy("Sına", "Test"), disabled: busy, onPress: () => run(model, "test") },
                  { key: "remove", label: copy("Kaldır", "Remove"), destructive: true, disabled: busy, onPress: () => setConfirming(model) },
                ]} />
                : <Button label={copy("İndir", "Download")} tone="quiet" density="compact" disabled={busy}
                  accessibilityLabel={copy("{p0} modelini {p1} üzerine indir", "Download {p0} to {p1}", { p0: model.label, p1: computer })}
                  onPress={() => run(model, "download")} />;
            return <ValueRow key={model.id} label={name} trailing={trailing}>
              <Body muted>{label(model)}</Body>
            </ValueRow>;
          })}
        </NavigationGroup> : null}
        {confirming ? (
          <ConfirmationCard
            message={copy("{p0}, {p1} üzerinden silinsin mi? Yeniden indirmek gerekir.", "Remove {p0} from {p1}? You would need to download it again.", { p0: confirming.label, p1: computer })}
            cancelLabel={copy("Vazgeç", "Cancel")}
            confirmLabel={copy("Kaldır", "Remove")}
            onCancel={() => setConfirming(null)}
            onConfirm={() => { const model = confirming; setConfirming(null); run(model, "delete"); }}
          />
        ) : null}
        {action.error ? <ErrorNotice error={action.error} /> : null}
      </>}
    </Disclosure>
  );
}
