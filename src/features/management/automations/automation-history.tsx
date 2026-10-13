import { router } from "expo-router";
import { Body, Button, Card, ErrorText, QueryState, Row } from "@/ui/primitives";
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
        <Card key={run.id}>
          <Row>
            <Status value={run.status} />
            <Body muted>{stamp(run.createdAt)}</Body>
          </Row>
          <ErrorText error={run.error} />
          {run.sessionId && (
            <Button
              label={copy("Oturumu aç", "Open session")}
              onPress={() => {
                if (machine && run.sessionId)
                  router.push({
                    pathname: "/session/[id]",
                    params: { id: run.sessionId, machineId: machine.id, projectId },
                  });
              }}
            />
          )}
        </Card>
      ))}
    </>
  );
}
