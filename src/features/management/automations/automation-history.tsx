import { useEffect, useRef, useState } from "react";
import { router } from "expo-router";
import { Body, Button, ErrorText, QueryState, Row, ScreenList, Sheet, Stack, StateView } from "@/ui/primitives";
import { ScreenChromeProvider } from "@/ui/layout";
import { useCopy } from "@/ui/copy";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import { useConnectionScope } from "@/state/connection-scope";
import type { HostAutomationRun } from "@/domain/types";
import { stamp } from "../shared/format";
import { Status } from "../shared/status";
import type { AutomationHistoryProps } from "./types";
import { summarizedAutomationRun } from "./automation-feedback";
import { useMobileTheme } from "@/ui/theme";

export function AutomationHistory({ automationId, projectId, summary, automationName, onClose }: AutomationHistoryProps) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy(), machine = useActiveMachine(), connection = useConnectionScope();
  const [opening] = useState(() => ({ automationId, projectId, connection, machineId: machine?.id, machineName: machine?.name }));
  const mounted = useRef(false), retired = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const readable = !!opening.machineId && opening.connection.isCurrent() && automationId === opening.automationId && projectId === opening.projectId;
  const query = useHostQuery<HostAutomationRun[]>(
    ["automations", "runs", opening.automationId],
    "automations.runs",
    { automationId: opening.automationId },
    { interval: 10000, enabled: readable },
  );
  const runs = readable ? query.data : undefined;
  const current = useRef(runs); current.current = runs;
  const summarized = summarizedAutomationRun(summary, runs ?? []);
  const close = () => { if (!mounted.current || retired.current) return; retired.current = true; onClose(); };
  return <Sheet visible title={copy("Geçmiş", "History")} size="full" scroll={false} onClose={close}
    footer={<Button tone="quiet" label={copy("Kapat", "Close")} onPress={close} />}>
    {!readable ? <StateView illustration="unreachable" title={copy("Bağlantı bekleniyor", "Waiting for a connection")} description={copy("Kayıt erişimi kullanılamıyor. İlk bilgisayar ve proje bağlantısını kontrol edin.", "Record access is unavailable. Check the original computer and project connection.")} /> :
      <ScreenChromeProvider nativeTitle bottomSafeArea={false}>
        <ScreenList data={runs ?? []} keyExtractor={run => run.id}
          header={<>
            {automationName ? <Body style={uiStyles.title}>{automationName}</Body> : null}
            {opening.machineName ? <Body muted style={uiStyles.caption}>{opening.machineName}</Body> : null}
            <ErrorText error={summary?.lastRunError} />
            <QueryState query={query} empty={!runs?.length} />
          </>}
          renderItem={({ item: run }) => <Stack>
            <Row><Status value={run.status} /><Body muted style={uiStyles.caption}>{stamp(run.createdAt)}</Body></Row>
            <ErrorText error={run.id === summarized ? undefined : run.error} />
            {run.sessionId ? <Button label={copy("Oturumu aç", "Open session")} tone="quiet" onPress={() => {
              if (mounted.current && !retired.current && opening.connection.isCurrent() && current.current?.includes(run))
                router.push({ pathname: "/session/[id]", params: { id: run.sessionId!, machineId: opening.machineId!, projectId: opening.projectId } });
            }} /> : null}
          </Stack>} />
      </ScreenChromeProvider>}
  </Sheet>;
}
