import { useEffect, useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import { isReviewedMachine } from "@/state/reviewed-machine";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { Body, Button, FormActions, IconButton, MutationState, Notice, QueryState, Row, ScopeLine, StateView, StatusLine, StatusRow, StatusText, Sheet, Stack, ToggleField } from "@/ui/primitives";
import RefreshCw from "lucide-react-native/icons/refresh-cw";
import { useMobileTheme } from "@/ui/theme";
import { useCopy } from "@/ui/copy";
import { iconSize, space } from "@/ui/tokens";
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
  const confirmedStatus = supported && !status.error && status.fetchStatus !== "paused" ? status.data : undefined;
  const serviceAction = confirmedStatus?.running
    ? "stop"
    : confirmedStatus?.installed ? "start" : confirmedStatus ? "setup" : undefined;
  const canStop = !!impactSupported && !impact.isFetching && !impact.error &&
    impact.fetchStatus !== "paused" && impact.data?.activeCount === 0;
  const actionsDisabled = busy || uncertain || status.isFetching;
  const confirmable = (kind: typeof review) => !actionsDisabled && !!confirmedStatus &&
    (kind === "setup" || kind === serviceAction && (kind !== "stop" || canStop));
  const canConfirm = confirmable(review);
  const refreshing = preflight.isFetching || status.isFetching || !!impactSupported && impact.isFetching;
  const checks = supported ? preflight.data?.checks : undefined;
  const currentAccess = !!checks?.agentControl;
  const showAgentToggle = !!confirmedStatus?.installed && !!checks && !review && !uncertain;
  // The toggle starts from what the computer has now; Confirm only appears once it differs.
  useEffect(() => { if (!review) setAgentAccess(currentAccess); }, [currentAccess, review]);
  const accessChanged = !!checks && serviceAction !== "setup" && agentAccess !== currentAccess;
  const reviewSetup = () => { setAgentAccess(false); setReview("setup"); };
  const run = (kind: typeof review = review) => {
    if (!kind || !confirmable(kind) || !current() || occupied.current) return;
    const mutation = kind === "setup" ? setup : kind === "stop" ? stop : start;
    occupied.current = true;
    void mutation.mutateAsync({ projectId: opening.projectId, ...(kind === "setup" ? { agentAccess } : {}) }).then(() => {
      if (current()) { setReview(undefined); void preflight.refetch(); void status.refetch(); if (impactSupported) void impact.refetch(); }
    }).catch((error: unknown) => {
      if (error && typeof error === "object" && "uncertain" in error && error.uncertain === true) setUncertain(true);
    }).finally(() => { occupied.current = false; });
  };
  return <Sheet visible title={copy("Cihaz servisi", "Device service")} size="form" dismissible={!busy} onClose={onClose}>
    <Row style={{ flexWrap: "nowrap", alignItems: "center", justifyContent: "space-between" }}>
      <ScopeLine scope={{ computer: machine?.name }} />
      <IconButton label={copy("Yenile", "Refresh")} busy={refreshing}
        disabled={!supported || busy || refreshing}
        onPress={() => { void preflight.refetch(); void status.refetch(); if (impactSupported) void impact.refetch(); }}>
        <RefreshCw size={iconSize.action} strokeWidth={2} color={colors.accent} />
      </IconButton>
    </Row>
    {!supported ? <StateView illustration="permission" title={copy("Güncelleme gerekiyor", "Update needed")} description={copy("Seçili bilgisayar değişti veya bu özelliği desteklemiyor.", "The selected computer changed or does not support this feature.")} /> : <><QueryState query={preflight} /><QueryState query={status} loading={preflight.data ? "inline" : "none"} /></>}
    {checks ? <Stack style={{ gap: space.xs }}>
      <StatusRow label={copy("Cihaz araçları", "Device tools")}><StatusText label={checks.sdk && checks.tools ? copy("Hazır", "Ready") : copy("Kurulum gerekli", "Setup required")} tone={checks.sdk && checks.tools ? "live" : "warning"} /></StatusRow>
      <StatusRow label={copy("Cihazlar", "Devices")}><StatusText label={checks.device ? copy("Hazır", "Ready") : copy("Kullanılamıyor", "Unavailable")} tone={checks.device ? "live" : "warning"} /></StatusRow>
      {!showAgentToggle && review !== "setup" ? <StatusRow label={copy("Ajan erişimi", "Agent access")}>
        <StatusText label={checks.agentControl ? copy("Açık", "On") : copy("Kapalı", "Off")} tone={checks.agentControl ? "live" : "default"} />
      </StatusRow> : null}
    </Stack> : null}
    {impactSupported ? <><QueryState query={impact} loading={serviceAction === "stop" ? "inline" : "none"} />{impact.data ? <>
      <StatusRow label={copy("Etkin önizleme işleri", "Active preview jobs")}><Body muted>{impact.data.activeCount}</Body></StatusRow>
      {impact.data.owned.map((job) => <StatusRow key={job.id} label={job.deviceId}>
        <StatusText label={job.state === "queued" ? copy("Sırada", "Queued") : copy("Çalışıyor", "Running")} tone="active" />
      </StatusRow>)}
      {impact.data.otherActiveCount ? <StatusRow label={copy("Diğer bağlamlardaki etkin işler", "Active jobs in other contexts")}><Body muted>{impact.data.otherActiveCount}</Body></StatusRow> : null}
    </> : null}</> : null}
    {/* One caution above the action area: an unknown outcome and the stop impact share it. */}
    {uncertain || review === "stop" ? <Notice tone="warning" message={[
      uncertain ? copy("İşlemin sonucu bilinmiyor. Yeniden göndermeden bilgisayardaki durumu kontrol edin.", "The operation outcome is unknown. Check the computer state before sending again.") : null,
      review === "stop" ? copy("Ortak cihaz servisi durur; diğer cihaz kontrolleri de etkilenir.", "The shared device service stops, affecting other device controls.") : null,
    ].filter(Boolean).join(" ")} /> : null}
    {review ? <>
      {review === "setup" ? <><Body muted>{copy("Cihaz araçları bu bilgisayara indirilip kurulur.", "Device tools are downloaded and installed on this computer.")}</Body>
        <ToggleField label={copy("Ajanlar cihazları kullanabilsin", "Let agents use devices")} help={copy("Açıkken bilgisayardaki ajanlar bu cihazları açıp kontrol edebilir.", "When on, agents on the computer can open and control these devices.")} value={agentAccess} onChange={setAgentAccess} disabled={busy || uncertain} /></> : null}
      <FormActions feedback={<><MutationState mutation={setup} /><MutationState mutation={start} /><MutationState mutation={stop} /></>}
        submitLabel={copy("Onayla", "Confirm")} cancelLabel={copy("Vazgeç", "Cancel")} busy={busy} disabled={!canConfirm} onSubmit={() => run()} onCancel={() => setReview(undefined)} />
    </> : !uncertain ? <>
      {serviceAction === "setup" ? <Button tone="primary" fullWidth label={copy("Cihaz araçlarını kur", "Set up device tools")} disabled={actionsDisabled} onPress={reviewSetup} /> : null}
      {serviceAction === "start" ? <Button tone="primary" fullWidth label={copy("Cihaz servisini başlat", "Start device service")} disabled={actionsDisabled} onPress={() => setReview("start")} /> : null}
      {serviceAction === "stop" && canStop ? <Button fullWidth label={copy("Cihaz servisini durdur", "Stop device service")} tone="danger" disabled={actionsDisabled} onPress={() => setReview("stop")} /> : null}
      {serviceAction === "stop" && !impactSupported ? <StatusLine tone="warning" label={copy("Durdurma etkisini görmek için güncelleme gerekiyor", "Update needed to show what stopping affects")} /> : null}
      {showAgentToggle ? <>
        <ToggleField label={copy("Ajanlar cihazları kullanabilsin", "Let agents use devices")} help={copy("Açıkken bilgisayardaki ajanlar bu cihazları açıp kontrol edebilir.", "When on, agents on the computer can open and control these devices.")}
          value={agentAccess} onChange={setAgentAccess} disabled={actionsDisabled} />
        {accessChanged ? <FormActions submitLabel={copy("Onayla", "Confirm")} cancelLabel={copy("Vazgeç", "Cancel")} busy={busy}
          disabled={!confirmable("setup")} onSubmit={() => run("setup")} onCancel={() => setAgentAccess(currentAccess)} /> : null}
      </> : null}
    </> : null}
    {!review ? <><MutationState mutation={setup} /><MutationState mutation={start} /><MutationState mutation={stop} /></> : null}
  </Sheet>;
}
