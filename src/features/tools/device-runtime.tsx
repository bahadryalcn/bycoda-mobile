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
import type { DeviceHostStatus, DeviceSummary } from "./types";
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
  // Running previews name their device; the list is the one the device page already reads.
  const deviceList = useHostQuery<{ devices: DeviceSummary[] }>(["devices", "list"], "devices.list", { projectId: opening.projectId }, {
    enabled: !!impactSupported && (impact.data?.owned.length ?? 0) > 0,
  });
  const deviceName = (id: string) => deviceList.data?.devices?.find((device) => device.id === id)?.name ?? id;
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
  const agentDetail = copy(
    "Açıkken bu bilgisayardaki ajanlar (örneğin bir oturumdaki kodlama ajanı) emülatörleri açıp ekrana dokunabilir ve yazabilir. Kapalıyken cihazları yalnızca sen kullanırsın.",
    "When on, agents on this computer (such as the coding agent in a session) can open emulators, tap and type on them. When off, only you use the devices.",
  );
  const activeJobs = impact.data?.activeCount ?? 0;
  const serviceState = serviceAction === "stop"
    ? { label: copy("Çalışıyor", "Running"), tone: "live" as const,
      detail: copy("Emülatör başlatma ve Expo önizlemeleri kullanılabilir.", "Emulators can be started and Expo previews can run.") }
    : serviceAction === "start"
      ? { label: copy("Durdu", "Stopped"), tone: "default" as const,
        detail: copy(
          "Emülatör başlatmak ve Expo önizlemesi için gerekir. Açık bir cihazı görmek ve kullanmak çoğu bilgisayarda onsuz da çalışır.",
          "Needed to start emulators and run Expo previews. Viewing and using a running device usually works without it.",
        ) }
      : serviceAction === "setup"
        ? { label: copy("Kurulmadı", "Not set up"), tone: "warning" as const,
          detail: copy(
            "Cihaz araçları bu bilgisayarda henüz yok. Kurulum emülatör başlatmayı, önizlemeyi ve cihaz kontrolünü açar.",
            "Device tools are not on this computer yet. Setting them up enables starting emulators, previews and device control.",
          ) }
        : undefined;
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
    {serviceState ? <Stack style={{ gap: space.xs }}>
      <StatusRow label={copy("Durum", "Status")}><StatusText label={serviceState.label} tone={serviceState.tone} /></StatusRow>
      <Body muted>{serviceState.detail}</Body>
    </Stack> : null}
    {/* Only problems are listed: a list of "Ready" rows next to a Start button read as a contradiction. */}
    {checks && !checks.sdk ? <StatusLine tone="warning" label={copy("Bu bilgisayarda Android SDK veya Xcode bulunamadı.", "Android SDK or Xcode wasn't found on this computer.")} /> : null}
    {checks && checks.sdk && !checks.device ? <StatusLine tone="warning" label={copy("Cihaz bulunamadı. Bir emülatör başlat veya cihaz bağla.", "No device found. Start an emulator or connect a device.")} /> : null}
    {impactSupported ? <><QueryState query={impact} loading={serviceState && serviceAction === "stop" ? "inline" : "none"} />{impact.data && activeJobs > 0 ? <>
      <StatusRow label={copy("Çalışan önizlemeler", "Running previews")}><Body muted>{activeJobs}</Body></StatusRow>
      {impact.data.owned.map((job) => <StatusRow key={job.id} label={deviceName(job.deviceId)}>
        <StatusText label={job.state === "queued" ? copy("Sırada", "Queued") : copy("Çalışıyor", "Running")} tone="active" />
      </StatusRow>)}
      {serviceAction === "stop" ? <Body muted>{copy("Servis, önizlemeler bitince durdurulabilir.", "The service can be stopped once the previews finish.")}</Body> : null}
    </> : null}</> : null}
    {/* One caution above the action area: an unknown outcome and the stop impact share it. */}
    {uncertain || review === "stop" ? <Notice tone="warning" message={[
      uncertain ? copy("İşlemin sonucu bilinmiyor. Yeniden göndermeden bilgisayardaki durumu kontrol edin.", "The operation outcome is unknown. Check the computer state before sending again.") : null,
      review === "stop" ? copy("Ortak cihaz servisi durur; diğer cihaz kontrolleri de etkilenir.", "The shared device service stops, affecting other device controls.") : null,
    ].filter(Boolean).join(" ")} /> : null}
    {review ? <>
      {review === "setup" ? <><Body muted>{copy("Cihaz araçları bu bilgisayara indirilip kurulur.", "Device tools are downloaded and installed on this computer.")}</Body>
        <ToggleField label={copy("Ajanlar cihazları kullanabilsin", "Let agents use devices")} detail={agentDetail} value={agentAccess} onChange={setAgentAccess} disabled={busy || uncertain} /></> : null}
      {review === "start" ? <Body muted>{copy("Servis bu bilgisayarda başlar ve açık kalır.", "The service starts on this computer and keeps running.")}</Body> : null}
      <FormActions feedback={<><MutationState mutation={setup} /><MutationState mutation={start} /><MutationState mutation={stop} /></>}
        submitLabel={review === "setup" ? copy("Cihaz araçlarını kur", "Set up device tools")
          : review === "stop" ? copy("Cihaz servisini durdur", "Stop device service")
            : copy("Cihaz servisini başlat", "Start device service")}
        cancelLabel={copy("Vazgeç", "Cancel")} busy={busy} disabled={!canConfirm} onSubmit={() => run()} onCancel={() => setReview(undefined)} />
    </> : !uncertain ? <>
      {serviceAction === "setup" ? <Button tone="primary" fullWidth label={copy("Cihaz araçlarını kur", "Set up device tools")} disabled={actionsDisabled} onPress={reviewSetup} /> : null}
      {serviceAction === "start" ? <Button tone="primary" fullWidth label={copy("Cihaz servisini başlat", "Start device service")} disabled={actionsDisabled} onPress={() => setReview("start")} /> : null}
      {serviceAction === "stop" && canStop ? <Button fullWidth label={copy("Cihaz servisini durdur", "Stop device service")} tone="danger" disabled={actionsDisabled} onPress={() => setReview("stop")} /> : null}
      {serviceAction === "stop" && !impactSupported ? <StatusLine tone="warning" label={copy("Durdurma etkisini görmek için güncelleme gerekiyor", "Update needed to show what stopping affects")} /> : null}
      {showAgentToggle ? <>
        <ToggleField label={copy("Ajanlar cihazları kullanabilsin", "Let agents use devices")} detail={agentDetail}
          value={agentAccess} onChange={setAgentAccess} disabled={actionsDisabled} />
        {accessChanged ? <FormActions submitLabel={agentAccess ? copy("Ajan erişimini aç", "Turn on agent access") : copy("Ajan erişimini kapat", "Turn off agent access")} cancelLabel={copy("Vazgeç", "Cancel")} busy={busy}
          disabled={!confirmable("setup")} onSubmit={() => run("setup")} onCancel={() => setAgentAccess(currentAccess)} /> : null}
      </> : checks && !review ? <StatusRow label={copy("Ajan erişimi", "Agent access")}>
        <StatusText label={checks.agentControl ? copy("Açık", "On") : copy("Kapalı", "Off")} tone={checks.agentControl ? "success" : "default"} />
      </StatusRow> : null}
    </> : null}
    {!review ? <><MutationState mutation={setup} /><MutationState mutation={start} /><MutationState mutation={stop} /></> : null}
  </Sheet>;
}
