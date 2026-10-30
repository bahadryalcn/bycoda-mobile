import { useRef, useState } from "react";
import { useActiveMachine, useMachines } from "@/state/machines";
import { useHostMutation, useHostQuery } from "@/state/queries";
import { Body, Button, Disclosure, FormActions, MutationState, Notice, QueryState, Row, Sheet, Stack, ToggleField } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { space } from "@/ui/tokens";
import type { DeviceHostStatus } from "./types";
import { readPreviewImpact, type PreviewImpact } from "./device-preview-model";

type Preflight = { checks: { sdk: boolean; device: boolean; tools: boolean; agentControl: boolean } };
export function DeviceRuntime({ projectId, deviceId, onClose }: { projectId: string; deviceId?: string; onClose: () => void }) {
  const copy = useCopy(); const machine = useActiveMachine();
  const [opening] = useState(() => ({ machineId: machine?.id, environmentId: machine?.environmentId, projectId, deviceId }));
  const [review, setReview] = useState<"setup" | "start" | "stop">(); const [agentAccess, setAgentAccess] = useState(false);
  const [uncertain, setUncertain] = useState(false); const occupied = useRef(false);
  const current = () => !!opening.machineId && !!opening.environmentId && machine?.id === opening.machineId && machine.environmentId === opening.environmentId &&
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
    <Body muted>{machine?.name}</Body>
    {!supported ? <Notice message={copy("Seçili bilgisayar değişti veya bu özelliği desteklemiyor.", "The selected computer changed or does not support this feature.")} /> : <><QueryState query={preflight} /><QueryState query={status} loading="none" /></>}
    {checks ? <Stack style={{ gap: space.xs }}>
      <Row><Body style={{ flex: 1 }}>SDK</Body><Body muted>{checks.sdk ? copy("Hazır", "Ready") : copy("Kullanılamıyor", "Unavailable")}</Body></Row>
      <Row><Body style={{ flex: 1 }}>{copy("Cihazlar", "Devices")}</Body><Body muted>{checks.device ? copy("Hazır", "Ready") : copy("Kullanılamıyor", "Unavailable")}</Body></Row>
      <Row><Body style={{ flex: 1 }}>{copy("Araçlar", "Tools")}</Body><Body muted>{checks.tools ? copy("Hazır", "Ready") : copy("Kurulum gerekli", "Setup required")}</Body></Row>
      <Row><Body style={{ flex: 1 }}>{copy("Ajan kontrolü", "Agent control")}</Body><Body muted>{checks.agentControl ? copy("Etkin", "Enabled") : copy("Kapalı", "Off")}</Body></Row>
    </Stack> : null}
    <Button busy={preflight.isFetching || status.isFetching || (impactSupported && impact.isFetching)} tone="quiet" label={copy("Yenile", "Refresh")} disabled={!supported || busy || preflight.isFetching} onPress={() => { void preflight.refetch(); void status.refetch(); if (impactSupported) void impact.refetch(); }} />
    {impactSupported ? <><QueryState query={impact} loading="none" />{impact.data ? <>
      <Body>{copy("Etkin önizleme işleri", "Active preview jobs")}: {impact.data.activeCount}</Body>
      {impact.data.owned.map((job) => <Body key={job.id} mono>{job.deviceId} · {job.state}</Body>)}
      {impact.data.otherActiveCount ? <Body>{copy("Diğer bağlamlardaki etkin işler", "Active jobs in other contexts")}: {impact.data.otherActiveCount}</Body> : null}
    </> : null}</> : null}
    {uncertain ? <Notice tone="warning" message={copy("İşlemin sonucu bilinmiyor. Yeniden göndermeden bilgisayardaki durumu kontrol edin.", "The operation outcome is unknown. Check the computer state before sending again.")} /> : null}
    {review ? <>
      {review === "setup" ? <><Notice message={copy("Bu işlem seçili bilgisayara cihaz araçlarını indirip kurar.", "This downloads and installs device tools on the selected computer.")} />
        <ToggleField label={copy("Ajanların cihazları kontrol etmesine izin ver", "Allow agents to control devices")} value={agentAccess} onChange={setAgentAccess} disabled={busy || uncertain} /></> : null}
      {review === "stop" ? <Notice tone="warning" message={copy("Bu bilgisayardaki ortak cihaz servisi durur; diğer cihaz kontrolleri de etkilenir.", "The shared device service on this computer will stop, affecting other device controls.")} /> : null}
      <FormActions feedback={<> <Body>{copy("Seçili bilgisayarda incelenen işlemi uygula?", "Apply the reviewed action on the selected computer?")}</Body> <MutationState mutation={setup} /><MutationState mutation={start} /><MutationState mutation={stop} /> </>}
        submitLabel={copy("Onayla", "Confirm")} cancelLabel={copy("Vazgeç", "Cancel")} busy={busy} disabled={!supported || uncertain} onSubmit={run} onCancel={() => setReview(undefined)} />
    </> : <>
      <Button tone="quiet" label={copy("Cihaz araçlarını kur", "Set up device tools")} disabled={!supported || busy || uncertain || status.isFetching} onPress={() => { setAgentAccess(false); setReview("setup"); }} />
      <Button tone="primary" label={copy("Cihaz servisini başlat", "Start device service")} disabled={!supported || busy || uncertain || !status.data?.installed || status.data.running} onPress={() => setReview("start")} />
      <Button label={copy("Cihaz servisini durdur", "Stop device service")} tone="danger" disabled={!supported || busy || uncertain || !status.data?.running || !impactSupported || impact.isFetching || impact.data?.activeCount !== 0} onPress={() => setReview("stop")} />
    </>}
    {!review ? <><MutationState mutation={setup} /><MutationState mutation={start} /><MutationState mutation={stop} /></> : null}
    <Disclosure label={copy("Ayrıntılar", "Details")}><Body mono>{opening.machineId} / {opening.projectId}</Body></Disclosure>
  </Sheet>;
}
