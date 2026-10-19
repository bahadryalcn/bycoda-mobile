import { useRef, useState } from "react";
import { useHostMutation, useHostQuery } from "@/state/queries";
import {
  Body, Button, CodePanel, CodeText, ConfirmationCard, ErrorText, MutationState,
  Notice, QueryState, Row, Sheet, ToggleField, NavigationGroup,
} from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMachines } from "@/state/machines";
import { projectServers, serverTarget } from "./tool-model";
import type { DevServer, DevServerDetails, DevServerStartResult, DevServerStop } from "./types";

export function DevServerDetail({ projectId, server, onClose }: {
  projectId: string;
  server: DevServer;
  onClose: () => void;
}) {
  const copy = useCopy();
  const machineId = useMachines((state) => state.activeId);
  const [includeChildren, setIncludeChildren] = useState(server.managed);
  const [intent, setIntent] = useState<"stop" | "restart">();
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
  const current = details.data?.server && projectServers([details.data.server], projectId)[0];
  const busy = stop.isPending || restart.isPending;
  const act = () => {
    if (flight.current || !current || !intent) return;
    let target;
    try { target = serverTarget(current, projectId, includeChildren); }
    catch (error) { setLocalError(error); return; }
    setLocalError(undefined);
    flight.current = true;
    const operation = intent === "stop" ? stop.mutateAsync(target) : restart.mutateAsync(target);
    void operation.then(() => {
      if (useMachines.getState().activeId !== machineId) return;
      setIntent(undefined);
      void details.refetch();
    }).catch(() => {}).finally(() => { flight.current = false; });
  };
  return (
    <Sheet visible title={server.name} size="full" dismissible={!busy} onClose={onClose}>
      <QueryState query={details} />
      {details.isSuccess && !current ? <Notice tone="danger" message={copy("Sunucu bu projeye ait değil.", "This server does not belong to this project.")} /> : null}
      {current ? (
        <>
          <Body mono>{current.command ?? current.name}</Body>
          {current.cwd ? <Body mono muted>{current.cwd}</Body> : null}
          {current.endpoints.map((endpoint) => <Body key={`${endpoint.address}:${endpoint.port}`} mono>{endpoint.url}</Body>)}
          {current.error ? <ErrorText error={current.error} /> : null}
          {current.process ? <Body mono muted>{`PID ${current.process.pid}`}</Body> : null}
          <NavigationGroup><ToggleField label={copy("Alt işlemleri de kapsa", "Include child processes")} value={includeChildren} disabled={busy} onChange={(value) => { setIntent(undefined); setIncludeChildren(value); }} /></NavigationGroup>
          <Body muted>{`${copy("Etkilenen portlar", "Affected ports")}: ${details.data?.affectedPorts.join(", ") || "—"}`}</Body>
          <Row>
            {current.state === "running" || current.state === "starting" ? <Button label={copy("Durdur", "Stop")} disabled={busy || details.isFetching} onPress={() => { stop.reset(); restart.reset(); setIntent("stop"); }} /> : null}
            {current.managed ? <Button label={copy("Yeniden başlat", "Restart")} disabled={busy || details.isFetching} onPress={() => { stop.reset(); restart.reset(); setIntent("restart"); }} /> : null}
            {current.logsAvailable ? <Button label={copy("Günlükler", "Logs")} selected={showLogs} onPress={() => setShowLogs((value) => !value)} /> : null}
          </Row>
          {intent ? <ConfirmationCard
            message={intent === "stop" ? copy("Bu sunucuyu seçili bilgisayarda durdur?", "Stop this server on the selected computer?") : copy("Bu sunucuyu seçili bilgisayarda yeniden başlat?", "Restart this server on the selected computer?")}
            cancelLabel={copy("Vazgeç", "Cancel")}
            confirmLabel={intent === "stop" ? copy("Durdur", "Stop") : copy("Yeniden başlat", "Restart")}
            busy={busy}
            disabled={details.isFetching}
            onCancel={() => setIntent(undefined)}
            onConfirm={act}
          /> : null}
          {localError ? <ErrorText error={localError} /> : null}
          <MutationState mutation={stop} />
          <MutationState mutation={restart} />
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
