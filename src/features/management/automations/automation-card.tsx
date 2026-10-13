import { router } from "expo-router";
import { uiStyles } from "@/ui/styles";
import { Body, Button, Card, Disclosure, ErrorText, Heading, Row } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { useActiveMachine } from "@/state/machines";
import { stamp } from "../shared/format";
import { Status } from "../shared/status";
import { AutomationHistory } from "./automation-history";
import type { AutomationCardProps } from "./types";
import { scheduleLabel } from "./schedule-model";

export function AutomationCard({
  item,
  busy,
  editorOpen,
  historyId,
  onEdit,
  onHistory,
  save,
  run,
  remove,
}: AutomationCardProps) {
  const copy = useCopy();
  const machine = useActiveMachine();
  return (
    <Card key={item.id}>
      <Heading numberOfLines={2} style={uiStyles.title}>
        {item.name}
      </Heading>
      <Body muted numberOfLines={2} style={uiStyles.caption}>
        {scheduleLabel(item, copy)}{" "}
        · {copy("Sonraki", "Next")}: {stamp(item.nextRunAt)}
      </Body>
      {item.lastRunStatus && <Status value={item.lastRunStatus} />}
      <ErrorText error={item.lastRunError} />
      <Row>
        <Button
          label={item.enabled ? copy("Duraklat", "Pause") : copy("Etkinleştir", "Enable")}
          disabled={busy}
          onPress={() => save.mutate({ automation: { ...item, enabled: !item.enabled } })}
        />
        <Button
          label={copy("Şimdi çalıştır", "Run now")}
          tone="primary"
          disabled={busy}
          onPress={() =>
            confirmAction(
              copy("Şimdi çalıştır", "Run now"),
              copy(
                "Ajan bu bilgisayarda otomasyon talimatlarını çalıştıracak.",
                "The agent will run this automation on the computer.",
              ),
              copy("Çalıştır", "Run"),
              () => run.mutate({ automationId: item.id }),
            )
          }
        />
      </Row>
      <Disclosure label={copy("Otomasyon ayrıntıları", "Automation details")}>
        <Body>{item.prompt}</Body>
        <Row>
          <Button
            label={copy("Düzenle", "Edit")}
            disabled={busy || editorOpen}
            onPress={() => onEdit(item.id)}
          />
          <Button
            label={copy("Geçmiş", "History")}
            onPress={() => onHistory(historyId === item.id ? null : item.id)}
          />
          {item.lastSessionId && (
            <Button
              label={copy("Son oturum", "Last session")}
              onPress={() => {
                if (machine && item.lastSessionId)
                  router.push({
                    pathname: "/session/[id]",
                    params: {
                      id: item.lastSessionId,
                      machineId: machine.id,
                      projectId: item.projectId,
                    },
                  });
              }}
            />
          )}
          <Button
            label={copy("Sil", "Delete")}
            tone="danger"
            disabled={busy}
            onPress={() =>
              confirmAction(
                copy("Otomasyonu sil", "Delete automation"),
                copy(
                  "Zamanlanmış iş ve çalıştırma geçmişi silinecek.",
                  "The schedule and run history will be deleted.",
                ),
                copy("Sil", "Delete"),
                () => remove.mutate({ automationId: item.id }),
              )
            }
          />
        </Row>
      </Disclosure>
      {historyId === item.id && (
        <AutomationHistory automationId={item.id} projectId={item.projectId} />
      )}
    </Card>
  );
}
