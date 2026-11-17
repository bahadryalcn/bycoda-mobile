import { useState } from "react";
import { useActiveMachine } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { View } from "react-native";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import AudioLines from "lucide-react-native/icons/audio-lines";
import { Button, ConfirmationCard, ErrorNotice, IconButton, NavigationGroup, NavigationRow, Notice, QueryState, SectionHeader, SegmentedRow, SettingIcon, Sheet, Stack, ValueRow } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { formatBytes } from "../settings/local-data-sizes";
import { cloudAvailable, downloadPercent, modelBusy, modelRowState, parseLocalModels, parseModelJob, type LocalVoiceModel, type ModelAction } from "./voice-models-model";
import { moveMic, useVoicePreferences, voicePreferences, type MicKind } from "./voice-preferences";

/** Settings → Voice: transcription engine, this computer's dictation models and microphone priority. */
export function VoiceSettings() {
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const { preferences } = useVoicePreferences();
  return (
    <>
      <NavigationGroup>
        <NavigationRow
          label={copy("Ses", "Voice")}
          icon={<SettingIcon glyph={AudioLines} />}
          detail={preferences.engine === "cloud" ? copy("Bulut yazıya dökme", "Cloud transcription") : copy("Bu bilgisayarda yazıya dökme", "On this computer")}
          onPress={() => setOpen(true)}
        />
      </NavigationGroup>
      <Sheet visible={open} title={copy("Ses", "Voice")} size="form" onClose={() => setOpen(false)}>
        {open ? <VoiceSettingsBody /> : null}
      </Sheet>
    </>
  );
}

function VoiceSettingsBody() {
  const copy = useCopy();
  const machine = useActiveMachine();
  const { preferences, hydrated } = useVoicePreferences();
  const localSupported = machine?.capabilities?.includes("voice.local.v1") === true;
  const cloudSupported = machine?.capabilities?.includes("voice.cloud.v1") === true;
  const cloud = useHostQuery<unknown>(["voice", "cloud"], "voice.cloud.status", {}, { enabled: cloudSupported });
  const cloudReady = cloudSupported && cloudAvailable(cloud.data);
  const setEngine = (engine: "local" | "cloud") => void voicePreferences.getState().update({ engine }).catch(() => undefined);
  return (
    <Stack>
      <SectionHeader title={copy("Yazıya dökme motoru", "Transcription engine")} />
      <NavigationGroup>
        <SegmentedRow
          label={copy("Motor", "Engine")}
          help={cloudReady ? undefined : copy("Bulut için bilgisayarda OpenRouter anahtarı gerekir.", "Cloud needs an OpenRouter key on the computer.")}
          value={preferences.engine}
          disabled={!hydrated}
          options={[
            { value: "local" as const, label: copy("Bu bilgisayarda", "On this computer") },
            { value: "cloud" as const, label: copy("Bulut", "Cloud"), disabled: !cloudReady },
          ]}
          onChange={setEngine}
        />
      </NavigationGroup>
      {preferences.engine === "cloud" && !cloudReady && !cloud.isLoading ? (
        <Notice tone="warning" message={copy("Bulut kullanılamıyor; bilgisayara anahtar ekleyene kadar dikte çalışmaz.", "Cloud is unavailable; dictation will not work until a key is added on the computer.")} />
      ) : null}
      <LocalModels supported={localSupported} />
      <MicrophonePriority order={preferences.micOrder} disabled={!hydrated} />
    </Stack>
  );
}

function LocalModels({ supported }: { supported: boolean }) {
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
  const busy = modelBusy(job) || action.isPending;
  const run = (model: LocalVoiceModel, kind: ModelAction) => void action.mutateAsync({ action: kind, id: model.id }).catch(() => undefined);
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
      <SectionHeader title={copy("Ses modelleri", "Voice models")} />
      {!supported ? <Notice message={copy("Ses modelleri için bilgisayardaki bycoda’yı güncelleyin.", "Update bycoda on this computer for voice models.")} /> : <>
        {setup.data?.state === "installing" ? <Notice tone="info" message={copy("Ses kurulumu sürüyor.", "Voice setup is running.")} /> : null}
        <QueryState query={models} />
        {models.data?.map((model) => {
          const state = modelRowState(model, job);
          const working = state === "downloading" || state === "testing" || state === "removing";
          return (
            <Stack key={model.id} style={{ gap: 0 }}>
              <NavigationGroup>
                <ValueRow label={model.sizeBytes ? `${model.label} · ${formatBytes(model.sizeBytes)}` : model.label} value={label(model)} />
              </NavigationGroup>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingTop: space.sm }}>
                {working ? <Button label={copy("İptal", "Cancel")} tone="quiet" busy={cancel.isPending} onPress={() => void cancel.mutateAsync({}).catch(() => undefined)} />
                  : model.installed ? <>
                    <Button label={copy("Sına", "Test")} tone="quiet" disabled={busy} onPress={() => run(model, "test")} />
                    <Button label={copy("Kaldır", "Remove")} tone="danger" disabled={busy} onPress={() => setConfirming(model)} />
                  </> : <Button label={copy("İndir", "Download")} disabled={busy} onPress={() => run(model, "download")} />}
              </View>
              {confirming?.id === model.id ? (
                <ConfirmationCard
                  message={copy("{p0} bu bilgisayardan silinsin mi? Yeniden indirmek gerekir.", "Remove {p0} from this computer? You would need to download it again.", { p0: model.label })}
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
  const move = (kind: MicKind, delta: -1 | 1) => void voicePreferences.getState().update({ micOrder: moveMic(order, kind, delta) }).catch(() => undefined);
  return (
    <Stack>
      <SectionHeader title={copy("Mikrofon önceliği", "Microphone priority")} />
      <NavigationGroup>
        {order.map((kind, index) => (
          <ValueRow
            key={kind}
            label={`${index + 1}. ${names[kind]}`}
            trailing={
              <View style={{ flexDirection: "row" }}>
                <IconButton label={copy("{p0} yukarı", "Move {p0} up", { p0: names[kind] })} disabled={disabled || index === 0} onPress={() => move(kind, -1)}>
                  <ChevronUp size={18} color={colors.muted} />
                </IconButton>
                <IconButton label={copy("{p0} aşağı", "Move {p0} down", { p0: names[kind] })} disabled={disabled || index === order.length - 1} onPress={() => move(kind, 1)}>
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
