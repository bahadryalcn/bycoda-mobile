import { router } from "expo-router";
import { uiStyles } from "@/ui/styles";
import { Body, Button, Card, Disclosure, ErrorText, Heading, Row } from "@/ui/primitives";
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
  const copy = useCopy();
  const machine = useActiveMachine();
  return (
    <Card key={goal.id}>
      <Row>
        <Status value={goal.status} />
        <Body muted style={uiStyles.caption}>
          {goal.taskIds.length} {copy("görev", "tasks")}
        </Body>
      </Row>
      <Heading numberOfLines={2} style={uiStyles.title}>
        {goal.title}
      </Heading>
      <ErrorText error={goal.error} />
      <ErrorText error={goal.planError} />
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
        {["awaiting-approval", "blocked"].includes(goal.status) && (
          <Button
            label={copy("Planı değiştir", "Revise plan")}
            disabled={busy || editorOpen}
            onPress={() => onReplan(goal.id)}
          />
        )}
        {!["done", "cancelled"].includes(goal.status) && (
          <Button
            label={copy("Hedefi durdur", "Cancel goal")}
            tone="danger"
            disabled={busy}
            onPress={() =>
              confirmAction(
                copy("Hedefi durdur", "Cancel goal"),
                copy(
                  "Hedef ve devam eden görevleri durdurulacak; çalışma dosyaları korunacak.",
                  "The goal and its active tasks will stop; work files will be retained.",
                ),
                copy("Durdur", "Stop"),
                () => cancel.mutate({ goalId: goal.id }),
              )
            }
          />
        )}
      </Row>
      <Disclosure label={copy("Hedef ayrıntıları", "Goal details")}>
        <Body>{goal.prompt}</Body>
        <Body muted>
          {goal.projectIds
            .map((id) => projects.find((project) => project.id === id)?.name ?? id)
            .join(" · ")}
        </Body>
        {goal.plan?.tasks.map((task) => (
          <Card key={task.key}>
            <Heading style={uiStyles.title}>{task.title}</Heading>
            <Body>{task.prompt}</Body>
            <Body muted>
              {task.project}
              {task.dependsOn.length
                ? ` · ${copy("Bağımlılıklar", "Depends on")}: ${task.dependsOn.join(", ")}`
                : ""}
            </Body>
          </Card>
        ))}
        <Row>
          {goal.plannerSessionId && (
            <Button
              label={copy("Planlayıcı oturumu", "Planner session")}
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
          {["done", "cancelled"].includes(goal.status) && (
            <Button
              label={copy("Kaydı sil", "Delete record")}
              tone="danger"
              disabled={busy}
              onPress={() =>
                confirmAction(
                  copy("Hedefi sil", "Delete goal"),
                  copy(
                    "Hedef kaydı silinecek; görevler korunacak.",
                    "The goal record will be deleted; tasks will be retained.",
                  ),
                  copy("Sil", "Delete"),
                  () => remove.mutate({ goalId: goal.id, withTasks: false }),
                )
              }
            />
          )}
        </Row>
      </Disclosure>
    </Card>
  );
}
