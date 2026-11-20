import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { PreferenceStorageNotice } from "@/ui/preference-storage-notice";
import { View } from "react-native";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import AudioLines from "lucide-react-native/icons/audio-lines";
import { Button, ConfirmationCard, ErrorNotice, IconButton, NavigationGroup, NavigationRow, Notice, QueryState, SectionHeader, SegmentedRow, SettingIcon, Sheet, Stack, ValueRow } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { useSheetGuard } from "@/ui/sheet-guard";
import { space } from "@/ui/tokens";
import { formatBytes } from "../settings/local-data-sizes";
import { downloadPercent, modelBusy, modelRowState, parseLocalModels, parseModelJob, type LocalVoiceModel, type ModelAction } from "./voice-models-model";
import { speechSummary, VoiceChoices } from "./voice-choices";
import { moveVisibleMic, useVoicePreferences, visibleMics, voicePreferences, type MicKind } from "./voice-preferences";

/** Settings → Voice: speech recognition, the assistant's voice, this computer's models and microphone priority. */
export function VoiceSettings() {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const { preferences } = useVoicePreferences();
  const computer = useActiveMachine()?.name;
  return (
    <>
      <NavigationRow
        label={copy("Ses", "Voice")}
        icon={<SettingIcon glyph={AudioLines} />}
        detail={`${speechSummary(preferences.speech, preferences.speaker, copy)} · ${preferences.engine === "cloud" ? copy("Bulut", "Cloud") : computer ?? copy("Bağlı bilgisayar", "Connected computer")}`}
        onPress={() => setOpen(true)}
      />
      <Sheet visible={open} title={copy("Ses", "Voice")} size="form" onClose={() => setOpen(false)}>
        {open ? <VoiceSettingsBody /> : null}
      </Sheet>
    </>
  );
}

function VoiceSettingsBody() {
  const copy = useCopy();
  const { requestCloseThen } = useSheetGuard({});
  const machine = useActiveMachine();
  const hydratedMachines = useMachines((state) => state.hydrated);
  const connectionPending = useMachines((state) => state.connectionPending);
  const storageError = useMachines((state) => state.storageError);
  const { preferences, hydrated, storageError: preferenceError, retry: retryPreference } = useVoicePreferences();
  const localSupported = machine?.capabilities?.includes("voice.local.v1") === true;
  const waitingForComputer = !hydratedMachines || (!machine && connectionPending);
  return (
    <Stack>
      <PreferenceStorageNotice error={preferenceError} retry={retryPreference} />
      {storageError || waitingForComputer ? (
        <QueryState query={{ error: storageError, isLoading: waitingForComputer }} loading="content" />
      ) : !machine ? (
        <Button
          label={copy("Bilgisayar bağla", "Connect a computer")}
          onPress={() => requestCloseThen(() => router.navigate("/machines"))}
        />
      ) : (
      <>
      <VoiceChoices />
      <LocalModels key={machine.id} supported={localSupported} computer={machine.name} />
      </>
      )}
      <MicrophonePriority order={preferences.micOrder} disabled={!hydrated} />
    </Stack>
  );
}

function LocalModels({ supported, computer }: { supported: boolean; computer: string }) {
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
  const run = (model: LocalVoiceModel, kind: ModelAction) => void action.mutateAsync({ action: kind, id: model.id })
    .then(() => status.refetch())
    .then((result) => { if (!modelBusy(parseModelJob(result.data))) return models.refetch(); })
    .catch(() => undefined);
  const label = (model: LocalVoiceModel) => {
    switch (modelRowState(model, job)) {
      case "downloading": {
        const percent = downloadPercent(job);
        return percent === undefined ? copy("İndiriliyor…", "Downloading…") : `${copy("İndiriliyor…", "Downloading…")} ${percent}% · ${formatBytes(job.bytesDone ?? 0)} / ${formatBytes(job.bytesTotal ?? 0)}`;
      }
      case "testing": return copy("Sınanıyor…", "Testing…");
      case "removing": return copy("Kaldırılıyor…", "Removing…");
      case "installed": return copy("Yüklü", "Installed");
      case "failed": return job.detail ?? copy("İşlem başarısız", "Action failed");
      default: return copy("Yüklü değil", "Not installed");
    }
  };
  return (
    <Stack>
      <SectionHeader title={copy("{p0} üzerindeki ses modelleri", "Voice models on {p0}", { p0: computer })} />
      {!supported ? <Notice message={copy("Ses modelleri için {p0} üzerindeki bycoda’yı güncelleyin.", "Update bycoda on {p0} for voice models.", { p0: computer })} /> : <>
        {setup.data?.state === "installing" ? <Notice tone="info" message={copy("Ses kurulumu sürüyor.", "Voice setup is running.")} /> : null}
        <QueryState query={models} />
        {models.data?.map((model) => {
          const state = modelRowState(model, job);
          const working = state === "downloading" || state === "testing" || state === "removing";
          return (
            <Stack key={model.id} style={{ gap: 0 }}>
              <NavigationGroup>
                <ValueRow label={model.sizeBytes ? `${model.label} · ${formatBytes(model.sizeBytes)}` : model.label}
                  value={modelRowState(model, job) === "installed" ? copy("{p0} üzerinde yüklü", "Installed on {p0}", { p0: computer }) : label(model)} />
              </NavigationGroup>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingTop: space.sm }}>
                {working ? <Button label={copy("İptal", "Cancel")} tone="quiet" busy={cancel.isPending} onPress={() => void cancel.mutateAsync({}).catch(() => undefined)} />
                  : model.installed ? <>
                    <Button label={copy("Sına", "Test")} tone="quiet" disabled={busy} onPress={() => run(model, "test")} />
                    <Button label={copy("Kaldır", "Remove")} tone="danger" disabled={busy} onPress={() => setConfirming(model)} />
                  </> : <Button label={copy("{p0} üzerine indir", "Download to {p0}", { p0: computer })} disabled={busy} onPress={() => run(model, "download")} />}
              </View>
              {confirming?.id === model.id ? (
                <ConfirmationCard
                  message={copy("{p0}, {p1} üzerinden silinsin mi? Yeniden indirmek gerekir.", "Remove {p0} from {p1}? You would need to download it again.", { p0: model.label, p1: computer })}
                  cancelLabel={copy("Vazgeç", "Cancel")}
                  confirmLabel={copy("Kaldır", "Remove")}
                  onCancel={() => setConfirming(null)}
                  onConfirm={() => { setConfirming(null); run(model, "delete"); }}
                />
              ) : null}
            </Stack>
          );
        })}
        {action.error ? <ErrorNotice error={action.error} /> : null}
      </>}
    </Stack>
  );
}

function MicrophonePriority({ order, disabled }: { order: MicKind[]; disabled: boolean }) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const names: Record<MicKind, string> = {
    wired: copy("Kablolu", "Wired"),
    bluetooth: copy("Bluetooth", "Bluetooth"),
    builtin: copy("Yerleşik", "Built-in"),
    carplay: copy("CarPlay", "CarPlay"),
  };
  const os = process.env.EXPO_OS;
  const visible = visibleMics(order, os);
  const move = (kind: MicKind, delta: -1 | 1) => void voicePreferences.getState().update({ micOrder: moveVisibleMic(order, os, kind, delta) });
  return (
    <Stack>
      <SectionHeader title={copy("Mikrofon önceliği", "Microphone priority")} />
      <NavigationGroup>
        {visible.map((kind, index) => (
          <ValueRow
            key={kind}
            label={`${index + 1}. ${names[kind]}`}
            trailing={
              <View style={{ flexDirection: "row" }}>
                <IconButton label={copy("{p0} yukarı", "Move {p0} up", { p0: names[kind] })} disabled={disabled || index === 0} onPress={() => move(kind, -1)}>
                  <ChevronUp size={18} color={colors.muted} />
                </IconButton>
                <IconButton label={copy("{p0} aşağı", "Move {p0} down", { p0: names[kind] })} disabled={disabled || index === visible.length - 1} onPress={() => move(kind, 1)}>
                  <ChevronDown size={18} color={colors.muted} />
                </IconButton>
              </View>
            }
          />
        ))}
      </NavigationGroup>
    </Stack>
  );
}
