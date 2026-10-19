import { RecordCard } from "@/ui/record-card";
import { PlanSteps } from "@/ui/plan-steps";
import { useMobileTheme } from "@/ui/theme";
import { router } from "expo-router";
import { uiStyles } from "@/ui/styles";
import { ActionMenu, Body, Button, ErrorText, Row } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { confirmAction } from "@/ui/confirm";
import { useActiveMachine } from "@/state/machines";
import { Status } from "../shared/status";
import type { GoalCardProps } from "./types";

export function GoalCard({
  goal,
  projects,
  busy,
  editorOpen,
  onReplan,
  approve,
  cancel,
  remove,
}: GoalCardProps) {
  useMobileTheme();
  const copy = useCopy();
  const machine = useActiveMachine();
  const canCancel = !["done", "cancelled"].includes(goal.status);
  const canDelete = ["done", "cancelled"].includes(goal.status);
  // Revise and cancel are secondary to approval, so they move into the overflow menu.
  const menu = [
    ["awaiting-approval", "blocked"].includes(goal.status) && {
      key: "revise",
      label: copy("Planı değiştir", "Revise plan"),
      disabled: busy || editorOpen,
      onPress: () => onReplan(goal.id),
    },
    canCancel && {
      key: "cancel",
      label: copy("Hedefi durdur", "Cancel goal"),
      destructive: true,
      disabled: busy,
      onPress: () =>
        confirmAction(
          copy("Hedefi durdur", "Cancel goal"),
          copy(
            "Hedef ve devam eden görevleri durdurulacak; çalışma dosyaları korunacak.",
            "The goal and its active tasks will stop; work files will be retained.",
          ),
          copy("Durdur", "Stop"),
          () => cancel.mutate({ goalId: goal.id }),
        ),
    },
    canDelete && {
      key: "delete",
      label: copy("Kaydı sil", "Delete record"),
      destructive: true,
      disabled: busy,
      onPress: () =>
        confirmAction(
          copy("Hedefi sil", "Delete goal"),
          copy(
            "Hedef kaydı silinecek; görevler korunacak.",
            "The goal record will be deleted; tasks will be retained.",
          ),
          copy("Sil", "Delete"),
          () => remove.mutate({ goalId: goal.id, withTasks: false }),
        ),
    },
  ];
  return (
    <RecordCard
      title={goal.title}
      status={<Status value={goal.status} />}
      metadata={goal.taskIds.length + " " + copy("görev", "tasks")}
      defaultExpanded={goal.status === "awaiting-approval"}
      menu={<ActionMenu label={copy("Hedef işlemleri", "Goal actions")} actions={menu} />}
      footer={goal.status === "awaiting-approval" || goal.plannerSessionId ? (
        <Row>
          {goal.status === "awaiting-approval" && (
            <Button
              label={copy("Planı onayla", "Approve plan")}
              tone="success"
              disabled={busy}
              onPress={() =>
                confirmAction(
                  copy("Planı onayla", "Approve plan"),
                  copy(
                    "Plandaki görevler bilgisayarda çalıştırılmaya başlanacak.",
                    "The planned tasks will start running on the computer.",
                  ),
                  copy("Onayla", "Approve"),
                  () => approve.mutate({ goalId: goal.id }),
                )
              }
            />
          )}
          {goal.plannerSessionId && (
            <Button
              label={copy("Planlayıcı oturumu", "Planner session")}
              tone="quiet"
              onPress={() => {
                if (machine && goal.plannerSessionId)
                  router.push({
                    pathname: "/session/[id]",
                    params: {
                      id: goal.plannerSessionId,
                      machineId: machine.id,
                      projectId: goal.leadProjectId,
                    },
                  });
              }}
            />
          )}
        </Row>
      ) : null}
      details={<>
        <Body>{goal.prompt}</Body>
        <Body muted style={uiStyles.caption}>
          {goal.projectIds
            .map((id) => projects.find((project) => project.id === id)?.name ?? id)
            .join(" · ")}
        </Body>
        {goal.plan?.tasks.length ? <PlanSteps steps={goal.plan.tasks.map((task) => ({
          id: task.key,
          title: task.title,
          description: task.prompt,
          metadata: [task.project, task.dependsOn.length
            ? `${copy("Bağımlılıklar", "Depends on")}: ${task.dependsOn.join(", ")}` : ""].filter(Boolean).join(" · "),
        }))} /> : null}
      </>}
    >
      <ErrorText error={goal.error} />
      <ErrorText error={goal.planError} />

    </RecordCard>
  );
}
