import { useEffect, useRef, useState } from "react";
import { useHostMutation, useHostQuery } from "@/state/queries";
import {
  Body, Button, FormActions, ErrorText, MutationState,
  Notice, QueryState, ScopeLine, StateView, StatusLine, Row, Sheet, ToggleField, NavigationGroup, ValueRow,
} from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import { useCopy } from "@/ui/copy";
import { MessageCode } from "@/ui/message-code";
import { useActiveMachine, useMachines } from "@/state/machines";
import { isReviewedMachine, reviewedMachine } from "@/state/reviewed-machine";
import { getQueryPresentation } from "@/ui/query-presentation";
import { ScreenChromeProvider } from "@/ui/layout";
import type { HostProject } from "@/domain/types";
import { BrowserScreen } from "./browser-screen";
import { privatePreviewUrl, reviewServer, serverReviewMatches, type ServerReview } from "./dev-server-recovery";
import { projectServers } from "./tool-model";
import { LOG_POLL_ACTIVE_MS, LOG_POLL_IDLE_AFTER, LOG_POLL_IDLE_MS, logTail } from "./runtime-log-presentation";
import type { DevServer, DevServerDetails, DevServerStartResult, DevServerStop } from "./types";

export function DevServerDetail({ projectId, project, server, onClose }: {
  projectId: string;
  project?: HostProject;
  server: DevServer;
  onClose: () => void;
}) {
  const copy = useCopy();
  const { uiStyles } = useMobileTheme();
  const machineId = useMachines((state) => state.activeId);
  const machine = useActiveMachine();
  const [opening] = useState(() => ({ reviewed: reviewedMachine(machine), projectId, serverId: server.id, machineName: machine?.name, projectName: project?.name }));
  const latestTarget = useRef({ projectId, id: server.id }); latestTarget.current = { projectId, id: server.id };
  const invalidated = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const currentScope = () => {
    if (latestTarget.current.projectId !== opening.projectId || latestTarget.current.id !== opening.serverId || !isReviewedMachine(opening.reviewed, useMachines.getState())) invalidated.current = true;
    return mounted.current && !invalidated.current;
  };
  const validScope = currentScope();
  const [includeChildren, setIncludeChildren] = useState(server.managed);
  const [intent, setIntent] = useState<ServerReview>();
  const [uncertain, setUncertain] = useState(false);
  const [preview, setPreview] = useState<{ url: string; machineId: string; projectId: string; serverId: string }>();
  const [showLogs, setShowLogs] = useState(false);
  const [localError, setLocalError] = useState<unknown>();
  const flight = useRef(false);
  const [reconciling, setReconciling] = useState(false);
  const details = useHostQuery<DevServerDetails>(
    ["dev-server-detail", projectId, server.id, includeChildren], "devServers.details",
    { projectId, id: server.id, tree: includeChildren },
    { enabled: validScope },
  );
  // A stopped server writes nothing new, and a quiet one is read less often; any change resets it.
  const serverState = details.data?.server?.state ?? server.state;
  const serverLive = serverState === "running" || serverState === "starting";
  const [quietLogs, setQuietLogs] = useState(false);
  const logPoll = useRef<{ output?: string; unchanged: number }>({ unchanged: 0 });
  const logs = useHostQuery<{ available: boolean; output: string }>(
    ["dev-server-output", projectId, server.id], "devServers.logs", { projectId, id: server.id },
    { enabled: validScope && showLogs, interval: showLogs && serverLive ? (quietLogs ? LOG_POLL_IDLE_MS : LOG_POLL_ACTIVE_MS) : undefined },
  );
  useEffect(() => {
    const output = logs.data?.output;
    if (output === undefined) return;
    const poll = logPoll.current;
    poll.unchanged = output === poll.output ? poll.unchanged + 1 : 0;
    poll.output = output;
    setQuietLogs(poll.unchanged >= LOG_POLL_IDLE_AFTER);
  }, [logs.data?.output, logs.dataUpdatedAt]);
  const { text: logText, truncated: logTruncated } = logTail(logs.data?.output ?? "", 32_000);
  const stop = useHostMutation<DevServerStop>("devServers.stop", ["dev-servers", projectId]);
  const restart = useHostMutation<DevServerStartResult>("devServers.restart", ["dev-servers", projectId]);
  const kill = useHostMutation<DevServerStop>("devServers.kill", ["dev-servers", projectId]);
  const current = validScope && details.data?.server && details.data.server.id === server.id && projectServers([details.data.server], projectId)[0];
  const busy = stop.isPending || restart.isPending || kill.isPending;
  const canReview = machine?.capabilities?.includes("dev.servers.reviewed-impact");
  const prepare = (action: ServerReview["action"]) => {
    if (!currentScope() || !current || !canReview || !details.data || details.error || details.isFetching || !machineId || busy || uncertain || flight.current) return;
    try {
      setIntent(reviewServer(details.data, machineId, projectId, action, includeChildren));
      setLocalError(undefined); stop.reset(); restart.reset(); kill.reset();
    } catch (error) { setLocalError(error); }
  };
  const act = () => {
    if (flight.current || !currentScope() || busy || details.error || details.isFetching || !current || !intent || uncertain || !canReview ||
      !serverReviewMatches(intent, useMachines.getState().activeId, projectId, server.id)) return;
    setLocalError(undefined);
    flight.current = true;
    const operation = intent.action === "stop" ? stop.mutateAsync(intent.target) :
      intent.action === "kill" ? kill.mutateAsync(intent.target) : restart.mutateAsync(intent.target);
    void operation.then(() => {
      if (!currentScope()) return;
      setIntent(undefined);
      void details.refetch();
    }).catch((error: unknown) => {
      if (currentScope() && !!error && typeof error === "object" && "uncertain" in error && error.uncertain === true) setUncertain(true);
    }).finally(() => { flight.current = false; });
  };
  const reconcile = async () => {
    if (!currentScope() || flight.current || busy || details.isFetching) return;
    flight.current = true; setReconciling(true); setIntent(undefined);
    try { const result = await details.refetch(); if (!result.isError && currentScope()) { setUncertain(false); setLocalError(undefined); } }
    catch { /* QueryState owns the read error; uncertainty remains unresolved. */ }
    finally { flight.current = false; if (mounted.current) setReconciling(false); }
  };
  const disabled = !validScope || busy || reconciling || details.isFetching || !!details.error || uncertain || !canReview;
  if (validScope && preview && project && preview.machineId === machineId && preview.projectId === projectId && preview.serverId === server.id) return <Sheet visible title={copy("Özel önizleme", "Private preview")} size="full" scroll={false} onClose={() => setPreview(undefined)}>
    <ScreenChromeProvider nativeTitle bottomSafeArea={false}>
    <BrowserScreen project={project} initialUrl={preview.url} embedded />
    </ScreenChromeProvider>
  </Sheet>;
  return (
    <Sheet visible title={server.name} size="full" dismissible={!busy} onClose={onClose}>
      <ScopeLine scope={{ computer: opening.machineName, project: opening.projectName ?? opening.projectId }} />
      {!validScope ? <StateView illustration="error" tone="danger" title={copy("Bir şeyler ters gitti", "Something went wrong")} description={copy("Bağlantı veya proje değişti. Devam etmek için bu ekranı yeniden açın.", "The connection or project changed. Reopen this view to continue.")} /> : <QueryState query={{ ...details, refetch: reconcile }} />}
      {validScope && details.isSuccess && !details.error && !current ? <Notice tone="danger" message={copy("Sunucu ayrıntıları bu hedefle eşleşmiyor. Yenile ve tekrar kontrol et.", "The server details do not match this target. Refresh and check again.")} retrying={reconciling || details.isFetching} onRetry={() => { void reconcile(); }} /> : null}
      {current ? (
        <>
          <Body mono>{current.command ?? current.name}</Body>
          {/* Identifiers stay as quiet selectable lines; the computer and project are in the scope line. */}
          {current.cwd ? <Body mono muted selectable>{current.cwd}</Body> : null}
          {current.process ? <Body mono muted selectable>{`PID ${current.process.pid}`}</Body> : null}
          {current.endpoints.map((endpoint) => <Row key={`${endpoint.address}:${endpoint.port}`}><Body mono>{endpoint.url}</Body>
            {project && machine?.capabilities?.includes("browser.shared") ? <Button tone="quiet" label={copy("Önizle", "Preview")} disabled={!validScope || busy || !!details.error || details.isFetching || reconciling || uncertain || !!intent} onPress={() => {
              try { if (machineId && currentScope()) setPreview({ url: privatePreviewUrl(endpoint.url), machineId, projectId, serverId: server.id }); } catch (error) { setLocalError(error); }
            }} /> : null}</Row>)}
          {current.error ? <ErrorText error={current.error} /> : null}
          {/* The stop scope is two rows that change what Stop affects, so it stays visible. */}
          <NavigationGroup><ToggleField label={copy("Alt işlemleri de kapsa", "Include child processes")} value={includeChildren} disabled={busy} onChange={(value) => { setIntent(undefined); setIncludeChildren(value); }} /></NavigationGroup>
          {details.data?.affectedPorts.length ? <Body muted>{`${copy("Etkilenen portlar", "Affected ports")}: ${details.data.affectedPorts.join(", ")}`}</Body> : null}
          {!canReview ? <StatusLine tone="info" label={copy("İşlem etkisini güvenle doğrulamak için bilgisayardaki bycoda'yı güncelle.", "Update bycoda on the computer to safely review process impact.")} /> : null}
          {/* One caution above the actions: unknown outcome, a process that would not stop, a busy port. */}
          {uncertain || stop.data?.requiresForce || restart.data?.conflict ? <Notice tone="warning" message={[
            uncertain ? copy("İşlemin sonucu bilinmiyor. Tekrar göndermeden önce güncel durumu kontrol et.", "The operation outcome is unknown. Check the current state before sending another action.") : null,
            stop.data?.requiresForce ? stop.data.message ?? copy("İşlem hâlâ çalışıyor.", "The process is still running.") : null,
            restart.data?.conflict ? copy("{p0} portu zaten kullanılıyor.", "Port {p0} is already in use.", { p0: restart.data.conflict.port }) : null,
          ].filter(Boolean).join(" ")} /> : null}
          {!intent ? <Row>
            {/* One primary action: Restart when the server is managed, otherwise Stop. */}
            {current.state === "running" || current.state === "starting" ? <Button label={copy("Durdur", "Stop")} tone={current.managed ? "secondary" : "primary"} disabled={disabled} onPress={() => prepare("stop")} /> : null}
            {current.managed ? <Button label={copy("Yeniden başlat", "Restart")} disabled={disabled || !includeChildren} onPress={() => prepare("restart")} /> : null}
            {stop.data?.requiresForce || kill.data?.requiresForce || restart.isError ? <Button tone="danger" label={copy("Zorla durdur", "Force stop")} disabled={disabled} onPress={() => prepare("kill")} /> : null}
          </Row> : null}
          {!details.error || current.logsAvailable ? <Row>
            {!details.error ? <Button busy={reconciling} tone="quiet" label={copy("Durumu yenile", "Refresh state")} disabled={busy || details.isFetching || reconciling} onPress={() => { void reconcile(); }} /> : null}
            {current.logsAvailable ? <Button tone="quiet" label={copy("Günlükler", "Logs")} selected={showLogs} onPress={() => setShowLogs((value) => !value)} /> : null}
          </Row> : null}
          {intent ? <><Body>{intent.action === "kill" ? copy("Listelenen işlemler zorla durdurulsun mu? Kaydedilmemiş uygulama verileri kaybolabilir.", "Force stop the listed processes? Unsaved application data may be lost.") : intent.action === "stop" ? copy("Bu sunucu seçili bilgisayarda durdurulsun mu?", "Stop this server on the selected computer?") : copy("Bu sunucu seçili bilgisayarda yeniden başlatılsın mı?", "Restart this server on the selected computer?")}</Body>
            {/* What the action affects, one reading per row. */}
            <NavigationGroup>
              {intent.processes.map((process) => <ValueRow key={`${process.pid}:${process.startedAt}`} label={process.name} value={`PID ${process.pid}`} />)}
              {intent.ports.length ? <ValueRow label={copy("Etkilenen portlar", "Affected ports")} value={intent.ports.join(", ")} /> : null}
            </NavigationGroup>
            <FormActions
            feedback={<> {localError ? <ErrorText error={localError} /> : null} <MutationState mutation={stop} /> <MutationState mutation={restart} /> <MutationState mutation={kill} /> </>}
            cancelLabel={copy("Vazgeç", "Cancel")}
            submitLabel={intent.action === "kill" ? copy("Zorla durdur", "Force stop") : intent.action === "stop" ? copy("Durdur", "Stop") : copy("Yeniden başlat", "Restart")}
            busy={busy}
            tone={intent.action === "restart" ? "primary" : "danger"}
            disabled={disabled}
            onCancel={() => setIntent(undefined)}
            onSubmit={act}
          /></> : null}
          {!intent ? <>
            {localError ? <ErrorText error={localError} /> : null}
            <MutationState mutation={stop} />
            <MutationState mutation={restart} />
            <MutationState mutation={kill} />
          </> : null}
          {showLogs ? <>
            <QueryState query={logs} />
            {logs.data?.available ? <>{logTruncated ? <Body muted style={uiStyles.caption}>{copy("Çıktının yalnızca son bölümü gösteriliyor.", "Only the most recent output is shown.")}</Body> : null}<MessageCode code={logText} output allowPreview={false} complete={current.state !== "running" && current.state !== "starting"} /></> : getQueryPresentation(logs) === "ready" ? <StateView compact title={copy("Bu sunucunun günlükleri kullanılamıyor.", "Logs are not available for this server.")} /> : null}
          </> : null}
        </>
      ) : null}
    </Sheet>
  );
}
