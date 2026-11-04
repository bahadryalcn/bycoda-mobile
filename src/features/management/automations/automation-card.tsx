import { RecordCard } from "@/ui/record-card";
import { useMobileTheme } from "@/ui/theme";
import { router } from "expo-router";
import { ActionMenu, Body, Button, ErrorText, MutationState, Row } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { useActiveMachine } from "@/state/machines";
import { stamp } from "../shared/format";
import { Status } from "../shared/status";
import { AutomationHistory } from "./automation-history";
import type { AutomationCardProps } from "./types";
import { scheduleLabel } from "./schedule-model";
import { savedAutomationId } from "./automation-feedback";

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
  useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  // Edit, history, last session and delete are secondary; they live in the overflow menu.
  const menu = [
    {
      key: "toggle",
      label: item.enabled ? copy("Duraklat", "Pause") : copy("Etkinleştir", "Enable"),
      disabled: busy || editorOpen,
      onPress: () =>
        save.mutate({
          automation: { ...item, enabled: !item.enabled, expectedConfiguration: item },
        }),
    },
    {
      key: "edit",
      label: copy("Düzenle", "Edit"),
      disabled: busy || editorOpen,
      onPress: () => onEdit(item.id),
    },
    {
      key: "history",
      label: copy("Geçmiş", "History"),
      onPress: () => onHistory(historyId === item.id ? null : item.id),
    },
    !!item.lastSessionId && {
      key: "session",
      label: copy("Son oturum", "Last session"),
      onPress: () => {
        if (machine && item.lastSessionId)
          router.push({
            pathname: "/session/[id]",
            params: {
              id: item.lastSessionId,
              machineId: machine.id,
              projectId: item.projectId,
            },
          });
      },
    },
    {
      key: "delete",
      label: copy("Sil", "Delete"),
      destructive: true,
      disabled: busy,
      onPress: () =>
        confirmAction(
          copy("Otomasyonu sil", "Delete automation"),
          copy(
            "Zamanlanmış iş ve çalıştırma geçmişi silinecek.",
            "The schedule and run history will be deleted.",
          ),
          copy("Sil", "Delete"),
          () => remove.mutate({ automationId: item.id }),
        ),
    },
  ];
  return (
    <RecordCard
      title={item.name}
      status={<Status value={item.enabled ? (item.lastRunStatus ?? "idle") : "paused"} />}
      metadata={
        scheduleLabel(item, copy) + " · " + copy("Sonraki", "Next") + ": " + stamp(item.nextRunAt)
      }
      menu={<ActionMenu label={copy("Otomasyon işlemleri", "Automation actions")}
        busy={(save.isPending && (save.variables?.automation as { id?: string } | undefined)?.id === item.id) || (remove.isPending && remove.variables?.automationId === item.id)} actions={menu} />}
      footer={
        <Row>
          <Button
            label={copy("Şimdi çalıştır", "Run now")}
            tone="quiet"
            busy={run.isPending && run.variables?.automationId === item.id}
            disabled={busy}
            onPress={() =>
              confirmAction(
                copy("Şimdi çalıştır", "Run now"),
                copy(
                  "Ajan bu bilgisayarda otomasyon talimatlarını çalıştıracak.",
                  "The agent will run this automation on the computer.",
                ),
                copy("Çalıştır", "Run"),
                () => run.mutate({ automationId: item.id }), undefined, "default",
              )
            }
          />
        </Row>
      }
      details={
        <>
          <Body>{item.prompt}</Body>
        </>
      }
    >
      <ErrorText error={historyId === item.id ? undefined : item.lastRunError} />
      {!editorOpen && savedAutomationId(save.variables) === item.id ? <MutationState mutation={save} success={copy("Otomasyon kaydedildi.", "Automation saved.")} /> : null}
      {run.variables?.automationId === item.id ? <MutationState mutation={run} success={copy("Çalıştırma istendi.", "Run requested.")} /> : null}
      {remove.variables?.automationId === item.id ? <MutationState mutation={remove} /> : null}
      {historyId === item.id && (
        <AutomationHistory automationId={item.id} projectId={item.projectId} summary={item} automationName={item.name} onClose={() => onHistory(null)} />
      )}
    </RecordCard>
  );
}
