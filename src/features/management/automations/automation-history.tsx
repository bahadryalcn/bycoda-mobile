import { router } from "expo-router";
import { Body, Button, ErrorText, QueryState, Row, Separator, Stack } from "@/ui/primitives";
import { uiStyles } from "@/ui/styles";
import { useCopy } from "@/ui/copy";
import { useHostQuery } from "@/state/queries";
import { useActiveMachine } from "@/state/machines";
import type { HostAutomationRun } from "@/domain/types";
import { stamp } from "../shared/format";
import { Status } from "../shared/status";
import type { AutomationHistoryProps } from "./types";

export function AutomationHistory({ automationId, projectId }: AutomationHistoryProps) {
  const copy = useCopy();
  const machine = useActiveMachine();
  const query = useHostQuery<HostAutomationRun[]>(
    ["automations", "runs", automationId],
    "automations.runs",
    { automationId },
    { interval: 10000 },
  );
  return (
    <>
      <QueryState query={query} empty={!query.data?.length} />
      {query.data?.slice(0, 20).map((run) => (
        <Stack key={run.id}>
          <Separator />
          <Row>
            <Status value={run.status} />
            <Body muted style={uiStyles.caption}>{stamp(run.createdAt)}</Body>
          </Row>
          <ErrorText error={run.error} />
          {run.sessionId && (
            <Button
              label={copy("Oturumu aç", "Open session")}
              tone="quiet"
              onPress={() => {
                if (machine && run.sessionId)
                  router.push({
                    pathname: "/session/[id]",
                    params: { id: run.sessionId, machineId: machine.id, projectId },
                  });
              }}
            />
          )}
        </Stack>
      ))}
    </>
  );
}
