import { useRef, useState } from "react";
import { useHostMutation, useHostQuery } from "@/state/queries";
import {
  Body, Button, CodePanel, CodeText, ConfirmationCard, ErrorText, MutationState,
  Notice, QueryState, Row, Sheet, ToggleField, NavigationGroup,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useActiveMachine, useMachines } from "@/state/machines";
import type { HostProject } from "@/domain/types";
import { BrowserScreen } from "./browser-screen";
import { privatePreviewUrl, reviewServer, serverReviewMatches, type ServerReview } from "./dev-server-recovery";
import { projectServers } from "./tool-model";
import type { DevServer, DevServerDetails, DevServerStartResult, DevServerStop } from "./types";

export function DevServerDetail({ projectId, project, server, onClose }: {
  projectId: string;
  project?: HostProject;
  server: DevServer;
  onClose: () => void;
}) {
  const copy = useCopy();
  const machineId = useMachines((state) => state.activeId);
  const machine = useActiveMachine();
  const [includeChildren, setIncludeChildren] = useState(server.managed);
  const [intent, setIntent] = useState<ServerReview>();
  const [uncertain, setUncertain] = useState(false);
  const [preview, setPreview] = useState<{ url: string; machineId: string; projectId: string; serverId: string }>();
  const [showLogs, setShowLogs] = useState(false);
  const [localError, setLocalError] = useState<unknown>();
  const flight = useRef(false);
  const details = useHostQuery<DevServerDetails>(
    ["dev-server-detail", projectId, server.id, includeChildren], "devServers.details",
    { projectId, id: server.id, tree: includeChildren },
  );
  const logs = useHostQuery<{ available: boolean; output: string }>(
    ["dev-server-output", projectId, server.id], "devServers.logs", { projectId, id: server.id },
    { enabled: showLogs, interval: showLogs ? 5_000 : undefined },
  );
  const stop = useHostMutation<DevServerStop>("devServers.stop", ["dev-servers", projectId]);
  const restart = useHostMutation<DevServerStartResult>("devServers.restart", ["dev-servers", projectId]);
  const kill = useHostMutation<DevServerStop>("devServers.kill", ["dev-servers", projectId]);
  const current = details.data?.server && projectServers([details.data.server], projectId)[0];
  const busy = stop.isPending || restart.isPending || kill.isPending;
  const canReview = machine?.capabilities?.includes("dev.servers.reviewed-impact");
  const prepare = (action: ServerReview["action"]) => {
    if (!canReview || !details.data || !machineId || busy || uncertain) return;
    try {
      setIntent(reviewServer(details.data, machineId, projectId, action, includeChildren));
      setLocalError(undefined); stop.reset(); restart.reset(); kill.reset();
    } catch (error) { setLocalError(error); }
  };
  const act = () => {
    if (flight.current || !current || !intent || uncertain || !canReview ||
      !serverReviewMatches(intent, useMachines.getState().activeId, projectId, server.id)) return;
    setLocalError(undefined);
    flight.current = true;
    const operation = intent.action === "stop" ? stop.mutateAsync(intent.target) :
      intent.action === "kill" ? kill.mutateAsync(intent.target) : restart.mutateAsync(intent.target);
    void operation.then(() => {
      if (useMachines.getState().activeId !== machineId) return;
      setIntent(undefined);
      void details.refetch();
    }).catch((error: unknown) => {
      if (!!error && typeof error === "object" && "uncertain" in error && error.uncertain === true) setUncertain(true);
    }).finally(() => { flight.current = false; });
  };
  const disabled = busy || details.isFetching || uncertain || !canReview;
  if (preview && project && preview.machineId === machineId && preview.projectId === projectId && preview.serverId === server.id) return <Sheet visible title={copy("Özel önizleme", "Private preview")} size="full" scroll={false} onClose={() => setPreview(undefined)}>
    <Notice message={copy("Önizleme seçili bilgisayarın tarayıcısında açılır. Kontrolü al, ardından adresi aç.", "Preview runs in the selected computer's browser. Take control, then open the address.")} />
    <BrowserScreen key={`${machineId}:${projectId}:${preview.url}`} project={project} initialUrl={preview.url} />
  </Sheet>;
  return (
    <Sheet visible title={server.name} size="full" dismissible={!busy} onClose={onClose}>
      {!machine ? <Notice message={copy("Önce bir bilgisayar bağla", "Connect a computer first")} /> : null}
      <QueryState query={details} />
      {details.isSuccess && !current ? <Notice tone="danger" message={copy("Sunucu bu projeye ait değil.", "This server does not belong to this project.")} /> : null}
      {current ? (
        <>
          <Body mono>{current.command ?? current.name}</Body>
          {current.cwd ? <Body mono muted>{current.cwd}</Body> : null}
          {current.endpoints.map((endpoint) => <Row key={`${endpoint.address}:${endpoint.port}`}><Body mono>{endpoint.url}</Body>
            {project && machine?.capabilities?.includes("browser.shared") ? <Button tone="quiet" label={copy("Önizleme", "Preview")} disabled={busy || uncertain} onPress={() => {
              try { if (machineId) setPreview({ url: privatePreviewUrl(endpoint.url), machineId, projectId, serverId: server.id }); } catch (error) { setLocalError(error); }
            }} /> : null}</Row>)}
          {current.error ? <ErrorText error={current.error} /> : null}
          {current.process ? <Body mono muted>{`PID ${current.process.pid}`}</Body> : null}
          <NavigationGroup><ToggleField label={copy("Alt işlemleri de kapsa", "Include child processes")} value={includeChildren} disabled={busy} onChange={(value) => { setIntent(undefined); setIncludeChildren(value); }} /></NavigationGroup>
          <Body muted>{`${copy("Etkilenen portlar", "Affected ports")}: ${details.data?.affectedPorts.join(", ") || "—"}`}</Body>
          {!canReview ? <Notice message={copy("İşlem etkisini güvenle doğrulamak için bilgisayardaki bycoda'yı güncelle.", "Update bycoda on the computer to safely review process impact.")} /> : null}
          {uncertain ? <Notice tone="warning" message={copy("İşlemin sonucu bilinmiyor. Tekrar göndermeden önce güncel durumu kontrol et.", "The operation outcome is unknown. Check the current state before sending another action.")} /> : null}
          <Button busy={details.isFetching} tone="quiet" label={copy("Durumu yenile", "Refresh state")} disabled={busy} onPress={() => {
            setIntent(undefined); void details.refetch().then((result) => { if (!result.isError && useMachines.getState().activeId === machineId) setUncertain(false); });
          }} />
          <Row>
            {current.state === "running" || current.state === "starting" ? <Button label={copy("Durdur", "Stop")} disabled={disabled} onPress={() => prepare("stop")} /> : null}
            {current.managed ? <Button label={copy("Yeniden başlat", "Restart")} disabled={disabled || !includeChildren} onPress={() => prepare("restart")} /> : null}
            {stop.data?.requiresForce || kill.data?.requiresForce || restart.isError ? <Button tone="danger" label={copy("Zorla durdur", "Force stop")} disabled={disabled} onPress={() => prepare("kill")} /> : null}
            {current.logsAvailable ? <Button tone="quiet" label={copy("Günlükler", "Logs")} selected={showLogs} onPress={() => setShowLogs((value) => !value)} /> : null}
          </Row>
          {intent ? <><Body mono>{`${intent.machineId} / ${intent.projectId}\n${intent.processes.map((process) => `PID ${process.pid} · ${process.name} · ${process.startedAt}`).join("\n")}\n${copy("Etkilenen portlar", "Affected ports")}: ${intent.ports.join(", ") || "—"}`}</Body><ConfirmationCard
            message={intent.action === "kill" ? copy("Listelenen işlemleri zorla durdur? Kaydedilmemiş uygulama verileri kaybolabilir.", "Force stop the listed processes? Unsaved application data may be lost.") : intent.action === "stop" ? copy("Bu sunucuyu seçili bilgisayarda durdur?", "Stop this server on the selected computer?") : copy("Bu sunucuyu seçili bilgisayarda yeniden başlat?", "Restart this server on the selected computer?")}
            cancelLabel={copy("Vazgeç", "Cancel")}
            confirmLabel={intent.action === "kill" ? copy("Zorla durdur", "Force stop") : intent.action === "stop" ? copy("Durdur", "Stop") : copy("Yeniden başlat", "Restart")}
            busy={busy}
            disabled={disabled}
            onCancel={() => setIntent(undefined)}
            onConfirm={act}
          /></> : null}
          {localError ? <ErrorText error={localError} /> : null}
          <MutationState mutation={stop} />
          <MutationState mutation={restart} />
          <MutationState mutation={kill} />
          {stop.data?.requiresForce ? <Notice tone="warning" message={stop.data.message ?? copy("İşlem hâlâ çalışıyor.", "The process is still running.")} /> : null}
          {restart.data?.conflict ? <Notice tone="warning" message={copy("{p0} portu zaten kullanılıyor.", "Port {p0} is already in use.", { p0: restart.data.conflict.port })} /> : null}
          {showLogs ? <>
            <QueryState query={logs} />
            {logs.data?.available ? <CodePanel horizontal={false}><CodeText>{logs.data.output.slice(-32_000)}</CodeText></CodePanel> : !logs.isPending ? <Notice message={copy("Bu sunucunun günlükleri kullanılamıyor.", "Logs are not available for this server.")} /> : null}
          </> : null}
        </>
      ) : null}
    </Sheet>
  );
}
