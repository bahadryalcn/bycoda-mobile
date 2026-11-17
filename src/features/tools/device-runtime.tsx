import { useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { isReviewedMachine } from "@/state/reviewed-machine";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { Body, Button, FormActions, IconButton, MutationState, Notice, QueryState, Row, StateView, StatusRow, Sheet, Stack, ToggleField } from "@/ui/primitives";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { useMobileTheme } from "@/ui/theme";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import type { DeviceHostStatus } from "./types";
import { readPreviewImpact, type PreviewImpact } from "./device-preview-model";

type Preflight = { checks: { sdk: boolean; device: boolean; tools: boolean; agentControl: boolean } };
export function DeviceRuntime({ projectId, deviceId, onClose }: { projectId: string; deviceId?: string; onClose: () => void }) {
  const copy = useCopy(); const machine = useActiveMachine(); const { colors } = useMobileTheme();
  const connection = useConnectionScope();
  const [openingConnection] = useState(connection);
  const [opening] = useState(() => ({ machineId: machine?.id, environmentId: machine?.environmentId, projectId, deviceId }));
  const [review, setReview] = useState<"setup" | "start" | "stop">(); const [agentAccess, setAgentAccess] = useState(false);
  const [uncertain, setUncertain] = useState(false); const occupied = useRef(false);
  const current = () => openingConnection.isCurrent() && isReviewedMachine(openingConnection.review, useMachines.getState()) &&
    !!opening.machineId && !!opening.environmentId && machine?.id === opening.machineId && machine.environmentId === opening.environmentId &&
    useMachines.getState().activeId === opening.machineId && projectId === opening.projectId && deviceId === opening.deviceId;
  const supported = current() && machine?.capabilities?.includes("device.host");
  const params = { projectId: opening.projectId, ...(opening.deviceId ? { deviceId: opening.deviceId } : {}) };
  const preflight = useHostQuery<Preflight>(["devices", "preflight", opening.projectId, opening.deviceId ?? "all"], "devices.preflight", params, { enabled: !!supported });
  const status = useHostQuery<DeviceHostStatus>(["devices", "status"], "devices.status", { projectId: opening.projectId }, { enabled: !!supported });
  const impactSupported = supported && machine?.capabilities?.includes("devices.preview.mobile.v1");
  const impact = useHostQuery<PreviewImpact>(["devices", "preview-impact", opening.projectId], "devices.preview.impact", { projectId: opening.projectId }, {
    enabled: !!impactSupported,
    queryFn: async (client, signal) => readPreviewImpact(await client.request("devices.preview.impact", { projectId: opening.projectId }, { signal })),
  });
  const setup = useHostMutation<DeviceHostStatus>("devices.setup", ["devices"]);
  const start = useHostMutation<DeviceHostStatus>("devices.start", ["devices"]);
  const stop = useHostMutation<DeviceHostStatus>("devices.stop", ["devices"]);
  const write = review === "setup" ? setup : review === "stop" ? stop : start;
  const busy = setup.isPending || start.isPending || stop.isPending;
  const run = () => {
    if (!review || !supported || !current() || busy || occupied.current || uncertain) return;
    if (review === "stop" && (!impactSupported || impact.isFetching || impact.data?.activeCount !== 0)) return;
    occupied.current = true;
    void write.mutateAsync({ projectId: opening.projectId, ...(review === "setup" ? { agentAccess } : {}) }).then(() => {
      if (current()) { setReview(undefined); void preflight.refetch(); void status.refetch(); if (impactSupported) void impact.refetch(); }
    }).catch((error: unknown) => {
      if (error && typeof error === "object" && "uncertain" in error && error.uncertain === true) setUncertain(true);
    }).finally(() => { occupied.current = false; });
  };
  const checks = supported ? preflight.data?.checks : undefined;
  return <Sheet visible title={copy("Cihaz servisi", "Device service")} size="form" dismissible={!busy} onClose={onClose}>
    <Row style={{ flexWrap: "nowrap", alignItems: "center", justifyContent: "space-between" }}>
      <Body muted style={{ flexShrink: 1 }}>{machine?.name}</Body>
      <IconButton label={copy("Yenile", "Refresh")} density="compact" busy={preflight.isFetching || status.isFetching || (impactSupported && impact.isFetching)}
        disabled={!supported || busy || preflight.isFetching}
        onPress={() => { void preflight.refetch(); void status.refetch(); if (impactSupported) void impact.refetch(); }}>
        <RefreshCw size={18} strokeWidth={2} color={colors.accent} />
      </IconButton>
    </Row>
    {!supported ? <StateView illustration="permission" title={copy("Güncelleme gerekiyor", "Update needed")} description={copy("Seçili bilgisayar değişti veya bu özelliği desteklemiyor.", "The selected computer changed or does not support this feature.")} /> : <><QueryState query={preflight} /><QueryState query={status} loading="none" /></>}
    {checks ? <Stack style={{ gap: space.xs }}>
      <StatusRow label="SDK"><Body muted>{checks.sdk ? copy("Hazır", "Ready") : copy("Kullanılamıyor", "Unavailable")}</Body></StatusRow>
      <StatusRow label={copy("Cihazlar", "Devices")}><Body muted>{checks.device ? copy("Hazır", "Ready") : copy("Kullanılamıyor", "Unavailable")}</Body></StatusRow>
      <StatusRow label={copy("Araçlar", "Tools")}><Body muted>{checks.tools ? copy("Hazır", "Ready") : copy("Kurulum gerekli", "Setup required")}</Body></StatusRow>
      <StatusRow label={copy("Ajan kontrolü", "Agent control")}><Body muted>{checks.agentControl ? copy("Etkin", "Enabled") : copy("Kapalı", "Off")}</Body></StatusRow>
    </Stack> : null}
    {impactSupported ? <><QueryState query={impact} loading="none" />{impact.data ? <>
      <StatusRow label={copy("Etkin önizleme işleri", "Active preview jobs")}><Body muted>{impact.data.activeCount}</Body></StatusRow>
      {impact.data.owned.map((job) => <Body key={job.id} mono>{job.deviceId} · {job.state}</Body>)}
      {impact.data.otherActiveCount ? <StatusRow label={copy("Diğer bağlamlardaki etkin işler", "Active jobs in other contexts")}><Body muted>{impact.data.otherActiveCount}</Body></StatusRow> : null}
    </> : null}</> : null}
    {uncertain ? <Notice tone="warning" message={copy("İşlemin sonucu bilinmiyor. Yeniden göndermeden bilgisayardaki durumu kontrol edin.", "The operation outcome is unknown. Check the computer state before sending again.")} /> : null}
    {review ? <>
      {review === "setup" ? <><Notice message={copy("Cihaz araçları bu bilgisayara indirilip kurulur.", "Device tools are downloaded and installed on this computer.")} />
        <ToggleField label={copy("Ajanların cihazları kontrol etmesine izin ver", "Allow agents to control devices")} value={agentAccess} onChange={setAgentAccess} disabled={busy || uncertain} /></> : null}
      {review === "stop" ? <Notice tone="warning" message={copy("Ortak cihaz servisi durur; diğer cihaz kontrolleri de etkilenir.", "The shared device service stops, affecting other device controls.")} /> : null}
      <FormActions feedback={<> <Body>{copy("Seçili bilgisayarda incelenen işlemi uygula?", "Apply the reviewed action on the selected computer?")}</Body> <MutationState mutation={setup} /><MutationState mutation={start} /><MutationState mutation={stop} /> </>}
        submitLabel={copy("Onayla", "Confirm")} cancelLabel={copy("Vazgeç", "Cancel")} busy={busy} disabled={!supported || uncertain} onSubmit={run} onCancel={() => setReview(undefined)} />
    </> : <>
      <Button tone="secondary" fullWidth label={copy("Cihaz araçlarını kur", "Set up device tools")} disabled={!supported || busy || uncertain || status.isFetching} onPress={() => { setAgentAccess(false); setReview("setup"); }} />
      <Button tone="primary" fullWidth label={copy("Cihaz servisini başlat", "Start device service")} disabled={!supported || busy || uncertain || !status.data?.installed || status.data.running} onPress={() => setReview("start")} />
      <Button fullWidth label={copy("Cihaz servisini durdur", "Stop device service")} tone="danger" disabled={!supported || busy || uncertain || !status.data?.running || !impactSupported || impact.isFetching || impact.data?.activeCount !== 0} onPress={() => setReview("stop")} />
    </>}
    {!review ? <><MutationState mutation={setup} /><MutationState mutation={start} /><MutationState mutation={stop} /></> : null}
  </Sheet>;
}
